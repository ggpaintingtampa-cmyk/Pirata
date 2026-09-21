import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// Resolve current canonical source without rebuilding shared packages during parallel browser runs.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@pirata/contracts': fileURLToPath(new URL('../../../../packages/contracts/src', import.meta.url)), '@pirata/domain': fileURLToPath(new URL('../../../../packages/domain/src', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('./artifacts/build', import.meta.url)), emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL('./harness.html', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5183, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3004', changeOrigin: false } } },
});
