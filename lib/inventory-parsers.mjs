function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// Site Health "Copy site info" text uses untranslated keys, so it reads the
// same on every locale.
export function parseSiteHealthCopy(text) {
  const info = { wpVersion: null, environmentType: null, homeUrl: null, siteUrl: null, siteLanguage: null, plugins: [] };
  const coreKeys = { version: 'wpVersion', environment_type: 'environmentType', home_url: 'homeUrl', site_url: 'siteUrl', site_language: 'siteLanguage' };
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^###\s*([\w-]+)/);
    if (header) {
      section = header[1];
      continue;
    }
    if (!line) continue;
    if (section === 'wp-core') {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv && coreKeys[kv[1]]) info[coreKeys[kv[1]]] = kv[2];
    } else if (section === 'wp-plugins-active') {
      const m = line.match(/^(.+?): version: ([^,]+)/);
      if (m) info.plugins.push({ name: m[1], version: m[2].trim() });
    }
  }
  return info;
}

export function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeXml(m[1]));
}

export function parseHreflang(html) {
  const out = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    const lang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (lang && href) out.push({ lang, url: decodeXml(href) });
  }
  return out;
}

export function parseHtmlLang(html) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? '';
}

export function accessVerdict({ homeStatus, login, credentialsProvided }) {
  if (!homeStatus || homeStatus >= 500) return 'FAIL';
  if (credentialsProvided && !login.ok) return 'FAIL';
  if (!credentialsProvided) return 'REVIEW';
  return 'PASS';
}
