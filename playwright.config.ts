import { defineConfig, devices } from '@playwright/test';
import { loadEnvFile } from './lib/env.mjs';

loadEnvFile('.env.qa');

const baseURL = process.env.QA_BASE_URL || 'http://localhost:9400';
// Folders under tests/ that are not site E2E specs.
const NOT_E2E = ['**/unit/**', '**/integration/**', '**/support/**', '**/fixtures/**', '**/visual/**', '**/detectors/**'];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'qa/latest-playwright-results.json' }],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium-desktop', testIgnore: NOT_E2E, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', testIgnore: NOT_E2E, use: { ...devices['Pixel 5'] } },
  ],
});
