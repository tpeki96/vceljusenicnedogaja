-- Reviewed public records. Keep both rows and point stale copies to the canonical event.
-- Guards prevent applying this correction if either event has changed since review.
begin;

update public.events as old
set duplicate_of = canonical.id,
    dedupe_confidence = 1,
    dedupe_reason = 'reviewed:official_club_schedule_time_updated',
    updated_at = now()
from public.events as canonical
where old.id = '73a7f529-f9c8-4f04-9738-a95c6ff1ece4'
  and canonical.id = '94469d11-7b83-4f56-8141-0f59f96046e6'
  and old.source_id = canonical.source_id
  and old.source_id = '601e92fe-7cfc-4f39-a6aa-9d6c3dd61c09'
  and old.title = canonical.title
  and old.venue = canonical.venue
  and old.start_at = '2026-10-11T16:00:00Z'
  and canonical.start_at = '2026-10-11T16:30:00Z'
  and old.source_url = 'https://www.rk-celje.si/sl/tekme'
  and canonical.source_url = old.source_url
  and old.duplicate_of is null
  and canonical.duplicate_of is null;

-- Exact matching date and venue, title differs only by spelling/capitalisation.
update public.events as old
set duplicate_of = canonical.id,
    dedupe_confidence = 1,
    dedupe_reason = 'reviewed:same_performance_date_and_venue',
    updated_at = now()
from public.events as canonical
where old.id = '84172baa-5a60-4fe9-8eca-9e965fc83772'
  and canonical.id = '60bb180a-1d39-48c2-a714-c5455bebe8b1'
  and old.source_id = '001400c3-253c-4794-a3df-1acaf6ca168d'
  and canonical.source_id = '3fcf3549-f879-4cbd-a4ff-266d0825c672'
  and old.title = 'Mojca Pokraculja'
  and canonical.title = 'MOJCA POKRAJCULJA'
  and old.start_at = '2026-10-17T08:00:00Z'
  and canonical.start_at = old.start_at
  and old.venue = 'Muzej novejše zgodovine Celje'
  and canonical.venue = old.venue
  and old.duplicate_of is null
  and canonical.duplicate_of is null;

commit;
