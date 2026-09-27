// Decides whether the scanner may request a URL. The goal is a read-only
// guarantee: WordPress and WooCommerce perform state changes on plain GET
// links that carry a nonce or an action, so those are refused outright.

const DENY_PARAMS = new Set([
  '_wpnonce', 'action', 'add-to-cart', 'remove_item', 'undo_item', 'wc-ajax',
  'replytocom', 'customize_changeset_uuid', 'doing_wp_cron', 'preview_nonce',
]);

const DENY_PATHS = [
  /^\/wp-login\.php/i,
  /^\/xmlrpc\.php/i,
  /^\/wp-cron\.php/i,
  /^\/wp-comments-post\.php/i,
  /^\/wp-admin\/admin-(ajax|post)\.php/i,
];

const ADMIN_READ_PAGES = new Set(['index.php', 'edit.php', 'plugins.php', 'site-health.php', 'nav-menus.php']);

const deny = (reason) => ({ allowed: false, reason });

export function ensureSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

export function checkUrl(input, { baseUrl, audience = 'visitor' }) {
  let url;
  let base;
  try {
    base = new URL(ensureSlash(baseUrl));
    url = new URL(input, base);
  } catch {
    return deny('invalid-url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return deny('non-http');
  if (url.origin !== base.origin) return deny('external');

  const basePath = base.pathname.replace(/\/$/, '');
  if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return deny('outside-site');
  const rel = url.pathname.slice(basePath.length) || '/';

  for (const [key, value] of url.searchParams) {
    if (DENY_PARAMS.has(key.toLowerCase())) return deny(`mutating-param:${key}`);
    if (/logout/i.test(value)) return deny('logout');
  }
  if (/logout/i.test(rel)) return deny('logout');
  if (DENY_PATHS.some((re) => re.test(rel))) return deny('mutating-endpoint');

  if (/^\/wp-admin(\/|$)/i.test(rel)) {
    if (audience !== 'admin') return deny('admin-requires-admin-audience');
    const page = rel.replace(/^\/wp-admin\/?/i, '') || 'index.php';
    if (!ADMIN_READ_PAGES.has(page.toLowerCase())) return deny('admin-page-not-allowlisted');
  }
  return { allowed: true, reason: 'ok' };
}
