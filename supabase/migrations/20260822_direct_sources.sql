insert into public.sources (key,name,base_url,import_method,active,created_at,updated_at)
values
  ('mcc','Celjski mladinski center','https://www.mc-celje.si','direct_html',true,now(),now()),
  ('mnzc','Muzej novejše zgodovine Celje','https://www.muzej-nz-ce.si','direct_html',true,now(),now()),
  ('tehnopark','Tehnopark Celje','https://tehnopark.si','direct_api',true,now(),now()),
  ('knjiznica-celje','Osrednja knjižnica Celje','https://www.knjiznica-celje.si','direct_html',false,now(),now()),
  ('pokmuz-celje','Pokrajinski muzej Celje','https://www.pokmuz-ce.si','direct_html',false,now(),now())
on conflict (key) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  import_method=excluded.import_method,
  active=excluded.active,
  updated_at=now();

select cron.schedule(
  'sync-direct-sources-every-6-hours',
  '7 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-direct-sources',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'sync-tehnopark-every-6-hours',
  '27 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' order by created_at desc limit 1) || '/functions/v1/sync-tehnopark',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
