import { test, expect } from '@playwright/test';

test(
  'admin can open dashboard',
  {
    tag: ['@smoke', '@admin'],
    annotation: [{ type: 'testId', description: 'ADMIN-DASHBOARD-001' }],
  },
  async ({ page }) => {
    await page.goto('/wp-login.php');
    const user = process.env.QA_ADMIN_USER;
    const password = process.env.QA_ADMIN_PASSWORD;
    if (!user || !password) {
      await expect(page.locator('#loginform')).toBeVisible();
      return;
    }
    // Core element IDs are identical in every WordPress locale; field labels are not.
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(password);
    await page.locator('#wp-submit').click();
    await expect(page).toHaveURL(/\/wp-admin\//);
    await expect(page.locator('#wpadminbar')).toBeVisible();
  }
);
