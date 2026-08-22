insert into sources (key,name,base_url,import_method,active,created_at,updated_at)
values
  ('citycenter','Citycenter Celje','https://www.city-center.si','direct_html',true,now(),now()),
  ('kk-celje','Košarkarski klub Celje','https://www.kkcelje.si','direct_html',true,now(),now())
on conflict (key) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  import_method=excluded.import_method,
  active=true,
  updated_at=now();

do $$ begin
  if exists (select 1 from cron.job where jobname='sync-citycenter-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-citycenter-every-6-hours' limit 1));
  end if;
  if exists (select 1 from cron.job where jobname='sync-kk-celje-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-kk-celje-every-6-hours' limit 1));
  end if;

  perform cron.schedule('sync-kk-celje-every-6-hours','12 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-kk-celje',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);

  perform cron.schedule('sync-citycenter-every-6-hours','52 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-citycenter',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);
end $$;