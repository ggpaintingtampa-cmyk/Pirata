import { defineConfig } from '@playwright/test';
import team from '../team/playwright.config';

export default defineConfig({
  ...team,
  // Separate disposable server per suite keeps real sign-in rate limits intact.
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './results',
});
