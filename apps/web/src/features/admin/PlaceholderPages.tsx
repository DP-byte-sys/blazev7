import { EmptyState } from '../../components/States';
import { useAuth } from '../auth/AuthProvider';

export function SettingsPage() {
  const { session, profile } = useAuth();
  return (
    <>
      <h1>Settings / profile</h1>
      <dl className="facts">
        <div>
          <dt>Name</dt>
          <dd>{profile?.display_name ?? '—'}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{session?.user.email ?? '—'}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{profile?.role ?? '—'}</dd>
        </div>
      </dl>
      <EmptyState
        title="More account settings arrive later"
        body="Password change and notification preferences are not built yet."
      />
    </>
  );
}
