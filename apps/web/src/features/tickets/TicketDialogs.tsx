import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import type { StaffTicket } from './types';

interface Base {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
}

function Actions({
  busy,
  submitLabel,
  disabled,
  onCancel,
}: {
  busy: boolean;
  submitLabel: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-actions">
      <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button type="submit" className="btn" disabled={busy || disabled}>
        {busy ? 'Working…' : submitLabel}
      </button>
    </div>
  );
}

export function ResolveDialog({
  busy,
  error,
  onCancel,
  onSubmit,
}: Base & { onSubmit: (summary: string) => void }) {
  const [summary, setSummary] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = touched && !summary.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (summary.trim()) onSubmit(summary.trim());
  }
  return (
    <Dialog title="Resolve ticket" onClose={onCancel}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="resolution">Resolution summary (shown to the requester)</label>
          <textarea
            id="resolution"
            rows={4}
            value={summary}
            maxLength={2000}
            onChange={(e) => setSummary(e.target.value)}
            aria-invalid={missing}
          />
          {missing ? <span className="field-error">A resolution summary is required.</span> : null}
        </div>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
        <Actions busy={busy} submitLabel="Resolve ticket" onCancel={onCancel} />
      </form>
    </Dialog>
  );
}

export function ReopenDialog({
  busy,
  error,
  onCancel,
  onSubmit,
}: Base & { onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = touched && !reason.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (reason.trim()) onSubmit(reason.trim());
  }
  return (
    <Dialog title="Reopen ticket" onClose={onCancel}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="reopen-reason">Reason for reopening (recorded in the history)</label>
          <textarea
            id="reopen-reason"
            rows={3}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={missing}
          />
          {missing ? <span className="field-error">A reason is required.</span> : null}
        </div>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
        <Actions busy={busy} submitLabel="Reopen ticket" onCancel={onCancel} />
      </form>
    </Dialog>
  );
}

export function AssignDialog({
  ticket,
  busy,
  error,
  onCancel,
  onSubmit,
}: Base & { ticket: StaffTicket; onSubmit: (assigneeId: string, reason: string) => void }) {
  const repo = useRepo();
  const agents = useLoad(() => repo.listAssignableAgents(ticket.teamId), [repo, ticket.teamId]);
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const options =
    agents.state.status === 'ready'
      ? agents.state.data.filter((a) => a.id !== ticket.assigneeId)
      : [];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (assigneeId) onSubmit(assigneeId, reason.trim());
  }
  return (
    <Dialog title={ticket.assigneeId ? 'Reassign ticket' : 'Assign ticket'} onClose={onCancel}>
      {agents.state.status === 'loading' ? <LoadingState message="Loading agents…" /> : null}
      {agents.state.status === 'error' ? (
        <ErrorState
          title="Couldn't load agents"
          body={agents.state.error.message}
          onRetry={agents.retry}
        />
      ) : null}
      {agents.state.status === 'ready' ? (
        <form onSubmit={submit} noValidate>
          {options.length === 0 ? (
            <p className="muted">
              No other eligible agents are available in this ticket&apos;s team.
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="assignee">Assign to</label>
            <select
              id="assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={options.length === 0}
            >
              <option value="">Select an agent…</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="assign-reason">Note (optional, recorded in the history)</label>
            <input
              id="assign-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="field-error">
              {error}
            </p>
          ) : null}
          <Actions
            busy={busy}
            submitLabel={ticket.assigneeId ? 'Reassign' : 'Assign'}
            disabled={!assigneeId}
            onCancel={onCancel}
          />
        </form>
      ) : (
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </Dialog>
  );
}
