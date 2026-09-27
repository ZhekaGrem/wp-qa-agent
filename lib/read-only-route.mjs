// Installs a Playwright route guard that aborts any same-origin, non-GET
// request a page's own scripts try to send (e.g. the Heartbeat API POSTing
// to admin-ajax.php). The single allowed exception is the wp-login.php form
// POST, when explicitly opted in by the caller. Cross-origin and GET/HEAD
// requests are left untouched.
export async function guardReadOnly(page, { origin, allowLoginPost = false, onBlocked = () => {} }) {
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    if (!url.startsWith(origin) || method === 'GET' || method === 'HEAD') return route.continue();
    if (allowLoginPost && method === 'POST' && new URL(url).pathname.endsWith('/wp-login.php')) return route.continue();
    onBlocked(`${method} ${url}`);
    return route.abort();
  });
}
