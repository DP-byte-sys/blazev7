import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useLoad } from '../../hooks/useLoad';
import { useRepo } from '../../repositories/RepoContext';
import { ok } from '../../repositories/result';
import type { CategoryInput, CategoryRow, Team } from '../tickets/types';

const blank: CategoryInput = {
  id: null,
  name: '',
  description: '',
  active: true,
  sortOrder: 0,
  defaultTeamId: null,
};

function CategoryDialog({
  initial,
  teams,
  busy,
  error,
  onCancel,
  onSave,
}: {
  initial: CategoryInput;
  teams: Team[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (c: CategoryInput) => void;
}) {
  const [c, setC] = useState(initial);
  const [touched, setTouched] = useState(false);
  const nameError =
    touched &&
    (!c.name.trim()
      ? 'Name is required.'
      : c.name.trim().length > 100
        ? 'Name must be 100 characters or fewer.'
        : null);
  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (c.name.trim() && c.name.trim().length <= 100) onSave(c);
  }
  return (
    <Dialog title={c.id ? 'Edit category' : 'New category'} onClose={onCancel}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="cat-name">Name</label>
          <input
            id="cat-name"
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
            aria-invalid={!!nameError}
          />
          {nameError ? <span className="field-error">{nameError}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="cat-desc">Description (optional)</label>
          <input
            id="cat-desc"
            value={c.description}
            maxLength={500}
            onChange={(e) => setC({ ...c, description: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cat-team">Default team queue</label>
          <select
            id="cat-team"
            value={c.defaultTeamId ?? ''}
            onChange={(e) => setC({ ...c, defaultTeamId: e.target.value || null })}
          >
            <option value="">None (only admins and assignees see these tickets)</option>
            {teams
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cat-sort">Sort order</label>
          <input
            id="cat-sort"
            type="number"
            value={c.sortOrder}
            onChange={(e) => setC({ ...c, sortOrder: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={c.active}
            onChange={(e) => setC({ ...c, active: e.target.checked })}
          />{' '}
          Active (requesters can choose it)
        </label>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CategoriesPage() {
  const repo = useRepo();
  const data = useLoad(async () => {
    const [c, t] = await Promise.all([repo.listCategories(), repo.listTeams()]);
    if (!c.ok) return c;
    if (!t.ok) return t;
    return ok({ categories: c.data, teams: t.data });
  }, [repo]);
  const [editing, setEditing] = useState<CategoryInput | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function save(c: CategoryInput) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFlash(null);
    const r = await repo.upsertCategory(c);
    busyRef.current = false;
    setBusy(false);
    if (r.ok) {
      setEditing(null);
      setFlash(`Category "${c.name.trim()}" saved.`);
      await data.refresh();
    } else setError(r.error.message);
  }

  return (
    <>
      <h1>Categories</h1>
      <p className="muted">
        Categories route new tickets to a team queue. Changes are recorded in the audit log.
      </p>
      {flash ? <Notice tone="success">{flash}</Notice> : null}
      {data.state.status === 'loading' ? <LoadingState /> : null}
      {data.state.status === 'error' ? (
        <ErrorState
          title="Couldn't load categories"
          body={data.state.error.message}
          onRetry={data.retry}
        />
      ) : null}
      {data.state.status === 'ready' ? (
        <>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setError(null);
                setEditing(blank);
              }}
            >
              New category
            </button>
          </p>
          {data.state.data.categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              body="Requesters cannot create tickets until at least one active category exists."
            />
          ) : (
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Description</th>
                    <th scope="col">Default team</th>
                    <th scope="col">Status</th>
                    <th scope="col">Order</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.state.data.categories.map((c: CategoryRow) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.description ?? ''}</td>
                      <td>
                        {data.state.status === 'ready'
                          ? (data.state.data.teams.find((t) => t.id === c.defaultTeamId)?.name ??
                            'None')
                          : ''}
                      </td>
                      <td>{c.active ? 'Active' : 'Inactive'}</td>
                      <td>{c.sortOrder}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => {
                            setError(null);
                            setEditing({
                              id: c.id,
                              name: c.name,
                              description: c.description ?? '',
                              active: c.active,
                              sortOrder: c.sortOrder,
                              defaultTeamId: c.defaultTeamId,
                            });
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {editing ? (
            <CategoryDialog
              initial={editing}
              teams={data.state.data.teams}
              busy={busy}
              error={error}
              onCancel={() => {
                if (!busyRef.current) setEditing(null);
              }}
              onSave={(c) => void save(c)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
