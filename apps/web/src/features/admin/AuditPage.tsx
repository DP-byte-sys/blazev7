import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { formatDateTime } from '../../utils/time';
import { summarizeAudit } from './auditSummary';

export function AuditPage() {
  const repo = useRepo();
  const audit = useLoad(() => repo.listAdminAudit(), [repo]);
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">
        Administrative changes (latest 100). Ticket history is shown on each ticket.
      </p>
      {audit.state.status === 'loading' ? <LoadingState /> : null}
      {audit.state.status === 'error' ? (
        <ErrorState
          title="Couldn't load the audit log"
          body={audit.state.error.message}
          onRetry={audit.retry}
        />
      ) : null}
      {audit.state.status === 'ready' && audit.state.data.length === 0 ? (
        <EmptyState title="No administrative changes yet" />
      ) : null}
      {audit.state.status === 'ready' && audit.state.data.length > 0 ? (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {audit.state.data.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.at)}</td>
                  <td>{r.actorName}</td>
                  <td>{summarizeAudit(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
