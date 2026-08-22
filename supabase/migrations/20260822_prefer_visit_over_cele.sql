create or replace function public.dedupe_cele_against_visit()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  affected integer := 0;
  changed integer := 0;
begin
  create temporary table if not exists _visit_cele_winners(
    cele_id uuid primary key,
    visit_id uuid not null,
    title_sim real,
    venue_sim real,
    time_diff real
  ) on commit drop;
  truncate _visit_cele_winners;

  insert into _visit_cele_winners(cele_id,visit_id,title_sim,venue_sim,time_diff)
  with cele as (
    select e.id,e.title,e.start_at,e.venue
    from public.events e join public.sources s on s.id=e.source_id
    where s.key='cele-si' and s.active=true and e.status='published'
      and e.start_at>=now()-interval '1 day'
      and e.duplicate_of is null
  ), visit as (
    select e.id,e.title,e.start_at,e.venue
    from public.events e join public.sources s on s.id=e.source_id
    where s.key='visit-celje' and s.active=true and e.status='published'
      and e.start_at>=now()-interval '1 day'
  ), ranked as (
    select c.id cele_id,v.id visit_id,
      similarity(lower(c.title),lower(v.title)) title_sim,
      similarity(lower(coalesce(c.venue,'')),lower(coalesce(v.venue,''))) venue_sim,
      abs(extract(epoch from (c.start_at-v.start_at))) time_diff,
      row_number() over(
        partition by c.id
        order by
          case when abs(extract(epoch from (c.start_at-v.start_at)))<=120 then 1 else 0 end desc,
          similarity(lower(c.title),lower(v.title)) desc,
          similarity(lower(coalesce(c.venue,'')),lower(coalesce(v.venue,''))) desc
      ) rn
    from cele c
    join visit v on (c.start_at at time zone 'Europe/Ljubljana')::date=(v.start_at at time zone 'Europe/Ljubljana')::date
    where
      (
        abs(extract(epoch from (c.start_at-v.start_at)))<=120
        and (
          similarity(lower(c.title),lower(v.title))>=0.50
          or (similarity(lower(c.title),lower(v.title))>=0.35 and similarity(lower(coalesce(c.venue,'')),lower(coalesce(v.venue,'')))>=0.30)
        )
      )
      or (
        similarity(lower(c.title),lower(v.title))>=0.82
        and abs(extract(epoch from (c.start_at-v.start_at)))<=7200
      )
  )
  select cele_id,visit_id,title_sim,venue_sim,time_diff from ranked where rn=1;

  update public.events v
     set duplicate_of=null,dedupe_confidence=null,dedupe_reason=null,updated_at=now()
    from _visit_cele_winners w
   where v.id=w.visit_id and v.duplicate_of is not null;

  update public.events child
     set duplicate_of=w.visit_id,updated_at=now()
    from _visit_cele_winners w
   where child.duplicate_of=w.cele_id and child.id<>w.visit_id;

  update public.events c
     set duplicate_of=w.visit_id,
         dedupe_confidence=round((greatest(w.title_sim,0.5)*0.85 + w.venue_sim*0.10 + case when w.time_diff<=120 then 0.05 else 0 end)::numeric,3),
         dedupe_reason='visit-over-cele:title:'||round(w.title_sim::numeric,2)||',venue:'||round(w.venue_sim::numeric,2)||',seconds:'||round(w.time_diff::numeric,0),
         updated_at=now()
    from _visit_cele_winners w
   where c.id=w.cele_id;

  get diagnostics changed=row_count;
  affected := affected + changed;
  return affected;
end;
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname='dedupe-cele-against-visit-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='dedupe-cele-against-visit-every-6-hours' limit 1));
  end if;
  perform cron.schedule(
    'dedupe-cele-against-visit-every-6-hours',
    '6 1,7,13,19 * * *',
    'select public.dedupe_cele_against_visit();'
  );
end $$;

select public.dedupe_cele_against_visit();
