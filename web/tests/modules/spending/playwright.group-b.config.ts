import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '..', testMatch: ['spending/*.spec.ts', 'inventory/*.spec.ts'], fullyParallel: false, workers: 1,
  outputDir: './artifacts/results', reporter: [['list'], ['html', { outputFolder: 'tests/modules/spending/artifacts/report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5183', timezoneId: 'America/New_York', trace: 'retain-on-failure' },
  projects: [{ name: 'group-b-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }],
  webServer: [
    { command: 'pnpm --filter @pirata/server exec tsx --tsconfig tests/modules/spending/tsconfig.harness.json tests/modules/spending/harness.ts', url: 'http://127.0.0.1:3004/api/v1/health', reuseExistingServer: false, cwd: '../../../..' },
    { command: 'pnpm exec vite --config tests/modules/spending/vite.group-b.config.ts', url: 'http://127.0.0.1:5183/tests/modules/spending/harness.html', reuseExistingServer: false, cwd: '../../..' },
  ],
});
