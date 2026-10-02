import 'server-only';

import type { Queryable } from './pool';

/**
 * WHICH TERM IS THE SCHOOL IN
 * ==========================
 *
 * Every screen that shows fees, balances or report cards has to open on *a*
 * term when the user has not chosen one. There is one right answer to that
 * question - the term whose start and end dates bracket today - and this module
 * is the only place that answers it.
 *
 * WHY IT IS SHARED
 * ----------------
 * It was not shared, and each feature guessed differently:
 *
 *   * `fees.ts` ordered by `sequence desc` and took the FIRST row, which is the
 *     LAST term of the year. In October 2026, with the year running September
 *     to July, that opened the fee ledger on Term 3 - a term six months in the
 *     future. Every balance, every arrears figure and every receipt total on
 *     that screen belonged to a term that has not started.
 *
 *   * `report-cards/page.tsx` and `assessment-form.tsx` took `terms[0]` from a
 *     list ordered by `sequence asc`, which is the FIRST term of the year. That
 *     is correct in Term 1 and wrong in Term 2 and Term 3, so the report card
 *     screen quietly showed last term's grades for most of the school year.
 *
 * Two guesses, two opposite failure modes, and neither tested - a bug of this
 * shape is invisible precisely when the data is missing, because every screen
 * it affects is empty and therefore looks fine. Guessing at the current term is
 * the kind of thing that must be written down once.
 *
 * THE RULE
 * --------
 * A term has been chosen for the school, so choosing one is not a preference
 * the code should have an opinion about beyond the dates:
 *
 *   1. The term running today wins. `today` is within `[start_date, end_date]`.
 *   2. Failing that, the most recently STARTED term wins. This is the case in
 *      the long vacation between Term 3 and the next Term 1: the fees a bursar
 *      reconciles in July are Term 3's, not the following year's Term 1.
 *   3. Failing that, the term that has not started yet and is NEAREST wins.
 *      In August, before the year opens, the term about to begin is the one
 *      being billed for.
 *
 * Ordering by `sequence` cannot express any of this, because a term's sequence
 * says where it sits in the year and not whether the year has reached it. Note
 * that rule 2 and rule 3 pick opposite ends of `sequence`: taking the largest
 * sequence gets rule 1 wrong, taking the smallest gets rule 2 wrong, and a
 * school in Term 3 is wrong under both.
 *
 * WHY `asOf` IS A PARAMETER AND NOT `current_date`
 * -----------------------------------------------
 * A test cannot pin `current_date`. If the rule above is only ever exercised on
 * the day it is written, it silently stops being tested the moment the school
 * rolls into a different term - the assertion would still pass, against a rule
 * nobody had re-checked. Taking the date as an argument lets the tests walk the
 * calendar: before the year, inside each term, in the long vacation, and after
 * the last term of a closed year.
 *
 * It defaults to the server's today, which is the only value production callers
 * pass. Every screen still lets the user pick a different term explicitly; this
 * only decides the starting point.
 */

/** `YYYY-MM-DD` in UTC, the format both `date` columns and `new Date()` agree on. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CurrentTermRow {
  id: string;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  academic_year_id: string;
  academic_year: string;
  is_current: boolean;
}

/**
 * The ORDER BY that implements the three rules above, as a reusable fragment.
 *
 * Split out so the ranking is stated once. It is a fragment rather than a whole
 * query because the callers select different columns.
 */
export const CURRENT_TERM_ORDER_BY = `
       (t.start_date <= $1::date) desc,
       case when t.start_date <= $1::date then t.start_date end desc nulls last,
       case when t.start_date >  $1::date then t.start_date end asc  nulls last,
       ay.is_current desc,
       ay.start_date desc,
       t.sequence desc`;

/** Terms in the order the dropdowns should offer them: the year running, earliest term first. */
export const TERM_DROPDOWN_ORDER_BY = `ay.is_current desc, ay.start_date desc, t.sequence asc`;

const TERM_COLUMNS = `t.id, t.name, t.sequence, t.start_date, t.end_date,
       t.academic_year_id, ay.name as academic_year, ay.is_current`;

/**
 * The term the school is in on `asOf`, or `null` when no term has been defined.
 *
 * `null` is a real answer and not a failure: a school that has not entered its
 * terms should see an honest empty screen, not somebody else's term.
 */
export async function findCurrentTerm(
  tx: Queryable,
  asOf: string = today(),
): Promise<CurrentTermRow | null> {
  const { rows } = await tx.query<CurrentTermRow>(
    `select ${TERM_COLUMNS}
       from terms t
       join academic_years ay on ay.id = t.academic_year_id
     order by ${CURRENT_TERM_ORDER_BY}
     limit 1`,
    [asOf],
  );
  return rows[0] ?? null;
}

/**
 * The term to open on when `termId` is absent: the one the school is in.
 *
 * An explicit `termId` always wins, including when it names a term in the past -
 * looking up last year's arrears is a legitimate thing to do and is not this
 * function's business to second-guess.
 */
export async function resolveTerm(
  tx: Queryable,
  termId: string | null,
  asOf: string = today(),
): Promise<CurrentTermRow | null> {
  if (termId) {
    const { rows } = await tx.query<CurrentTermRow>(
      `select ${TERM_COLUMNS}
         from terms t
         join academic_years ay on ay.id = t.academic_year_id
        where t.id = $1
        limit 1`,
      [termId],
    );
    return rows[0] ?? null;
  }
  return findCurrentTerm(tx, asOf);
}