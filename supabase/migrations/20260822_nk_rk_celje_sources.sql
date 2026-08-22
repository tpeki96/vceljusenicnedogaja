insert into sources (key,name,base_url,import_method,active,created_at,updated_at)
values
  ('nk-celje','NK Celje','https://www.nk-celje.si','direct_html',true,now(),now()),
  ('rk-celje','RK Celje Pivovarna Laško','https://www.rk-celje.si','direct_html',true,now(),now())
on conflict (key) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  import_method=excluded.import_method,
  active=true,
  updated_at=now();

do $$ begin
  if exists (select 1 from cron.job where jobname='sync-celje-clubs-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-celje-clubs-every-6-hours' limit 1));
  end if;
  perform cron.schedule('sync-celje-clubs-every-6-hours','2 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-celje-clubs',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);
end $$;