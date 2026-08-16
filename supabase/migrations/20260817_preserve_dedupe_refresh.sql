create or replace function public.preserve_dedupe_on_source_refresh()
returns trigger
language plpgsql
as $$
begin
  if old.duplicate_of is not null
     and new.duplicate_of is null
     and new.last_seen_at is distinct from old.last_seen_at then
    new.duplicate_of := old.duplicate_of;
    new.dedupe_confidence := old.dedupe_confidence;
    new.dedupe_reason := old.dedupe_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_dedupe_on_source_refresh on public.events;
create trigger preserve_dedupe_on_source_refresh
before update on public.events
for each row
execute function public.preserve_dedupe_on_source_refresh();
