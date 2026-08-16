-- Visit Celje source + helper used for cross-source dedupe audits.
create extension if not exists pg_trgm;

insert into public.sources (key, name, base_url, import_method, active)
values ('visit-celje', 'Visit Celje', 'https://www.visitcelje.eu', 'html', true)
on conflict (key) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  import_method = excluded.import_method,
  active = true,
  updated_at = now();

-- Keep the larger Visit Celje source staggered from the other importers.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'sync-visit-celje-every-6-hours';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'sync-visit-celje-every-6-hours',
    '57 */6 * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' order by created_at desc limit 1) || '/functions/v1/sync-visit-celje',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'legacy_anon_key' order by created_at desc limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end $$;
