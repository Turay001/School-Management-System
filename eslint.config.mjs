import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Only the data layer may speak to the database. This is the architectural
    // guard that keeps SQL out of services, routes, and UI: a stray
    // `import { Pool } from 'pg'` in a component is a lint error, not a
    // code-review comment someone might miss.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['src/server/db/**', 'src/server/repositories/postgres/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              message:
                'Import the query helpers from src/server/db/pool and the transaction wrappers from src/server/db/transaction instead of using pg directly.',
            },
          ],
          patterns: [
            {
              group: ['@supabase/supabase-js'],
              message:
                'Go through src/server/repositories. Direct Supabase calls bypass the service layer.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may be looser and may log.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', 'src/server/db/__tests__/**'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Operational scripts. These are command-line tools, so writing to stdout
    // is their entire purpose and the no-console rule does not apply.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The data layer must never be imported into a client component.
    // `server-only` already makes this a build error; this makes the intent
    // explicit at review time too.
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/db/**', '**/server/services/**', '**/server/repositories/**'],
              message:
                'Server data access cannot be imported into a component. Fetch through a route handler or a server component.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
