import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiteHealthCopy, parseSitemapLocs, parseHreflang, parseHtmlLang, accessVerdict } from '../../lib/inventory-parsers.mjs';

test('parseSiteHealthCopy reads core fields and active plugins, including names with colons', () => {
  const text = [
    '### wp-core ###', '',
    'version: 6.4.2', 'site_language: en_US', 'home_url: https://site.test', 'site_url: https://site.test/wp', 'environment_type: production', '',
    '### wp-plugins-active (2) ###', '',
    'Akismet Anti-spam: Spam Protection: version: 5.3, author: Automattic - Anti-spam Team, Auto-updates disabled',
    'WooCommerce: version: 9.9.0, author: Automattic, Auto-updates enabled', '',
    '### wp-plugins-inactive (1) ###', '',
    'Hello Dolly: version: 1.7.2, author: Matt Mullenweg, Auto-updates disabled',
  ].join('\n');
  assert.deepEqual(parseSiteHealthCopy(text), {
    wpVersion: '6.4.2', environmentType: 'production', homeUrl: 'https://site.test', siteUrl: 'https://site.test/wp', siteLanguage: 'en_US',
    plugins: [{ name: 'Akismet Anti-spam: Spam Protection', version: '5.3' }, { name: 'WooCommerce', version: '9.9.0' }],
  });
});

test('parseSitemapLocs decodes XML entities', () => {
  assert.deepEqual(parseSitemapLocs('<urlset><url><loc> https://s.test/?p=1&amp;lang=uk </loc></url><url><loc>https://s.test/a/</loc></url></urlset>'),
    ['https://s.test/?p=1&lang=uk', 'https://s.test/a/']);
});

test('parseHreflang and parseHtmlLang read language markers', () => {
  const html = '<html class="x" lang="uk-UA"><head><link rel="alternate" hreflang="en" href="https://s.test/en/"><link rel="stylesheet" href="a.css"></head>';
  assert.deepEqual(parseHreflang(html), [{ lang: 'en', url: 'https://s.test/en/' }]);
  assert.equal(parseHtmlLang(html), 'uk-UA');
  assert.equal(parseHtmlLang('<html><body></body></html>'), '');
});

test('accessVerdict', () => {
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: true }, credentialsProvided: true }), 'PASS');
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: false }, credentialsProvided: false }), 'REVIEW');
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: false }, credentialsProvided: true }), 'FAIL');
  assert.equal(accessVerdict({ homeStatus: 503, login: { ok: true }, credentialsProvided: true }), 'FAIL');
  assert.equal(accessVerdict({ homeStatus: 0, login: { ok: false }, credentialsProvided: false }), 'FAIL');
  assert.equal(accessVerdict({ homeStatus: 301, login: { ok: false, reason: 'base-url-redirects' }, credentialsProvided: true, redirectsTo: 'https://www.s.test' }), 'REVIEW');
});
