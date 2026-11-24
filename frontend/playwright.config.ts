import { defineConfig, devices } from '@playwright/test';
import { E2E_VENDOR_PIN } from './e2e/testEnv';

/**
 * Pit Stop v3.0 Playwright E2E Configuration
 * Tests dual-persona trackside operations:
 * 1. Mobile Fan Flow (Albert Park spectator ordering & pass redemption)
 * 2. Tablet Kiosk Vendor Flow (1280x800 trackside concession management & offline sync)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 7'],
      },
    },
    {
      name: 'Desktop/Tablet Kiosk',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // The app has no default PIN, so the test server is given one explicitly.
    env: { VENDOR_ACCESS_PIN: E2E_VENDOR_PIN },
  },
});
