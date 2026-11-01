import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fail, ok } from '../../repositories/result';
import { QUEUE, fakeRepo, ticketFor, type FakeRepo } from '../../test/fakeRepo';
import { renderApp } from '../../test/renderApp';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('ticket queue', () => {
  it('shows open tickets by default (resolved hidden) with names, assignee and status as text', async () => {
    renderApp('/tickets');
    expect(await screen.findByRole('link', { name: 'BLZ-0001' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BLZ-0002' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'BLZ-0003' })).not.toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('In progress')).toBeInTheDocument(); // status is text, not color alone
    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
    expect(within(table).getByText('Test admin')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 3');
  });

  it('filters by assignment, status, priority and search', async () => {
    renderApp('/tickets');
    await screen.findByRole('link', { name: 'BLZ-0001' });

    await userEvent.selectOptions(screen.getByLabelText('Assignment'), 'unassigned');
    expect(screen.queryByRole('link', { name: 'BLZ-0001' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BLZ-0002' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Assignment'), 'mine');
    expect(screen.getByRole('link', { name: 'BLZ-0001' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'BLZ-0002' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Assignment'), 'all');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'resolved');
    expect(screen.getByRole('link', { name: 'BLZ-0003' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'BLZ-0001' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'all');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'low');
    expect(screen.getAllByRole('link', { name: /BLZ-/ })).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'all');
    await userEvent.type(screen.getByLabelText('Search'), 'sam sender');
    expect(screen.getAllByRole('link', { name: /BLZ-/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'BLZ-0002' })).toBeInTheDocument();
  });

  it('offers a reset when nothing matches', async () => {
    renderApp('/tickets');
    await screen.findByRole('link', { name: 'BLZ-0001' });
    await userEvent.type(screen.getByLabelText('Search'), 'zzz-no-match');
    expect(screen.getByText('No tickets match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByRole('link', { name: 'BLZ-0001' })).toBeInTheDocument();
  });

  it('shows an empty state for an empty queue', async () => {
    const repo = renderRepo();
    repo.listQueue.mockResolvedValue(ok([]));
    renderApp('/tickets', { repo });
    expect(await screen.findByText('The queue is empty')).toBeInTheDocument();
  });

  it('shows a retryable error state', async () => {
    const repo = renderRepo();
    repo.listQueue.mockResolvedValueOnce(
      fail('network', "Can't reach the server. Check your connection and try again."),
    );
    renderApp('/tickets', { repo });
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'BLZ-0001' })).toBeInTheDocument();
    expect(repo.listQueue).toHaveBeenCalledTimes(2);
  });
});

const renderRepo = (): FakeRepo => fakeRepo();

const openTicket = async (id: string, repo: FakeRepo) => {
  renderApp(`/tickets/${id}`, { repo });
  await screen.findByRole('heading', { level: 1 });
};
const withStatus = (id: string, patch: Parameters<typeof ticketFor>[1]) => {
  const repo = renderRepo();
  repo.getTicket.mockResolvedValue(
    ok(
      ticketFor(
        QUEUE.find((t) => t.id === id)!,
        patch,
      ),
    ),
  );
  return repo;
};
const buttons = () =>
  within(screen.getByRole('group', { name: 'Ticket actions' }))
    .queryAllByRole('button')
    .map((b) => b.textContent);

describe('ticket detail: actions are shown per status', () => {
  it.each([
    ['new', ['Acknowledge', 'Assign…']],
    ['acknowledged', ['Start work', 'Assign…']],
    ['in_progress', ['Resolve…', 'Assign…']],
    ['reopened', ['Acknowledge', 'Start work', 'Assign…']],
    ['resolved', ['Reopen…']],
  ] as const)('%s', async (status, expected) => {
    const repo = withStatus('2', { status });
    await openTicket('2', repo);
    expect(buttons()).toEqual(expected);
  });

  it('labels the assign button Reassign when already assigned', async () => {
    const repo = withStatus('1', { status: 'in_progress' });
    await openTicket('1', repo);
    expect(screen.getByRole('button', { name: 'Reassign…' })).toBeInTheDocument();
  });
});

describe('ticket detail: history and staff-only content', () => {
  it('marks internal notes and events as "Staff only" and shows names', async () => {
    await openTicket('1', renderRepo());
    const history = screen.getByRole('list', { name: 'Ticket history' });
    const items = within(history).getAllByRole('listitem');
    const internalNote = items.find((li) => li.textContent?.includes('Probably a firmware bug'))!;
    expect(within(internalNote).getByText('Staff only')).toBeInTheDocument();
    const publicReply = items.find((li) => li.textContent?.includes('Checking the access point'))!;
    expect(within(publicReply).queryByText('Staff only')).not.toBeInTheDocument();
    expect(history).toHaveTextContent('Assigned to Alex Agent');
    expect(
      within(items.find((li) => li.textContent?.includes('Assigned to'))!).getByText('Staff only'),
    ).toBeInTheDocument();
    expect(history).toHaveTextContent('Riley Requester');
  });

  it('shows the resolution only for resolved tickets', async () => {
    const repo = withStatus('3', { status: 'resolved', resolutionSummary: 'Replaced the router' });
    await openTicket('3', repo);
    expect(screen.getByText('Replaced the router')).toBeInTheDocument();
  });

  it('shows a not-found state without a retry button', async () => {
    renderApp('/tickets/does-not-exist');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('ticket detail: acknowledge / start work', () => {
  it('sends the version it saw, waits for the server, then shows the refreshed state', async () => {
    const repo = withStatus('2', { status: 'new', version: 7 });
    repo.getTicket.mockResolvedValueOnce(ok(ticketFor(QUEUE[1]!, { status: 'new', version: 7 })));
    repo.getTicket.mockResolvedValue(
      ok(ticketFor(QUEUE[1]!, { status: 'acknowledged', version: 8 })),
    );
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(repo.acknowledge).toHaveBeenCalledWith('2', 7);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start work' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Ticket acknowledged.')).toBeInTheDocument();
  });

  it('blocks duplicate clicks while an action is in flight and claims no success before the server answers', async () => {
    const repo = withStatus('2', { status: 'new' });
    const d = deferred<ReturnType<typeof ok<void>>>();
    repo.acknowledge.mockReturnValue(d.promise);
    await openTicket('2', repo);
    const button = screen.getByRole('button', { name: 'Acknowledge' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(repo.acknowledge).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Ticket acknowledged.')).not.toBeInTheDocument();
    d.resolve(ok(undefined));
    expect(await screen.findByText('Ticket acknowledged.')).toBeInTheDocument();
  });

  it('on a stale version, warns, refreshes and does not claim success', async () => {
    const repo = withStatus('2', { status: 'new', version: 1 });
    repo.acknowledge.mockResolvedValue(
      fail(
        'stale',
        'This ticket was changed by someone else. It has been refreshed; review it and try again.',
      ),
    );
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
    expect(screen.queryByText('Ticket acknowledged.')).not.toBeInTheDocument();
    await waitFor(() => expect(repo.getTicket).toHaveBeenCalledTimes(2));
  });

  it('shows permission errors from the server as an alert', async () => {
    const repo = withStatus('2', { status: 'new' });
    repo.acknowledge.mockResolvedValue(fail('forbidden', "You don't have permission to do that."));
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have permission");
  });

  it('start work calls the server with the current version', async () => {
    const repo = withStatus('2', { status: 'acknowledged', version: 4 });
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Start work' }));
    expect(repo.startWork).toHaveBeenCalledWith('2', 4);
  });
});

describe('ticket detail: resolve and reopen', () => {
  it('requires a resolution summary before calling the server', async () => {
    const repo = withStatus('1', { status: 'in_progress', version: 5 });
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve…' }));
    const dialog = screen.getByRole('dialog', { name: 'Resolve ticket' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve ticket' }));
    expect(within(dialog).getByText('A resolution summary is required.')).toBeInTheDocument();
    expect(repo.resolve).not.toHaveBeenCalled();
    await userEvent.type(
      within(dialog).getByLabelText(/Resolution summary/),
      '  Replaced the access point ',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve ticket' }));
    expect(repo.resolve).toHaveBeenCalledWith('1', 'Replaced the access point', 5);
    expect(await screen.findByText('Ticket resolved.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the typed summary and shows the server error inside the dialog on failure', async () => {
    const repo = withStatus('1', { status: 'in_progress' });
    repo.resolve.mockResolvedValue(fail('validation', 'Resolution summary is required'));
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve…' }));
    await userEvent.type(screen.getByLabelText(/Resolution summary/), 'Done');
    await userEvent.click(screen.getByRole('button', { name: 'Resolve ticket' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolve ticket' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Resolution summary is required');
    expect(within(dialog).getByLabelText(/Resolution summary/)).toHaveValue('Done');
  });

  it('requires a reason to reopen and records it', async () => {
    const repo = withStatus('3', { status: 'resolved', version: 9, resolutionSummary: 'x' });
    await openTicket('3', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen…' }));
    const dialog = screen.getByRole('dialog', { name: 'Reopen ticket' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reopen ticket' }));
    expect(within(dialog).getByText('A reason is required.')).toBeInTheDocument();
    expect(repo.reopen).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Reason for reopening/), 'Still failing');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reopen ticket' }));
    expect(repo.reopen).toHaveBeenCalledWith('3', 'Still failing', 9);
  });

  it('closes the dialog with Escape without sending anything', async () => {
    const repo = withStatus('1', { status: 'in_progress' });
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve…' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repo.resolve).not.toHaveBeenCalled();
  });
});

describe('ticket detail: assignment', () => {
  it('offers eligible agents except the current assignee and requires a choice', async () => {
    const repo = withStatus('1', {
      status: 'in_progress',
      version: 6,
      assigneeId: 'agent-2',
      assigneeName: 'Alex Agent',
      teamId: 'team-net',
    });
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Reassign…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reassign ticket' });
    const select = await within(dialog).findByLabelText('Assign to');
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'Select an agent…',
      'Test admin (admin)',
      'Sam Supervisor (supervisor)',
    ]);
    expect(repo.listAssignableAgents).toHaveBeenCalledWith('team-net');
    expect(within(dialog).getByRole('button', { name: 'Reassign' })).toBeDisabled();
  });

  it('assigns with the version and an optional note', async () => {
    const repo = withStatus('2', {
      status: 'new',
      version: 2,
      assigneeId: null,
      assigneeName: null,
      teamId: 'team-net',
    });
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Assign…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign ticket' });
    await userEvent.selectOptions(await within(dialog).findByLabelText('Assign to'), 'sup-1');
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'covering lunch');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(repo.assign).toHaveBeenCalledWith('2', 'sup-1', 2, 'covering lunch');
    expect(await screen.findByText('Assignment saved.')).toBeInTheDocument();
  });

  it('omits the note when empty', async () => {
    const repo = withStatus('2', {
      status: 'new',
      version: 2,
      assigneeId: null,
      assigneeName: null,
    });
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Assign…' }));
    await userEvent.selectOptions(await screen.findByLabelText('Assign to'), 'agent-2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(repo.assign).toHaveBeenCalledWith('2', 'agent-2', 2, undefined);
  });

  it('shows server rejections inside the dialog', async () => {
    const repo = withStatus('2', { status: 'new', assigneeId: null, assigneeName: null });
    repo.assign.mockResolvedValue(fail('validation', 'Assignee is not in the ticket team'));
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Assign…' }));
    await userEvent.selectOptions(await screen.findByLabelText('Assign to'), 'agent-2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'not in the ticket team',
    );
  });

  it('says so when no eligible agents exist', async () => {
    const repo = withStatus('2', { status: 'new', assigneeId: null, assigneeName: null });
    repo.listAssignableAgents.mockResolvedValue(ok([]));
    await openTicket('2', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Assign…' }));
    expect(await screen.findByText(/No other eligible agents/)).toBeInTheDocument();
  });
});

describe('ticket detail: replies and internal notes', () => {
  it('sends a public reply by default and clears the box on success', async () => {
    const repo = renderRepo();
    await openTicket('1', repo);
    expect(screen.getByRole('button', { name: 'Send public reply' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Message'), ' We are looking into it ');
    await userEvent.click(screen.getByRole('button', { name: 'Send public reply' }));
    expect(repo.addComment).toHaveBeenCalledWith('1', 'We are looking into it', 'public');
    expect(await screen.findByText('Reply sent to the requester.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('sends an internal note when "Internal note" is chosen, and the button says so', async () => {
    const repo = renderRepo();
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('radio', { name: /Internal note/ }));
    await userEvent.type(screen.getByLabelText('Message'), 'Escalate to vendor');
    await userEvent.click(screen.getByRole('button', { name: 'Add internal note' }));
    expect(repo.addComment).toHaveBeenCalledWith('1', 'Escalate to vendor', 'internal');
    expect(await screen.findByText('Internal note added.')).toBeInTheDocument();
  });

  it('does not send an empty message', async () => {
    const repo = renderRepo();
    await openTicket('1', repo);
    await userEvent.click(screen.getByRole('button', { name: 'Send public reply' }));
    expect(screen.getByText('Write something first.')).toBeInTheDocument();
    expect(repo.addComment).not.toHaveBeenCalled();
  });

  it('keeps the typed message when sending fails', async () => {
    const repo = renderRepo();
    repo.addComment.mockResolvedValue(
      fail('network', "Can't reach the server. Check your connection and try again."),
    );
    await openTicket('1', repo);
    await userEvent.type(screen.getByLabelText('Message'), 'Important text');
    await userEvent.click(screen.getByRole('button', { name: 'Send public reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    expect(screen.getByLabelText('Message')).toHaveValue('Important text');
  });
});
