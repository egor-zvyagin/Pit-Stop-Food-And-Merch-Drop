import { generateKeyPairSync } from 'crypto';
import { defineConfig, devices } from '@playwright/test';
import { E2E_VENDOR_PIN } from './e2e/testEnv';

/**
 * Pit Stop v3.0 Playwright E2E Configuration
 * Tests dual-persona trackside operations:
 * 1. Mobile Fan Flow (Albert Park spectator ordering & pass redemption)
 * 2. Tablet Kiosk Vendor Flow (1280x800 trackside concession management & offline sync)
 */
// The suite runs against the production build, which refuses to sign passes
// without a key, so the test server gets a throwaway one.
const e2eSigningKey = generateKeyPairSync('ed25519')
  .privateKey.export({ type: 'pkcs8', format: 'der' })
  .toString('base64');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    // Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of the
    // Playwright-managed browser.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
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
    // Production build, as deployed: `next dev` hides problems that only
    // appear after a build (static prerendering, the service worker).
    // scripts/verify.sh has already built, so it sets E2E_SKIP_BUILD.
    command: process.env.E2E_SKIP_BUILD ? 'npm run start' : 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
    // The app has no default PIN or signing key, so the test server is given
    // both. It runs on the in-memory store and never touches a real table.
    env: {
      VENDOR_ACCESS_PIN: E2E_VENDOR_PIN,
      ED25519_PRIVATE_KEY_BASE64: e2eSigningKey,
      USE_LOCAL_STORAGE: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
