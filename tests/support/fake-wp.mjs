import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/pages/', import.meta.url));
const SESSION_COOKIE = 'wordpress_logged_in_fakewp=qa';

const LABELS = {
  en: { user: 'Username or Email Address', pass: 'Password', show: 'Show password', submit: 'Log In', dashboard: 'Dashboard', error: 'Error: The password you entered is incorrect.' },
  uk: { user: "Ім'я користувача або адреса e-mail", pass: 'Пароль', show: 'Показати пароль', submit: 'Увійти', dashboard: 'Майстерня', error: 'Помилка: неправильний пароль.' },
};

export function fixtureNames() {
  return fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Solid grey RGB PNG of a known size, so image probes can compare natural and rendered ratios.
export function makePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type RGB
  const row = Buffer.alloc(1 + width * 3, 0x88);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function loginPage(locale, failed) {
  const t = LABELS[locale];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${t.submit}</title></head><body class="login">
${failed ? `<div id="login_error">${t.error}</div>` : ''}
<form name="loginform" id="loginform" action="/wp-login.php" method="post">
<p><label for="user_login">${t.user}</label><input type="text" name="log" id="user_login"></p>
<div class="user-pass-wrap"><label for="user_pass">${t.pass}</label>
<div class="wp-pwd"><input type="password" name="pwd" id="user_pass">
<button type="button" class="button wp-hide-pw" aria-label="${t.show}"><span class="dashicons dashicons-visibility" aria-hidden="true"></span></button></div></div>
<p class="submit"><input type="submit" name="wp-submit" id="wp-submit" value="${t.submit}"></p>
</form></body></html>`;
}

function adminPage(locale, body) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>Admin</title></head><body class="wp-admin">
<div id="wpadminbar"><a href="/wp-login.php?action=logout&amp;_wpnonce=abc">Log out</a></div>
<div id="wpbody">${body}</div></body></html>`;
}

function siteHealthBody(origin, environmentType) {
  const copy = [
    '### wp-core ###', '',
    'version: 6.8.1', 'site_language: uk', `home_url: ${origin}`, `site_url: ${origin}`, `environment_type: ${environmentType}`, '',
    '### wp-plugins-active (2) ###', '',
    'WooCommerce: version: 9.9.0, author: Automattic, Auto-updates disabled',
    'Contact Form 7: version: 6.0.6, author: Takayuki Miyoshi, Auto-updates disabled',
  ].join('\n');
  return `<h1>Site Health</h1><div class="site-health-copy-buttons"><button type="button" class="button copy-button" data-clipboard-text="${escapeHtml(copy)}">Copy site info to clipboard</button></div>`;
}

function pagesJson(origin) {
  return [
    { link: `${origin}/`, title: { rendered: 'Головна' }, modified: '2026-09-01T10:00:00' },
    ...fixtureNames().map((name) => ({ link: `${origin}/${name}/`, title: { rendered: name }, modified: '2026-09-01T10:00:00' })),
  ];
}

function homePage(origin) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Fake WP</title>
<link rel="alternate" hreflang="uk" href="${origin}/"><link rel="alternate" hreflang="en" href="${origin}/en/">
</head><body><main><h1>Головна</h1><ul>${fixtureNames().map((n) => `<li><a href="/${n}/">${n}</a></li>`).join('')}</ul></main></body></html>`;
}

const NOT_FOUND = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><p>Page not found</p></body></html>';

export function createFakeWp({ user = 'qa-admin', password = 'secret', locale = 'en', restEnabled = true, environmentType = 'staging' } = {}) {
  const hits = [];
  let variant = 'a';
  let origin = '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake.local');
    const p = url.pathname;
    hits.push(`${req.method} ${p}${url.search}`);
    const loggedIn = (req.headers.cookie || '').includes(SESSION_COOKIE);
    const send = (status, body, type = 'text/html; charset=utf-8', headers = {}) => {
      res.writeHead(status, { 'content-type': type, ...headers });
      res.end(body);
    };

    if (p === '/wp-login.php' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (form.get('log') === user && form.get('pwd') === password) {
        return send(302, '', 'text/plain', { location: '/wp-admin/', 'set-cookie': `${SESSION_COOKIE}; Path=/; HttpOnly` });
      }
      return send(200, loginPage(locale, true));
    }
    if (p === '/wp-login.php') return send(200, loginPage(locale, false));
    if (p.startsWith('/wp-admin')) {
      if (!loggedIn) return send(302, '', 'text/plain', { location: '/wp-login.php' });
      if (p === '/wp-admin/site-health.php') return send(200, adminPage(locale, siteHealthBody(origin, environmentType)));
      return send(200, adminPage(locale, `<h1>${LABELS[locale].dashboard}</h1>`));
    }
    if (p.startsWith('/wp-json/')) {
      if (!restEnabled) return send(401, JSON.stringify({ code: 'rest_login_required' }), 'application/json');
      if (p === '/wp-json/wp/v2/pages') {
        const items = pagesJson(origin);
        return send(200, JSON.stringify(items), 'application/json', { 'x-wp-totalpages': '1', 'x-wp-total': String(items.length) });
      }
      if (p === '/wp-json/wp/v2/posts') return send(200, '[]', 'application/json', { 'x-wp-totalpages': '1', 'x-wp-total': '0' });
      return send(404, JSON.stringify({ code: 'rest_no_route' }), 'application/json');
    }
    if (p === '/wp-sitemap.xml') {
      return send(200, `<?xml version="1.0"?><sitemapindex><sitemap><loc>${origin}/wp-sitemap-posts-page-1.xml</loc></sitemap></sitemapindex>`, 'application/xml');
    }
    if (p === '/wp-sitemap-posts-page-1.xml') {
      return send(200, `<?xml version="1.0"?><urlset>${pagesJson(origin).map((i) => `<url><loc>${i.link}</loc></url>`).join('')}</urlset>`, 'application/xml');
    }
    if (p === '/img/200x100.png') return send(200, makePng(200, 100), 'image/png');
    if (p === '/favicon.ico') return send(200, makePng(16, 16), 'image/png');
    if (p === '/server-error/') {
      return send(500, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body><p>Internal Server Error</p></body></html>');
    }
    if (p === '/') return send(200, homePage(origin));

    const name = p.replace(/^\/|\/$/g, '');
    if (/^[a-z0-9-]+$/.test(name) && fs.existsSync(`${FIXTURE_DIR}${name}.html`)) {
      let html = fs.readFileSync(`${FIXTURE_DIR}${name}.html`, 'utf8');
      if (variant === 'b' && name === 'clean') html = html.replace('</main>', '<p>Нова акція: безкоштовна доставка.</p></main>');
      return send(200, html);
    }
    return send(404, NOT_FOUND);
  });

  return {
    hits,
    get url() { return origin; },
    setVariant(value) { variant = value; },
    async start(port = 0) {
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
