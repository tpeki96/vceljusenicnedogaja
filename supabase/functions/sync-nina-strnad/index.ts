import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const SOURCE_URL = "https://www.ninastrnad.com/";
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function localIso(y: number, m: number, d: number, h: number, minute: number) {
  const wall = Date.UTC(y, m - 1, d, h, minute);
  function offset(ts: number) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
  }
  let utc = wall - offset(wall);
  utc = wall - offset(utc);
  return new Date(utc).toISOString();
}
function parseConcerts(html: string, sourceId: string, now: string) {
  const $ = load(html);
  if (!$(".nastopi_wrapper").length) throw new Error("Concert listing structure missing");
  const rows: any[] = [];
  let discovered = 0;
  $(".nastopi_row").each((_i, element) => {
    discovered++;
    const row = $(element), dateText = clean(row.find(".nastopi_col_date").first().text());
    const dm = dateText.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})$/);
    const cityNode = row.find(".nastopi_col_lokacija").first().clone();
    cityNode.find(".nastopi_mobile_venue").remove();
    const city = clean(cityNode.text());
    const title = clean(row.find(".nastopi_col_title").first().text());
    if (!dm || !title || !city) throw new Error("Concert date/title/location missing");
    if (!/^Celje$/i.test(city)) return;
    const venue = clean(row.find(".nastopi_desc_location").first().text()) || city;
    const description = clean(row.find(".nastopi_desc_text").first().text());
    const time = description.match(/\bob\s+(\d{1,2})[.:](\d{2})\b/i)
      || description.match(/\b(\d{1,2}):(\d{2})\b/);
    const start = localIso(+dm[3], +dm[2], +dm[1], time ? +time[1] : 0, time ? +time[2] : 0);
    if (Date.parse(start) < Date.parse(now) - 86400000) return;
    const id = [dm[3], dm[2].padStart(2, "0"), dm[1].padStart(2, "0"), title, venue]
      .join("-").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    rows.push({
      source_id: sourceId, source_event_id: id, slug: "nina-strnad-" + id, title,
      start_at: start, end_at: null, all_day: !time, venue, city: "Celje",
      category: "Koncerti", event_type: "single", description: description || null,
      source_url: SOURCE_URL, status: "published", location_status: "in_area",
      raw: { direct_source: "nina-strnad", date_text: dateText },
      last_seen_at: now, updated_at: now,
    });
  });
  return { discovered, rows: [...new Map(rows.map(row => [row.source_event_id, row])).values()] };
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: source, error: sourceError } = await sb.from("sources").select("id").eq("key", "nina-strnad").single();
    if (sourceError || !source) throw new Error(sourceError?.message || "Source missing");
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const now = new Date().toISOString(), parsed = parseConcerts(await response.text(), source.id, now);
    if (parsed.rows.length) {
      const { error } = await sb.from("events").upsert(parsed.rows, { onConflict: "source_id,source_event_id" });
      if (error) throw new Error(error.message);
    }
    const { error: syncError } = await sb.from("sources").update({ last_synced_at: now, updated_at: now }).eq("id", source.id);
    if (syncError) throw new Error(syncError.message);
    return Response.json({ ok: true, discovered: parsed.discovered, imported: parsed.rows.length });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
});
