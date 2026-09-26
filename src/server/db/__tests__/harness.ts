/**
 * Migration verification harness.
 *
 * Runs every SQL migration against a real PostgreSQL instance (PGlite: the
 * actual Postgres engine compiled to WASM, running in-process) so the schema
 * and PL/pgSQL triggers are genuinely executed rather than assumed correct.
 *
 * Why this exists: the integrity rules in migration 010 are the core of the
 * financial guarantee. Untested trigger logic is worse than no trigger
 * logic, because it looks like protection.
 *
 * Run:  npm run test:db
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export interface MigrationResult {
  file: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();

  // Supabase provides this schema. PGlite does not, so it is stubbed to a
  // shape faithful enough to exercise the foreign keys that depend on it.
  // Extension handling (citext, pgcrypto) is left to migration 001, which
  // degrades gracefully when an extension is unavailable.
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz default now()
    );
  `);

  return db;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function runMigrations(db: PGlite): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const started = Date.now();
    try {
      await db.exec(sql);
      results.push({ file, ok: true, durationMs: Date.now() - started });
    } catch (err) {
      results.push({
        file,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      });
      // Stop at the first failure: later migrations depend on earlier ones.
      break;
    }
  }

  return results;
}

/** Convenience for tests: a fully migrated database. */
export async function migratedDatabase(): Promise<PGlite> {
  const db = await freshDatabase();
  const results = await runMigrations(db);
  const failure = results.find((r) => !r.ok);
  if (failure) {
    throw new Error(
      `Migration ${failure.file} failed:\n${failure.error}\n\n` +
        'Fix the migration before running dependent tests.',
    );
  }
  return db;
}
