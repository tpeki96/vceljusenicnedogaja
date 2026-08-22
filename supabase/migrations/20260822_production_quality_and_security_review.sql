create or replace function public.event_quality_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  place_text text := lower(coalesce(new.venue,'') || ' ' || coalesce(new.address,''));
begin
  -- Explicit venues outside Celje must never be exposed as in-area, even if an importer defaulted city=Celje.
  if place_text ~ '(šentjur|rogaška slatina|zalec|žalec|velenje|maribor|ljubljana|laško|šmartno ob paki|slovenj gradec)' then
    new.location_status := 'out_of_area';
  end if;

  -- Citycenter sometimes publishes a sales period for tickets as an event card. Do not count that as an event.
  if lower(ltrim(coalesce(new.title,''))) like 'vstopnice %'
     and lower(coalesce(new.venue,'')) like '%citycenter%' then
    new.status := 'hidden';
  end if;

  -- Known MCC page whose free-text fallback can accidentally capture neighbouring page copy.
  if new.source_event_id = 'basket_turnir_3_na_3_3' then
    new.venue := 'Igrišče MAVS';
    new.address := 'Ljubljanska cesta 21, 3000 Celje';
    new.city := 'Celje';
    new.location_status := 'in_area';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_event_quality_guard on public.events;
create trigger trg_event_quality_guard
before insert or update on public.events
for each row execute function public.event_quality_guard();

alter function public.preserve_dedupe_on_source_refresh() set search_path = public;
revoke execute on function public.dedupe_cele_against_visit() from public, anon, authenticated;
revoke execute on function public.promote_direct_source_duplicates() from public, anon, authenticated;

update public.events set updated_at = now()
where status = 'published' and start_at >= now() - interval '1 day';

select cron.unschedule(jobid) from cron.job where jobname='sync-inkubator-every-6-hours';
select cron.schedule('sync-inkubator-every-6-hours','32 */6 * * *',$cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-inkubator',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);