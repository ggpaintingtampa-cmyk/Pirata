import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', coverage: { include: ['src/domain/**', 'src/data/**', 'src/state/createAppStore.ts', 'src/lib/**'] } } });
