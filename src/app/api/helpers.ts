import { NextResponse } from 'next/server';

import { toAppError, UnauthenticatedError } from '@/lib/errors';
import { getSessionUser } from '@/server/auth/bootstrap';
import type { SessionUser } from '@/server/auth/permissions';

/**
 * Route-handler helpers.
 *
 * Every POST/PUT in the application follows the same shape: resolve the
 * session user (401 when absent), run the portal service, and translate any
 * thrown AppError into the JSON contract { error: { code, message, ... } }.
 * A thrown non-AppError becomes an InternalError with a correlation id the
 * administrator can quote - never a raw stack trace.
 */

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export function handleRouteError(err: unknown, correlationId: string): NextResponse {
  const appError = toAppError(err, correlationId);
  return NextResponse.json(appError.toJSON(), { status: appError.status });
}

export function json(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}