import test from 'node:test';
import assert from 'node:assert/strict';
import { followRedirects, checkLink, checkLinks } from '../../lib/link-check.mjs';

const base = 'https://s.test/';

// A fake Playwright APIRequestContext: answers from a route table and records
// every URL it was asked for, with the options it was asked with.
function fakeRequest(routes) {
  const calls = [];
  return {
    calls,
    async get(url, options) {
      calls.push({ url, options });
      const [status, location] = routes[url] ?? [404];
      return { status: () => status, headers: () => (location ? { location } : {}) };
    },
  };
}

test('redirects are followed by hand and every hop goes through the URL filter', async () => {
  const request = fakeRequest({
    'https://s.test/go/': [302, '/?add-to-cart=12'],
  });
  const result = await checkLink(request, 'https://s.test/go/', { baseUrl: base, audience: 'visitor' });
  assert.deepEqual(result, { checked: false, refused: 'https://s.test/?add-to-cart=12', reason: 'mutating-param:add-to-cart' });
  assert.deepEqual(request.calls.map((c) => c.url), ['https://s.test/go/']);
  assert.ok(request.calls.every((c) => c.options.maxRedirects === 0));
});

test('an allowed chain reports the final status', async () => {
  const request = fakeRequest({
    'https://s.test/old/': [301, 'https://s.test/new/'],
    'https://s.test/new/': [301, '/gone/'],
  });
  const result = await checkLink(request, 'https://s.test/old/', { baseUrl: base, audience: 'visitor' });
  assert.deepEqual(result, { checked: true, status: 404, url: 'https://s.test/gone/' });
  assert.deepEqual(request.calls.map((c) => c.url), ['https://s.test/old/', 'https://s.test/new/', 'https://s.test/gone/']);
});

test('more than five hops stops the check', async () => {
  const routes = {};
  for (let i = 0; i < 10; i++) routes[`https://s.test/r${i}/`] = [302, `/r${i + 1}/`];
  const request = fakeRequest(routes);
  const result = await checkLink(request, 'https://s.test/r0/', { baseUrl: base, audience: 'visitor' });
  assert.equal(result.checked, false);
  assert.equal(result.reason, 'too-many-redirects');
  assert.equal(request.calls.length, 6);
});

test('followRedirects stops before requesting a refused hop', async () => {
  const seen = [];
  const hop = async (url) => {
    seen.push(url);
    return url === 'https://s.test/' ? { status: 301, location: 'https://www.s.test/' } : { status: 200 };
  };
  const result = await followRedirects('https://s.test/', { hop, allow: (u) => (new URL(u).origin === 'https://s.test' ? true : 'external') });
  assert.deepEqual(result, { status: 301, url: 'https://s.test/', refused: 'https://www.s.test/', reason: 'external' });
  assert.deepEqual(seen, ['https://s.test/']);
});

test('checkLinks skips query links, refused links and redirects, and reports broken ones', async () => {
  const request = fakeRequest({
    'https://s.test/ok/': [200],
    'https://s.test/go/': [302, '/?add-to-cart=1'],
  });
  const links = ['https://s.test/ok/', 'https://s.test/missing/', 'https://s.test/shop/?orderby=price', 'https://s.test/go/', 'https://s.test/wp-login.php', 'https://s.test/self/'];
  const out = await checkLinks(request, links, { baseUrl: base, audience: 'visitor', skip: new Set(['https://s.test/self/']), cache: new Map() });
  assert.deepEqual(out.linkCheck, { checked: 2, skipped: 3, budgetExhausted: false });
  assert.deepEqual(out.detections.map((d) => [d.id, d.evidence, d.match]), [['NET-BROKEN-LINK', 'https://s.test/missing/', '404']]);
  assert.deepEqual(request.calls.map((c) => c.url), ['https://s.test/ok/', 'https://s.test/missing/', 'https://s.test/go/']);
});

test('checkLinks reuses results across pages and stops when the time budget is spent', async () => {
  const cache = new Map();
  const request = fakeRequest({ 'https://s.test/ok/': [200] });
  await checkLinks(request, ['https://s.test/ok/', 'https://s.test/missing/'], { baseUrl: base, audience: 'visitor', cache });
  const again = await checkLinks(request, ['https://s.test/ok/', 'https://s.test/missing/'], { baseUrl: base, audience: 'visitor', cache });
  assert.equal(request.calls.length, 2);
  assert.deepEqual(again.linkCheck, { checked: 2, skipped: 0, budgetExhausted: false });
  assert.equal(again.detections.length, 1);

  let clock = 0;
  const slow = fakeRequest({});
  const origGet = slow.get;
  slow.get = async (url, options) => { clock += 40_000; return origGet(url, options); };
  const out = await checkLinks(slow, ['https://s.test/a/', 'https://s.test/b/', 'https://s.test/c/'], { baseUrl: base, audience: 'visitor', cache: new Map(), budgetMs: 60_000, now: () => clock });
  assert.deepEqual(out.linkCheck, { checked: 2, skipped: 1, budgetExhausted: true });
  assert.equal(slow.calls.length, 2);
  assert.ok(slow.calls[1].options.timeout <= 20_000);
});
