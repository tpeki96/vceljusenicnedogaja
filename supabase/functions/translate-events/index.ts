import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TARGET_LANGUAGES = ["en", "de", "it"] as const;
const MAX_PAIRS_PER_RUN = 45;

type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

type EventRow = {
  id: string;
  title: string;
  category: string | null;
  updated_at: string;
};

type TranslationRow = {
  event_id: string;
  language: TargetLanguage;
  source_hash: string;
  manual_override: boolean;
};

const CATEGORY_TRANSLATIONS: Record<string, Record<TargetLanguage, string>> = {
  "Dogodek": { en: "Event", de: "Veranstaltung", it: "Evento" },
  "Ostalo": { en: "Other", de: "Sonstiges", it: "Altro" },
  "Za otroke": { en: "For children", de: "Für Kinder", it: "Per bambini" },
  "Koncert": { en: "Concert", de: "Konzert", it: "Concerto" },
  "Koncerti": { en: "Concerts", de: "Konzerte", it: "Concerti" },
  "Glasba": { en: "Music", de: "Musik", it: "Musica" },
  "Šport": { en: "Sport", de: "Sport", it: "Sport" },
  "Predstava": { en: "Performance", de: "Aufführung", it: "Spettacolo" },
  "Predstave": { en: "Performances", de: "Aufführungen", it: "Spettacoli" },
  "Delavnica": { en: "Workshop", de: "Workshop", it: "Laboratorio" },
  "Predavanja": { en: "Lectures", de: "Vorträge", it: "Conferenze" },
  "Vodenje": { en: "Guided tour", de: "Führung", it: "Visita guidata" },
  "Vodenja": { en: "Guided tours", de: "Führungen", it: "Visite guidate" },
  "Razstava": { en: "Exhibition", de: "Ausstellung", it: "Mostra" },
  "Razstave": { en: "Exhibitions", de: "Ausstellungen", it: "Mostre" },
  "Sejmi": { en: "Fairs", de: "Messen", it: "Fiere" },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase GET failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function upsertTranslation(row: Record<string, unknown>) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/event_translations?on_conflict=event_id,language`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    },
  );

  if (!response.ok) {
    throw new Error(`Translation upsert failed (${response.status}): ${await response.text()}`);
  }
}

function translatedCategory(category: string | null, language: TargetLanguage) {
  if (!category) {
    return { en: "Event", de: "Veranstaltung", it: "Evento" }[language];
  }
  return CATEGORY_TRANSLATIONS[category]?.[language] || category;
}

async function googleTranslate(text: string, target: TargetLanguage) {
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client", "gtx");
  endpoint.searchParams.set("sl", "sl");
  endpoint.searchParams.set("tl", target);
  endpoint.searchParams.set("dt", "t");
  endpoint.searchParams.set("q", text);

  let lastError = "unknown error";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; vceljusenicnedogaja.si translation worker)",
          Accept: "application/json,text/plain,*/*",
        },
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const translated = Array.isArray(data?.[0])
          ? data[0].map((part: unknown[]) => part?.[0] || "").join("").trim()
          : "";

        if (!translated) throw new Error("empty translation response");
        return translated;
      }

      lastError = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(500 * (attempt + 1));
  }

  throw new Error(`Google Translate failed: ${lastError}`);
}

Deno.serve(async () => {
  try {
    const events = await supabaseGet<EventRow[]>(
      "events?select=id,title,category,updated_at&status=eq.published&duplicate_of=is.null&location_status=eq.in_area&order=updated_at.desc&limit=600",
    );
    const translations = await supabaseGet<TranslationRow[]>(
      "event_translations?select=event_id,language,source_hash,manual_override&limit=2000",
    );

    const existing = new Map(
      translations.map((row) => [`${row.event_id}:${row.language}`, row]),
    );

    const work: Array<{
      event: EventRow;
      language: TargetLanguage;
      sourceHash: string;
    }> = [];

    for (const event of events) {
      const sourceHash = await sha256(`${event.title}\u0000${event.category || ""}`);
      for (const language of TARGET_LANGUAGES) {
        const row = existing.get(`${event.id}:${language}`);
        if (row?.manual_override) continue;
        if (row?.source_hash === sourceHash) continue;
        work.push({ event, language, sourceHash });
      }
    }

    const selected = work.slice(0, MAX_PAIRS_PER_RUN);
    const errors: Array<Record<string, string>> = [];
    let translated = 0;

    for (const item of selected) {
      try {
        const title = await googleTranslate(item.event.title, item.language);
        const now = new Date().toISOString();

        await upsertTranslation({
          event_id: item.event.id,
          language: item.language,
          title,
          category: translatedCategory(item.event.category, item.language),
          source_hash: item.sourceHash,
          provider: "google-translate-gtx",
          manual_override: false,
          translated_at: now,
          updated_at: now,
        });
        translated += 1;
        await sleep(120);
      } catch (error) {
        errors.push({
          event_id: item.event.id,
          language: item.language,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return Response.json({
      ok: errors.length === 0,
      visible_events: events.length,
      pending_before_run: work.length,
      attempted: selected.length,
      translated,
      failed: errors.length,
      remaining_estimate: Math.max(0, work.length - translated),
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
