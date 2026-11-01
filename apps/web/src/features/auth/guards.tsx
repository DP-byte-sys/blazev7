import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/States';
import { useAuth, type Role } from './AuthProvider';

/** Signed-out users are sent to /login. (UI guard only: data access is enforced by the backend.) */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState message="Checking your session…" />;
  if (status !== 'signedIn')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function AccessDenied({ title, body }: { title: string; body: string }) {
  const { signOut } = useAuth();
  return (
    <main className="content">
      <div className="state">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}

/** The portal is for staff. Requesters use the mobile app. (UX only: RLS already hides staff data from requesters.) */
export function RequireStaff() {
  const { profile } = useAuth();
  if (!profile)
    return (
      <ErrorState
        title="Could not load your profile"
        body="Check your connection and sign in again."
      />
    );
  if (profile.role === 'requester') {
    return (
      <AccessDenied
        title="Staff access only"
        body="This portal is for support staff. Use the Blaze mobile app to create and track your tickets."
      />
    );
  }
  return <Outlet />;
}

/** Hides admin pages from other staff. Hiding is not security; the backend enforces every admin action. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) {
    return (
      <>
        <h1>No access</h1>
        <p className="muted">You do not have permission to view this page.</p>
      </>
    );
  }
  return <Outlet />;
}
