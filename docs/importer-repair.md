# Importer repair, 7 October 2026

## Applied changes

- The club importer no longer includes kickoff time in newly generated fixture identifiers. Competition is included to distinguish separate competitions.
- Existing active fixtures keep their legacy identifier when the same title, local date, venue and competition appear with an updated time.
- Exact-time matches resolve the reviewed legacy pair. Ambiguous matches fail instead of choosing a record arbitrarily. Records marked as duplicates are excluded.
- The guarded SQL migration marks the stale RK Celje–MRK Krka record and the Celje.info copy of Mojca Pokraculja as duplicates. It does not delete records.

Validation: run `node scripts/test-club-fixture-identity.cjs` with Node 22.13+ or Node 24. Syntax check: `node --experimental-strip-types --check supabase/functions/sync-celje-clubs/index.ts`.

The guarded duplicate correction was executed with SQL and verified against production rows. The obsolete RK fixture points to the 18:30 fixture. The Celje.info Mojca Pokraculja record points to Visit Celje and keeps that reviewed relationship on reimport.

## Importer failures and fixes

- Inkubator and HZS both failed with PostgreSQL's `ON CONFLICT DO UPDATE command cannot affect row a second time`: repeated responsive listing blocks produced duplicate identifiers in a single upsert. The importers now collapse these rows; Inkubator also fetches duplicate detail URLs only once.
- Inkubator no longer mistakes the dotted calendar date for a clock time.
- Celje.info and Visit Celje were stopped for `CPUTime` in function logs. Reusing timezone formatters and caching date keys prevents repeated formatter construction during comparisons.
- Celje.info preserves reviewed duplicate decisions for unchanged records. It does not update the successful sync timestamp when parsing has failed.
- Nina Strnad had no scheduled adapter. The new importer checks the observed concert listing and only imports concerts whose city is Celje. Job `sync-nina-strnad-every-6-hours` runs at `11 3,9,15,21 * * *` UTC. The currently listed Medvode concert is correctly excluded.
- The translation worker reads eligible event titles through the public anonymous role, paginates current/upcoming/ongoing events and reads translations for those IDs. Manual overrides are preserved. It processes at most six pairs within a bounded runtime and stops immediately on provider HTTP 429.

## Production verification

Deployed versions: `sync-celje-clubs` 3, `sync-inkubator` 3, `sync-hzs` 4, `sync-celje-info` 3, `sync-visit-celje` 4, `sync-nina-strnad` 1, `translate-events` 4. JWT verification remains enabled.

Observed HTTP 200 / successful imports:

- Club importer: three NK and three RK fixtures; repeating the import kept one visible RK–MRK Krka fixture and the stale record marked as a duplicate.
- Inkubator: four events, no parsing failures.
- HZS: three fixtures.
- Celje.info: 31 events, no parsing failures; reviewed Mojca correction persisted.
- Visit Celje: 15 listing pages, 24 refreshed events, no failures or warnings.
- Nina Strnad: one listed concert, zero Celje concerts; successful sync timestamp updated.

Read-only health audit at 2026-10-07 11:43 UTC: 26 active sources, 177 eligible events, zero findings. This audit checks source freshness and event quality; it does not establish translation provider health.

Remaining external limitation: Google Translate returned HTTP 429 for the live translation check. The worker now returns without exceeding the runtime limit and stops the batch rather than retrying the rate limit repeatedly. Existing translations and Slovenian titles remain available; pending translations will be retried by the existing cron job.

## Regression checks

Use Node 24. Cheerio is only needed by the parser tests; it is not a frontend dependency.

```sh
npm install --prefix /tmp/celje-importer-test --save-exact cheerio@1.0.0
NODE_PATH=/tmp/celje-importer-test/node_modules node scripts/test-importer-regressions.cjs
node scripts/test-club-fixture-identity.cjs
node scripts/test-translation-worker.cjs
```
