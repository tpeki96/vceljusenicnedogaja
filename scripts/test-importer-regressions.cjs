// Run with Node 24 and cheerio@1.0.0 available in NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { load } = require('cheerio');

async function run(name, htmlForUrl) {
  let handler;
  const batches = [], fetches = [];
  const sb = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, like() { return this; },
      neq() { return this; }, gte() { return this; }, lte() { return this; }, in() { return this; },
      single() { return Promise.resolve({ data: { id: 'source-id' }, error: null }); },
      update() { return this; },
      upsert(rows) {
        assert.equal(new Set(rows.map(r => r.source_event_id)).size, rows.length);
        batches.push(rows);
        return this;
      },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const context = vm.createContext({
    Intl, Date, URL, Response, AbortSignal, load, setTimeout,
    createClient: () => sb,
    fetch: async url => {
      fetches.push(url);
      return { ok: true, url, text: async () => htmlForUrl(url) };
    },
    Deno: { serve(fn) { handler = fn; }, env: { get() { return 'test'; } } },
  });
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions', name, 'index.ts'), 'utf8');
  vm.runInContext(stripTypeScriptTypes(source.replace(/import\b[^;]+;/g, '')), context);
  const response = await handler({ method: 'POST' });
  assert.equal(response.status, 200);
  return { batches, fetches, body: await response.json(), context };
}

(async () => {
  const future = new Date(Date.now() + 7 * 86400000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(future).map(p => [p.type, p.value]));
  const date = parts.day + '.' + parts.month + '.' + parts.year;
  const match = '<div class="resulttab"><div class="g-info">' + date +
    ' 18:30 Dvorana Celje</div><table><tr><td class="team">HK LedX Celje</td>' +
    '<td class="team">HK Olimpija</td></tr></table></div>';
  const hockey = await run('sync-hzs', () => match + match);
  assert.equal(hockey.batches[0].length, 1, 'Repeated responsive schedule blocks produce one upsert row');
  assert.equal(hockey.body.imported, 1);

  const item = '<div class="e-loop-item"><a href="https://www.inkubatorsr.si/dogodki/test/">Test</a>' +
    '<div class="date">' + date + '</div></div>';
  const detail = '<main><h1>Test workshop</h1>Datum dogodka ' + date +
    ' Lokacija dogodka Inkubator Savinjske regije 📅 ob 18:30 – 20:00</main>';
  const ink = await run('sync-inkubator', url => url.includes('/aktualno/') ? item + item : detail);
  assert.equal(ink.batches[0].length, 1);
  assert.equal(ink.fetches.length, 2, 'Duplicate listing URLs are fetched once');
  assert.equal(ink.body.discovered_future, 1);
  assert.equal(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(ink.batches[0][0].start_at)), '18:30', 'Calendar date is not mistaken for kickoff time');
  const noTime = await run('sync-inkubator', url => url.includes('/aktualno/') ? item : detail.replace('ob 18:30 – 20:00', ''));
  assert.equal(noTime.batches[0][0].all_day, true);

  const celje = await run('sync-celje-info', url => url.includes('/kam-v-celju/')
    ? '<a href="/events/event/test/">Test</a>'
    : '<main><h1>Test</h1><ul><li>Datum: ' + date + ' 18:30</li><li>Lokacija: Celje</li></ul></main>');
  assert.equal(celje.context.celjeDateKey('2026-10-11T22:30:00Z'), '2026-10-12');
  assert.equal(celje.context.celjeDateKey('2026-10-25T23:30:00Z'), '2026-10-26');
  assert.equal(celje.context.localDateTimeToIso({ year: 2026, month: 10, day: 11 }, { hour: 18, minute: 30 }), '2026-10-11T16:30:00.000Z');
  const nina = await run('sync-nina-strnad', () => '<div class="nastopi_wrapper"><div class="nastopi_row">' +
    '<div class="nastopi_col_date">' + date + '</div><div class="nastopi_col_lokacija">Medvode</div>' +
    '<div class="nastopi_col_title">Nina Strnad Band</div></div></div>');
  assert.equal(nina.body.imported, 0, 'Current Medvode concert stays outside the Celje listing');
  const concert = '<div class="nastopi_wrapper"><div class="nastopi_row">' +
    '<div class="nastopi_col_date">' + date + '</div><div class="nastopi_col_lokacija">Celje<span class="nastopi_mobile_venue">, MCC</span></div>' +
    '<div class="nastopi_col_title">Nina Strnad</div><div class="nastopi_desc_location">Celje, MCC</div>' +
    '<div class="nastopi_desc_text">Koncert ob 19:30</div></div></div>';
  const parsedNina = nina.context.parseConcerts(concert, 'source-id', new Date().toISOString());
  assert.equal(parsedNina.rows.length, 1);
  assert.equal(parsedNina.rows[0].all_day, false);
  assert.throws(() => nina.context.parseConcerts('<html>Changed page</html>', 'source-id', new Date().toISOString()), /structure missing/);
  const visit = await run('sync-visit-celje', () => '<a href="/sl/izdelek/test/">' + date.replaceAll(' ', '') + ' Test</a>' +
    '<main><h1>Test</h1><h3>Začetek</h3><p>' + date.replaceAll(' ', '') + ' ob 18:30</p><h3>Konec</h3><p>' + date.replaceAll(' ', '') + ' ob 20:00</p><h3>Lokacija</h3><p>Celje</p></main>');
  assert.equal(visit.context.localDateTimeToIso({ year: 2026, month: 10, day: 11 }, { hour: 18, minute: 30 }), '2026-10-11T16:30:00.000Z');
  console.log('Importer duplicate and date regression checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
