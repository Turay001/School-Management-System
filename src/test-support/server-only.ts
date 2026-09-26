/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws at import time unless resolved through the
 * `react-server` export condition, which only the Next.js compiler sets. Under
 * Vitest and `tsx` that condition is absent, so importing any module carrying
 * `import 'server-only'` would fail at load time rather than at build time.
 *
 * Aliasing it here means server-only modules such as `db/transaction.ts` can be
 * unit tested. The marker still does its real job in the Next.js build, where
 * pulling one of these modules into a client component is a compile error.
 *
 * See vitest.config.ts.
 */

export {};
