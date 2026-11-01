import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fail, ok } from '../../repositories/result';
import { CATEGORIES, fakeRepo } from '../../test/fakeRepo';
import { renderApp } from '../../test/renderApp';

describe('users and roles', () => {
  it('lists users and disables role and status controls on your own row', async () => {
    renderApp('/users');
    expect(await screen.findByRole('heading', { name: 'Users and roles' })).toBeInTheDocument();
    expect(screen.getByText('Test admin (you)')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for Test admin')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deactivate Test admin' })).toBeDisabled();
    expect(screen.getByLabelText('Role for Alex Agent')).toBeEnabled();
  });

  it('asks for confirmation before changing a role, and does nothing on cancel', async () => {
    const { repo } = renderApp('/users');
    await userEvent.selectOptions(
      await screen.findByLabelText('Role for Alex Agent'),
      'supervisor',
    );
    const dialog = screen.getByRole('dialog', { name: 'Change role?' });
    expect(dialog).toHaveTextContent('Change Alex Agent from agent to supervisor');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(repo.setUserRole).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes the role only after confirmation, then reloads and reports success', async () => {
    const { repo } = renderApp('/users');
    await userEvent.selectOptions(
      await screen.findByLabelText('Role for Alex Agent'),
      'supervisor',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }),
    );
    expect(repo.setUserRole).toHaveBeenCalledWith('agent-2', 'supervisor');
    expect(await screen.findByText('Alex Agent is now supervisor.')).toBeInTheDocument();
    expect(repo.listUsers).toHaveBeenCalledTimes(2);
  });

  it('shows server rejections inside the dialog and does not claim success', async () => {
    const repo = fakeRepo();
    repo.setUserRole.mockResolvedValue(fail('forbidden', "You don't have permission to do that."));
    renderApp('/users', { repo });
    await userEvent.selectOptions(await screen.findByLabelText('Role for Alex Agent'), 'admin');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }),
    );
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      "don't have permission",
    );
    expect(screen.queryByText(/is now admin/)).not.toBeInTheDocument();
  });

  it('deactivates and reactivates with a confirmation', async () => {
    const { repo } = renderApp('/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Alex Agent' }));
    expect(screen.getByRole('dialog', { name: 'Deactivate user?' })).toHaveTextContent(
      'lose all access immediately',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    );
    expect(repo.setUserActive).toHaveBeenCalledWith('agent-2', false);
    await screen.findByText('Alex Agent deactivated.');

    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Gone Agent' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    );
    expect(repo.setUserActive).toHaveBeenLastCalledWith('agent-3', true);
  });

  it('manages team membership for active agents and supervisors only', async () => {
    const { repo } = renderApp('/users');
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Alex Agent in IT Support' }),
    );
    expect(repo.setTeamMember).toHaveBeenCalledWith('team-it', 'agent-2', true);
    await screen.findByText('Alex Agent added to IT Support.');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Alex Agent in Network' }));
    expect(repo.setTeamMember).toHaveBeenLastCalledWith('team-net', 'agent-2', false);
    expect(screen.queryByRole('checkbox', { name: /Riley Requester in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Gone Agent in/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Agents and supervisors only')).toHaveLength(2); // admin and requester rows
  });

  it('shows a retryable error when users cannot be loaded', async () => {
    const repo = fakeRepo();
    repo.listUsers.mockResolvedValueOnce(
      fail('network', "Can't reach the server. Check your connection and try again."),
    );
    renderApp('/users', { repo });
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Test admin (you)')).toBeInTheDocument();
  });
});

describe('categories', () => {
  it('lists active and inactive categories', async () => {
    renderApp('/categories');
    expect(await screen.findByRole('heading', { name: 'Categories' })).toBeInTheDocument();
    expect(await screen.findByText('Retired')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit Network' })).toBeInTheDocument();
  });

  it('requires a name, then creates a category', async () => {
    const { repo } = renderApp('/categories');
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const dialog = screen.getByRole('dialog', { name: 'New category' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument();
    expect(repo.upsertCategory).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Facilities');
    await userEvent.selectOptions(within(dialog).getByLabelText('Default team queue'), 'team-it');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(repo.upsertCategory).toHaveBeenCalledWith({
      id: null,
      name: 'Facilities',
      description: '',
      active: true,
      sortOrder: 0,
      defaultTeamId: 'team-it',
    });
    expect(await screen.findByText('Category "Facilities" saved.')).toBeInTheDocument();
  });

  it('edits an existing category with its values prefilled', async () => {
    const { repo } = renderApp('/categories');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Network' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Network');
    expect(within(dialog).getByLabelText('Default team queue')).toHaveValue('team-net');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Active/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(repo.upsertCategory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat-1', name: 'Network', active: false }),
    );
  });

  it('shows server errors (such as a duplicate name) in the dialog and keeps the input', async () => {
    const repo = fakeRepo();
    repo.upsertCategory.mockResolvedValue(fail('validation', 'That name is already in use.'));
    renderApp('/categories', { repo });
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Network');
    await userEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'already in use',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Network');
  });

  it('shows an empty state when there are no categories', async () => {
    const repo = fakeRepo();
    repo.listCategories.mockResolvedValue(ok([]));
    renderApp('/categories', { repo });
    expect(await screen.findByText('No categories yet')).toBeInTheDocument();
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });
});

describe('audit log and overview', () => {
  it('shows administrative changes with readable summaries', async () => {
    renderApp('/audit');
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findByText('Alex Agent: role requester → agent')).toBeInTheDocument();
    expect(screen.getByText('Alex Agent added to Network')).toBeInTheDocument();
  });

  it('is admin only', async () => {
    renderApp('/audit', { role: 'agent' });
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });

  it('shows queue counts on the overview', async () => {
    renderApp('/');
    const list = await screen.findByRole('list', { name: 'Queue summary' });
    const counts = Object.fromEntries(
      within(list)
        .getAllByRole('listitem')
        .map((li) => [li.lastElementChild!.textContent, li.firstElementChild!.textContent]),
    );
    expect(counts).toEqual({
      New: '1',
      'Unassigned (open)': '1',
      'Assigned to me (open)': '1',
      'In progress': '1',
      Reopened: '0',
    });
  });
});
