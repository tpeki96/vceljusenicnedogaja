import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const BASE_URL = "https://www.visitcelje.eu";
const LIST_ROOT = `${BASE_URL}/sl/kategorija-izdelka/kaj-poceti/dogodki/`;
const TIME_ZONE = "Europe/Ljubljana";
const USER_AGENT = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";
const HORIZON_DAYS = 240;
const MAX_PAGES = 40;

const OUT_OF_AREA = [
  /\bžalec\b/i,
  /\bzalec\b/i,
  /gornja radgona/i,
  /pomurski sejem/i,
  /laško/i,
  /lasko/i,
  /šentjur/i,
  /sentjur/i,
  /doberna/i,
  /vojnik/i,
  /slovenske konjice/i,
];

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string, attempts = 4) {
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
        await sleep(Math.min(retryAfter * 1000, 16000));
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
      if (attempt < attempts - 1) await sleep(1200 * (attempt + 1));
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
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
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return asUtc - timestamp;
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
  let offset = timeZoneOffsetMs(wallClock);
  let utc = wallClock - offset;
  offset = timeZoneOffsetMs(utc);
  utc = wallClock - offset;
  return new Date(utc).toISOString();
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
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
  if (single) {
    const date = { day: Number(single[1]), month: Number(single[2]), year: Number(single[3]) };
    return { start: date, end: date };
  }
  return null;
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
  const heading = $("h1,h2,h3,h4,h5,h6").filter((_i, el) => clean($(el).text()).toLocaleLowerCase("sl-SI") === label.toLocaleLowerCase("sl-SI")).first();
  if (heading.length) {
    let node = heading.next();
    for (let i = 0; i < 5 && node.length; i += 1, node = node.next()) {
      const value = clean(node.text());
      if (value) return value;
    }
    const parentText = clean(heading.parent().text());
    const stripped = clean(parentText.replace(new RegExp(`^${label}\\s*`, "i"), ""));
    if (stripped && stripped.toLocaleLowerCase("sl-SI") !== label.toLocaleLowerCase("sl-SI")) return stripped;
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

function locationStatus(location: string | null, content: string) {
  const haystack = `${location ?? ""} ${content}`;
  if (OUT_OF_AREA.some((pattern) => pattern.test(haystack))) return "out_of_area" as const;
  return "in_area" as const;
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
    .replace(/\b(?:prvi|drugi|tretji|cetrti|peti)\s+dan\b/gi, "")
    .replace(/&/g, " in ")
    .replace(/[^a-z0-9čšž]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  const stop = new Set(["v", "na", "in", "za", "z", "s", "pri", "po", "the"]);
  return normalizeTitle(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
}

function textSimilarity(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 7) return 0.94;
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
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
  const locStatus = locationStatus(location, content);
  const imageUrl = $("meta[property='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content") || null;
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop()!;

  return {
    source_event_id: slug,
    title,
    slug,
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
    .from("sources").select("id,last_synced_at").eq("key", "visit-celje").single();
  if (sourceError || !source) {
    return Response.json({ ok: false, error: sourceError?.message ?? "Source missing" }, { status: 500 });
  }

  if (source.last_synced_at && Date.now() - new Date(source.last_synced_at).getTime() < 4 * 60 * 60 * 1000) {
    return Response.json({ ok: true, skipped: true, reason: "recently_synced" });
  }

  const today = dateKey(new Date());
  const lower = addDays(today, -1);
  const upper = addDays(today, HORIZON_DAYS);
  const candidates = new Map<string, { startKey: string; endKey: string }>();
  const warnings: string[] = [];

  let firstHtml: string;
  try {
    firstHtml = await fetchHtml(LIST_ROOT);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }

  const first$ = load(firstHtml);
  let maxPage = 1;
  first$("a[href]").each((_i, element) => {
    const page = pageNumber(first$(element).attr("href"));
    if (page && page > maxPage) maxPage = page;
  });
  maxPage = Math.min(maxPage, MAX_PAGES);

  async function collect(html: string) {
    const $ = load(html);
    $("a[href]").each((_i, element) => {
      const url = eventUrl($(element).attr("href"));
      if (!url) return;
      const dateRange = parseListDate($(element).text());
      if (!dateRange) return;
      const startKey = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, "0")}-${String(dateRange.start.day).padStart(2, "0")}`;
      const endKey = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, "0")}-${String(dateRange.end.day).padStart(2, "0")}`;
      if (endKey < lower || startKey > upper) return;
      candidates.set(url, { startKey, endKey });
    });
  }

  await collect(firstHtml);
  for (let page = 2; page <= maxPage; page += 1) {
    await sleep(650);
    try {
      const html = await fetchHtml(`${LIST_ROOT}page/${page}/`);
      await collect(html);
    } catch (error) {
      warnings.push(`page ${page}: ${error instanceof Error ? error.message : String(error)}`);
      if (/429/.test(warnings[warnings.length - 1])) break;
    }
  }

  if (!candidates.size) {
    return Response.json({ ok: false, error: "No current/future Visit Celje events discovered", pages_scanned: maxPage, warnings }, { status: 502 });
  }

  const failures: string[] = [];
  const parsed: Array<Awaited<ReturnType<typeof parseDetail>>> = [];
  for (const url of candidates.keys()) {
    await sleep(700);
    try {
      parsed.push(await parseDetail(url));
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      if (failures.filter((item) => /429/.test(item)).length >= 3) break;
    }
  }

  const nowIso = new Date().toISOString();
  const rows = parsed.map((event) => ({
    ...event,
    source_id: source.id,
    last_seen_at: nowIso,
    updated_at: nowIso,
  }));

  const { data: imported, error: upsertError } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "source_id,source_event_id" })
    .select("id,title,start_at,end_at,venue,event_type,status,location_status");
  if (upsertError) {
    return Response.json({ ok: false, error: upsertError.message, parsed: rows.length }, { status: 500 });
  }

  const published = (imported ?? []).filter((event) => event.status === "published");
  let deduped = 0;
  let seriesCollapsed = 0;
  const dedupeExamples: Array<Record<string, unknown>> = [];

  if (published.length) {
    const minStart = new Date(Math.min(...published.map((event) => new Date(event.start_at).getTime())) - 86400000).toISOString();
    const maxEnd = new Date(Math.max(...published.map((event) => new Date(event.end_at ?? event.start_at).getTime())) + 86400000).toISOString();
    const { data: existing, error: existingError } = await supabase
      .from("events")
      .select("id,title,start_at,end_at,venue,event_type,source_id,duplicate_of")
      .neq("source_id", source.id)
      .is("duplicate_of", null)
      .eq("status", "published")
      .gte("start_at", minStart)
      .lte("start_at", maxEnd);
    if (existingError) return Response.json({ ok: false, error: existingError.message }, { status: 500 });

    for (const event of published) {
      const matches = (existing ?? [])
        .map((candidate) => {
          const titleScore = textSimilarity(event.title, candidate.title);
          const venueScore = textSimilarity(event.venue, candidate.venue);
          const overlap = rangesOverlap(event.start_at, event.end_at, candidate.start_at, candidate.end_at);
          if (!overlap || titleScore < 0.72) return null;

          // A months-long umbrella programme is not the same thing as one matching daily occurrence.
          if (event.event_type === "ongoing" && candidate.event_type === "single") return null;

          const sameStart = isoDateKey(event.start_at) === isoDateKey(candidate.start_at);
          const score = titleScore * 0.80 + venueScore * 0.12 + (sameStart ? 0.08 : 0.03);
          return { candidate, titleScore, venueScore, score };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => b.score - a.score);

      const eventStart = isoDateKey(event.start_at)!;
      const eventEnd = isoDateKey(event.end_at ?? event.start_at)!;
      const seriesMatches = (existing ?? [])
        .map((candidate) => ({
          candidate,
          titleScore: textSimilarity(event.title, candidate.title),
          venueScore: textSimilarity(event.venue, candidate.venue),
        }))
        .filter((item) => {
          const candidateDate = isoDateKey(item.candidate.start_at)!;
          return event.event_type === "multiday" && item.titleScore >= 0.82 && candidateDate >= eventStart && candidateDate <= eventEnd;
        });
      const distinctSeriesDates = new Set(seriesMatches.map((item) => isoDateKey(item.candidate.start_at)));
      const seriesSplit = distinctSeriesDates.size >= 2;

      let best = matches[0] ?? null;
      if (seriesSplit) {
        best = seriesMatches
          .sort((a, b) => (b.titleScore + b.venueScore * 0.1) - (a.titleScore + a.venueScore * 0.1))[0] as typeof best;
      }
      if (!best) continue;
      const score = "score" in best ? best.score : Math.min(1, best.titleScore * 0.9 + best.venueScore * 0.1);
      if (!seriesSplit && score < 0.78) continue;

      const reason = seriesSplit
        ? `series_split:${distinctSeriesDates.size}_daily_records`
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
        await supabase.from("events").update({
          end_at: event.end_at,
          event_type: event.event_type,
          updated_at: nowIso,
        }).eq("id", best.candidate.id);
      }

      if (dedupeExamples.length < 10) {
        dedupeExamples.push({
          incoming: event.title,
          canonical: best.candidate.title,
          confidence: Number(score.toFixed(3)),
          reason,
        });
      }
    }
  }

  await supabase.from("sources").update({ last_synced_at: nowIso, updated_at: nowIso }).eq("id", source.id);

  return Response.json({
    ok: true,
    pages_scanned: maxPage,
    discovered_current_or_future: candidates.size,
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
