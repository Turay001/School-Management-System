/**
 * Environment variable access, with validation.
 *
 * SECURITY: the `server-only` import makes any attempt to use this from a
 * client component a BUILD ERROR rather than a silent credential leak into
 * the browser bundle. This is the primary defence against shipping the
 * database password to the client.
 */

import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env.local and fill it in. See docs/deployment.md',
    );
  }
  return value.trim();
}

export const serverEnv = {
  /** Supabase transaction-pooler connection string. Port 6543. */
  get DATABASE_URL() {
    return required('DATABASE_URL');
  },
  get DATABASE_POOL_MAX() {
    return process.env.DATABASE_POOL_MAX;
  },
  get DATABASE_STATEMENT_TIMEOUT_MS() {
    return process.env.DATABASE_STATEMENT_TIMEOUT_MS;
  },

  /**
   * The BYPASSRLS service-role key, used ONLY by the payroll generation path.
   *
   * If the application connects directly via `pg` on the transaction pooler
   * with `samjona_service_login`, this variable is not needed. It is retained
   * for operators who prefer to provision the service connection separately.
   *
   * It must never reach a client component. See docs/security.md.
   */
  get SUPABASE_SERVICE_ROLE_KEY() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
  },

  /** Supabase project reference, e.g. abcdefghijklmnop. */
  get SUPABASE_PROJECT_REF() {
    return process.env.SUPABASE_PROJECT_REF?.trim() || undefined;
  },

  get NEXT_PUBLIC_SUPABASE_URL() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },

  get AUTH_SECRET() {
    return required('AUTH_SECRET');
  },
  get NEXTAUTH_URL() {
    return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  },

  get CURRENCY_CODE() {
    return process.env.CURRENCY_CODE;
  },
  get CURRENCY_MINOR_UNITS() {
    return process.env.CURRENCY_MINOR_UNITS;
  },
  get PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES() {
    return process.env.PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES;
  },
  get REQUIRE_SEPARATE_PAYROLL_APPROVER() {
    return process.env.REQUIRE_SEPARATE_PAYROLL_APPROVER;
  },
  get LOGIN_RATE_LIMIT_ATTEMPTS() {
    return process.env.LOGIN_RATE_LIMIT_ATTEMPTS;
  },
  get LOGIN_RATE_LIMIT_WINDOW_MS() {
    return process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
  },
  get ENABLE_ATTENDANCE_MODULE() {
    return process.env.ENABLE_ATTENDANCE_MODULE;
  },
  get ENABLE_LEAVE_MODULE() {
    return process.env.ENABLE_LEAVE_MODULE;
  },
};

/**
 * Validate configuration at startup.
 * Returns human-readable problems rather than throwing, so a setup or health
 * page can display them all at once.
 */
export function validateConfig(): string[] {
  const problems: string[] = [];

  const url = process.env.DATABASE_URL;
  if (!url) {
    problems.push('DATABASE_URL is not set. The school database is not configured.');
  } else if (url.includes(':5432') || url.includes(':6543') === false) {
    if (!url.includes(':6543')) {
      problems.push(
        'DATABASE_URL does not appear to use the transaction pooler (port 6543). ' +
          'Vercel serverless functions will exhaust the connection limit on port 5432.',
      );
    }
  }
  if (url && url.includes('postgres.')) {
    problems.push(
      'DATABASE_URL looks like a service-role connection. Application requests must use ' +
        'samjona_login so that RLS applies. Only payroll generation may use the service role.',
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    problems.push('AUTH_SECRET is not set. Sessions cannot be secured.');
  } else if (secret.length < 32) {
    problems.push(
      'AUTH_SECRET is shorter than 32 characters. Generate one with: openssl rand -base64 32',
    );
  }

  if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_URL) {
    problems.push('NEXTAUTH_URL is not set. Authentication callbacks will fail in production.');
  }

  return problems;
}
