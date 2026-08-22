insert into sources (key,name,base_url,import_method,active,created_at,updated_at)
values
  ('spital','Špital za prjatle','https://www.spital.si/koledar-dogodkov/','direct_ajax',true,now(),now()),
  ('mansion','Mansion Klub','https://www.mansionklub.si/dogodki','direct_jsonld',true,now(),now())
on conflict (key) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  import_method=excluded.import_method,
  active=true,
  updated_at=now();

create or replace function public.promote_direct_source_duplicates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  changed integer := 0;
begin
  with direct_events as (
    select e.id,e.title,e.start_at,e.venue
    from public.events e
    join public.sources s on s.id=e.source_id
    where s.active=true
      and s.import_method like 'direct_%'
      and e.status='published'
      and coalesce(e.end_at,e.start_at) >= now()-interval '1 day'
  ), candidates as (
    select e.id,e.title,e.start_at,e.venue
    from public.events e
    join public.sources s on s.id=e.source_id
    where s.active=true
      and s.import_method not like 'direct_%'
      and e.status='published'
      and coalesce(e.end_at,e.start_at) >= now()-interval '1 day'
  ), ranked as (
    select c.id candidate_id,d.id direct_id,
      similarity(lower(d.title),lower(c.title)) as title_sim,
      similarity(lower(coalesce(d.venue,'')),lower(coalesce(c.venue,''))) as venue_sim,
      row_number() over (
        partition by c.id
        order by
          (similarity(lower(d.title),lower(c.title))*0.9 + similarity(lower(coalesce(d.venue,'')),lower(coalesce(c.venue,'')))*0.1) desc
      ) rn
    from candidates c
    join direct_events d
      on (c.start_at at time zone 'Europe/Ljubljana')::date=(d.start_at at time zone 'Europe/Ljubljana')::date
    where similarity(lower(d.title),lower(c.title)) >= 0.72
       or (similarity(lower(d.title),lower(c.title)) >= 0.55 and similarity(lower(coalesce(d.venue,'')),lower(coalesce(c.venue,''))) >= 0.45)
  ), winners as (
    select * from ranked where rn=1
  )
  update public.events e
     set duplicate_of=w.direct_id,
         dedupe_confidence=round((w.title_sim*0.9+w.venue_sim*0.1)::numeric,3),
         dedupe_reason='direct-promotion:title:'||round(w.title_sim::numeric,2)||',venue:'||round(w.venue_sim::numeric,2),
         updated_at=now()
    from winners w
   where e.id=w.candidate_id
     and e.duplicate_of is distinct from w.direct_id;

  get diagnostics changed = row_count;
  affected := affected + changed;
  return affected;
end;
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname='sync-private-venues-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-private-venues-every-6-hours' limit 1));
  end if;
  perform cron.schedule('sync-private-venues-every-6-hours','22 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-private-venues',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);

  if exists (select 1 from cron.job where jobname='promote-direct-sources-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='promote-direct-sources-every-6-hours' limit 1));
  end if;
  perform cron.schedule(
    'promote-direct-sources-every-6-hours',
    '5 1,7,13,19 * * *',
    'select public.promote_direct_source_duplicates();'
  );
end $$;

select public.promote_direct_source_duplicates();
