import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const TZ = "Europe/Ljubljana";
const UA = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";
const SPITAL = "https://www.spital.si/wp-admin/admin-ajax.php";
const MANSION = "https://www.mansionklub.si/dogodki";
const MONTHS:any = {
  januar:1,januarja:1,februar:2,februarja:2,marec:3,marca:3,april:4,aprila:4,maj:5,maja:5,
  junij:6,junija:6,julij:7,julija:7,avgust:8,avgusta:8,september:9,septembra:9,oktober:10,oktobra:10,
  november:11,novembra:11,december:12,decembra:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,avg:8,sep:9,okt:10,nov:11,dec:12
};
const clean=(v:any)=>String(v??"").replace(/\s+/g," ").trim();

function norm(v:string){
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/\b(?:klub|club|live|koncert|dogodek|event)\b/g," ")
    .replace(/&/g," in ").replace(/[^a-z0-9čšž]+/gi," ").replace(/\s+/g," ").trim();
}
function sim(a:any,b:any){
  if(!a||!b)return 0;const x=norm(a),y=norm(b);if(x===y)return 1;
  if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=6)return .94;
  const A=new Set(x.split(" ").filter(q=>q.length>1)),B=new Set(y.split(" ").filter(q=>q.length>1));
  const i=[...A].filter(q=>B.has(q)).length,u=new Set([...A,...B]).size;return u?i/u:0;
}
function day(v:string){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(v));
  const x:any=Object.fromEntries(p.map(z=>[z.type,z.value]));return `${x.year}-${x.month}-${x.day}`;
}
function classify(t:string,d=""){
  const h=`${t} ${d}`.toLowerCase();
  if(/koncert|rock|feltna|kreslin|popevka|akust|dj|fest|after|band/.test(h))return "Koncerti";
  if(/stand.?up|komedij|predstav/.test(h))return "Predstave";
  if(/otrok|družin|delavnic/.test(h))return "Za otroke";
  return "Ostalo";
}
function slug(url:string){try{return new URL(url).pathname.split("/").filter(Boolean).pop()||crypto.randomUUID()}catch{return crypto.randomUUID()}}
function localIso(y:number,m:number,d:number,h:number,min:number){
  return new Date(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00+02:00`).toISOString();
}
async function fh(url:string,init:RequestInit={}){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
  try{
    const r=await fetch(url,{...init,signal:ac.signal,headers:{"user-agent":UA,"accept-language":"sl-SI,sl;q=0.9,en;q=0.6",...(init.headers||{})},redirect:"follow"});
    if(!r.ok)throw Error(`HTTP ${r.status}`);return {html:await r.text(),url:r.url};
  }finally{clearTimeout(timer)}
}
function parseLd($:ReturnType<typeof load>){
  for(const el of $("script[type='application/ld+json']").toArray()){
    try{
      const x=JSON.parse($(el).text()),arr=Array.isArray(x)?x:[x];
      for(const v of arr){if(v?.["@type"]==="Event")return v;if(Array.isArray(v?.["@graph"]))for(const g of v["@graph"])if(g?.["@type"]==="Event")return g;}
    }catch{}
  }
  return null;
}
async function dedupe(sb:any,sourceId:string,events:any[],now:string){
  let n=0;const examples:any[]=[];
  const {data:ds}=await sb.from("sources").select("id").like("import_method","direct_%"),direct=new Set((ds||[]).map((x:any)=>x.id));
  for(const e of events||[]){
    const lo=new Date(Date.parse(e.start_at)-12*3600000).toISOString(),hi=new Date(Date.parse(e.end_at||e.start_at)+12*3600000).toISOString();
    const {data:c}=await sb.from("events").select("id,title,start_at,venue,source_id,duplicate_of").neq("source_id",sourceId).gte("start_at",lo).lte("start_at",hi).eq("status","published");
    for(const q of c||[]){
      if(direct.has(q.source_id)||q.duplicate_of||day(e.start_at)!==day(q.start_at))continue;
      const ts=sim(e.title,q.title),vs=sim(e.venue,q.venue),score=ts*.9+vs*.1;
      const special=(/spital|vodni stolp/i.test(`${e.venue} ${q.venue}`)&&ts>=.4)||(/mansion/i.test(`${e.venue} ${q.venue}`)&&ts>=.38);
      if(score<.72&&!special)continue;
      await sb.from("events").update({duplicate_of:e.id,dedupe_confidence:+Math.max(score,.74).toFixed(3),dedupe_reason:`direct:title:${ts.toFixed(2)},venue:${vs.toFixed(2)}`,updated_at:now}).eq("id",q.id);
      n++;if(examples.length<8)examples.push({direct:e.title,matched:q.title,confidence:+Math.max(score,.74).toFixed(3)});
    }
  }
  return {deduped:n,examples};
}

async function syncSpital(sb:any,s:any,now:string){
  const body=new URLSearchParams({action:"tc_filter_events",tc_categories:"0",tc_column_number:"3",tc_show_excerpt:"true",tc_show_number_of_posts:"50",tc_pagination_number:"1",tc_show_default_featured_image:"true",tc_show_past_events:"false",tc_order_events_by:"asc"}).toString();
  const {html}=await fh(SPITAL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body}),$=load(html),rows:any[]=[];
  $(".tc-single-event").each((_:any,el:any)=>{
    const a=$(el).find("h4 a[href]").first(),url=a.attr("href"),title=clean(a.text());
    const dateText=clean($(el).find(".tc-event-date span").first().text()),venue=clean($(el).find(".tc-event-location span").first().text())||"Špital za prjatle";
    const desc=clean($(el).find(".tc-event-excerpt").text()),img=$(el).find("img").first().attr("src")||null;
    const m=dateText.match(/(\d{1,2})\.\s*([a-zčšž]+),?\s*(20\d{2})\s+(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?/i);
    if(!url||!title||!m)return;const mo=MONTHS[m[2].toLowerCase()];if(!mo)return;
    const start=localIso(+m[3],mo,+m[1],+m[4],+m[5]);let end=null;
    if(m[6]){let ed=+m[1];if(+m[6]<+m[4])ed++;end=localIso(+m[3],mo,ed,+m[6],+m[7]);}
    if(Date.parse(end||start)<Date.now()-86400000)return;const id=slug(url);
    rows.push({source_id:s.id,source_event_id:id,title,slug:`spital-${id}`,start_at:start,end_at:end,all_day:false,venue,address:"Slomškov trg 5, 3000 Celje",city:"Celje",category:classify(title,desc),event_type:"single",is_free:null,price_text:null,description:desc||null,image_url:img,source_url:url,status:"published",location_status:"in_area",duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,raw:{direct_source:"spital",date_text:dateText},last_seen_at:now,updated_at:now});
  });
  const {data:imp,error}=await sb.from("events").upsert(rows,{onConflict:"source_id,source_event_id"}).select("id,title,start_at,end_at,venue");if(error)throw error;
  const d=await dedupe(sb,s.id,imp||[],now);await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",s.id);
  return {key:"spital",ok:true,imported:rows.length,...d,events:rows.map(x=>({title:x.title,start_at:x.start_at}))};
}

function nowParts(){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v:any=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return {y:+v.year,m:+v.month,d:+v.day};
}
async function syncMansion(sb:any,s:any,now:string){
  const {html}=await fh(MANSION),$=load(html),np=nowParts(),links:string[]=[];
  for(const el of $("[data-hook='events-card']").toArray()){
    const card=$(el),a=card.find("a[data-hook='title'][href*='/event-details-registration/']").first(),url=a.attr("href"),dt=clean(card.find("[data-hook='short-date']").text()),m=dt.match(/(\d{1,2})\.\s*([a-zčšž]+)/i);
    if(!url||!m)continue;const mo=MONTHS[m[2].toLowerCase().slice(0,3)]||MONTHS[m[2].toLowerCase()],dd=+m[1];if(!mo)continue;
    const candidate=Date.UTC(np.y,mo-1,dd),today=Date.UTC(np.y,np.m-1,np.d);if(candidate<today-86400000){if(links.length)break;continue;}
    links.push(url);if(links.length>=15)break;
  }
  const rows:any[]=[],fails:string[]=[];
  for(const url of links){
    try{
      const d=await fh(url),q=load(d.html),ld=parseLd(q);if(!ld?.startDate)continue;
      const start=new Date(ld.startDate).toISOString(),end=ld.endDate?new Date(ld.endDate).toISOString():null;if(Date.parse(end||start)<Date.now()-86400000)continue;
      const title=clean(ld.name||q("title").text().split("|")[0]),venue=clean(ld.location?.name)||"Mansion Klub",address=clean(typeof ld.location?.address==="string"?ld.location.address:"")||"Trg celjskih knezov 10, 3000 Celje";
      const img=typeof ld.image==="string"?ld.image:(ld.image?.url||q("meta[property='og:image']").attr("content")||null),id=slug(d.url);
      rows.push({source_id:s.id,source_event_id:id,title,slug:`mansion-${id}`,start_at:start,end_at:end,all_day:false,venue,address,city:"Celje",category:classify(title),event_type:"single",is_free:null,price_text:null,description:null,image_url:img,source_url:d.url,status:"published",location_status:"in_area",duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,raw:{direct_source:"mansion",json_ld:true},last_seen_at:now,updated_at:now});
    }catch(e){fails.push(`${url}: ${e instanceof Error?e.message:String(e)}`);}
  }
  const {data:imp,error}=await sb.from("events").upsert(rows,{onConflict:"source_id,source_event_id"}).select("id,title,start_at,end_at,venue");if(error)throw error;
  const d=await dedupe(sb,s.id,imp||[],now);await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",s.id);
  return {key:"mansion",ok:true,discovered:links.length,imported:rows.length,failed:fails.length,...d,events:rows.map(x=>({title:x.title,start_at:x.start_at}))};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ss,error}=await sb.from("sources").select("id,key").in("key",["spital","mansion"]);if(error)return Response.json({ok:false,error:error.message},{status:500});
  const by=new Map((ss||[]).map((x:any)=>[x.key,x])),now=new Date().toISOString(),summaries:any[]=[];
  for(const key of ["spital","mansion"]){try{const s:any=by.get(key);summaries.push(key==="spital"?await syncSpital(sb,s,now):await syncMansion(sb,s,now));}catch(e){summaries.push({key,ok:false,error:e instanceof Error?e.message:String(e)});}}
  const ok=summaries.every(x=>x.ok);return Response.json({ok,summaries},{status:ok?200:502});
});
