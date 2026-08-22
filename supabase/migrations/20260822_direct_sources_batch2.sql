insert into sources (key,name,base_url,import_method,active,created_at,updated_at)
values
  ('slg-celje','Slovensko ljudsko gledališče Celje','https://slg-ce.si','direct_html',true,now(),now()),
  ('inkubator-sr','Inkubator Savinjske regije','https://www.inkubatorsr.si','direct_html',true,now(),now()),
  ('celjski-sejem','Celjski sejem','https://ce-sejem.si','direct_html',true,now(),now())
on conflict (key) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  import_method=excluded.import_method,
  active=true,
  updated_at=now();

do $$ begin
  if exists (select 1 from cron.job where jobname='sync-slg-celje-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-slg-celje-every-6-hours' limit 1));
  end if;
  if exists (select 1 from cron.job where jobname='sync-inkubator-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-inkubator-every-6-hours' limit 1));
  end if;
  if exists (select 1 from cron.job where jobname='sync-celjski-sejem-every-6-hours') then
    perform cron.unschedule((select jobid from cron.job where jobname='sync-celjski-sejem-every-6-hours' limit 1));
  end if;

  perform cron.schedule('sync-inkubator-every-6-hours','37 */6 * * *',$cmd$
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

  perform cron.schedule('sync-celjski-sejem-every-6-hours','42 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-celjski-sejem',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);

  perform cron.schedule('sync-slg-celje-every-6-hours','47 */6 * * *',$cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-slg-celje',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);
end $$;