do $$
declare
  existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname = 'translate-events-hourly'
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'translate-events-hourly',
    '12 * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/translate-events',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end $$;
