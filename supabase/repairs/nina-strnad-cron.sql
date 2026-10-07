-- Applied 2026-10-07. Scheduling the same name updates the existing job.
select cron.schedule(
  'sync-nina-strnad-every-6-hours',
  '11 3,9,15,21 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'project_url' order by created_at desc limit 1)
             || '/functions/v1/sync-nina-strnad',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
              where name = 'legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
