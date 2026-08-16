import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const BASE_URL = "https://www.visitcelje.eu";
const LIST_ROOT = `${BASE_URL}/sl/kategorija-izdelka/kaj-poceti/dogodki/`;
const TIME_ZONE = "Europe/Ljubljana";
const USER_AGENT = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";
const HORIZON_DAYS = 120;
const MAX_PAGES = 40;
const MAX_DETAILS_PER_RUN = 48;

const OUT_OF_AREA = [
  /\bžalec\b/i,
  /\bzalec\b/i,
  /gornja radgona/i,
  /pomurski sejem/i,
  /\blaško\b/i,
  /\blasko\b/i,
  /\bšentjur\b/i,
  /\bsentjur\b/i,
  /\bdobrna\b/i,
  /\bvojnik\b/i,
  /slovenske konjice/i,
];

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string, attempts = 3) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "sl-SI,sl;q=0.9,en;q=0.6",
        },
        redirect: "follow",
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || 2 ** (attempt + 1);
        await sleep(Math.min(retryAfter * 1000, 10000));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

      const html = await response.text();
      if (/request is being verified|just a moment|cloudflare/i.test(html) && html.length < 30000) {
        throw new Error(`Anti-bot page returned for ${url}`);
      }
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts - 1) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function mapBatches<T, R>(items: T[], concurrency: number, pauseMs: number, fn: (item: T) => Promise<R>) {
  const output: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    output.push(...(await Promise.all(batch.map(fn))));
    if (i + concurrency < items.length) await sleep(pauseMs);
  }
  return output;
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
  return Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  ) - timestamp;
}

function localDateTimeToIso(
  date: { year: number; month: number; day: number },
  time?: { hour: number; minute: number } | null,
  endOfDay = false,
) {
  const hour = time?.hour ?? (endOfDay ? 23 : 0);
  const minute = time?.minute ?? (endOfDay ? 59 : 0);
  const second = endOfDay && !time ? 59 : 0;
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second);
  let utc = wallClock - timeZoneOffsetMs(wallClock);
  utc = wallClock - timeZoneOffsetMs(utc);
  return new Date(utc).toISOString();
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isoDateKey(iso: string | null) {
  return iso ? dateKey(new Date(iso)) : null;
}

function addDays(key: string, amount: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12)).toISOString().slice(0, 10);
}

function daysBetween(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day, 12) - Date.UTC(a.year, a.month - 1, a.day, 12)) / 86400000);
}

function classifyEvent(start: { year: number; month: number; day: number }, end: { year: number; month: number; day: number }) {
  const span = daysBetween(start, end);
  if (span <= 0) return "single" as const;
  if (span <= 7) return "multiday" as const;
  return "ongoing" as const;
}

function parseListDate(text: string) {
  const value = clean(text).replace(/[–—]/g, "-");
  const range = value.match(/^(\d{1,2})\.(\d{1,2})\.\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (range) {
    return {
      start: { day: Number(range[1]), month: Number(range[2]), year: Number(range[5]) },
      end: { day: Number(range[3]), month: Number(range[4]), year: Number(range[5]) },
    };
  }
  const single = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!single) return null;
  const date = { day: Number(single[1]), month: Number(single[2]), year: Number(single[3]) };
  return { start: date, end: date };
}

function parseDetailDate(value: string | null) {
  if (!value) return null;
  const match = clean(value).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+ob\s+(\d{1,2}):(\d{2}))?/i);
  if (!match) return null;
  return {
    date: { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) },
    time: match[4] ? { hour: Number(match[4]), minute: Number(match[5]) } : null,
  };
}

function fieldAfterHeading($: ReturnType<typeof load>, label: string) {
  const heading = $("h1,h2,h3,h4,h5,h6")
    .filter((_i, el) => clean($(el).text()).toLocaleLowerCase("sl-SI") === label.toLocaleLowerCase("sl-SI"))
    .first();

  if (heading.length) {
    let node = heading.next();
    for (let i = 0; i < 5 && node.length; i += 1, node = node.next()) {
      const value = clean(node.text());
      if (value) return value;
    }
  }

  const main = clean($("main").text() || $("body").text());
  const labels = ["Začetek", "Konec", "Lokacija", "Spletna stran", "Telefon", "E-poštni naslov"];
  const nextLabels = labels.filter((item) => item !== label).join("|");
  const match = main.match(new RegExp(`${label}\\s+(.+?)(?=\\s+(?:${nextLabels})\\s+|$)`, "i"));
  return match ? clean(match[1]) : null;
}

function detailContent($: ReturnType<typeof load>) {
  const main = clean($("main").text() || $("body").text());
  const marker = main.indexOf("Več o dogodku");
  let value = marker >= 0 ? main.slice(marker) : main;
  const cut = value.indexOf("Priporočamo vam");
  if (cut >= 0) value = value.slice(0, cut);
  return clean(value).slice(0, 5000);
}

function eventUrl(href: string | undefined) {
  if (!href) return null;
  try {
    const url = new URL(href, BASE_URL);
    if (!/^(?:www\.)?visitcelje\.eu$/i.test(url.hostname)) return null;
    if (!/^\/sl\/izdelek\/[^/]+\/$/.test(url.pathname)) return null;
    return `${BASE_URL}${url.pathname}`;
  } catch {
    return null;
  }
}

function slugFromUrl(url: string) {
  return new URL(url).pathname.split("/").filter(Boolean).pop()!;
}

function pageNumber(href: string | undefined) {
  if (!href) return null;
  try {
    const url = new URL(href, BASE_URL);
    const match = url.pathname.match(/\/dogodki\/page\/(\d+)\/?$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function inferCategory(title: string, content: string) {
  const text = `${title} ${content}`.toLocaleLowerCase("sl-SI");
  if (/razstav|galerij|likovn|fotograf/.test(text)) return "Razstava";
  if (/koncert|glasb|orkester|pev|jazz|rock|klasika/.test(text)) return "Glasba";
  if (/delavnic|ustvarjal|izdelav/.test(text)) return "Delavnica";
  if (/gledali|predstav|performans|muzikal|ples/.test(text)) return "Predstava";
  if (/tekma|šport|sport|košark|nogomet|tek|koles|slalom/.test(text)) return "Šport";
  if (/voden|sprehod|ogled/.test(text)) return "Vodenje";
  if (/otrok|družin|počitni/.test(text)) return "Za otroke";
  return "Dogodek";
}

function priceAndFree(content: string, title: string) {
  const explicitFree = /\bbrezplač/i.test(title) || /\bvstop\s+prost/i.test(content) || /\bbrezplač(?:en|na|no|ni)\b/i.test(content);
  const price = content.match(/(?:cena|vstopnina)\s*:?\s*(?:od\s*)?(\d+(?:[,.]\d+)?)\s*€/i);
  if (price) return { isFree: false as boolean | null, priceText: `${price[1]} €` };
  return { isFree: explicitFree ? true : null, priceText: null as string | null };
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTitle(value: string) {
  return stripAccents(value)
    .toLocaleLowerCase("sl-SI")
    .replace(/^poletje\s+v\s+celju\s+\d{4}\s*[|:\-–]\s*/i, "")
    .replace(/^\s*(koncert|dogodek|predstava|prireditev|festival)\s*[:\-–]\s*/i, "")
    .replace(/\b(?:1|2|3|4|5)\.?\s*dan\b/gi, "")
    .replace(/&/g, " in ")
    .replace(/[^a-z0-9čšž]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarity(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 7) return 0.94;
  const aa = new Set(na.split(" ").filter((token) => token.length > 1));
  const bb = new Set(nb.split(" ").filter((token) => token.length > 1));
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

function rangesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) {
  const as = isoDateKey(aStart)!;
  const ae = isoDateKey(aEnd ?? aStart)!;
  const bs = isoDateKey(bStart)!;
  const be = isoDateKey(bEnd ?? bStart)!;
  return as <= be && bs <= ae;
}

async function parseDetail(url: string) {
  const html = await fetchHtml(url);
  const $ = load(html);
  const title = clean($("h1").first().text());
  const startText = fieldAfterHeading($, "Začetek");
  const endText = fieldAfterHeading($, "Konec");
  const location = fieldAfterHeading($, "Lokacija");
  const start = parseDetailDate(startText);
  const end = parseDetailDate(endText) ?? start;
  if (!title || !start || !end) throw new Error(`Could not parse title/date for ${url}`);

  const eventType = classifyEvent(start.date, end.date);
  const startAt = localDateTimeToIso(start.date, start.time, false);
  let endAt: string | null = null;
  if (eventType !== "single") endAt = localDateTimeToIso(end.date, end.time, !end.time);
  else if (end.time) endAt = localDateTimeToIso(end.date, end.time, false);

  const content = detailContent($);
  const { isFree, priceText } = priceAndFree(content, title);
  const imageUrl = $("meta[property='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content") || null;
  const locStatus = location && OUT_OF_AREA.some((pattern) => pattern.test(location)) ? "out_of_area" : "in_area";

  return {
    source_event_id: slugFromUrl(url),
    title,
    slug: slugFromUrl(url),
    start_at: startAt,
    end_at: endAt,
    all_day: !start.time,
    venue: location,
    address: /\d/.test(location ?? "") ? location : null,
    city: "Celje",
    category: inferCategory(title, content),
    event_type: eventType,
    is_free: isFree,
    price_text: priceText,
    description: content,
    image_url: imageUrl,
    source_url: url,
    status: locStatus === "out_of_area" ? "hidden" : "published",
    location_status: locStatus,
    duplicate_of: null,
    dedupe_confidence: null,
    dedupe_reason: null,
    raw: { start_text: startText, end_text: endText, location_text: location },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id,last_synced_at")
    .eq("key", "visit-celje")
    .single();
  if (sourceError || !source) return Response.json({ ok: false, error: sourceError?.message ?? "Source missing" }, { status: 500 });

  if (source.last_synced_at && Date.now() - new Date(source.last_synced_at).getTime() < 20 * 60 * 1000) {
    return Response.json({ ok: true, skipped: true, reason: "recently_synced" });
  }

  const today = dateKey(new Date());
  const lower = addDays(today, -1);
  const upper = addDays(today, HORIZON_DAYS);
  const candidates = new Map<string, { startKey: string; endKey: string }>();
  const warnings: string[] = [];

  const firstHtml = await fetchHtml(LIST_ROOT);
  const first$ = load(firstHtml);
  let maxPage = 1;
  first$("a[href]").each((_i, element) => {
    const page = pageNumber(first$(element).attr("href"));
    if (page && page > maxPage) maxPage = page;
  });
  maxPage = Math.min(maxPage, MAX_PAGES);

  function collect(html: string) {
    const $ = load(html);
    $("a[href]").each((_i, element) => {
      const url = eventUrl($(element).attr("href"));
      if (!url) return;
      const range = parseListDate($(element).text());
      if (!range) return;
      const startKey = `${range.start.year}-${String(range.start.month).padStart(2, "0")}-${String(range.start.day).padStart(2, "0")}`;
      const endKey = `${range.end.year}-${String(range.end.month).padStart(2, "0")}-${String(range.end.day).padStart(2, "0")}`;
      if (endKey < lower || startKey > upper) return;
      candidates.set(url, { startKey, endKey });
    });
  }

  collect(firstHtml);
  const otherPages = Array.from({ length: Math.max(0, maxPage - 1) }, (_v, i) => i + 2);
  await mapBatches(otherPages, 3, 350, async (page) => {
    try {
      collect(await fetchHtml(`${LIST_ROOT}page/${page}/`));
    } catch (error) {
      warnings.push(`page ${page}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  });

  if (!candidates.size) {
    return Response.json({ ok: false, error: "No current/future Visit Celje events discovered", pages_scanned: maxPage, warnings }, { status: 502 });
  }

  const { data: knownRows } = await supabase
    .from("events")
    .select("source_event_id")
    .eq("source_id", source.id);
  const known = new Set((knownRows ?? []).map((row) => row.source_event_id));

  const ordered = [...candidates.entries()].sort((a, b) => a[1].startKey.localeCompare(b[1].startKey));
  const newCandidates = ordered.filter(([url]) => !known.has(slugFromUrl(url)));
  const existingCandidates = ordered.filter(([url]) => known.has(slugFromUrl(url)));
  const work = [...newCandidates, ...existingCandidates].slice(0, MAX_DETAILS_PER_RUN);

  const failures: string[] = [];
  const parsedResults = await mapBatches(work, 2, 450, async ([url]) => {
    try {
      return await parseDetail(url);
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  const parsed = parsedResults.filter((item): item is NonNullable<typeof item> => Boolean(item));

  const nowIso = new Date().toISOString();
  const rows = parsed.map((event) => ({ ...event, source_id: source.id, last_seen_at: nowIso, updated_at: nowIso }));
  const { data: imported, error: upsertError } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "source_id,source_event_id" })
    .select("id,title,start_at,end_at,venue,event_type,status,location_status");
  if (upsertError) return Response.json({ ok: false, error: upsertError.message, parsed: rows.length }, { status: 500 });

  const published = (imported ?? []).filter((event) => event.status === "published");
  let deduped = 0;
  let seriesCollapsed = 0;
  const dedupeExamples: Array<Record<string, unknown>> = [];

  if (published.length) {
    const minStart = new Date(Math.min(...published.map((event) => new Date(event.start_at).getTime())) - 86400000).toISOString();
    const maxEnd = new Date(Math.max(...published.map((event) => new Date(event.end_at ?? event.start_at).getTime())) + 86400000).toISOString();
    const { data: existing } = await supabase
      .from("events")
      .select("id,title,start_at,end_at,venue,event_type,source_id,duplicate_of")
      .neq("source_id", source.id)
      .is("duplicate_of", null)
      .eq("status", "published")
      .gte("start_at", minStart)
      .lte("start_at", maxEnd);

    for (const event of published) {
      const direct = (existing ?? [])
        .map((candidate) => {
          const titleScore = textSimilarity(event.title, candidate.title);
          const venueScore = textSimilarity(event.venue, candidate.venue);
          if (!rangesOverlap(event.start_at, event.end_at, candidate.start_at, candidate.end_at) || titleScore < 0.72) return null;
          if (event.event_type === "ongoing" && candidate.event_type === "single") return null;
          const sameStart = isoDateKey(event.start_at) === isoDateKey(candidate.start_at);
          return { candidate, titleScore, venueScore, score: titleScore * 0.8 + venueScore * 0.12 + (sameStart ? 0.08 : 0.03) };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => b.score - a.score);

      const eventStart = isoDateKey(event.start_at)!;
      const eventEnd = isoDateKey(event.end_at ?? event.start_at)!;
      const series = (existing ?? [])
        .map((candidate) => ({ candidate, titleScore: textSimilarity(event.title, candidate.title), venueScore: textSimilarity(event.venue, candidate.venue) }))
        .filter((item) => {
          const candidateDate = isoDateKey(item.candidate.start_at)!;
          return event.event_type === "multiday" && item.titleScore >= 0.82 && candidateDate >= eventStart && candidateDate <= eventEnd;
        });
      const seriesDates = new Set(series.map((item) => isoDateKey(item.candidate.start_at)));
      const seriesSplit = seriesDates.size >= 2;

      let best: any = direct[0] ?? null;
      if (seriesSplit) best = series.sort((a, b) => (b.titleScore + b.venueScore * 0.1) - (a.titleScore + a.venueScore * 0.1))[0] ?? null;
      if (!best) continue;
      const score = typeof best.score === "number" ? best.score : Math.min(1, best.titleScore * 0.9 + best.venueScore * 0.1);
      if (!seriesSplit && score < 0.78) continue;

      const reason = seriesSplit
        ? `series_split:${seriesDates.size}_daily_records`
        : `title:${best.titleScore.toFixed(2)},venue:${best.venueScore.toFixed(2)}`;

      await supabase.from("events").update({
        duplicate_of: best.candidate.id,
        dedupe_confidence: Number(score.toFixed(3)),
        dedupe_reason: reason,
        updated_at: nowIso,
      }).eq("id", event.id);
      deduped += 1;
      if (seriesSplit) seriesCollapsed += 1;

      if (!seriesSplit && event.end_at && !best.candidate.end_at && event.event_type !== "ongoing") {
        await supabase.from("events").update({ end_at: event.end_at, event_type: event.event_type, updated_at: nowIso }).eq("id", best.candidate.id);
      }

      if (dedupeExamples.length < 10) {
        dedupeExamples.push({ incoming: event.title, canonical: best.candidate.title, confidence: Number(score.toFixed(3)), reason });
      }
    }
  }

  await supabase.from("sources").update({ last_synced_at: nowIso, updated_at: nowIso }).eq("id", source.id);

  return Response.json({
    ok: true,
    pages_scanned: maxPage,
    discovered_current_or_future: candidates.size,
    selected_for_detail: work.length,
    remaining_new_estimate: Math.max(0, newCandidates.length - work.length),
    imported: rows.length,
    hidden_out_of_area: rows.filter((row) => row.location_status === "out_of_area").length,
    failed: failures.length,
    deduped,
    series_collapsed: seriesCollapsed,
    dedupe_examples: dedupeExamples,
    warnings: warnings.slice(0, 8),
    failures: failures.slice(0, 10),
  });
});
