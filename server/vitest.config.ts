import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Tests share one Postgres database and reset it between files.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
