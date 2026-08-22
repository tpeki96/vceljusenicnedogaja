import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";

const SOURCES = [
  {
    key: "azs",
    url: "https://slovenska-atletika.si/events/ekipno-prvenstvo-slovenije-za-mlajse-mladince-in-mladinke-9/",
    sourceEventId: "ekipno-prvenstvo-mlajsi-2026",
    title: "Ekipno prvenstvo Slovenije za mlajše mladince in mladinke",
    slug: "azs-ekipno-prvenstvo-mlajsi-2026",
    start: "2026-08-29T10:00:00.000Z",
    end: "2026-08-29T17:00:00.000Z",
    venue: "Stadion Kladivar Cinkarna Celje",
    address: "Stritarjeva ulica 24, 3000 Celje",
    description: "Uradni koledar Atletske zveze Slovenije. Organizator: Atletsko društvo Kladivar Celje.",
    required: ["Ekipno prvenstvo Slovenije za mlajše mladince in mladinke", "Stadion Kladivar", "29"],
    celeTitle: "Ekipno prvenstvo Slovenije za mlajše mladince in mladinke",
  },
  {
    key: "rzs",
    url: "https://www.rokometna-zveza.si/si/novice/2026/0/12361-Superpokalni-zacetek-sezone-bo-gostilo-Celje",
    sourceEventId: "superpokal-zenske-2026",
    title: "Superpokal Slovenije 2026 – ženske",
    slug: "rzs-superpokal-zenske-2026",
    start: "2026-08-29T15:30:00.000Z",
    end: null,
    venue: "Dvorana Zlatorog",
    address: "Opekarniška cesta 15, 3000 Celje",
    description: "Ženski Superpokal Slovenije: RK Krim OTP Group Mercator Ljubljana – ŽRK Mlinotest Ajdovščina.",
    required: ["SUPERPOKAL SLOVENIJE 2026", "29. avgusta", "17.30"],
    celeTitle: "Superpokal Slovenije 2026 (Ž)",
  },
] as const;

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "sl-SI,sl;q=0.9,en;q=0.6" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return await response.text();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const results: unknown[] = [];

  for (const item of SOURCES) {
    try {
      const html = await fetchText(item.url);
      const missing = item.required.filter((needle) => !html.includes(needle));
      if (missing.length) throw new Error(`official page verification failed: ${missing.join(", ")}`);

      const { data: source, error: sourceError } = await sb.from("sources").select("id").eq("key", item.key).single();
      if (sourceError || !source) throw new Error(sourceError?.message || `source ${item.key} missing`);

      const row = {
        source_id: source.id,
        source_event_id: item.sourceEventId,
        title: item.title,
        slug: item.slug,
        start_at: item.start,
        end_at: item.end,
        all_day: false,
        venue: item.venue,
        address: item.address,
        city: "Celje",
        category: "Šport",
        is_free: null,
        price_text: null,
        description: item.description,
        source_url: item.url,
        status: "published",
        location_status: "in_area",
        event_type: "single",
        raw: { direct_source: item.key, verified_official_page: true },
        last_seen_at: now,
        updated_at: now,
      };

      const { data: event, error: eventError } = await sb.from("events").upsert(row, { onConflict: "source_id,source_event_id" }).select("id").single();
      if (eventError || !event) throw new Error(eventError?.message || "event upsert failed");

      await sb.from("events").update({
        duplicate_of: event.id,
        dedupe_confidence: 0.999,
        dedupe_reason: `offboard_cele_official_${item.key}`,
        updated_at: now,
      }).eq("title", item.celeTitle).neq("source_id", source.id).is("duplicate_of", null);

      await sb.from("sources").update({ last_synced_at: now, updated_at: now }).eq("id", source.id);
      results.push({ key: item.key, ok: true });
    } catch (error) {
      results.push({ key: item.key, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const failed = results.filter((result: any) => !result.ok).length;
  return Response.json({ ok: failed === 0, failed, results }, { status: failed === 0 ? 200 : 502 });
});
