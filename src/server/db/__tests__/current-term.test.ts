/**
 * Current-term resolution tests.
 *
 * THE BUG THIS PINS
 * =================
 * Three screens had to pick a term when the user had not chosen one, and each
 * guessed differently:
 *
 *   * `fees.ts` ordered by `sequence desc` and took the first row - the LAST
 *     term of the year. With the 2026/27 year running September to July, that
 *     opened the fee ledger on Term 3 in early October, a term six months in
 *     the future. Every balance and arrears figure on that screen was the wrong
 *     term's.
 *
 *   * `report-cards/page.tsx` and `assessment-form.tsx` took `terms[0]` from a
 *     list ordered `sequence asc` - the FIRST term. Correct in Term 1, and last
 *     term's grades for the rest of the year.
 *
 * Opposite failure modes from the same missing idea. That is why
 * `db/current-term.ts` exists, and this file exists to stop the idea drifting
 * back into three separate guesses.
 *
 * WHY NO TEST CAUGHT IT
 * ====================
 * Every screen it affects was empty, and an empty screen renders identically
 * whether the term is right or wrong. A bug that is invisible exactly when
 * there is no data is invisible for as long as the deployment is new.
 *
 * WHY `asOf` IS EXPLICIT HERE
 * ==========================
 * The rule reads `today`, so a test that only ran "today" would keep passing
 * after the calendar moved underneath it - and it moves: the assertions below
 * are about a September-to-July year, so a test pinned to the real date would
 * silently start asserting the wrong thing in September 2027. Every case here
 * names the date it is testing, which is what makes the calendar walkable.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';
import { findCurrentTerm, resolveTerm } from '../current-term';
import type { Queryable } from '../pool';

/** The year migration 013 seeds: 2026/27, three terms, September to July. */
const YEAR_START = '2026-09-01';
const TERM_1 = ['2026-09-01', '2026-12-18'];
const TERM_2 = ['2027-01-05', '2027-04-02'];
const TERM_3 = ['2027-04-13', '2027-07-30'];

let db: PGlite;

/**
 * PGlite as the `Queryable` the service functions expect.
 *
 * `Queryable` is node-postgres' own overloaded query interface, and PGlite's
 * `query` is close but not assignable to it. Widening the production type to
 * admit both would weaken it for every real caller to satisfy a test double;
 * this one cast is contained in the test instead. The functions under test only
 * ever call `query(sql, params)`, which both drivers support identically.
 */
const tx = () => db as unknown as Queryable;

beforeAll(async () => {
  db = await migratedDatabase();
}, 120_000);

/** The term `asOf` should resolve to, by name. */
async function termOn(asOf: string): Promise<string | null> {
  const row = await findCurrentTerm(tx(), asOf);
  return row?.name ?? null;
}

/**
 * `YYYY-MM-DD` from whatever the driver handed back.
 *
 * `CurrentTermRow` declares `start_date`/`end_date` as strings because that is
 * what the application gets: `pool.ts` re-parses `bigint` (OID 20) and leaves
 * `date` (OID 1082) alone, and node-postgres returns that as a string. PGlite
 * returns a `Date` instead. The production type is the string one; this helper
 * exists so the test does not assert a detail of the test driver that the
 * application never sees.
 */
function iso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

describe('inside a term', () => {
  it('picks the term running on the first day of Term 1', async () => {
    expect(await termOn(TERM_1[0]!)).toBe('Term 1');
  });

  it('picks Term 1 in its middle, not Term 3', async () => {
    // THE REGRESSION. 2026-10-02 is the day this was found in the live
    // database, and `sequence desc` returned Term 3 for it.
    expect(await termOn('2026-10-02')).toBe('Term 1');
  });

  it('picks Term 1 on its last day - the range is inclusive', async () => {
    expect(await termOn(TERM_1[1]!)).toBe('Term 1');
  });

  it('picks Term 2 on its first day, crossing the new-year boundary', async () => {
    expect(await termOn(TERM_2[0]!)).toBe('Term 2');
  });

  it('picks Term 3 on its first day, straight after the April break', async () => {
    expect(await termOn(TERM_3[0]!)).toBe('Term 3');
  });

  it('picks Term 3 on its last day', async () => {
    expect(await termOn(TERM_3[1]!)).toBe('Term 3');
  });
});

describe('outside every term', () => {
  it('picks the NEAREST upcoming term before the year opens', async () => {
    // In late August the bursar is billing for the year about to start, which
    // is Term 1. Taking `sequence desc` would have said Term 3.
    expect(await termOn('2026-08-20')).toBe('Term 1');
  });

  it('picks the MOST RECENT term in the break between terms', async () => {
    // Between Term 1 and Term 2 nobody is billing yet, but the fees a bursar
    // reconciles are Term 1's. The nearest upcoming term is Term 2; the right
    // answer is the one that just finished.
    expect(await termOn('2026-12-28')).toBe('Term 1');
  });

  it('picks Term 2 in the April break', async () => {
    expect(await termOn('2027-04-08')).toBe('Term 2');
  });

  it('picks Term 3 after the year has ended', async () => {
    // The school is closed. The last term's fees are what is still owed.
    expect(await termOn('2027-08-15')).toBe('Term 3');
  });

  it('picks Term 3 well after the year has ended', async () => {
    expect(await termOn('2028-06-01')).toBe('Term 3');
  });
});

describe('the ranking itself', () => {
  it('never returns the first term of the year for a date inside Term 3', async () => {
    // The opposite-direction bug: `terms[0]` and `sequence asc` would.
    expect(await termOn(TERM_3[0]!)).not.toBe('Term 1');
  });

  it('never returns the last term of the year for a date inside Term 1', async () => {
    // The bug that was found live.
    expect(await termOn(TERM_1[0]!)).not.toBe('Term 3');
  });

  it('prefers a term running today over a more recently started one', async () => {
    // Defensive: if two terms overlapped, the one actually running wins.
    const term = await findCurrentTerm(tx(), TERM_2[0]!);
    expect(term?.name).toBe('Term 2');
    expect(term?.academic_year).toBe('2026/27');
  });
});

describe('resolveTerm', () => {
  it('honours an explicit term id over the current term', async () => {
    // Looking up last year's arrears is a legitimate thing for a bursar to do,
    // so an explicit choice must never be second-guessed.
    const all = await db.query<{ id: string; name: string }>(
      `select id, name from terms order by sequence`,
    );
    const last = all.rows[all.rows.length - 1]!;
    const resolved = await resolveTerm(tx(), last.id, TERM_1[0]!);
    expect(resolved?.name).toBe(last.name);
  });

  it('falls back to the current term when no id is given', async () => {
    expect((await resolveTerm(tx(), null, '2027-02-01'))?.name).toBe('Term 2');
  });

  it('returns null for an id that matches no term, rather than guessing', async () => {
    // A stale bookmark must not silently show somebody else's balances.
    const resolved = await resolveTerm(tx(), '00000000-0000-4000-8000-000000000000', '2026-10-02');
    expect(resolved).toBeNull();
  });

  it('returns the row with the dates the caller needs to display it', async () => {
    const term = await findCurrentTerm(tx(), '2026-10-02');
    expect(term).toMatchObject({
      name: 'Term 1',
      academic_year: '2026/27',
      sequence: 1,
      is_current: true,
    });
    expect(iso(term!.start_date)).toBe(TERM_1[0]);
    expect(iso(term!.end_date)).toBe(TERM_1[1]);
  });
});

describe('what the callers now do with it', () => {
  it('gives the fees screen the running term, not the last one', async () => {
    // The shape getFeeOverview depends on: a label naming the term it chose.
    const term = await findCurrentTerm(tx(), '2026-10-02');
    const label = `${term!.academic_year} · ${term!.name}`;
    expect(label).toBe('2026/27 · Term 1');
    expect(label).not.toMatch(/Term 3/);
  });

  it('still lists every term for the picker, earliest first', async () => {
    // The dropdown is a different question from "which one is current", and
    // must not be narrowed by the current-term rule.
    const { rows } = await db.query<{ name: string }>(
      `select t.name from terms t
         join academic_years ay on ay.id = t.academic_year_id
        order by ay.is_current desc, ay.start_date desc, t.sequence asc`,
    );
    expect(rows.map((r) => r.name)).toEqual(['Term 1', 'Term 2', 'Term 3']);
  });
});

describe('the seeded year is the one these tests describe', () => {
  it('has Term 1 starting on the date this file assumes', async () => {
    const { rows } = await db.query<{ name: string; start_date: string; end_date: string }>(
      `select name, start_date::text, end_date::text from terms order by sequence`,
    );
    expect(rows[0]).toMatchObject({ name: 'Term 1', start_date: YEAR_START, end_date: TERM_1[1] });
  });
});