import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from '../../components/Badges';
import { Notice } from '../../components/Notice';
import { ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { ok, type Result } from '../../repositories/result';
import { formatDateTime } from '../../utils/time';
import { availableActions } from './actions';
import { ResolveDialog, ReopenDialog, AssignDialog } from './TicketDialogs';
import { buildStaffTimeline } from './timeline';

type DialogKind = 'resolve' | 'reopen' | 'assign';
type Flash = { tone: 'success' | 'warning' | 'danger'; text: string };

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const repo = useRepo();
  const detail = useLoad(async () => {
    const t = await repo.getTicket(id);
    if (!t.ok) return t;
    const tl = await repo.getTimeline(id);
    if (!tl.ok) return tl;
    return ok({ ticket: t.data, timeline: buildStaffTimeline(tl.data) });
  }, [id, repo]);

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('public');
  const [noteError, setNoteError] = useState<string | null>(null);

  /** One action at a time. The UI never claims success before the server confirms, and always reloads the authoritative state. */
  async function perform(
    fn: () => Promise<Result<void>>,
    success: string,
    inDialog: boolean,
  ): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    setDialogError(null);
    const r = await fn();
    busyRef.current = false;
    setBusy(false);
    if (r.ok) {
      setDialog(null);
      setFlash({ tone: 'success', text: success });
      await detail.refresh();
      return true;
    }
    if (r.error.kind === 'stale' || r.error.kind === 'invalid_transition') {
      setDialog(null);
      setFlash({ tone: 'warning', text: r.error.message });
      await detail.refresh();
    } else if (inDialog) setDialogError(r.error.message);
    else setFlash({ tone: 'danger', text: r.error.message });
    return false;
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setNoteError('Write something first.');
      return;
    }
    setNoteError(null);
    const done = await perform(
      () => repo.addComment(id, note.trim(), visibility),
      visibility === 'internal' ? 'Internal note added.' : 'Reply sent to the requester.',
      false,
    );
    if (done) setNote('');
  }

  if (detail.state.status === 'loading') return <LoadingState message="Loading ticket…" />;
  if (detail.state.status === 'error') {
    const e = detail.state.error;
    return (
      <ErrorState
        title={e.kind === 'not_found' ? 'Ticket not found' : "Couldn't load this ticket"}
        body={e.message}
        onRetry={e.kind === 'not_found' ? undefined : detail.retry}
      />
    );
  }
  const { ticket, timeline } = detail.state.data;
  const actions = availableActions(ticket.status);
  const close = () => {
    if (!busyRef.current) {
      setDialog(null);
      setDialogError(null);
    }
  };

  return (
    <>
      <p>
        <Link to="/tickets">← Back to queue</Link>
      </p>
      <h1>{ticket.title}</h1>
      <p className="muted">
        {ticket.reference} · {ticket.category}
        {ticket.teamName ? ` · Team: ${ticket.teamName}` : ''}
      </p>
      <p>
        <StatusBadge status={ticket.status} /> <PriorityBadge priority={ticket.priority} />
      </p>
      <dl className="facts">
        <div>
          <dt>Requester</dt>
          <dd>{ticket.requesterName}</dd>
        </div>
        <div>
          <dt>Assignee</dt>
          <dd>{ticket.assigneeName ?? 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(ticket.createdAt)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDateTime(ticket.updatedAt)}</dd>
        </div>
      </dl>

      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}

      <div className="actions" role="group" aria-label="Ticket actions">
        {actions.includes('acknowledge') ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void perform(
                () => repo.acknowledge(id, ticket.version),
                'Ticket acknowledged.',
                false,
              )
            }
          >
            Acknowledge
          </button>
        ) : null}
        {actions.includes('start_work') ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void perform(() => repo.startWork(id, ticket.version), 'Work started.', false)
            }
          >
            Start work
          </button>
        ) : null}
        {actions.includes('resolve') ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setDialog('resolve')}
          >
            Resolve…
          </button>
        ) : null}
        {actions.includes('reopen') ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => setDialog('reopen')}
          >
            Reopen…
          </button>
        ) : null}
        {actions.includes('assign') ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => setDialog('assign')}
          >
            {ticket.assigneeId ? 'Reassign…' : 'Assign…'}
          </button>
        ) : null}
      </div>

      <h2>Description</h2>
      <p className="prewrap">{ticket.description}</p>
      {ticket.status === 'resolved' && ticket.resolutionSummary ? (
        <>
          <h2>Resolution</h2>
          <p className="prewrap">{ticket.resolutionSummary}</p>
        </>
      ) : null}

      <h2>History</h2>
      <ol className="timeline" aria-label="Ticket history">
        {timeline.map((t) => (
          <li
            key={t.key}
            className={`timeline-item${t.kind === 'comment' ? ' is-comment' : ''}${t.internal ? ' is-internal' : ''}`}
          >
            <div className="timeline-head">
              <strong>{t.title}</strong>
              {t.internal ? <span className="badge badge-internal">Staff only</span> : null}
            </div>
            {t.detail ? <p className="prewrap">{t.detail}</p> : null}
            <span className="muted">
              {t.by} · {formatDateTime(t.at)}
            </span>
          </li>
        ))}
      </ol>

      <h2>Add a reply or note</h2>
      <form onSubmit={(e) => void addNote(e)} className="composer" noValidate>
        <div className="field">
          <label htmlFor="note">Message</label>
          <textarea
            id="note"
            rows={3}
            value={note}
            maxLength={5000}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={!!noteError}
          />
          {noteError ? <span className="field-error">{noteError}</span> : null}
        </div>
        <fieldset className="visibility">
          <legend>Who can see this?</legend>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
            />{' '}
            Public reply (the requester can see it)
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'internal'}
              onChange={() => setVisibility('internal')}
            />{' '}
            Internal note (staff only)
          </label>
        </fieldset>
        <button type="submit" className="btn" disabled={busy}>
          {visibility === 'internal' ? 'Add internal note' : 'Send public reply'}
        </button>
      </form>

      {dialog === 'resolve' ? (
        <ResolveDialog
          busy={busy}
          error={dialogError}
          onCancel={close}
          onSubmit={(s) =>
            void perform(() => repo.resolve(id, s, ticket.version), 'Ticket resolved.', true)
          }
        />
      ) : null}
      {dialog === 'reopen' ? (
        <ReopenDialog
          busy={busy}
          error={dialogError}
          onCancel={close}
          onSubmit={(r) =>
            void perform(() => repo.reopen(id, r, ticket.version), 'Ticket reopened.', true)
          }
        />
      ) : null}
      {dialog === 'assign' ? (
        <AssignDialog
          ticket={ticket}
          busy={busy}
          error={dialogError}
          onCancel={close}
          onSubmit={(a, r) =>
            void perform(
              () => repo.assign(id, a, ticket.version, r || undefined),
              'Assignment saved.',
              true,
            )
          }
        />
      ) : null}
    </>
  );
}
