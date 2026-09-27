import { checkUrl, ensureSlash } from './safe-url.mjs';

export const DEFAULT_VIEWPORTS = [360, 768, 1366, 1920];
const HEIGHTS = { 360: 740, 768: 1024, 1366: 768, 1920: 1080 };
const MODES = ['scan', 'baseline', 'compare'];

export function viewportSize(width) {
  return { width, height: HEIGHTS[width] ?? Math.round(width * 0.625) };
}

export function pageSlug(url) {
  const u = new URL(url);
  const raw = `${u.pathname}${u.search ? `-${u.search.slice(1)}` : ''}`.toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'home';
}

export function newRunId(slug) {
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${slug}`;
}

export function normalizePlan(input, { baseUrl }) {
  const errors = [];
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
  const used = new Map();
  for (const entry of input.pages ?? []) {
    const raw = typeof entry === 'string' ? entry : entry.url;
    const check = checkUrl(raw, { baseUrl: base, audience });
    if (!check.allowed) {
      errors.push(`page ${raw} refused: ${check.reason}`);
      continue;
    }
    const url = new URL(raw, base).href;
    let slug = pageSlug(url);
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (n) slug = `${slug}-${n + 1}`;
    pages.push({ url, label: (typeof entry === 'object' && entry.label) || new URL(url).pathname, slug });
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
