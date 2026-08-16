import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const BASE_URL = "https://www.celje.info";
const LIST_URL = `${BASE_URL}/kam-v-celju/`;
const TIME_ZONE = "Europe/Ljubljana";
const USER_AGENT = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";

const OUT_OF_AREA = [
  /pomurski sejem/i,
  /gornja radgona/i,
  /ekomuzej hmeljarstva/i,
  /fontana piv zeleno zlato/i,
  /\bžalec\b/i,
  /\bzalec\b/i,
];

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
    if (url.hostname !== "www.celje.info" && url.hostname !== "celje.info") return null;
    const path = url.pathname.replace(/\/+$/, "/");
    if (!/^\/events\/event\/[^/]+\/$/.test(path)) return null;
    return `${BASE_URL}${path}`;
  } catch {
    return null;
  }
}

function detailValue($: ReturnType<typeof load>, label: string) {
  const wanted = `${label}:`.toLocaleLowerCase("sl-SI");
  const item = $("li").filter((_i, el) => clean($(el).text()).toLocaleLowerCase("sl-SI").startsWith(wanted)).first();
  if (item.length) return clean(item.text()).replace(new RegExp(`^${label}:\\s*`, "i"), "");

  const body = clean($("body").text());
  const labels = ["Datum", "Lokacija", "Kategorije"];
  const next = labels.filter((x) => x !== label).join("|");
  const match = body.match(new RegExp(`${label}:\\s*(.+?)(?=\\s+(?:${next}):|\\s+Navedbe o dogodkih|$)`, "i"));
  return match ? clean(match[1]) : null;
}

function eventContent($: ReturnType<typeof load>) {
  const full = clean($("main").text() || $("body").text());
  const start = full.indexOf("Podrobnosti dogodka");
  let content = start >= 0 ? full.slice(start) : full;
  const end = content.indexOf("Navedbe o dogodkih so informativnega značaja");
  if (end >= 0) content = content.slice(0, end);
  return clean(content);
}

function timeZoneOffsetMs(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
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

function dateOnly(date: { year: number; month: number; day: number }) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function daysBetween(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day, 12) - Date.UTC(a.year, a.month - 1, a.day, 12)) / 86400000);
}

function parseDateRange(value: string | null) {
  if (!value) return null;
  const text = clean(value).replace(/[–—]/g, "-");

  const condensed = text.match(/^(\d{1,2})\.?\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (condensed) {
    const start = { day: Number(condensed[1]), month: Number(condensed[3]), year: Number(condensed[4]) };
    const end = { day: Number(condensed[2]), month: Number(condensed[3]), year: Number(condensed[4]) };
    const endTime = condensed[5] ? { hour: Number(condensed[5]), minute: Number(condensed[6]) } : null;
    return { start, end, startTime: null, endTime, allDay: !endTime };
  }

  const matches = [...text.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/g)];
  if (!matches.length) return null;
  const first = matches[0];
  const start = { day: Number(first[1]), month: Number(first[2]), year: Number(first[3]) };
  const startTime = first[4] ? { hour: Number(first[4]), minute: Number(first[5]) } : null;

  if (matches.length >= 2) {
    const last = matches[matches.length - 1];
    const end = { day: Number(last[1]), month: Number(last[2]), year: Number(last[3]) };
    const endTime = last[4] ? { hour: Number(last[4]), minute: Number(last[5]) } : null;
    return { start, end, startTime, endTime, allDay: !startTime && !endTime };
  }
  return { start, end: start, startTime, endTime: null, allDay: !startTime };
}

function classifyEvent(start: { year: number; month: number; day: number }, end: { year: number; month: number; day: number }) {
  const span = daysBetween(start, end);
  if (span <= 0) return "single" as const;
  if (span <= 7) return "multiday" as const;
  return "ongoing" as const;
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTitle(value: string) {
  return stripAccents(value)
    .toLocaleLowerCase("sl-SI")
    .replace(/^\s*(koncert|dogodek|predstava|prireditev|festival)\s*[:\-–]\s*/i, "")
    .replace(/\b(?:1|2|3|4|5)\.?\s*dan\b/gi, "")
    .replace(/\b(?:prvi|drugi|tretji|četrti|peti)\s+dan\b/gi, "")
    .replace(/&/g, " in ")
    .replace(/[^a-z0-9čšž]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  const stop = new Set(["v", "na", "in", "za", "z", "s", "pri", "po", "the"]);
  return normalizeTitle(value).split(" ").filter((x) => x.length > 1 && !stop.has(x));
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
  const intersection = [...aa].filter((x) => bb.has(x)).length;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

function celjeDateKey(iso: string | null) {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rangesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) {
  const as = celjeDateKey(aStart)!;
  const ae = celjeDateKey(aEnd ?? aStart)!;
  const bs = celjeDateKey(bStart)!;
  const be = celjeDateKey(bEnd ?? bStart)!;
  return as <= be && bs <= ae;
}

function locationStatus(venue: string | null) {
  if (venue && OUT_OF_AREA.some((pattern) => pattern.test(venue))) return "out_of_area" as const;
  return "in_area" as const;
}

function priceAndFree(content: string, title: string) {
  const priceMatch = content.match(/(?:💶\s*)?Cena:\s*(.+?)(?=\s+(?:Cena vključuje|Več informacij|Prijav|Prehrana|Kaj vas čaka|Rezervacija|$))/i);
  const priceText = priceMatch ? clean(priceMatch[1]).slice(0, 120) : null;
  if (priceText && /\d|€/.test(priceText)) return { priceText, isFree: false as boolean | null };

  const explicitFree = /^brezplač/i.test(title) || /vstop\s+prost/i.test(content) || /(?:udeležba|vstop|dogodek|delavnica|vodstvo)[^.!?]{0,50}brezplač/i.test(content);
  return { priceText, isFree: explicitFree ? true : null };
}

async function parseDetail(url: string) {
  const html = await fetchHtml(url);
  const $ = load(html);
  const title = clean($("h1").first().text());
  const dateText = detailValue($, "Datum");
  const venue = detailValue($, "Lokacija");
  const categoryRaw = detailValue($, "Kategorije");
  const category = categoryRaw ? clean(categoryRaw.split(/\s{2,}|,/)[0]) : "Dogodek";
  const parsed = parseDateRange(dateText);
  if (!title || !parsed) throw new Error(`Could not parse title/date for ${url}`);

  const eventType = classifyEvent(parsed.start, parsed.end);
  const startAt = localDateTimeToIso(parsed.start, parsed.startTime, false);
  let endAt: string | null = null;
  if (eventType !== "single") endAt = localDateTimeToIso(parsed.end, parsed.endTime, !parsed.endTime);
  else if (parsed.endTime) endAt = localDateTimeToIso(parsed.end, parsed.endTime, false);

  const content = eventContent($);
  const { priceText, isFree } = priceAndFree(content, title);
  const imageUrl = $("meta[property='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content") || null;
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop()!;
  const locStatus = locationStatus(venue);

  return {
    source_event_id: slug, title, slug, start_at: startAt, end_at: endAt,
    all_day: parsed.allDay, venue, address: null, city: "Celje", category,
    event_type: eventType, is_free: isFree, price_text: priceText,
    description: content.slice(0, 4000) || null, image_url: imageUrl, source_url: url,
    status: locStatus === "out_of_area" ? "hidden" : "published",
    location_status: locStatus, duplicate_of: null, dedupe_confidence: null, dedupe_reason: null,
    raw: { date_text: dateText, start_date: dateOnly(parsed.start), end_date: dateOnly(parsed.end) },
  };
}

async function mapBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: source, error: sourceError } = await supabase.from("sources").select("id,last_synced_at").eq("key", "celje-info").single();
  if (sourceError || !source) return Response.json({ ok: false, error: sourceError?.message ?? "Source missing" }, { status: 500 });
  if (source.last_synced_at && Date.now() - new Date(source.last_synced_at).getTime() < 20 * 60 * 1000) {
    return Response.json({ ok: true, skipped: true, reason: "recently_synced" });
  }

  const listHtml = await fetchHtml(LIST_URL);
  const $ = load(listHtml);
  const urls = new Set<string>();
  $("a[href]").each((_i, element) => {
    const url = eventUrlFromHref($(element).attr("href"));
    if (url) urls.add(url);
  });
  if (!urls.size) return Response.json({ ok: false, error: "No event URLs discovered" }, { status: 502 });

  const failures: string[] = [];
  const parsed = await mapBatches([...urls], 5, async (url) => {
    try { return await parseDetail(url); }
    catch (error) { failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`); return null; }
  });

  const nowIso = new Date().toISOString();
  const rows = parsed.filter((x): x is NonNullable<typeof x> => Boolean(x)).map((event) => ({
    ...event, source_id: source.id, last_seen_at: nowIso, updated_at: nowIso,
  }));

  const { data: imported, error: upsertError } = await supabase.from("events")
    .upsert(rows, { onConflict: "source_id,source_event_id" })
    .select("id,source_event_id,title,start_at,end_at,venue,event_type,status,location_status");
  if (upsertError) return Response.json({ ok: false, error: upsertError.message }, { status: 500 });

  const published = (imported ?? []).filter((event) => event.status === "published");
  let deduped = 0;
  let seriesCollapsed = 0;
  const dedupeExamples: Array<Record<string, unknown>> = [];

  if (published.length) {
    const minStart = new Date(Math.min(...published.map((e) => new Date(e.start_at).getTime())) - 86400000).toISOString();
    const maxEnd = new Date(Math.max(...published.map((e) => new Date(e.end_at ?? e.start_at).getTime())) + 86400000).toISOString();
    const { data: candidates, error: candidateError } = await supabase.from("events")
      .select("id,title,start_at,end_at,venue,event_type,source_id,duplicate_of")
      .neq("source_id", source.id).is("duplicate_of", null)
      .gte("start_at", minStart).lte("start_at", maxEnd).eq("status", "published");
    if (candidateError) return Response.json({ ok: false, error: candidateError.message }, { status: 500 });

    for (const event of published) {
      const matches = (candidates ?? []).map((candidate) => {
        const titleScore = textSimilarity(event.title, candidate.title);
        const venueScore = textSimilarity(event.venue, candidate.venue);
        const overlap = rangesOverlap(event.start_at, event.end_at, candidate.start_at, candidate.end_at);
        const sameStart = celjeDateKey(event.start_at) === celjeDateKey(candidate.start_at);
        if (!overlap || titleScore < 0.72) return null;
        if (event.event_type === "ongoing" && candidate.event_type === "single" && !sameStart) return null;
        const score = titleScore * 0.78 + venueScore * 0.14 + (sameStart ? 0.08 : 0.04);
        return { candidate, titleScore, venueScore, score, sameStart };
      }).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.score - a.score);

      if (!matches.length || matches[0].score < 0.76) continue;
      const eventStart = celjeDateKey(event.start_at)!;
      const eventEnd = celjeDateKey(event.end_at ?? event.start_at)!;
      const strongAcrossRange = matches.filter((m) => m.titleScore >= 0.82 && celjeDateKey(m.candidate.start_at)! >= eventStart && celjeDateKey(m.candidate.start_at)! <= eventEnd);
      const distinctDates = new Set(strongAcrossRange.map((m) => celjeDateKey(m.candidate.start_at)));
      const seriesSplit = event.event_type === "multiday" && distinctDates.size >= 2;
      const best = matches[0];

      if (event.event_type === "multiday" && !seriesSplit && best.candidate.event_type === "single" && !best.sameStart) continue;

      const reason = seriesSplit ? `series_split:${distinctDates.size}_daily_records` : `title:${best.titleScore.toFixed(2)},venue:${best.venueScore.toFixed(2)}`;
      await supabase.from("events").update({
        duplicate_of: best.candidate.id, dedupe_confidence: Number(best.score.toFixed(3)), dedupe_reason: reason, updated_at: nowIso,
      }).eq("id", event.id);
      deduped += 1;

      if (seriesSplit) seriesCollapsed += 1;
      else if (event.end_at && !best.candidate.end_at && best.sameStart) {
        await supabase.from("events").update({ end_at: event.end_at, event_type: event.event_type, updated_at: nowIso }).eq("id", best.candidate.id);
      }

      if (dedupeExamples.length < 8) dedupeExamples.push({
        incoming: event.title, canonical: best.candidate.title,
        confidence: Number(best.score.toFixed(3)), reason,
      });
    }
  }

  await supabase.from("sources").update({ last_synced_at: nowIso, updated_at: nowIso }).eq("id", source.id);
  return Response.json({
    ok: true, discovered: urls.size, imported: rows.length,
    hidden_out_of_area: rows.filter((x) => x.location_status === "out_of_area").length,
    failed: failures.length, deduped, series_collapsed: seriesCollapsed,
    dedupe_examples: dedupeExamples, failures: failures.slice(0, 10),
  });
});
