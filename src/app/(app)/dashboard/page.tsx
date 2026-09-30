import { requireAppUser } from '@/server/auth/page-guard';
import AdminDashboard from '@/components/dashboard/admin-dashboard';
import TeacherDashboard from '@/components/dashboard/teacher-dashboard';
import PrincipalDashboard from '@/components/dashboard/principal-dashboard';
import BursarDashboard from '@/components/dashboard/bursar-dashboard';

/**
 * ROLE-AWARE DASHBOARD ROUTING
 * ============================
 * Every signed-in role lands on a dashboard shaped for what they are allowed
 * to do (Phase 2, role-aware application shell):
 *
 *   proprietor, admin  -> the school-wide operations dashboard (unchanged)
 *   teacher            -> My Classes / My Subjects / marks awaiting entry
 *   principal          -> academic oversight + the permission-driven attention list
 *   bursar             -> fees, payments, expenses and payroll at a glance
 *
 * Each dashboard fetches its own data through `withUserContext`, so RLS
 * scopes every row read. Routing by role here is convenience, never
 * authorization: each data getter refuses roles it does not serve, and the
 * underlying services and database enforce every permission independently.
 */
export default async function DashboardPage() {
  const user = await requireAppUser();

  switch (user.role) {
    case 'teacher':
      return <TeacherDashboard user={user} />;
    case 'principal':
      return <PrincipalDashboard user={user} />;
    case 'bursar':
      return <BursarDashboard user={user} />;
    default:
      return <AdminDashboard user={user} />;
  }
}
