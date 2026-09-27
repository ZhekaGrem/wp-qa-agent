// Installs a Playwright route guard that aborts any same-origin, non-GET
// request a page's own scripts try to send (e.g. the Heartbeat API POSTing
// to admin-ajax.php). The single allowed exception is the wp-login.php form
// POST, when explicitly opted in by the caller. Cross-origin and GET/HEAD
// requests are left untouched.
//
// Optionally also guards navigation: when `allowNavigation` is given, any
// frame's navigation (top-level page script or a nested iframe) to a
// same-origin URL it refuses is stopped too, so a page can never carry the
// scanner somewhere the URL filter would have refused as an entry point. A
// refused navigation is answered with an empty 204 response rather than
// aborted: aborting a top-level navigation request makes Chromium commit the
// frame to its own chrome-error://chromewebdata/ document, replacing the
// page being scanned with a blank one; a 204 No Content response means "stay
// on the current document", so the scanned page survives untouched.
function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

export async function guardReadOnly(page, { origin, allowLoginPost = false, allowNavigation = () => true, onBlocked = () => {} }) {
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const isSameOrigin = sameOrigin(url, origin);
    if (isSameOrigin && method !== 'GET' && method !== 'HEAD') {
      if (allowLoginPost && method === 'POST' && new URL(url).pathname.endsWith('/wp-login.php')) return route.continue();
      onBlocked(`${method} ${url}`);
      return route.abort();
    }
    if (isSameOrigin && request.isNavigationRequest() && !allowNavigation(url)) {
      onBlocked(`NAVIGATE ${url}`);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
}
