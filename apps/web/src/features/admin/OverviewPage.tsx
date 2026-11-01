import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { useAuth } from '../auth/AuthProvider';

export function OverviewPage() {
  const repo = useRepo();
  const { session, profile } = useAuth();
  const myId = session?.user.id ?? '';
  const queue = useLoad(() => repo.listQueue(), [repo]);
  return (
    <>
      <h1>Overview</h1>
      <p className="muted">{profile ? `Welcome, ${profile.display_name}.` : ''}</p>
      {queue.state.status === 'loading' ? <LoadingState message="Loading summary…" /> : null}
      {queue.state.status === 'error' ? (
        <ErrorState
          title="Couldn't load the summary"
          body={queue.state.error.message}
          onRetry={queue.retry}
        />
      ) : null}
      {queue.state.status === 'ready' && queue.state.data.length === 0 ? (
        <EmptyState title="No tickets in your queues" />
      ) : null}
      {queue.state.status === 'ready' && queue.state.data.length > 0
        ? (() => {
            const open = queue.state.data.filter((t) => t.status !== 'resolved');
            const cards: [string, number][] = [
              ['New', open.filter((t) => t.status === 'new').length],
              ['Unassigned (open)', open.filter((t) => t.assigneeId === null).length],
              ['Assigned to me (open)', open.filter((t) => t.assigneeId === myId).length],
              ['In progress', open.filter((t) => t.status === 'in_progress').length],
              ['Reopened', open.filter((t) => t.status === 'reopened').length],
            ];
            return (
              <>
                <ul className="cards" aria-label="Queue summary">
                  {cards.map(([label, n]) => (
                    <li key={label} className="card">
                      <div className="card-number">{n}</div>
                      <div className="muted">{label}</div>
                    </li>
                  ))}
                </ul>
                <p>
                  <Link to="/tickets">Open the ticket queue →</Link>
                </p>
              </>
            );
          })()
        : null}
    </>
  );
}
