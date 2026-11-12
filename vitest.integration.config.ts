import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/integration/**/*.spec.ts'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
