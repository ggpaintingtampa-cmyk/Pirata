import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({ resolve: { alias: { '@pirata/contracts': fileURLToPath(new URL('../../../../packages/contracts/src', import.meta.url)), '@pirata/domain': fileURLToPath(new URL('../../../../packages/domain/src', import.meta.url)) } }, test: { include: ['tests/modules/tasks-time/**/*.test.ts', 'tests/unit/**/*.test.ts'], environment: 'node' } });
