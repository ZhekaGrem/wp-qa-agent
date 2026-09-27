import { checkUrl } from './safe-url.mjs';

// Follows an HTTP redirect chain one hop at a time, asking `allow` about
// every Location *before* requesting it. `hop(url)` must not follow redirects
// itself and resolves to { status, location }. `allow(url)` returns true or a
// refusal reason. The result names the last URL requested and its status, plus
// `refused`/`reason` when the chain was stopped before a hop.
export async function followRedirects(url, { hop, allow, maxHops = 5 }) {
  let current = url;
  for (let hops = 0; ; hops++) {
    const { status, location } = await hop(current);
    if (status < 300 || status >= 400 || !location) return { status, url: current };
    const next = new URL(location, current).href;
    if (hops >= maxHops) return { status, url: current, refused: next, reason: 'too-many-redirects' };
    const verdict = allow(next);
    if (verdict !== true) return { status, url: current, refused: next, reason: verdict };
    current = next;
  }
}

// Checks one internal link with GET, following redirects by hand so that no
// hop the URL filter refuses is ever requested. A refused hop is not a defect:
// the link simply stays unchecked.
export async function checkLink(request, link, { baseUrl, audience, timeout = 15_000 }) {
  const result = await followRedirects(link, {
    hop: async (url) => {
      const res = await request.get(url, { maxRedirects: 0, failOnStatusCode: false, timeout });
      return { status: res.status(), location: res.headers().location };
    },
    allow: (url) => {
      const check = checkUrl(url, { baseUrl, audience });
      return check.allowed ? true : check.reason;
    },
  });
  if (result.refused) return { checked: false, refused: result.refused, reason: result.reason };
  return { checked: true, status: result.status, url: result.url };
}

// Results per link URL, shared by every page this worker process scans.
const LINK_CACHE = new Map();

// Checks a page's internal links within a total time budget. Links with a
// query string (filters, sorting, tracking) and links the URL filter refuses
// are skipped, as are links left when the budget runs out; `skip` holds URLs
// to ignore entirely (the page itself). Returns NET-BROKEN-LINK detections and
// `linkCheck: { checked, skipped, budgetExhausted }` for the record.
export async function checkLinks(request, links, { baseUrl, audience, skip = new Set(), budgetMs = 60_000, cache = LINK_CACHE, now = Date.now, max = 50 }) {
  const deadline = now() + budgetMs;
  const linkCheck = { checked: 0, skipped: Math.max(0, links.length - max), budgetExhausted: false };
  const detections = [];
  for (const link of links.slice(0, max)) {
    if (skip.has(link)) continue;
    if (new URL(link).search || !checkUrl(link, { baseUrl, audience }).allowed) {
      linkCheck.skipped++;
      continue;
    }
    let result = cache.get(link);
    if (!result) {
      const remaining = deadline - now();
      if (remaining <= 0) {
        linkCheck.budgetExhausted = true;
        linkCheck.skipped++;
        continue;
      }
      result = await checkLink(request, link, { baseUrl, audience, timeout: Math.min(15_000, remaining) }).catch(() => ({ checked: false, reason: 'request-failed' }));
      if (result.reason !== 'request-failed') cache.set(link, result);
    }
    if (!result.checked) {
      linkCheck.skipped++;
      continue;
    }
    linkCheck.checked++;
    if (result.status >= 400) {
      detections.push({ id: 'NET-BROKEN-LINK', severity: 'medium', message: `Link returns HTTP ${result.status}`, selector: '', match: String(result.status), evidence: link });
    }
  }
  return { detections, linkCheck };
}
