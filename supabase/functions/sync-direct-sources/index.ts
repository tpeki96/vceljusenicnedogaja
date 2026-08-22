import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const TZ = "Europe/Ljubljana";
const UA = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";
const DIRECT_KEYS = ["mcc", "mnzc", "tehnopark"];
const MONTHS: Record<string, number> = {
  januar:1,januarja:1,februar:2,februarja:2,marec:3,marca:3,april:4,aprila:4,
  maj:5,maja:5,junij:6,junija:6,julij:7,julija:7,avgust:8,avgusta:8,
  september:9,septembra:9,oktober:10,oktobra:10,november:11,novembra:11,december:12,decembra:12,
};

type Adapter = { key:string; list:string; base:string; defaultVenue:string; discover:($:ReturnType<typeof load>)=>string[] };
const clean = (v:string|null|undefined) => (v ?? "").replace(/\s+/g," ").trim();

async function fetchHtml(url:string) {
  const response = await fetch(url,{headers:{"user-agent":UA,accept:"text/html,application/xhtml+xml","accept-language":"sl-SI,sl;q=0.9,en;q=0.6"},redirect:"follow"});
  if(!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const text = await response.text();
  if(/request is being verified|just a moment|cloudflare/i.test(text) && text.length < 30000) throw new Error(`Anti-bot page for ${url}`);
  return { text, finalUrl: response.url };
}
function sameHostUrl(href:string|undefined, base:string) {
  if(!href) return null;
  try { const u=new URL(href,base), b=new URL(base); if(u.hostname.replace(/^www\./,"")!==b.hostname.replace(/^www\./,"")) return null; u.hash=""; return u.toString(); } catch { return null; }
}
const adapters: Adapter[] = [
  {key:"mcc",list:"https://www.mc-celje.si/Dogaja_1/",base:"https://www.mc-celje.si",defaultVenue:"Celjski mladinski center",discover:($)=>{
    const out=new Set<string>(); $("a[href]").each((_i,e)=>{const u=sameHostUrl($(e).attr("href"),"https://www.mc-celje.si"); if(u && /^\/dogaja_2\/[^/]+\/$/i.test(new URL(u).pathname.replace(/\/+$/,"/"))) out.add(u);}); return [...out];
  }},
  {key:"mnzc",list:"https://www.muzej-nz-ce.si/dogodki1/",base:"https://www.muzej-nz-ce.si",defaultVenue:"Muzej novejše zgodovine Celje",discover:($)=>{
    const out=new Set<string>(); $("a[href]").each((_i,e)=>{const u=sameHostUrl($(e).attr("href"),"https://www.muzej-nz-ce.si"); if(u && /^\/(?:dogodek|event)\/[^/]+\/$/i.test(new URL(u).pathname.replace(/\/+$/,"/"))) out.add(u);}); return [...out];
  }},
  {key:"tehnopark",list:"https://tehnopark.si/dogodki",base:"https://tehnopark.si",defaultVenue:"Tehnopark Celje",discover:($)=>{
    const out=new Set<string>(); $("a[href]").each((_i,e)=>{const u=sameHostUrl($(e).attr("href"),"https://tehnopark.si"); if(u && /^\/dogodki\/[^/]+\/?$/i.test(new URL(u).pathname)) out.add(u);}); return [...out];
  }},
];

function tzOffsetMs(ts:number){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ts));
  const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return Date.UTC(+v.year!,+v.month!-1,+v.day!,+v.hour!,+v.minute!,+v.second!)-ts;
}
function localIso(y:number,m:number,d:number,h=0,min=0){const wall=Date.UTC(y,m-1,d,h,min);let utc=wall-tzOffsetMs(wall);utc=wall-tzOffsetMs(utc);return new Date(utc).toISOString();}
function localDay(iso:string){const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;}
function localClock(iso:string){return new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));}
function parseSingleDate(t:string){
  let m=t.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/); if(m) return {day:+m[1],month:+m[2],year:+m[3]};
  m=t.toLocaleLowerCase("sl-SI").match(/\b(\d{1,2})\.?\s+([a-zčšž]+)\s+(20\d{2})\b/i); if(m&&MONTHS[m[2]]) return {day:+m[1],month:MONTHS[m[2]],year:+m[3]}; return null;
}
function parseRange(t:string){
  const x=t.replace(/[–—]/g,"-");
  let m=x.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/);
  if(m) return {a:{day:+m[1],month:+m[2],year:+m[3]},b:{day:+m[4],month:+m[5],year:+m[6]}};
  m=x.toLowerCase().match(/\b(\d{1,2})\.\s*in\s*(\d{1,2})\.\s*([a-zčšž]+)\s+(20\d{2})\b/i);
  if(m&&MONTHS[m[3]]) return {a:{day:+m[1],month:MONTHS[m[3]],year:+m[4]},b:{day:+m[2],month:MONTHS[m[3]],year:+m[4]}};
  m=x.toLowerCase().match(/\bod\s+(\d{1,2})\.?\s*(?:[a-zčšž]+\s+)?do\s+(\d{1,2})\.?\s*([a-zčšž]+)\s+(20\d{2})\b/i);
  if(m&&MONTHS[m[3]]) return {a:{day:+m[1],month:MONTHS[m[3]],year:+m[4]},b:{day:+m[2],month:MONTHS[m[3]],year:+m[4]}};
  const d=parseSingleDate(t); return d?{a:d,b:d}:null;
}
function explicitTime(t:string){
  for(const r of [/(?:KDAJ|URA)\s*[:?]?\s*[^0-9]{0,80}(\d{1,2})[.:](\d{2})/i,/\bob\s+(\d{1,2})[.:](\d{2})\b/i,/\b(\d{1,2}):(\d{2})\b/]){const m=t.match(r);if(m)return{h:+m[1],m:+m[2]};} return null;
}
function flatten(v:any,out:any[]=[]):any[]{if(Array.isArray(v))v.forEach(x=>flatten(x,out));else if(v&&typeof v==="object"){out.push(v);if(v["@graph"])flatten(v["@graph"],out);}return out;}
function jsonLdEvent($:ReturnType<typeof load>){const out:any[]=[];$("script[type='application/ld+json']").each((_i,e)=>{try{out.push(...flatten(JSON.parse($(e).text())))}catch{}});return out.find(x=>x["@type"]==="Event"||(Array.isArray(x["@type"])&&x["@type"].includes("Event")))??null;}
function validIso(v:any){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
function ldLocation(v:any){if(!v||typeof v!=="object")return{venue:null,address:null};let address=null;if(typeof v.address==="string")address=clean(v.address);else if(v.address&&typeof v.address==="object")address=clean([v.address.streetAddress,v.address.postalCode,v.address.addressLocality].filter(Boolean).join(", "));return{venue:typeof v.name==="string"?clean(v.name):null,address:address||null};}
function stripHtml(v:any){if(typeof v!=="string")return null;return clean(load(`<body>${v}</body>`)("body").text())||null;}
function imageUrl(v:any){if(typeof v==="string")return v;if(Array.isArray(v)&&typeof v[0]==="string")return v[0];if(v&&typeof v==="object"&&typeof v.url==="string")return v.url;return null;}
function classify(title:string,text:string){const h=`${title} ${text}`.toLowerCase();if(/koncert|glasb|orkester|kvartet|zasedba/.test(h))return"Koncerti";if(/otrok|pravlji|ustvarjalnic|delavnic|počitni|varstvo/.test(h))return"Za otroke";if(/predstav|gledali|performans|komedij|stand.?up/.test(h))return"Predstave";if(/razstav|galerij|odprtje/.test(h))return"Razstave";if(/vodstvo|voden ogled|vodenje/.test(h))return"Vodenja";if(/šport|turnir|tekma|košark|nogomet|tek|kolo/.test(h))return"Šport";if(/predavanje|pogovor|okrogla miza|izobražev/.test(h))return"Predavanja";return"Ostalo";}
function eventType(start:string,end:string|null){if(!end)return"single";const days=Math.round((new Date(end).getTime()-new Date(start).getTime())/86400000);return days<=0?"single":days<=7?"multiday":"ongoing";}
function fallbackVenue(text:string,def:string){const m=text.match(/\bKJE\s*[:?]?\s*(.{3,100}?)(?=\s+(?:KDAJ|URA|DATUM|VSTOP|PRIJAV|KARTE|$))/i);const v=m?clean(m[1]):null;return v&&v.length<90?v:def;}
async function parseDetail(url:string,a:Adapter){
  const {text,finalUrl}=await fetchHtml(url), $=load(text), ld=jsonLdEvent($), body=clean($("main").text()||$("body").text()), h1=$("h1").first();
  const title=clean((typeof ld?.name==="string"?ld.name:null)||h1.text()||$("title").text()); if(!title)throw new Error("missing title");
  let start=validIso(ld?.startDate), end=validIso(ld?.endDate), allDay=false;
  if(!start){
    const near=clean(`${h1.nextAll().slice(0,8).text()} ${h1.parent().text()}`).slice(0,3000);
    let rg=parseRange(a.key==="mcc"?near:body.slice(0,5000)); if(!rg)throw new Error("missing date");
    if(a.key==="mcc"){const broader=parseRange(body.slice(0,5000));if(broader&&broader.a.day===rg.a.day&&broader.a.month===rg.a.month&&broader.a.year===rg.a.year)rg=broader;}
    const tm=explicitTime(a.key==="mcc"?body.slice(0,5000):body.slice(0,3500)); allDay=!tm;
    start=localIso(rg.a.year,rg.a.month,rg.a.day,tm?.h??0,tm?.m??0);
    if(rg.a.year!==rg.b.year||rg.a.month!==rg.b.month||rg.a.day!==rg.b.day) end=localIso(rg.b.year,rg.b.month,rg.b.day,23,59);
  }
  const l=ldLocation(ld?.location), description=stripHtml(ld?.description)||body.slice(0,4000)||null;
  const free=/vstop\s+prost|brezplač|udeležba\s+je\s+brezplačna|cena\s*:\s*brezplačno/i.test(body);
  const pm=body.match(/(?:cena|vstopnina|karte?)\s*[:\-]?\s*([^.!?]{1,80}€)/i);
  const slug=new URL(finalUrl).pathname.split("/").filter(Boolean).pop()!;
  return {source_event_id:slug,title,slug,start_at:start,end_at:end,all_day:allDay,venue:l.venue||fallbackVenue(body.slice(0,4500),a.defaultVenue),address:l.address,city:"Celje",category:classify(title,description||body),event_type:eventType(start,end),is_free:free?true:pm?false:null,price_text:pm?clean(pm[1]):null,description,image_url:imageUrl(ld?.image)||$("meta[property='og:image']").attr("content")||null,source_url:finalUrl,status:"published",location_status:"in_area",duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,raw:{direct_source:a.key,json_ld:Boolean(ld)}};
}
function normalizeTitle(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^\s*(koncert|dogodek|predstava|prireditev|festival)\s*[:\-–]\s*/i,"").replace(/\b(?:1|2|3|4|5)\.?\s*dan\b/gi,"").replace(/&/g," in ").replace(/[^a-z0-9čšž]+/gi," ").replace(/\s+/g," ").trim();}
function similarity(a:string|null,b:string|null){if(!a||!b)return 0;const x=normalizeTitle(a),y=normalizeTitle(b);if(!x||!y)return 0;if(x===y)return 1;if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=7)return .94;const stop=new Set(["v","na","in","za","z","s","pri","po"]),A=new Set(x.split(" ").filter(q=>q.length>1&&!stop.has(q))),B=new Set(y.split(" ").filter(q=>q.length>1&&!stop.has(q)));const inter=[...A].filter(q=>B.has(q)).length,union=new Set([...A,...B]).size;return union?inter/union:0;}
function inRange(date:string,start:string,end:string|null){const d=localDay(date),a=localDay(start),b=localDay(end||start);return a<=d&&d<=b;}
async function mapBatches<T,R>(items:T[],size:number,fn:(x:T)=>Promise<R>){const out:R[]=[];for(let i=0;i<items.length;i+=size)out.push(...await Promise.all(items.slice(i,i+size).map(fn)));return out;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:sources,error:sourceError}=await sb.from("sources").select("id,key").in("key",DIRECT_KEYS); if(sourceError)return Response.json({ok:false,error:sourceError.message},{status:500});
  const sourceByKey=new Map((sources||[]).map((s:any)=>[s.key,s])); const directIds=new Set((sources||[]).map((s:any)=>s.id));
  const now=new Date().toISOString(), cutoff=Date.now()-86400000, summaries:any[]=[];
  for(const adapter of adapters){
    const source:any=sourceByKey.get(adapter.key); if(!source){summaries.push({key:adapter.key,ok:false,error:"source missing"});continue;}
    try{
      const listing=await fetchHtml(adapter.list), $=load(listing.text), urls=adapter.discover($); if(!urls.length)throw new Error("No event URLs discovered");
      const failures:string[]=[];
      const parsed=await mapBatches(urls.slice(0,120),5,async url=>{try{return await parseDetail(url,adapter)}catch(e){failures.push(`${url}: ${e instanceof Error?e.message:String(e)}`);return null;}});
      const rows=parsed.filter((x):x is NonNullable<typeof x>=>Boolean(x)).filter(e=>new Date(e.end_at||e.start_at).getTime()>=cutoff).map(e=>({...e,source_id:source.id,last_seen_at:now,updated_at:now}));
      if(!rows.length)throw new Error(`No current/future events parsed (${failures.slice(0,3).join(" | ")})`);
      const {data:imported,error:upsertError}=await sb.from("events").upsert(rows,{onConflict:"source_id,source_event_id"}).select("id,title,start_at,end_at,all_day,venue,event_type,source_id"); if(upsertError)throw upsertError;

      const directEventIds=(imported||[]).map((e:any)=>e.id);
      if(directEventIds.length){
        await sb.from("events").update({duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,updated_at:now}).in("id",directEventIds);
        const {data:oldChildren}=await sb.from("events").select("id").in("duplicate_of",directEventIds);
        if(oldChildren?.length)await sb.from("events").update({duplicate_of:null,dedupe_confidence:null,dedupe_reason:null,updated_at:now}).in("id",oldChildren.map((x:any)=>x.id));
      }

      let deduped=0,enrichedTimes=0;const examples:any[]=[];
      if(imported?.length){
        const lo=new Date(Math.min(...imported.map((e:any)=>new Date(e.start_at).getTime()))-86400000).toISOString();
        const hi=new Date(Math.max(...imported.map((e:any)=>new Date(e.end_at||e.start_at).getTime()))+86400000).toISOString();
        const {data:candidates,error:candidateError}=await sb.from("events").select("id,title,start_at,end_at,all_day,venue,event_type,source_id,duplicate_of").gte("start_at",lo).lte("start_at",hi).eq("status","published"); if(candidateError)throw candidateError;
        for(const event of imported){
          const matches=(candidates||[]).filter((c:any)=>c.source_id!==source.id&&!directIds.has(c.source_id)).map((c:any)=>{
            const titleScore=similarity(event.title,c.title); if(titleScore<.72)return null;
            const sameDate=localDay(event.start_at)===localDay(c.start_at);
            const dateOk=event.event_type==="single"?sameDate:(inRange(c.start_at,event.start_at,event.end_at)||inRange(event.start_at,c.start_at,c.end_at));
            if(!dateOk)return null;
            const venueScore=similarity(event.venue,c.venue); const score=titleScore*.85+venueScore*.10+(sameDate?.05:.02);
            return score>=.78?{c,titleScore,venueScore,score,sameDate}:null;
          }).filter((x):x is NonNullable<typeof x>=>Boolean(x)).sort((a,b)=>b.score-a.score);
          if(!matches.length)continue;

          if(event.all_day===true){
            const timed=matches.find(m=>m.sameDate&&m.c.all_day!==true&&localClock(m.c.start_at)!=="00:00");
            if(timed){await sb.from("events").update({start_at:timed.c.start_at,all_day:false,updated_at:now}).eq("id",event.id);event.start_at=timed.c.start_at;event.all_day=false;enrichedTimes++;}
          }
          for(const m of matches){
            if(m.c.duplicate_of && m.c.duplicate_of!==event.id) continue;
            await sb.from("events").update({duplicate_of:event.id,dedupe_confidence:Number(m.score.toFixed(3)),dedupe_reason:`direct:title:${m.titleScore.toFixed(2)},venue:${m.venueScore.toFixed(2)}`,updated_at:now}).eq("id",m.c.id);
            deduped++;
            if(examples.length<6)examples.push({direct:event.title,matched:m.c.title,source_date:localDay(m.c.start_at),confidence:Number(m.score.toFixed(3))});
          }
        }
      }
      await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",source.id);
      summaries.push({key:adapter.key,ok:true,discovered:urls.length,imported:rows.length,failed:failures.length,deduped,enriched_times:enrichedTimes,examples,failures:failures.slice(0,5)});
    }catch(e){summaries.push({key:adapter.key,ok:false,error:e instanceof Error?e.message:String(e)});}
  }
  const okCount=summaries.filter(x=>x.ok).length;
  return Response.json({ok:okCount===adapters.length,sources_ok:okCount,sources_total:adapters.length,summaries},{status:okCount?200:502});
});
