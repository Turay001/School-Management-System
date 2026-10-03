import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The `@/*` path alias is declared explicitly rather than via
// vite-tsconfig-paths, which is ESM-only and cannot be loaded by a CJS
// vitest config.
const srcPath = fileURLToPath(new URL('./src', import.meta.url));

// The real `server-only` package throws unless the Next.js compiler resolves it
// through the `react-server` export condition. Vitest does not set that
// condition, so without this alias every module carrying `import 'server-only'`
// (db/pool.ts, db/transaction.ts) would be untestable rather than tested.
const serverOnlyStub = fileURLToPath(new URL('./src/test-support/server-only.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: srcPath },
      { find: /^server-only$/, replacement: serverOnlyStub },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    // scripts/ is included because two of its modules hold real logic worth
    // holding to account: the role list, which had drifted from the database
    // enum while nothing compared them, and the argument and occupancy rules.
    // Neither needs a database to test, so there is no excuse for not testing them.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    // PGlite boots a real Postgres engine per test file; give it room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Financial logic must be covered. Anything below this fails the build.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      include: [
        'src/server/services/**/*.ts',
        'src/server/db/money.ts',
        'src/server/auth/permissions.ts',
      ],
    },
  },
});
