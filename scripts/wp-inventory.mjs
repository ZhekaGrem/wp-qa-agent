import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { loadEnvFile } from '../lib/env.mjs';
import { checkUrl, ensureSlash } from '../lib/safe-url.mjs';
import { ensureAdminSession } from '../lib/wp-session.mjs';
import { guardReadOnly } from '../lib/read-only-route.mjs';
import { parseSiteHealthCopy, parseSitemapLocs, parseHreflang, parseHtmlLang, accessVerdict } from '../lib/inventory-parsers.mjs';
import { followRedirects } from '../lib/link-check.mjs';

async function fetchRest(api, route, limit, type) {
  const items = [];
  for (let page = 1; items.length < limit; page++) {
    const res = await api.get(route, { params: { per_page: Math.min(100, limit - items.length), page, _fields: 'link,title,modified' } }).catch(() => null);
    if (!res || !res.ok()) return { ok: page > 1, items };
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return { ok: page > 1, items };
    items.push(...data.map((d) => ({ url: d.link, title: d.title?.rendered ?? '', type })));
    const totalPages = Number(res.headers()['x-wp-totalpages'] || 1);
    if (page >= totalPages || data.length === 0) break;
  }
  return { ok: true, items };
}

async function listContent(api, base, maxPosts) {
  const pages = await fetchRest(api, 'wp-json/wp/v2/pages', 500, 'page');
  if (pages.ok) {
    const items = [...pages.items];
    for (const [route, type] of [['wp-json/wp/v2/posts', 'post'], ['wp-json/wp/v2/product', 'product']]) {
      const more = await fetchRest(api, route, maxPosts, type);
      if (more.ok) items.push(...more.items);
    }
    return { source: 'rest', items };
  }
  const index = await api.get('wp-sitemap.xml').catch(() => null);
  if (index && index.ok()) {
    const items = [];
    for (const sub of parseSitemapLocs(await index.text()).slice(0, 20)) {
      if (!checkUrl(sub, { baseUrl: base }).allowed) continue;
      const res = await api.get(sub).catch(() => null);
      if (!res || !res.ok()) continue;
      for (const loc of parseSitemapLocs(await res.text())) items.push({ url: loc, title: '', type: /-page-/.test(sub) ? 'page' : 'other' });
    }
    return { source: 'sitemap', items: items.slice(0, 500) };
  }
  return { source: 'none', items: [] };
}

async function readSiteHealth(base, statePath) {
  const url = new URL('wp-admin/site-health.php?tab=debug', base).href;
  if (!checkUrl(url, { baseUrl: base, audience: 'admin' }).allowed) return {};
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();
    await guardReadOnly(page, {
      origin: new URL(base).origin,
      allowNavigation: (u) => checkUrl(u, { baseUrl: base, audience: 'admin' }).allowed,
    });
    await page.goto(url, { timeout: 60_000 });
    const copy = await page.locator('[data-clipboard-text]').first().getAttribute('data-clipboard-text', { timeout: 15_000 }).catch(() => null);
    return copy ? parseSiteHealthCopy(copy) : {};
  } finally {
    await browser.close();
  }
}

export async function buildInventory({ baseUrl, user, password, statePath = '.auth/admin.json', maxPosts = 50, manualLogin = false }) {
  const base = ensureSlash(baseUrl);
  const api = await playwrightRequest.newContext({ baseURL: base });
  try {
    // The home page, redirects followed by hand: a hop to another origin is
    // not requested, it only tells us QA_BASE_URL points at the wrong host.
    let home = null;
    let finalUrl = null;
    let redirectsTo = null;
    try {
      const chain = await followRedirects(base, {
        hop: async (url) => {
          home = await api.get(url, { maxRedirects: 0, failOnStatusCode: false });
          return { status: home.status(), location: home.headers().location };
        },
        allow: (url) => {
          const check = checkUrl(url, { baseUrl: base });
          return check.allowed ? true : check.reason;
        },
      });
      finalUrl = chain.url;
      if (chain.refused && chain.reason === 'external') {
        redirectsTo = new URL(chain.refused).origin;
        finalUrl = chain.refused;
      }
    } catch {
      home = null;
    }
    const homeStatus = home ? home.status() : 0;
    const homeHtml = home ? await home.text().catch(() => '') : '';
    const credentialsProvided = manualLogin || Boolean(user && password);
    const siteUnreachable = homeStatus === 0 || homeStatus >= 500;
    const login = !credentialsProvided
      ? { ok: false, reason: 'no-credentials' }
      : siteUnreachable
        ? { ok: false, reason: 'site-unreachable' }
        : redirectsTo
          ? { ok: false, reason: 'base-url-redirects' }
          : await ensureAdminSession({ baseUrl: base, user, password, statePath, manual: manualLogin });
    const site = login.ok ? await readSiteHealth(base, statePath) : {};
    return {
      generatedAt: new Date().toISOString(),
      baseUrl: base,
      access: {
        verdict: accessVerdict({ homeStatus, login, credentialsProvided, redirectsTo }),
        reason: redirectsTo ? 'base-url-redirects' : null,
        redirectsTo,
        mode: 'read-only',
        homeStatus,
        finalUrl,
        login: { ok: login.ok, reason: login.reason ?? null },
      },
      site: {
        wpVersion: site.wpVersion ?? null,
        environmentType: site.environmentType ?? 'unknown',
        homeUrl: site.homeUrl ?? null,
        siteUrl: site.siteUrl ?? null,
        siteLanguage: site.siteLanguage ?? null,
        plugins: site.plugins ?? [],
      },
      languages: { htmlLang: parseHtmlLang(homeHtml), alternates: parseHreflang(homeHtml) },
      content: redirectsTo ? { source: 'none', items: [] } : await listContent(api, base, maxPosts),
    };
  } finally {
    await api.dispose();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  loadEnvFile(option('--env') || '.env.qa');
  const baseUrl = process.env.QA_BASE_URL;
  if (!baseUrl) {
    console.error('QA_BASE_URL is not set. Copy config/wordpress-qa.example.env to .env.qa and fill it in.');
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = option('--out') || path.join(process.env.QA_RUNS_DIR || path.join('qa', 'runs'), `${stamp}-inventory`, 'inventory.json');
  const inventory = await buildInventory({
    baseUrl,
    user: process.env.QA_ADMIN_USER,
    password: process.env.QA_ADMIN_PASSWORD,
    statePath: '.auth/admin.json',
    manualLogin: args.includes('--login-manual'),
    maxPosts: Number(process.env.QA_INVENTORY_MAX_POSTS || 50),
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
  const { access, site, content } = inventory;
  console.log(`Access: ${access.verdict} (home HTTP ${access.homeStatus}; login ${access.login.ok ? 'ok' : access.login.reason})`);
  if (access.redirectsTo) console.log(`Base URL redirects to ${access.redirectsTo}: set QA_BASE_URL to it and run again.`);
  console.log(`Environment: ${site.environmentType}; WordPress ${site.wpVersion ?? 'unknown'}; ${site.plugins.length} active plugins`);
  console.log(`Content: ${content.items.length} URLs via ${content.source}`);
  console.log(`Written: ${out}`);
  process.exit(access.verdict === 'FAIL' ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
