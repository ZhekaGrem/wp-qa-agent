import { checkUrl, ensureSlash } from './safe-url.mjs';
import { shortHash } from './hash.mjs';

export const DEFAULT_VIEWPORTS = [360, 768, 1366, 1920];
const HEIGHTS = { 360: 740, 768: 1024, 1366: 768, 1920: 1080 };
const MODES = ['scan', 'baseline', 'compare'];

export function viewportSize(width) {
  return { width, height: HEIGHTS[width] ?? Math.round(width * 0.625) };
}

// A record/screenshot key for a page: a readable ASCII part of the decoded
// path and query (non-ASCII dropped, at most 60 characters) plus a hash of the
// full URL. The hash keeps apart pages whose readable parts collide
// (Cyrillic slugs, `/about` vs `/about/`) and does not depend on plan order.
export function pageSlug(url) {
  const u = new URL(url);
  const raw = `${u.pathname}${u.search ? `-${u.search.slice(1)}` : ''}`;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const readable = decoded.replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const fallback = u.pathname === '/' && !u.search ? 'home' : 'page';
  return `${readable || fallback}-${shortHash(u.href)}`;
}

export function newRunId(slug) {
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${slug}`;
}

export function normalizePlan(input, { baseUrl }) {
  const errors = [];
  // The run id becomes a directory name under the runs root.
  if (input.runId !== undefined && !(typeof input.runId === 'string' && /^[\w.-]+$/.test(input.runId) && !/^\.+$/.test(input.runId))) {
    errors.push('runId must match ^[\\w.-]+$ and not be only dots');
  }
  const mode = input.mode ?? 'scan';
  if (!MODES.includes(mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);
  const audience = input.audience ?? 'visitor';
  if (!['visitor', 'admin'].includes(audience)) errors.push('audience must be visitor or admin');
  const viewports = (input.viewports ?? DEFAULT_VIEWPORTS).map(Number);
  if (!viewports.length || viewports.some((w) => !Number.isInteger(w) || w < 280 || w > 3840)) {
    errors.push('viewports must be integers between 280 and 3840');
  }
  const base = ensureSlash(baseUrl);
  const pages = [];
  const seen = new Set();
  for (const entry of input.pages ?? []) {
    const raw = typeof entry === 'string' ? entry : entry.url;
    const check = checkUrl(raw, { baseUrl: base, audience });
    if (!check.allowed) {
      errors.push(`page ${raw} refused: ${check.reason}`);
      continue;
    }
    const url = new URL(raw, base).href;
    if (seen.has(url)) continue;
    seen.add(url);
    pages.push({ url, label: (typeof entry === 'object' && entry.label) || new URL(url).pathname, slug: pageSlug(url) });
  }
  if (!pages.length) errors.push('plan has no pages');
  return {
    ok: errors.length === 0,
    errors,
    plan: {
      runId: input.runId,
      request: input.request ?? '',
      mode,
      audience,
      viewports,
      pages,
      masks: (input.masks ?? []).filter((m) => typeof m === 'string'),
      checkLinks: input.checkLinks !== false,
      baseUrl: base,
      host: new URL(base).host.replace(/[^a-z0-9.-]/gi, '_'),
    },
  };
}
