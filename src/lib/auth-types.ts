import type { SessionUser } from '@/server/auth/permissions';

/**
 * The authenticated user as handed to the client shell. Never carries a
 * credential - only identity and role, which the UI needs to render the
 * role-appropriate experience (and nothing more: hiding controls is
 * affordance, the server enforces every permission).
 */
export interface PortalUser extends SessionUser {
  /** True for a first-time login; the UI offers a password change. */
  mustChangePassword: boolean;
}