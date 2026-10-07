const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

(async () => {
  let handler, rateLimited = false, providerCalls = 0;
  const writes = [], reads = [];
  const events = Array.from({ length: 5 }, (_, i) => ({
    id: 'event-' + i, title: 'Dogodek ' + i, category: 'Koncerti',
    start_at: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    end_at: null, event_type: 'single',
  }));
  const context = vm.createContext({
    Date, URL, Response, AbortSignal, TextEncoder, Uint8Array, crypto,
    setTimeout: fn => setTimeout(fn, 0),
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://test.supabase.co' : key === 'SUPABASE_ANON_KEY' ? 'public-test-key' : 'test-key' }, serve(fn) { handler = fn; } },
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      if (url.hostname === 'translate.googleapis.com') {
        providerCalls++;
        return rateLimited ? new Response(null, { status: 429 }) : Response.json([[[url.searchParams.get('q') + ' translated']]]);
      }
      if (init.method === 'POST') { writes.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      reads.push(url);
      if (url.pathname.endsWith('/events')) {
        assert.equal(init.headers.apikey, 'public-test-key', 'External translation input is read through the public anonymous role');
        return Response.json(events);
      }
      return Response.json([{ event_id: 'event-0', language: 'en', manual_override: true, source_hash: 'manual' }]);
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/translate-events/index.ts'), 'utf8');
  vm.runInContext(stripTypeScriptTypes(source.replace(/import\b[^;]+;/g, '')), context);
  assert.equal((await handler({ method: 'GET' })).status, 405);
  const response = await handler({ method: 'POST' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.attempted, 6);
  assert.equal(body.translated, 6);
  assert.equal(body.pending_before_run, 14);
  assert.equal(writes.length, 6);
  assert(!writes.some(row => row.event_id === 'event-0' && row.language === 'en'), 'Manual translation remains untouched');
  assert(reads[0].searchParams.get('or').includes('end_at.gte.'), 'Ongoing events remain eligible');
  assert.equal(reads[0].searchParams.get('order'), 'start_at.asc,id.asc');
  assert(reads[1].searchParams.get('event_id').startsWith('in.('), 'Load translations for selected events only');
  rateLimited = true;
  providerCalls = 0;
  const throttled = await (await handler({ method: 'POST' })).json();
  assert.equal(throttled.rate_limited, true);
  assert.equal(throttled.attempted, 1);
  assert.equal(providerCalls, 1, 'Rate limit stops the batch immediately without repeated requests');
  console.log('Translation batch and manual override checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
