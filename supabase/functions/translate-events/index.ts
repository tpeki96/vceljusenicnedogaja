import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Only public, published event titles are eligible for the existing Google translation service.
// Event reads use the anonymous public role; privileged credentials only access local translations.
const TARGET_LANGUAGES = ["en", "de", "it"] as const;
const MAX_PAIRS_PER_RUN = 6;
const RUN_BUDGET_MS = 80000;
const DAY_MS = 24 * 60 * 60 * 1000;

type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

type EventRow = {
  id: string;
  title: string;
  category: string | null;
  start_at: string;
  end_at: string | null;
  event_type: "single" | "multiday" | "ongoing";
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

async function supabaseGet<T>(path: string, publicRead = false): Promise<T> {
  const key = publicRead ? PUBLIC_ANON_KEY : SERVICE_ROLE_KEY;
  if (!key) throw new Error("Required database credential missing");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(10000),
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
      signal: AbortSignal.timeout(10000),
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

class TranslationRateLimitError extends Error {
  constructor() { super("Google Translate rate limited (HTTP 429)"); }
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
      
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; vceljusenicnedogaja.si translation worker)",
          Accept: "application/json,text/plain,*/*",
        },
      });

      if (response.status === 429) throw new TranslationRateLimitError();
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
      if (error instanceof TranslationRateLimitError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(500 * (attempt + 1));
  }

  throw new Error(`Google Translate failed: ${lastError}`);
}

function eventPriority(event: EventRow, nowMs: number) {
  const start = Date.parse(event.start_at);
  const end = Date.parse(event.end_at || event.start_at);

  if ((start <= nowMs && end >= nowMs) || (start <= nowMs && start >= nowMs - DAY_MS)) {
    return [0, start] as const;
  }
  if (start > nowMs) return [1, start] as const;
  return [2, -start] as const;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const startedAt = Date.now();
  try {
    const lower = new Date(Date.now() - DAY_MS).toISOString();
    const upper = new Date(Date.now() + 120 * DAY_MS).toISOString();
    const eventQuery = "events?select=id,title,category,start_at,end_at,event_type,updated_at&status=eq.published&duplicate_of=is.null&location_status=eq.in_area"
      + "&start_at=lte." + encodeURIComponent(upper)
      + "&or=" + encodeURIComponent("(start_at.gte." + lower + ",end_at.gte." + lower + ")")
      + "&order=start_at.asc,id.asc";
    const events: EventRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await supabaseGet<EventRow[]>(eventQuery + "&limit=500&offset=" + offset, true);
      events.push(...page);
      if (page.length < 500) break;
      if (offset >= 9500) throw new Error("Event pagination safety limit reached");
    }
    const translations: TranslationRow[] = [];
    for (let i = 0; i < events.length; i += 100) {
      const ids = events.slice(i, i + 100).map(event => event.id).join(",");
      const page = await supabaseGet<TranslationRow[]>(
        "event_translations?select=event_id,language,source_hash,manual_override&event_id=in.(" + ids + ")&limit=1000",
      );
      translations.push(...page);
    }

    const existing = new Map(
      translations.map((row) => [`${row.event_id}:${row.language}`, row]),
    );

    const nowMs = Date.now();
    const prioritizedEvents = [...events].sort((a, b) => {
      const ap = eventPriority(a, nowMs);
      const bp = eventPriority(b, nowMs);
      return ap[0] - bp[0] || ap[1] - bp[1];
    });

    const work: Array<{
      event: EventRow;
      language: TargetLanguage;
      sourceHash: string;
    }> = [];

    for (const event of prioritizedEvents) {
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
    let attempted = 0;
    let rateLimited = false;

    for (const item of selected) {
      if (Date.now() - startedAt > RUN_BUDGET_MS - 35000) break;
      attempted += 1;
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
        if (error instanceof TranslationRateLimitError) {
          rateLimited = true;
          break;
        }
      }
    }

    return Response.json({
      ok: errors.length === 0,
      visible_events: events.length,
      pending_before_run: work.length,
      attempted,
      translated,
      rate_limited: rateLimited,
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
