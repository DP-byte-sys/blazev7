import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../../components/Badges';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { formatRelative } from '../../utils/time';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_FILTERS, filterQueue, type QueueFilters } from './queueFilters';

export function QueuePage() {
  const repo = useRepo();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const queue = useLoad(() => repo.listQueue(), [repo]);
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const set = <K extends keyof QueueFilters>(k: K, v: QueueFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <h1>Ticket queue</h1>
      <p className="muted">Tickets in your teams&apos; queues and tickets assigned to you.</p>
      <div className="toolbar" role="search">
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => set('status', e.target.value as QueueFilters['status'])}
          >
            <option value="open">Open (not resolved)</option>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="reopened">Reopened</option>
          </select>
        </label>
        <label>
          Assignment
          <select
            value={filters.assignment}
            onChange={(e) => set('assignment', e.target.value as QueueFilters['assignment'])}
          >
            <option value="all">Everyone</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value={filters.priority}
            onChange={(e) => set('priority', e.target.value as QueueFilters['priority'])}
          >
            <option value="all">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Reference, title, requester"
          />
        </label>
      </div>

      {queue.state.status === 'loading' ? <LoadingState message="Loading tickets…" /> : null}
      {queue.state.status === 'error' ? (
        <ErrorState
          title="Couldn't load the queue"
          body={queue.state.error.message}
          onRetry={queue.retry}
        />
      ) : null}
      {queue.state.status === 'ready'
        ? (() => {
            const rows = filterQueue(queue.state.data, filters, myId);
            if (queue.state.data.length === 0)
              return (
                <EmptyState
                  title="The queue is empty"
                  body="New tickets for your teams will appear here."
                />
              );
            if (rows.length === 0)
              return (
                <EmptyState
                  title="No tickets match these filters"
                  action={
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                    >
                      Reset filters
                    </button>
                  }
                />
              );
            return (
              <>
                <p className="muted" role="status">
                  Showing {rows.length} of {queue.state.data.length} loaded tickets (latest 200).
                </p>
                <div className="table-wrap card" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Reference</th>
                        <th scope="col">Title</th>
                        <th scope="col">Category</th>
                        <th scope="col">Priority</th>
                        <th scope="col">Status</th>
                        <th scope="col">Assignee</th>
                        <th scope="col">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link to={`/tickets/${t.id}`}>{t.reference}</Link>
                          </td>
                          <td>{t.title}</td>
                          <td>{t.category}</td>
                          <td>
                            <PriorityBadge priority={t.priority} />
                          </td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                          <td>{t.assigneeName ?? 'Unassigned'}</td>
                          <td>{formatRelative(t.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()
        : null}
    </>
  );
}
