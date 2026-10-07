const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/sync-celje-clubs/index.ts'), 'utf8');
const context = vm.createContext({ Intl, Date, Deno: { serve() {} } });
vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;$/gm, '')), context);
const fixture = () => ({
  source_event_id: 'stable-new-id',
  title: 'RK Celje Pivovarna Laško – MRK Krka',
  start_at: '2026-10-11T16:30:00Z',
  venue: 'Dvorana Zlatorog',
  description: 'Liga NLB',
});
const existing = overrides => ({
  ...fixture(), source_event_id: 'legacy-id-with-time',
  start_at: '2026-10-11T16:00:00Z', duplicate_of: null, ...overrides,
});
const apply = (row, known) => context.reuseFixtureIds([row], known);

let row = fixture();
apply(row, [existing({})]);
assert.equal(row.source_event_id, 'legacy-id-with-time', 'Time change updates the existing fixture');

row = fixture();
apply(row, [existing({ duplicate_of: 'canonical-id' }), existing({
  source_event_id: 'canonical-id', start_at: row.start_at,
})]);
assert.equal(row.source_event_id, 'canonical-id', 'Reviewed duplicate stays hidden');

row = fixture();
apply(row, [existing({ duplicate_of: 'canonical-id' })]);
assert.equal(row.source_event_id, 'stable-new-id', 'Never reuse an identifier belonging to a hidden duplicate');

for (const change of [
  { start_at: '2026-10-12T16:00:00Z' },
  { venue: 'Other venue' },
  { description: 'Pokal Slovenije' },
]) {
  row = fixture();
  apply(row, [existing(change)]);
  assert.equal(row.source_event_id, 'stable-new-id', 'Different fixture remains separate');
}

row = fixture();
assert.throws(() => apply(row, [existing({}), existing({ source_event_id: 'second' })]), /Ambiguous/);
row = fixture();
apply(row, [existing({}), existing({ source_event_id: 'exact', start_at: row.start_at })]);
assert.equal(row.source_event_id, 'exact', 'Exact time resolves a legacy pair before database cleanup');
console.log('Club fixture identity checks passed');
