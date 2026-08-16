alter table public.events
  add column if not exists event_type text not null default 'single'
    check (event_type in ('single','multiday','ongoing')),
  add column if not exists duplicate_of uuid references public.events(id) on delete set null,
  add column if not exists dedupe_confidence numeric,
  add column if not exists dedupe_reason text,
  add column if not exists location_status text not null default 'in_area'
    check (location_status in ('in_area','out_of_area','review'));

create index if not exists events_end_at_idx on public.events (end_at);
create index if not exists events_duplicate_of_idx on public.events (duplicate_of);
create index if not exists events_event_type_idx on public.events (event_type);

insert into public.sources (key, name, base_url, import_method)
values ('celje-info', 'Celje.info', 'https://www.celje.info', 'html')
on conflict (key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    import_method = excluded.import_method,
    active = true,
    updated_at = now();
