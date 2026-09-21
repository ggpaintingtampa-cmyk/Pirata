import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Read shared source directly so parallel package builds cannot invalidate tests.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@pirata/contracts': fileURLToPath(new URL('../../../../packages/contracts/src', import.meta.url)),
    '@pirata/domain': fileURLToPath(new URL('../../../../packages/domain/src', import.meta.url)),
  } },
  build: { outDir: 'tests/modules/tasks-time/artifacts/build', emptyOutDir: true, rolldownOptions: { input: fileURLToPath(new URL('./harness/index.html', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5182, strictPort: true, ...(process.env.PIRATA_TEST_HTTPS==='1'?{https:{key:readFileSync(new URL('../../../../backups/testing-runtime/localhost-key.pem',import.meta.url)),cert:readFileSync(new URL('../../../../backups/testing-runtime/localhost-cert.pem',import.meta.url))}}:{}), proxy: { '/api': { target: 'http://127.0.0.1:' + (process.env.PIRATA_GROUP_A_API_PORT || 3003), changeOrigin: false } } },
});
