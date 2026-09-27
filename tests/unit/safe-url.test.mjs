import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, ensureSlash } from '../../lib/safe-url.mjs';

const base = 'https://site.test/';
const cases = [
  // [url, audience, allowed, reason]
  ['/', 'visitor', true, 'ok'],
  ['/contacts/', 'visitor', true, 'ok'],
  ['about/', 'visitor', true, 'ok'],
  ['https://site.test/shop/?orderby=price', 'visitor', true, 'ok'],
  ['https://other.test/', 'visitor', false, 'external'],
  ['mailto:hi@site.test', 'visitor', false, 'non-http'],
  ['/?add-to-cart=12', 'visitor', false, 'mutating-param:add-to-cart'],
  ['/cart/?remove_item=abc&_wpnonce=x', 'visitor', false, 'mutating-param:remove_item'],
  ['/wp-login.php?action=logout&_wpnonce=abc', 'visitor', false, 'mutating-param:action'],
  ['/?replytocom=5', 'visitor', false, 'mutating-param:replytocom'],
  ['/my-account/customer-logout/', 'visitor', false, 'logout'],
  ['/wp-login.php', 'visitor', false, 'mutating-endpoint'],
  ['/xmlrpc.php', 'visitor', false, 'mutating-endpoint'],
  ['/wp-admin/admin-ajax.php', 'admin', false, 'mutating-endpoint'],
  ['/wp-admin/', 'visitor', false, 'admin-requires-admin-audience'],
  ['/wp-admin/', 'admin', true, 'ok'],
  ['/wp-admin/plugins.php', 'admin', true, 'ok'],
  ['/wp-admin/site-health.php?tab=debug', 'admin', true, 'ok'],
  ['/wp-admin/plugins.php?action=deactivate&plugin=x&_wpnonce=y', 'admin', false, 'mutating-param:action'],
  ['/wp-admin/post.php?post=1&action=trash&_wpnonce=abc', 'admin', false, 'mutating-param:action'],
  ['/wp-admin/options.php', 'admin', false, 'admin-page-not-allowlisted'],
];

for (const [url, audience, allowed, reason] of cases) {
  test(`${audience} ${url} -> ${allowed ? 'allowed' : reason}`, () => {
    assert.deepEqual(checkUrl(url, { baseUrl: base, audience }), { allowed, reason });
  });
}

test('sub-directory installs: only paths under the base path are allowed', () => {
  const sub = 'https://site.test/blog/';
  assert.deepEqual(checkUrl('/blog/wp-admin/index.php', { baseUrl: sub, audience: 'admin' }), { allowed: true, reason: 'ok' });
  assert.deepEqual(checkUrl('/other/', { baseUrl: sub }), { allowed: false, reason: 'outside-site' });
});

test('ensureSlash adds exactly one trailing slash', () => {
  assert.equal(ensureSlash('https://site.test'), 'https://site.test/');
  assert.equal(ensureSlash('https://site.test/'), 'https://site.test/');
});
