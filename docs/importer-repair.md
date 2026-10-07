# Importer repair, 7 October 2026

## Prepared changes

- The club importer no longer includes kickoff time in newly generated fixture identifiers. Competition is included to distinguish separate competitions.
- Existing active fixtures keep their legacy identifier when the same title, local date, venue and competition appear with an updated time.
- Exact-time matches resolve the reviewed legacy pair. Ambiguous matches fail instead of choosing a record arbitrarily. Records marked as duplicates are excluded.
- The guarded SQL migration marks the stale RK Celje–MRK Krka record and the Celje.info copy of Mojca Pokraculja as duplicates. It does not delete records.

Validation: run `node scripts/test-club-fixture-identity.cjs` with Node 22.13+ or Node 24. Syntax check: `node --experimental-strip-types --check supabase/functions/sync-celje-clubs/index.ts`.

## Production work still required

Committing these files does not apply a Supabase migration or deploy an Edge Function. Before applying, check the four guarded record IDs and confirm that the official RK schedule still shows 11 October at 18:30 Europe/Ljubljana.

1. Apply the reviewed migration, then verify both obsolete records point to their canonical records.
2. Deploy `sync-celje-clubs`, invoke it, and verify that repeating the import does not add another RK Celje–MRK Krka fixture.
3. Inspect cron scheduling, HTTP responses and deployed function logs for `celje-info`, `inkubator-sr` and `hzs`; their public last-sync timestamps are stale. `nina-strnad` has no confirmed sync timestamp. Public timestamps alone cannot establish the cause.
4. Repair only the causes confirmed by those logs; rerun affected importers and the event health audit.

At preparation time the Supabase plugin is reported installed, but its SQL, deployment and logging tools are not exposed in this session. Database changes and Edge Function deployment have not been performed.
