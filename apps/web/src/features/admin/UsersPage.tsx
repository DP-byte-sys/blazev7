import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { ok, type Result } from '../../repositories/result';
import { useAuth, type Role } from '../auth/AuthProvider';
import type { AdminUser } from '../tickets/types';

const ROLES: Role[] = ['requester', 'agent', 'supervisor', 'admin'];
type Pending =
  | { kind: 'role'; user: AdminUser; role: Role }
  | { kind: 'active'; user: AdminUser; active: boolean };

export function UsersPage() {
  const repo = useRepo();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const data = useLoad(async () => {
    const [u, t] = await Promise.all([repo.listUsers(), repo.listTeams()]);
    if (!u.ok) return u;
    if (!t.ok) return t;
    return ok({ users: u.data, teams: t.data });
  }, [repo]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function perform(fn: () => Promise<Result<void>>, success: string, inDialog: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    setDialogError(null);
    const r = await fn();
    busyRef.current = false;
    setBusy(false);
    if (r.ok) {
      setPending(null);
      setFlash({ tone: 'success', text: success });
      await data.refresh();
    } else if (inDialog) setDialogError(r.error.message);
    else setFlash({ tone: 'danger', text: r.error.message });
  }

  if (data.state.status === 'loading') return <LoadingState />;
  if (data.state.status === 'error')
    return (
      <ErrorState
        title="Couldn't load users"
        body={data.state.error.message}
        onRetry={data.retry}
      />
    );
  const { users, teams } = data.state.data;

  return (
    <>
      <h1>Users and roles</h1>
      <p className="muted">
        Role, status and team changes are enforced and recorded by the server. You cannot change
        your own role or status.
      </p>
      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Teams</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === myId;
              const isStaff = u.role === 'agent' || u.role === 'supervisor';
              return (
                <tr key={u.id}>
                  <td>
                    {u.displayName}
                    {self ? ' (you)' : ''}
                  </td>
                  <td>
                    <select
                      aria-label={`Role for ${u.displayName}`}
                      value={u.role}
                      disabled={self || busy}
                      onChange={(e) =>
                        setPending({ kind: 'role', user: u, role: e.target.value as Role })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.active ? 'Active' : 'Inactive'}{' '}
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={self || busy}
                      aria-label={`${u.active ? 'Deactivate' : 'Reactivate'} ${u.displayName}`}
                      onClick={() => setPending({ kind: 'active', user: u, active: !u.active })}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                  <td>
                    {isStaff && u.active ? (
                      teams
                        .filter((t) => t.active)
                        .map((t) => (
                          <label key={t.id} className="check">
                            <input
                              type="checkbox"
                              aria-label={`${u.displayName} in ${t.name}`}
                              checked={u.teamIds.includes(t.id)}
                              disabled={busy}
                              onChange={(e) =>
                                void perform(
                                  () => repo.setTeamMember(t.id, u.id, e.target.checked),
                                  `${u.displayName} ${e.target.checked ? 'added to' : 'removed from'} ${t.name}.`,
                                  false,
                                )
                              }
                            />{' '}
                            {t.name}
                          </label>
                        ))
                    ) : (
                      <span className="muted">
                        {isStaff ? 'Inactive' : 'Agents and supervisors only'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending?.kind === 'role' ? (
        <ConfirmDialog
          title="Change role?"
          confirmLabel="Change role"
          busy={busy}
          error={dialogError}
          body={`Change ${pending.user.displayName} from ${pending.user.role} to ${pending.role}? This changes what they can see and do immediately, and is recorded in the audit log.`}
          onCancel={() => {
            if (!busyRef.current) {
              setPending(null);
              setDialogError(null);
            }
          }}
          onConfirm={() =>
            void perform(
              () => repo.setUserRole(pending.user.id, pending.role),
              `${pending.user.displayName} is now ${pending.role}.`,
              true,
            )
          }
        />
      ) : null}
      {pending?.kind === 'active' ? (
        <ConfirmDialog
          title={pending.active ? 'Reactivate user?' : 'Deactivate user?'}
          confirmLabel={pending.active ? 'Reactivate' : 'Deactivate'}
          destructive={!pending.active}
          busy={busy}
          error={dialogError}
          body={
            pending.active
              ? `${pending.user.displayName} will be able to sign in and use Blaze again.`
              : `${pending.user.displayName} will lose all access immediately. Their tickets and history are kept.`
          }
          onCancel={() => {
            if (!busyRef.current) {
              setPending(null);
              setDialogError(null);
            }
          }}
          onConfirm={() =>
            void perform(
              () => repo.setUserActive(pending.user.id, pending.active),
              `${pending.user.displayName} ${pending.active ? 'reactivated' : 'deactivated'}.`,
              true,
            )
          }
        />
      ) : null}
    </>
  );
}
