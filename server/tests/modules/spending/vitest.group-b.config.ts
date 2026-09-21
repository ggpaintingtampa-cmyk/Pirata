import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// Test canonical source while the coordinator updates shared compiled packages.
export default defineConfig({
  resolve: { alias: { '@pirata/contracts': fileURLToPath(new URL('../../../../packages/contracts/src', import.meta.url)), '@pirata/domain': fileURLToPath(new URL('../../../../packages/domain/src', import.meta.url)) } },
  test: { include: ['tests/modules/spending/*.test.ts', 'tests/modules/inventory/*.test.ts'] },
});
