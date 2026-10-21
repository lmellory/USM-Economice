import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@usm/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    pool: 'threads',
    maxWorkers: 2,
    minWorkers: 1,
    include: [
      'packages/**/test/**/*.test.ts',
      'worker/test/**/*.test.ts',
      'apps/web/test/**/*.test.ts',
    ],
  },
});
