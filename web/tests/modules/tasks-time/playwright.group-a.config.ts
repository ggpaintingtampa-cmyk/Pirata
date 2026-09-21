import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
const testUrl=(process.env.PIRATA_TEST_HTTPS==='1'?'https':'http')+'://127.0.0.1:5182';
export default defineConfig({
  testDir: '..', testMatch: ['tasks-time/**/*.spec.ts', 'planning/**/*.spec.ts'], fullyParallel: false, workers: 1,
  outputDir: './artifacts/results', reporter: [['list']], timeout: 45000,
  use: { baseURL: testUrl, timezoneId: 'America/New_York', trace: 'retain-on-failure',ignoreHTTPSErrors:process.env.PIRATA_TEST_HTTPS==='1' },
  projects: [{ name: 'group-a-phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },...(process.env.PLAYWRIGHT_WEBKIT==='1'?[{name:'group-a-webkit',use:{...devices['iPhone 13'],launchOptions:{executablePath:process.env.PIRATA_WEBKIT_EXECUTABLE}}}]:[])],
  webServer: [
    { cwd: fileURLToPath(new URL('../../..', import.meta.url)), command: 'pnpm --filter @pirata/server exec tsx --tsconfig tests/modules/tasks-time/tsconfig.harness.json tests/modules/tasks-time/harness.ts', url: 'http://127.0.0.1:' + (process.env.PIRATA_GROUP_A_API_PORT || 3003) + '/api/v1/health', reuseExistingServer: false },
    { cwd: fileURLToPath(new URL('../../..', import.meta.url)), command: 'pnpm exec vite --config tests/modules/tasks-time/vite.group-a.config.ts', url: testUrl+'/tests/modules/tasks-time/harness/', reuseExistingServer: false,ignoreHTTPSErrors:process.env.PIRATA_TEST_HTTPS==='1' },
  ],
});
