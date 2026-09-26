import { NextResponse } from 'next/server';

import type { PortalUser } from '@/lib/auth-types';
import { getSessionUser } from '@/server/auth/bootstrap';

/**
 * The client's source of truth for "who am I". Loaded once by the session
 * provider after login/navigation. Never includes a token, password or any
 * credential - only what the shell needs to render a role-appropriate
 * experience.
 */
export async function GET(): Promise<NextResponse> {
  const user: PortalUser | null = await getSessionUser();
  return NextResponse.json({ user });
}