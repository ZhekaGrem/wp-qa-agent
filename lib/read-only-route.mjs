import { followRedirects } from './link-check.mjs';

// Installs a Playwright route guard that keeps a page read-only.
//
// Writes: every non-GET/HEAD request the page sends is aborted, whatever its
// origin. Same-origin writes are WordPress actions (Heartbeat, cart
// fragments, form posts); cross-origin writes are analytics/collector side
// effects; and after a canonical host or scheme redirect (apex -> www,
// http -> https) the "site" is on a different origin than the one configured,
// so an origin test alone would wave every write through. Two exceptions:
//   - `loginPath`: the one login form POST (to that exact path on the site
//     origin), when the caller logs in;
//   - `allowSameOriginWrites`: while a human drives a manual login (2FA,
//     captcha) the page may post to the site origin as needed.
//
// Navigation: when `allowNavigation` is given, any frame's navigation (the
// top-level document, a page script, a nested iframe) to a same-origin URL it
// refuses is stopped. Redirects are checked hop by hop: Playwright never calls
// the route handler for a redirect's target, so the handler fetches the chain
// itself without following redirects, asks `allowNavigation` about every
// Location before requesting it, and only then lets the browser load the
// verified final URL. A refused navigation or hop is answered with an empty
// 204 response rather than aborted: aborting a top-level navigation request
// makes Chromium commit the frame to its own chrome-error://chromewebdata/
// document, replacing the page being scanned with a blank one; a 204 No
// Content response means "stay on the current document". `onBlocked(entry,
// info)` receives `NAVIGATE <url>` and, for a refused redirect hop,
// `{ redirectFrom, to, mainFrame }`.
function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

const trimSlash = (p) => p.replace(/\/+$/, '');

function abortCode(error) {
  const message = String(error?.message ?? error);
  if (/ECONNREFUSED/.test(message)) return 'connectionrefused';
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'namenotresolved';
  if (/timed? ?out|ETIMEDOUT/i.test(message)) return 'timedout';
  return 'failed';
}

export async function guardReadOnly(page, { origin, loginPath = null, allowSameOriginWrites = false, allowNavigation = null, onBlocked = () => {} }) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const isSameOrigin = sameOrigin(url, origin);
    if (method !== 'GET' && method !== 'HEAD') {
      if (isSameOrigin && allowSameOriginWrites) return route.continue();
      if (isSameOrigin && loginPath && method === 'POST' && trimSlash(new URL(url).pathname) === trimSlash(loginPath)) return route.continue();
      onBlocked(`${method} ${url}`);
      return route.abort();
    }
    if (!allowNavigation || !isSameOrigin || !request.isNavigationRequest()) return route.continue();

    if (!allowNavigation(url)) {
      onBlocked(`NAVIGATE ${url}`);
      return route.fulfill({ status: 204, body: '' });
    }
    const mainFrame = request.frame() === page.mainFrame();
    let last;
    let chain;
    try {
      chain = await followRedirects(url, {
        hop: async (hopUrl) => {
          last = await route.fetch({ url: hopUrl, maxRedirects: 0 });
          return { status: last.status(), location: last.headers().location };
        },
        allow: (next) => (allowNavigation(next) ? true : 'refused'),
      });
    } catch (error) {
      return route.abort(abortCode(error));
    }
    if (chain.refused) {
      onBlocked(`NAVIGATE ${chain.refused}`, { redirectFrom: url, to: chain.refused, mainFrame });
      return route.fulfill({ status: 204, body: '' });
    }
    if (chain.url === url) return route.fulfill({ response: last });
    // The chain ended on another allowed URL. Hand the browser a single,
    // already verified redirect so the document gets its real address
    // (relative links, page.url()); the browser then loads that URL itself.
    return route.fulfill({ status: 302, headers: { location: chain.url }, body: '' });
  });
}
