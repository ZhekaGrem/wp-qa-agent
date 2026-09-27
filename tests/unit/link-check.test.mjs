import test from 'node:test';
import assert from 'node:assert/strict';
import { followRedirects, checkLink } from '../../lib/link-check.mjs';

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
