import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const LIST_URL = "https://plesni-forum.si/dogodki/";
const BASE = "https://plesni-forum.si";
const TZ = "Europe/Ljubljana";
const UA = "Mozilla/5.0 (compatible; VCeljuSeNicNeDogaja/1.0; +https://vceljusenicnedogaja.si)";
const clean = (v:any) => String(v ?? "").replace(/\s+/g," ").trim();

function tzOffsetMs(ts:number){const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ts));const v:any=Object.fromEntries(p.map(x=>[x.type,x.value]));return Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second)-ts;}
function localIso(y:number,m:number,d:number,h=0,min=0){const wall=Date.UTC(y,m-1,d,h,min);let utc=wall-tzOffsetMs(wall);utc=wall-tzOffsetMs(utc);return new Date(utc).toISOString();}
async function fetchHtml(url:string){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{headers:{"user-agent":UA,accept:"text/html,application/xhtml+xml","accept-language":"sl-SI,sl;q=0.9,en;q=0.5"},redirect:"follow",signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return {html:await r.text(),url:r.url};}finally{clearTimeout(t)}}
function sameHost(href:string|undefined){if(!href)return null;try{const u=new URL(href,BASE);if(u.hostname.replace(/^www\./,"")!=="plesni-forum.si")return null;u.hash="";return u.toString();}catch{return null}}
function category(title:string,body:string){const s=`${title} ${body}`.toLowerCase();if(/koncert|jazz|glasb/.test(s))return "Koncerti";if(/ples|predstav|korpus|koreograf/.test(s))return "Predstave";if(/festival|tekmov/.test(s))return "Ostalo";return "Ostalo";}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:src,error:se}=await sb.from("sources").select("id").eq("key","plesni-forum").single();
  if(se||!src)return Response.json({ok:false,error:se?.message||"source missing"},{status:500});

  try{
    const l=await fetchHtml(LIST_URL),$=load(l.html),urls=new Set<string>();
    $("main a[href], article a[href], .elementor a[href]").each((_i,e)=>{const u=sameHost($(e).attr("href"));if(!u)return;const p=new URL(u).pathname;if(p==="/"||p.startsWith("/dogodki")||p.startsWith("/category/")||p.startsWith("/kontakt"))return;urls.add(u);});
    const failures:string[]=[];const rows:any[]=[];const now=new Date().toISOString();
    for(const url of [...urls].slice(0,40)){
      try{
        const d=await fetchHtml(url),q=load(d.html),body=clean(q("main").text()||q("body").text());
        const m=body.match(/(?:Čas:\s*)?(\d{1,2})\.(\d{1,2})\.(20\d{2})\s*(?:ob\s*)?(\d{1,2})(?:[:.]?(\d{2}))?\s*h?/i);
        if(!m)continue;
        const start=localIso(+m[3],+m[2],+m[1],+m[4],m[5]?+m[5]:0);
        if(Date.parse(start)<Date.now()-86400000)continue;
        const title=clean(q("h1").first().text()||q("h2").filter((_i,e)=>!/\d{1,2}\.\d{1,2}\.20\d{2}/.test(clean(q(e).text()))).first().text()||q("title").text().replace(/\s*-\s*Plesni Forum Celje.*$/i,""));
        if(!title)continue;
        const loc=body.match(/Lokacija:\s*(.{2,120}?)(?=\s+Čas:|\s+Termin:|$)/i);
        const venue=clean(loc?.[1])||"Plesni forum Celje";
        const slug=new URL(d.url).pathname.split("/").filter(Boolean).pop()!;
        rows.push({source_id:src.id,source_event_id:slug,title,slug:`plesni-forum-${slug}`,start_at:start,end_at:null,all_day:false,venue,address:venue.toLowerCase().includes("plesni forum")?"Trubarjeva ulica 1a, 3000 Celje":null,city:"Celje",category:category(title,body),event_type:"single",is_free:/vstop\s+prost|brezplač/i.test(body)?true:null,price_text:null,description:body.slice(0,4000),image_url:q("meta[property='og:image']").attr("content")||null,source_url:d.url,status:"published",location_status:"in_area",raw:{direct_source:"plesni-forum"},last_seen_at:now,updated_at:now});
      }catch(e){failures.push(`${url}: ${e instanceof Error?e.message:String(e)}`)}
    }
    if(rows.length){const {error}=await sb.from("events").upsert(rows,{onConflict:"source_id,source_event_id"});if(error)throw error;}
    await sb.from("sources").update({last_synced_at:now,updated_at:now}).eq("id",src.id);
    return Response.json({ok:true,discovered:urls.size,imported:rows.length,failed:failures.length,failures:failures.slice(0,5)});
  }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:502});}
});
