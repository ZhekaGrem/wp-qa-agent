import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ensureSlash } from './safe-url.mjs';

// Logs in through wp-login.php using core element IDs (locale-independent)
// and saves the session. `manual` opens a visible browser for 2FA/captcha.
export async function ensureAdminSession({ baseUrl, user, password, statePath = '.auth/admin.json', manual = false }) {
  if (!manual && (!user || !password)) return { ok: false, reason: 'no-credentials' };
  const browser = await chromium.launch({ headless: !manual });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(new URL('wp-login.php', ensureSlash(baseUrl)).href);
    if (manual) {
      console.log('Log in in the opened browser window (5 minutes)…');
      await page.locator('#wpadminbar').waitFor({ timeout: 300_000 });
    } else {
      await page.locator('#user_login').fill(user);
      await page.locator('#user_pass').fill(password);
      await page.locator('#wp-submit').click();
      await page.waitForLoadState('load');
      if ((await page.locator('#wpadminbar').count()) === 0) {
        const rejected = (await page.locator('#login_error').count()) > 0;
        return { ok: false, reason: rejected ? 'login-rejected' : 'no-admin-bar-after-login' };
      }
    }
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    return { ok: true, statePath };
  } finally {
    await browser.close();
  }
}
