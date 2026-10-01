import 'server-only';

/**
 * Transient-connection retry.
 *
 * THE FAILURE THIS ADDRESSES
 * =========================
 * On a network where a DNS proxy is in the path, a single dropped lookup is
 * enough to fail an entire page. Observed in this project: both Supabase
 * database hosts are IPv6-only with no A record, and a VPN was answering DNS
 * on the Wi-Fi adapter. One `getaddrinfo ENOTFOUND` from that proxy, and `pg`
 * throws while opening the socket.
 *
 * `resolveSessionUser` treats any failure to reach the database as `unavailable`
 * and renders "The system cannot reach the school database" - a dead end that
 * looks like an account or permissions problem, when in fact the account was
 * fine and one packet was lost.
 *
 * A retry turns that into a page load.
 *
 * THE CONSTRAINT THAT SHAPES EVERYTHING HERE
 * ==========================================
 * Retry ONLY the acquisition of a connection. Never a statement.
 *
 * A failed `connect()` has a known outcome: no connection was established, so
 * nothing was sent and nothing happened. Retrying it is free.
 *
 * A statement that fails mid-flight has an unknown one. If the socket resets
 * after `insert into fee_payments` reached the server but before the
 * acknowledgement came back, the row may exist. Retrying would post it twice,
 * and in a system where payroll is immutable and the audit trail is
 * append-only, a duplicated payment is worse than a failed page.
 *
 * So `withConnectionRetry` wraps `acquire` and nothing else. Callers pass a
 * function that opens a connection; the statement runs afterwards, once,
 * outside the retry. That is why this module exists separately from `pool.ts`
 * and why `query()` is written to acquire explicitly rather than calling
 * `pool.query()`: `pool.query()` hides the acquisition boundary, and hiding it
 * is what would tempt the next reader into widening the retry.
 *
 * WHAT IS NOT RETRIED, AND WHY
 * ============================
 * Deliberately excluded, because a retry that "fixes" a real fault is worse
 * than no retry:
 *
 *   57014 query_canceled          Our own statement_timeout fired. That is the
 *                                 timeout doing its job; retrying would defeat
 *                                 it and turn a slow query into a slow request
 *                                 that still fails.
 *   40001 / 40P01                 Serialization failure and deadlock. Genuinely
 *      serialization / deadlock   retryable, but only by re-running a whole
 *                                 transaction. Retrying them at this level
 *                                 would be a partial retry of a unit of work
 *                                 that has already failed, which is the exact
 *                                 double-apply risk above.
 *   42501 insufficient_privilege  A permission is wrong. Retrying cannot grant
 *   23xxx integrity violations   it, and these signal a bug, not a blip.
 *   42xxx syntax/parse            Our SQL is wrong.
 *
 * A connection that dies between acquisition and the first statement is also
 * not retried here, for the same unknown-fate reason. `pg` removes a broken
 * idle client from the pool, so the cost is one failed request rather than a
 * poisoned pool, and the next request gets a fresh connection.
 */

/**
 * Node/libuv error codes meaning "the connection never happened".
 *
 * ENOTFOUND and EAI_AGAIN are the two that matter here. They are the DNS
 * answers, and they are what the proxy in the failure above produced.
 */
const TRANSIENT_SYSTEM_CODES: ReadonlySet<string> = new Set([
  // DNS said the name does not exist, or could not be looked up right now.
  // Both are the failure this whole module exists for. A cached NXDOMAIN can
  // also mean a stale entry rather than a blip, which is why the attempt
  // count is small rather than generous.
  'ENOTFOUND',
  'EAI_AGAIN',
  // Refused / reset / timed out before the handshake completed.
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EADDRNOTAVAIL',
]);

/**
 * SQLSTATE codes meaning "this connection is gone; a new one might work".
 *
 * Class 08 is the connection exception class. The three from class 57 are the
 * server telling us it is going away rather than refusing us. Class 53 is
 * resource exhaustion, which resolves once connections are returned - and
 * since this is a fresh acquire each time, the pool has usually drained by
 * the second attempt.
 */
const TRANSIENT_SQLSTATE_CODES: ReadonlySet<string> = new Set([
  // class 08 - connection exception
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '08007', // transaction_resolution_unknown
  '08P01', // protocol_violation
  // class 57 - operator intervention, shutdown subset only
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '57P04', // database_dropped
  // class 53 - insufficient resources
  '53300', // too_many_connections
  '53400', // configuration_limit_exceeded
]);

/**
 * Is this a failure to connect, rather than a failure of the statement?
 *
 * Exported so the classification can be tested directly rather than inferred
 * from retry behaviour, which is the only way to check the exclusions above.
 */
export function isTransientConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const err = error as { code?: unknown; message?: unknown; cause?: unknown };
  const code = typeof err.code === 'string' ? err.code : '';

  if (TRANSIENT_SYSTEM_CODES.has(code) || TRANSIENT_SQLSTATE_CODES.has(code)) return true;

  // `pg` sometimes reports the underlying socket failure one level down.
  if (err.cause !== undefined && isTransientConnectionError(err.cause)) return true;

  // Last resort. Some drivers surface the DNS failure as prose with no code at
  // all. Node's format is `getaddrinfo ENOTFOUND <host>`, with the code
  // immediately after the syscall name - matched that tightly on purpose. A
  // looser pattern would retry any message merely containing the word, and a
  // data fault that happened to name a code would then be replayed against the
  // database.
  if (typeof err.message === 'string') {
    return /\bgetaddrinfo\s+(?:ENOTFOUND|EAI_AGAIN)\b/.test(err.message);
  }

  return false;
}

/** Test hook: lets a test drive the backoff without waiting for it. */
export type Sleeper = (ms: number) => Promise<void>;

const realSleep: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /**
   * Total attempts, including the first. Two means one retry.
   *
   * Two rather than more, deliberately. A dropped lookup - the failure above -
   * is gone by the second attempt, so extra attempts buy nothing for the case
   * this exists to handle. Against a genuine outage every attempt costs up to
   * `connectionTimeoutMillis` (10s), and these calls run inside serverless
   * functions that will themselves be killed. Failing fast with a clear error
   * beats being terminated mid-wait.
   */
  attempts?: number;
  /** Delay before each retry. The first attempt is never delayed. */
  backoffMs?: readonly number[];
  /** Injectable for tests. */
  sleep?: Sleeper;
  /** Called before each retry, for logging. */
  onRetry?: (info: { attempt: number; error: unknown; delayMs: number }) => void;
}

const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS: readonly number[] = [150];

/**
 * Run `acquire`, retrying only while it fails to CONNECT.
 *
 * The contract is the whole point: whatever `acquire` returns is handed
 * straight back, and a statement run with that result must not be wrapped in
 * this function. See the note at the top of the file.
 */
export async function withConnectionRetry<T>(
  label: string,
  acquire: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? realSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await acquire();
    } catch (error) {
      attempt += 1;

      const retryable = isTransientConnectionError(error);
      const exhausted = attempt >= attempts;

      if (!retryable || exhausted) {
        if (retryable && exhausted) {
          console.warn('[db] transient connection failure did not clear', {
            label,
            attempts: attempt,
            code: (error as { code?: string }).code,
            message: (error as Error).message,
          });
        }
        throw error;
      }

      const delayMs = backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 0;

      options.onRetry?.({ attempt, error, delayMs });
      if (delayMs > 0) await sleep(delayMs);
    }
  }
}
