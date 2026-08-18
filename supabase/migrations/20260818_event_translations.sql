create table if not exists public.event_translations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  language text not null check (language in ('en','de','it')),
  title text not null,
  category text,
  source_hash text not null,
  provider text not null default 'google-translate',
  manual_override boolean not null default false,
  translated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, language)
);

create index if not exists event_translations_language_idx
  on public.event_translations(language, event_id);

alter table public.event_translations enable row level security;

drop policy if exists "Public can read event translations" on public.event_translations;
create policy "Public can read event translations"
  on public.event_translations
  for select
  to anon, authenticated
  using (true);
