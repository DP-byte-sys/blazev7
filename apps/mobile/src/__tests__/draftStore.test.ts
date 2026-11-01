import { createDraftStore } from '../store/draftStore';
import { fakeRepo, makeIds, memoryDrafts, ticketFixture } from '../testUtils/helpers';

const setup = () => {
  const drafts = memoryDrafts();
  const repo = fakeRepo();
  const store = createDraftStore({
    drafts,
    repo,
    newId: makeIds(),
    now: () => new Date('2026-10-29T10:00:00Z'),
  });
  return { drafts, repo, store };
};
const fill = (store: ReturnType<typeof setup>['store']) => {
  store.getState().update({
    title: ' Wi-Fi down ',
    description: 'It is broken',
    categoryId: 'cat-1',
    priority: 'high',
  });
};
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('draft store', () => {
  it('saves a local draft and does not call the backend until submitted', async () => {
    const { store, repo, drafts } = setup();
    await store.getState().load('u1');
    fill(store);
    expect(store.getState().status).toBe('local_draft');
    await Promise.resolve();
    expect(drafts.rows.get('u1')?.title).toBe(' Wi-Fi down ');
    expect(repo.createTicket).not.toHaveBeenCalled();
  });

  it('validates before sending and does not call the backend when invalid', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    store.getState().update({ title: '  ' });
    const r = await store.getState().submit();
    expect(r.ok).toBe(false);
    expect(store.getState().fieldErrors).toMatchObject({
      title: 'Title is required.',
      description: 'Description is required.',
      category: 'Choose a category.',
    });
    expect(repo.createTicket).not.toHaveBeenCalled();
  });

  it('blocks a second submit while one is in flight (double-tap)', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    fill(store);
    const d = deferred<{ ok: true; data: ReturnType<typeof ticketFixture> }>();
    repo.createTicket.mockReturnValue(d.promise);
    const first = store.getState().submit();
    const second = await store.getState().submit();
    expect(second.ok).toBe(false);
    d.resolve({ ok: true, data: ticketFixture() });
    expect((await first).ok).toBe(true);
    expect(repo.createTicket).toHaveBeenCalledTimes(1);
  });

  it('sends trimmed text with the idempotency key, then clears the draft on success', async () => {
    const { store, repo, drafts } = setup();
    await store.getState().load('u1');
    fill(store);
    repo.createTicket.mockResolvedValue({ ok: true, data: ticketFixture() });
    const r = await store.getState().submit();
    expect(r).toMatchObject({ ok: true, ticket: { reference: 'BLZ-000001' } });
    expect(repo.createTicket).toHaveBeenCalledWith({
      clientRequestId: 'key-1',
      categoryId: 'cat-1',
      title: 'Wi-Fi down',
      description: 'It is broken',
      priority: 'high',
    });
    expect(store.getState()).toMatchObject({ draft: null, status: 'none' });
    expect(drafts.rows.size).toBe(0);
  });

  it('keeps the draft and reuses the SAME key after a network failure (no duplicate on retry)', async () => {
    const { store, repo, drafts } = setup();
    await store.getState().load('u1');
    fill(store);
    repo.createTicket.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network', message: "Can't reach the server." },
    });
    expect((await store.getState().submit()).ok).toBe(false);
    expect(store.getState().status).toBe('send_failed');
    expect(store.getState().draft?.title).toBe(' Wi-Fi down ');
    expect(drafts.rows.get('u1')?.attempted).toBe(true);

    repo.createTicket.mockResolvedValueOnce({ ok: true, data: ticketFixture() });
    expect((await store.getState().submit()).ok).toBe(true);
    const keys = repo.createTicket.mock.calls.map((c) => c[0].clientRequestId);
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('restores an unconfirmed attempt after an app restart as send_failed with the same key', async () => {
    const { drafts, repo } = setup();
    const first = createDraftStore({ drafts, repo, newId: makeIds() });
    await first.getState().load('u1');
    first.getState().update({ title: 'T', description: 'D', categoryId: 'c' });
    repo.createTicket.mockResolvedValue({ ok: false, error: { kind: 'unknown', message: 'x' } });
    await first.getState().submit();

    const restarted = createDraftStore({ drafts, repo, newId: makeIds() });
    await restarted.getState().load('u1');
    expect(restarted.getState().status).toBe('send_failed');
    expect(restarted.getState().draft?.clientRequestId).toBe('key-1');
    expect(restarted.getState().message).toMatch(/not create a duplicate/);
  });

  it('on idempotency conflict, keeps the text, rotates the key and warns the user', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    fill(store);
    repo.createTicket.mockResolvedValue({
      ok: false,
      error: { kind: 'conflict', message: 'Check My tickets before sending again.' },
    });
    await store.getState().submit();
    expect(store.getState().status).toBe('local_draft');
    expect(store.getState().draft).toMatchObject({
      clientRequestId: 'key-2',
      attempted: false,
      title: ' Wi-Fi down ',
    });
    expect(store.getState().message).toMatch(/My tickets/);
  });

  it('on server validation errors, shows the message and allows editing', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    fill(store);
    repo.createTicket.mockResolvedValue({
      ok: false,
      error: { kind: 'validation', message: 'Unknown or inactive category' },
    });
    await store.getState().submit();
    expect(store.getState()).toMatchObject({
      status: 'local_draft',
      message: 'Unknown or inactive category',
    });
    expect(store.getState().draft?.attempted).toBe(false);
  });

  it('when rate limited, keeps the draft and the SAME key (nothing was created) and explains', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    fill(store);
    repo.createTicket.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rate_limited',
        message: "You're doing that too often. Please wait a few minutes and try again.",
      },
    });
    expect((await store.getState().submit()).ok).toBe(false);
    expect(store.getState()).toMatchObject({
      status: 'local_draft',
      message: expect.stringMatching(/too often/),
    });
    expect(store.getState().draft).toMatchObject({ clientRequestId: 'key-1', attempted: false });
  });

  it('discard deletes the draft locally', async () => {
    const { store, drafts } = setup();
    await store.getState().load('u1');
    fill(store);
    await Promise.resolve();
    await store.getState().discard();
    expect(store.getState().draft).toBeNull();
    expect(drafts.rows.size).toBe(0);
  });

  it('clearAll (sign-out) wipes every local draft and in-memory state', async () => {
    const { store, drafts } = setup();
    await drafts.save('other-user', {
      clientRequestId: 'x',
      categoryId: null,
      title: 'secret',
      description: '',
      priority: 'normal',
      attempted: false,
      updatedAt: '',
    });
    await store.getState().load('u1');
    fill(store);
    await store.getState().clearAll();
    expect(drafts.rows.size).toBe(0);
    expect(store.getState()).toMatchObject({ userId: null, draft: null, status: 'none' });
  });

  it("a different user never sees the previous user's draft", async () => {
    const { store } = setup();
    await store.getState().load('u1');
    fill(store);
    await Promise.resolve();
    await store.getState().load('u2');
    expect(store.getState().draft).toBeNull();
  });

  it('ignores a send result that arrives after sign-out', async () => {
    const { store, repo } = setup();
    await store.getState().load('u1');
    fill(store);
    const d = deferred<{ ok: true; data: ReturnType<typeof ticketFixture> }>();
    repo.createTicket.mockReturnValue(d.promise);
    const pending = store.getState().submit();
    await store.getState().clearAll();
    d.resolve({ ok: true, data: ticketFixture() });
    expect((await pending).ok).toBe(false);
    expect(store.getState().draft).toBeNull();
  });

  it('reports when the draft cannot be saved locally instead of failing silently', async () => {
    const { store, drafts } = setup();
    drafts.failSaves = true;
    await store.getState().load('u1');
    fill(store);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().persistError).toBe(true);
    expect(store.getState().draft?.title).toBe(' Wi-Fi down '); // still usable in memory
  });
});
