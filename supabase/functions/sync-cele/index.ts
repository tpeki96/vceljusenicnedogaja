import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const BASE_URL = "https://www.cele.si";
const TIME_ZONE = "Europe/Ljubljana";
const USER_AGENT =
  "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";

const CATEGORIES = [
  ["Koncerti", "koncerti"],
  ["Za otroke", "za-otroke"],
  ["Ostalo", "ostalo"],
  ["Šport", "sport"],
  ["Predavanja", "predavanja"],
  ["Vodenja", "vodenja"],
  ["Gledališče", "gledalisce"],
  ["Predstave", "predstave"],
  ["Razstave", "razstave"],
  ["Sejmi", "sejmi"],
] as const;

const MONTHS: Record<string, number> = {
  januar: 1,
  januarja: 1,
  februar: 2,
  februarja: 2,
  marec: 3,
  marca: 3,
  april: 4,
  aprila: 4,
  maj: 5,
  maja: 5,
  junij: 6,
  junija: 6,
  julij: 7,
  julija: 7,
  avgust: 8,
  avgusta: 8,
  september: 9,
  septembra: 9,
  oktober: 10,
  oktobra: 10,
  november: 11,
  novembra: 11,
  december: 12,
  decembra: 12,
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "sl-SI,sl;q=0.9,en;q=0.6",
    },
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  const html = await response.text();
  if (/request is being verified|just a moment|cloudflare/i.test(html) && html.length < 30000) {
    throw new Error(`Anti-bot page returned for ${url}`);
  }
  return html;
}

function eventUrlFromHref(href: string | undefined) {
  if (!href) return null;
  try {
    const url = new URL(href, BASE_URL);
    if (url.hostname !== "www.cele.si" && url.hostname !== "cele.si") return null;
    const path = url.pathname.replace(/\/+$/, "/");
    if (!/^\/dogodek\/[^/]+\/$/.test(path)) return null;
    return `${BASE_URL}${path}`;
  } catch {
    return null;
  }
}

function leafTextAfterLabel($: ReturnType<typeof load>, wantedLabel: string) {
  const wanted = wantedLabel.toLocaleUpperCase("sl-SI");
  const elements = $("body *").toArray();

  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    const text = clean($(element).text()).toLocaleUpperCase("sl-SI");
    if ($(element).children().length === 0 && text === wanted) {
      for (let j = i + 1; j < Math.min(elements.length, i + 25); j += 1) {
        const candidate = elements[j];
        if ($(candidate).children().length > 0) continue;
        const value = clean($(candidate).text());
        if (!value) continue;
        const upper = value.toLocaleUpperCase("sl-SI");
        if (["DATUM", "URA DOGODKA", "LOKACIJA"].includes(upper)) continue;
        return value;
      }
    }
  }

  return null;
}

function parseSlovenianDate(value: string | null) {
  if (!value) return null;
  const match = clean(value)
    .toLocaleLowerCase("sl-SI")
    .match(/(\d{1,2})\.\s*([a-zčšž]+)\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[2]];
  if (!month) return null;
  return { day: Number(match[1]), month, year: Number(match[3]) };
}

function timeZoneOffsetMs(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - timestamp;
}

function localDateTimeToIso(
  date: { year: number; month: number; day: number },
  time: string | null,
) {
  const match = (time ?? "00:00").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  let offset = timeZoneOffsetMs(wallClock);
  let utc = wallClock - offset;
  offset = timeZoneOffsetMs(utc);
  utc = wallClock - offset;
  return new Date(utc).toISOString();
}

function priceFromBody(bodyText: string) {
  const marker = bodyText.search(/Cena vstopnic:/i);
  if (marker === -1) return null;
  const tail = bodyText.slice(marker).replace(/^.*?Cena vstopnic:\s*/i, "");
  const value = tail.split(
    /Predprodaja vstopnic:|Spletna prodaja:|📍|Lokacija:|Število ogledov|Želite opomnik|document\.addEventListener|🏪|🛒/i,
  )[0];
  return clean(value) || null;
}

function addressFromBody(bodyText: string, venue: string | null) {
  const marker = bodyText.indexOf("📍 Lokacija:");
  if (marker === -1) return null;
  let tail = clean(bodyText.slice(marker + "📍 Lokacija:".length));
  if (venue && tail.startsWith(venue)) tail = clean(tail.slice(venue.length));
  tail = tail.split(/Število ogledov|Želite opomnik|document\.addEventListener/i)[0];
  return clean(tail) || null;
}

async function parseDetail(url: string, category: string) {
  const html = await fetchHtml(url);
  const $ = load(html);
  const title = clean($("h1").first().text());
  const dateText = leafTextAfterLabel($, "DATUM");
  const timeText = leafTextAfterLabel($, "URA DOGODKA");
  const venue = leafTextAfterLabel($, "LOKACIJA");
  const date = parseSlovenianDate(dateText);

  if (!title || !date) throw new Error(`Could not parse title/date for ${url}`);

  const startAt = localDateTimeToIso(date, timeText);
  if (!startAt) throw new Error(`Could not parse time for ${url}`);

  const bodyText = clean($("body").text());
  const priceText = priceFromBody(bodyText);
  const imageUrl =
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    null;
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop()!;

  let isFree: boolean | null = null;
  if (priceText) {
    isFree = /brezpla|vstop\s+prost|prost\s+vstop|^0(?:[,.]0+)?\s*€?$/i.test(priceText);
  }

  return {
    source_event_id: slug,
    title,
    slug,
    start_at: startAt,
    // cele.si currently exposes only the start date. Do not write end_at here:
    // a second source may have enriched an existing row with a verified date range.
    all_day: false,
    venue,
    address: addressFromBody(bodyText, venue),
    city: "Celje",
    category,
    is_free: isFree,
    price_text: priceText,
    description: null,
    image_url: imageUrl,
    source_url: url,
    status: "published",
    raw: { date_text: dateText, time_text: timeText },
  };
}

async function mapBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id,last_synced_at")
    .eq("key", "cele-si")
    .single();

  if (sourceError || !source) {
    return Response.json({ ok: false, error: sourceError?.message ?? "Source missing" }, { status: 500 });
  }

  if (source.last_synced_at) {
    const ageMs = Date.now() - new Date(source.last_synced_at).getTime();
    if (ageMs < 20 * 60 * 1000) {
      return Response.json({ ok: true, skipped: true, reason: "recently_synced" });
    }
  }

  const discovered = new Map<string, string>();
  const warnings: string[] = [];

  for (const [category, slug] of CATEGORIES) {
    try {
      const html = await fetchHtml(`${BASE_URL}/kategorija-dogodka/${slug}/`);
      const $ = load(html);
      $("a[href]").each((_index, element) => {
        const eventUrl = eventUrlFromHref($(element).attr("href"));
        if (eventUrl && !discovered.has(eventUrl)) discovered.set(eventUrl, category);
      });
    } catch (error) {
      warnings.push(`${category}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const html = await fetchHtml(`${BASE_URL}/dogodek/`);
    const $ = load(html);
    $("a[href]").each((_index, element) => {
      const eventUrl = eventUrlFromHref($(element).attr("href"));
      if (eventUrl && !discovered.has(eventUrl)) discovered.set(eventUrl, "Ostalo");
    });
  } catch (error) {
    warnings.push(`Archive: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (discovered.size === 0) {
    return Response.json({ ok: false, error: "No event URLs discovered", warnings }, { status: 502 });
  }

  const failures: string[] = [];
  const parsed = await mapBatches([...discovered.entries()], 6, async ([url, category]) => {
    try {
      return await parseDetail(url, category);
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  const nowIso = new Date().toISOString();
  const rows = parsed
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .map((event) => ({
      ...event,
      source_id: source.id,
      last_seen_at: nowIso,
      updated_at: nowIso,
    }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from("events")
      .upsert(rows.slice(i, i + 100), { onConflict: "source_id,source_event_id" });
    if (error) {
      return Response.json({ ok: false, error: error.message, discovered: discovered.size, parsed: rows.length }, { status: 500 });
    }
  }

  await supabase
    .from("sources")
    .update({ last_synced_at: nowIso, updated_at: nowIso })
    .eq("id", source.id);

  return Response.json({
    ok: true,
    discovered: discovered.size,
    imported: rows.length,
    failed: failures.length,
    warnings,
    failures: failures.slice(0, 10),
  });
});
