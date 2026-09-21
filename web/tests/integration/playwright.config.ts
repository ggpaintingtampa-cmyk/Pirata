import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',fullyParallel:false,workers:1,timeout:60000,outputDir:'./results',reporter:[['list']],use:{baseURL:'http://127.0.0.1:5174',timezoneId:'America/New_York',trace:'retain-on-failure'},projects:[{name:'integrated-chromium',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}}],webServer:[
 {cwd:fileURLToPath(new URL('../../..',import.meta.url)),command:'pnpm --filter @pirata/server harness',url:'http://127.0.0.1:3002/api/v1/health',reuseExistingServer:false},
 {cwd:fileURLToPath(new URL('../..',import.meta.url)),command:'pnpm exec vite --config vite.harness.config.ts',url:'http://127.0.0.1:5174',reuseExistingServer:false}
]});
