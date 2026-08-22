import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const EXTERNAL_URL = "https://uppxxgsuotdnprbiqibo.supabase.co";
const EXTERNAL_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwcHh4Z3N1b3RkbnByYmlxaWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODE5OTUsImV4cCI6MjA4MzM1Nzk5NX0.3-P-iYHKgHHX0qYCh8mDdeI_X7i7zR82iMkuurUZWl0";
const TZ = "Europe/Ljubljana";
const DIRECT_KEYS = ["mcc","mnzc","tehnopark"];
const clean = (v:string|null|undefined) => (v ?? "").replace(/\s+/g," ").trim();

function tzOffsetMs(ts:number){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ts));
  const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return Date.UTC(+v.year!,+v.month!-1,+v.day!,+v.hour!,+v.minute!,+v.second!)-ts;
}
function localIso(date:string,time:string|null,endOfDay=false){
  const [y,m,d]=date.slice(0,10).split("-").map(Number);
  const mt=time?.match(/(\d{1,2}):(\d{2})/); const h=mt?+mt[1]:(endOfDay?23:0), min=mt?+mt[2]:(endOfDay?59:0);
  const wall=Date.UTC(y,m-1,d,h,min); let utc=wall-tzOffsetMs(wall); utc=wall-tzOffsetMs(utc); return new Date(utc).toISOString();
}
function localDay(iso:string){const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;}
function stripHtml(v:string|null){if(!v)return null;return clean(load(`<body>${v}</body>`)("body").text())||null;}
function normalizeTitle(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^\s*(koncert|dogodek|predstava|prireditev|festival)\s*[:\-–]\s*/i,"").replace(/\b(?:1|2|3|4|5)\.?\s*dan\b/gi,"").replace(/&/g," in ").replace(/[^a-z0-9čšž]+/gi," ").replace(/\s+/g," ").trim();}
function similarity(a:string|null,b:string|null){if(!a||!b)return 0;const x=normalizeTitle(a),y=normalizeTitle(b);if(x===y)return 1;if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=7)return .94;const stop=new Set(["v","na","in","za","z","s","pri","po"]),A=new Set(x.split(" ").filter(q=>q.length>1&&!stop.has(q))),B=new Set(y.split(" ").filter(q=>q.length>1&&!stop.has(q)));const inter=[...A].filter(q=>B.has(q)).length,union=new Set([...A,...B]).size;return union?inter/union:0;}
function classify(title:string,description:string|null,category:string|null){const h=`${title} ${description||""} ${category||""}`.toLowerCase();if(/koncert|glasb|orkester/.test(h))return"Koncerti";if(/otrok|družin|delavnic|počitni|varstvo/.test(h))return"Za otroke";if(/predstav|gledali|komedij/.test(h))return"Predstave";if(/razstav|galerij/.test(h))return"Razstave";if(/vodstvo|voden ogled/.test(h))return"Vodenja";if(/šport|turnir|tekma|košark|nogomet/.test(h))return"Šport";if(/predavanje|pogovor|okrogla miza|izobražev/.test(h))return"Predavanja";return"Ostalo";}
function typeFor(startDate:string,endDate:string|null){if(!endDate||startDate.slice(0,10)===endDate.slice(0,10))return"single";const days=Math.round((Date.parse(endDate.slice(0,10)+"T12:00:00Z")-Date.parse(startDate.slice(0,10)+"T12:00:00Z"))/86400000);return days<=7?"multiday":"ongoing";}
function dateInDirectRange(candidate:string,start:string,end:string|null){const d=localDay(candidate),a=localDay(start),b=localDay(end||start);return a<=d&&d<=b;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:source,error:sourceError}=await sb.from("sources").select("id,last_synced_at").eq("key","tehnopark").single();
  if(sourceError||!source)return Response.json({ok:false,error:sourceError?.message??"Source missing"},{status:500});

  const today=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const params=new URLSearchParams({
    select:"id,title,slug,event_date,event_end_date,start_time,end_time,location,location_address,category,price,description,image_url,is_published,is_archived",
    is_published:"eq.true", event_date:`gte.${today}T00:00:00Z`, order:"event_date.asc", limit:"200"
  });
  const response=await fetch(`${EXTERNAL_URL}/rest/v1/events?${params}`,{headers:{apikey:EXTERNAL_ANON,Authorization:`Bearer ${EXTERNAL_ANON}`}});
  if(!response.ok)return Response.json({ok:false,error:`External API HTTP ${response.status}`,body:(await response.text()).slice(0,500)},{status:502});
  const external:any[]=await response.json();
  const now=new Date().toISOString();
  const rows=external.map(e=>{
    const description=stripHtml(e.description), eventType=typeFor(e.event_date,e.event_end_date);
    const start=localIso(e.event_date,e.start_time||null,false);
    let end:string|null=null;
    if(e.event_end_date)end=localIso(e.event_end_date,e.end_time||null,!e.end_time);
    else if(e.end_time)end=localIso(e.event_date,e.end_time,false);
    const price=clean(e.price); const free=/brezpla|vstop\s+prost/i.test(price)||/vstop\s+je\s+prost|brezplač/i.test(description||"");
    return {source_id:source.id,source_event_id:e.id,title:clean(e.title),slug:e.slug,start_at:start,end_at:end,all_day:!e.start_time,venue:clean(e.location)||"Tehnopark Celje",address:clean(e.location_address)||"Gubčeva ulica 1, 3000 Celje",city:"Celje",category:classify(e.title,description,e.category),event_type:eventType,is_free:free?true:price?false:null,price_text:price||null,description,image_url:e.image_url||null,source_url:`https://tehnopark.si/dogodki/${e.slug}`,status:"published",location_status:"in_area",duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,raw:{external_id:e.id,external_category:e.category,direct_api:true},last_seen_at:now,updated_at:now};
  });
  if(!rows.length){await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",source.id);return Response.json({ok:true,imported:0,deduped:0});}
  const {data:imported,error:upsertError}=await sb.from("events").upsert(rows,{onConflict:"source_id,source_event_id"}).select("id,title,start_at,end_at,all_day,venue,event_type,source_id");
  if(upsertError)return Response.json({ok:false,error:upsertError.message},{status:500});

  const directIds=(imported||[]).map((e:any)=>e.id);
  if(directIds.length){
    const {data:oldChildren}=await sb.from("events").select("id").in("duplicate_of",directIds);
    if(oldChildren?.length)await sb.from("events").update({duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,updated_at:now}).in("id",oldChildren.map((x:any)=>x.id));
    await sb.from("events").update({duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,updated_at:now}).in("id",directIds);
  }
  const {data:directSources}=await sb.from("sources").select("id").in("key",DIRECT_KEYS); const directSourceIds=new Set((directSources||[]).map((x:any)=>x.id));
  const lo=new Date(Math.min(...(imported||[]).map((e:any)=>Date.parse(e.start_at)))-86400000).toISOString();
  const hi=new Date(Math.max(...(imported||[]).map((e:any)=>Date.parse(e.end_at||e.start_at)))+86400000).toISOString();
  const {data:candidates,error:candidateError}=await sb.from("events").select("id,title,start_at,end_at,venue,event_type,source_id,duplicate_of").gte("start_at",lo).lte("start_at",hi).eq("status","published");
  if(candidateError)return Response.json({ok:false,error:candidateError.message},{status:500});
  let deduped=0;const examples:any[]=[];
  for(const event of imported||[]){
    const matches=(candidates||[]).filter((c:any)=>c.source_id!==source.id&&!directSourceIds.has(c.source_id)).map((c:any)=>{
      const titleScore=similarity(event.title,c.title);if(titleScore<.72)return null;
      const sameDate=localDay(event.start_at)===localDay(c.start_at);
      const dateOk=event.event_type==="single"?sameDate:(dateInDirectRange(c.start_at,event.start_at,event.end_at)||dateInDirectRange(event.start_at,c.start_at,c.end_at));if(!dateOk)return null;
      const venueScore=similarity(event.venue,c.venue),score=titleScore*.85+venueScore*.10+(sameDate?.05:.02);return score>=.78?{c,titleScore,venueScore,score}:null;
    }).filter((x):x is NonNullable<typeof x>=>Boolean(x));
    for(const m of matches){if(m.c.duplicate_of&&m.c.duplicate_of!==event.id)continue;await sb.from("events").update({duplicate_of:event.id,dedupe_confidence:Number(m.score.toFixed(3)),dedupe_reason:`direct:title:${m.titleScore.toFixed(2)},venue:${m.venueScore.toFixed(2)}`,updated_at:now}).eq("id",m.c.id);deduped++;if(examples.length<8)examples.push({direct:event.title,matched:m.c.title,date:localDay(m.c.start_at),confidence:Number(m.score.toFixed(3))});}
  }
  await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",source.id);
  return Response.json({ok:true,external:external.length,imported:rows.length,deduped,examples});
});
