import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeWp } from '../support/fake-wp.mjs';
import { buildInventory } from '../../scripts/wp-inventory.mjs';

const tmpState = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-auth-')), 'admin.json');
const noMutatingRequests = (hits) => hits.every((h) => !/_wpnonce|add-to-cart|logout/.test(h) && (!h.startsWith('POST') || h === 'POST /wp-login.php'));

test('logs in, reads Site Health and lists pages from REST', async (t) => {
  const wp = createFakeWp({ locale: 'uk', environmentType: 'staging' });
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, user: 'qa-admin', password: 'secret', statePath: tmpState() });
  assert.equal(inv.access.verdict, 'PASS');
  assert.equal(inv.access.mode, 'read-only');
  assert.equal(inv.site.environmentType, 'staging');
  assert.equal(inv.site.wpVersion, '6.8.1');
  assert.deepEqual(inv.site.plugins.map((p) => p.name), ['WooCommerce', 'Contact Form 7']);
  assert.equal(inv.languages.htmlLang, 'uk');
  assert.equal(inv.content.source, 'rest');
  assert.ok(inv.content.items.some((i) => i.url === `${url}/clean/`));
  assert.ok(noMutatingRequests(wp.hits), wp.hits.join('\n'));
});

test('falls back to the sitemap when REST is disabled', async (t) => {
  const wp = createFakeWp({ restEnabled: false });
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, statePath: tmpState() });
  assert.equal(inv.content.source, 'sitemap');
  assert.ok(inv.content.items.some((i) => i.url === `${url}/clean/`));
  assert.equal(inv.access.verdict, 'REVIEW');
});

test('a wrong password is FAIL with login-rejected, not a site defect', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, user: 'qa-admin', password: 'wrong', statePath: tmpState() });
  assert.equal(inv.access.verdict, 'FAIL');
  assert.deepEqual(inv.access.login, { ok: false, reason: 'login-rejected' });
});
