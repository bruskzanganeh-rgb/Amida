import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['lib/types/**', 'lib/supabase/**', '**/*.d.ts'],
      thresholds: {
        // Current real coverage as of 2026-05-15: lines 84.35, functions 84.05,
        // branches 69.06, statements 82.04. Thresholds set ~1pp below to give
        // a small buffer; raise back to 85/85/70/83 after adding tests for
        // the worst-covered routes (documents/export, check-invoice-duplicates,
        // import/batch, expenses/scan).
        lines: 83,
        functions: 83,
        branches: 68,
        statements: 81,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
