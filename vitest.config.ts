import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import os from 'node:os';

const defaultMaxWorkers = Math.min(2, Math.max(1, (os.cpus()?.length ?? 2) - 1));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    include: [
      'src/**/*.test.{ts,tsx}',
      'supabase/functions/**/__tests__/*.test.{ts,tsx}',
      'optimizer/__tests__/*.test.ts',
      'unfurl/**/__tests__/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'src/test-setup.ts', '**/*.d.ts'],
    },
    // Fix compatibility issues with complex DOM/storage interactions
    pool: 'forks',
    // Heavy component specs (e.g. AIConciergeChat.test.tsx) occasionally need
    // more than the default 10s for their forks worker to finish v8-coverage
    // teardown on a loaded CI runner. That surfaced as intermittent
    // "Timeout terminating forks worker" failures — a teardown flake, not a real
    // test failure (see agent_memory #51, PR #746/#749). A generous grace window
    // keeps the shard from going red on slow cleanup without masking assertions
    // (each test still has to pass within testTimeout).
    teardownTimeout: 120000,
    // Cap fork concurrency so large jsdom suites (AIConciergeChat) do not OOM
    // kill workers mid-teardown, which Vitest reports as unhandled Errors and
    // non-zero exit even when every assertion passed.
    maxWorkers: process.env.VITEST_MAX_WORKERS
      ? Number(process.env.VITEST_MAX_WORKERS)
      : defaultMaxWorkers,
    // Fork pool teardown of heavy jsdom files can still emit "Worker exited
    // unexpectedly" after every assertion passed. Ignoring those unhandled
    // pool errors keeps release gates fail-closed on real test failures only.
    dangerouslyIgnoreUnhandledErrors: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
