import { test, expect } from '@playwright/test';

test(
  'admin can open dashboard',
  {
    tag: ['@smoke', '@admin'],
    annotation: [
      {
        type: 'testId',
        description: 'ADMIN-DASHBOARD-001',
      },
    ],
  },
  async ({ page }) => {
    const adminUrl = process.env.QA_BASE_URL
      ? `${process.env.QA_BASE_URL.replace(/\/$/, '')}/wp-login.php`
      : 'http://localhost:9400/wp-login.php';

    await page.goto(adminUrl);

    // Fill credentials if provided in env
    if (process.env.QA_ADMIN_USER && process.env.QA_ADMIN_PASSWORD) {
      await page.getByLabel(/Username or Email Address/i).fill(process.env.QA_ADMIN_USER);
      await page.getByLabel(/Password/i).fill(process.env.QA_ADMIN_PASSWORD);
      await page.getByRole('button', { name: /Log In/i }).click();

      await expect(page).toHaveURL(/wp-admin/);
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    } else {
      // Basic accessibility/health check when credentials are not configured
      await expect(page).toHaveTitle(/Log In|WordPress/i);
    }
  }
);
