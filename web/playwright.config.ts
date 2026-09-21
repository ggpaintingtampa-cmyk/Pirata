import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', timezoneId: 'America/New_York', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    ...(process.env.PLAYWRIGHT_WEBKIT === '1' ? [{ name: 'webkit-phone', use: { ...devices['iPhone 13'] } }] : []),
  ],
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
