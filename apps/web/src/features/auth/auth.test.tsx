import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setLogSink, type LogRecord } from '../../lib/logger';
import { fakeAuth, makeSession, renderApp } from '../../test/renderApp';
import { toSafeAuthMessage } from './errors';

describe('route protection (session boundaries)', () => {
  it('sends signed-out users to the login page and never renders protected content', async () => {
    renderApp('/tickets', { session: null });
    expect(await screen.findByRole('heading', { name: 'Sign in to Blaze' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ticket queue')).not.toBeInTheDocument();
  });

  it('protects every private route, including admin pages and ticket detail', async () => {
    for (const path of ['/', '/tickets/1', '/categories', '/users', '/settings']) {
      const { unmount } = renderApp(path, { session: null });
      expect(await screen.findByRole('heading', { name: 'Sign in to Blaze' })).toBeInTheDocument();
      unmount();
    }
  });

  it('restores an existing session without showing the login page', async () => {
    renderApp('/tickets', { session: makeSession() });
    expect(await screen.findByRole('heading', { name: 'Ticket queue' })).toBeInTheDocument();
  });

  it('blocks requesters from the staff portal', async () => {
    renderApp('/tickets', { role: 'requester' });
    expect(await screen.findByRole('heading', { name: 'Staff access only' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('lets agents use the queue but hides admin pages from them', async () => {
    const first = renderApp('/tickets', { role: 'agent' });
    expect(await screen.findByRole('heading', { name: 'Ticket queue' })).toBeInTheDocument();
    first.unmount();
    renderApp('/categories', { role: 'agent' });
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });

  it('lets admins open admin pages', async () => {
    renderApp('/users', { role: 'admin' });
    expect(await screen.findByRole('heading', { name: 'Users and roles' })).toBeInTheDocument();
  });

  it('shows an error state when the profile cannot be loaded', async () => {
    renderApp('/', { profile: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your profile');
  });

  it('signs out from the sidebar and returns to login', async () => {
    const { auth } = renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Blaze' })).toBeInTheDocument();
    expect(auth!.signOut).toHaveBeenCalled();
  });

  it('signs out deactivated accounts with a clear notice', async () => {
    const { auth } = renderApp('/', {
      profile: { id: 'user-1', display_name: 'Gone', role: 'agent', active: false },
    });
    await waitFor(() => expect(auth!.signOut).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Sign in to Blaze' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/deactivated/);
  });
});

describe('login page', () => {
  it('validates required fields without calling the backend', async () => {
    const { auth } = renderApp('/login', { session: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(auth!.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows only a safe message for wrong credentials', async () => {
    const auth = fakeAuth(null, {
      code: 'invalid_credentials',
      message: 'Invalid login credentials for secret@corp.test',
    });
    renderApp('/login', { session: null, auth });
    await userEvent.type(await screen.findByLabelText('Email'), 'secret@corp.test');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('secret@corp.test');
  });

  it('signs in and lands on the requested page', async () => {
    const auth = fakeAuth(null);
    renderApp('/tickets', { session: null, auth });
    await userEvent.type(await screen.findByLabelText('Email'), ' staff@example.test ');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Ticket queue' })).toBeInTheDocument();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@example.test',
      password: 'pw',
    });
  });

  it('explains when the backend is not configured and disables sign-in', async () => {
    renderApp('/login', { session: null, auth: null });
    expect(await screen.findByText(/not connected to a backend/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});

describe('auth logging', () => {
  it('logs a failed sign-in with its error code but never the email or password', async () => {
    const records: LogRecord[] = [];
    setLogSink((r) => records.push(r));
    try {
      const auth = fakeAuth(null, {
        code: 'invalid_credentials',
        status: 400,
        message: 'Invalid login credentials for secret@corp.test',
      });
      renderApp('/login', { session: null, auth });
      await userEvent.type(await screen.findByLabelText('Email'), 'secret@corp.test');
      await userEvent.type(screen.getByLabelText('Password'), 'hunter2-password');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByRole('alert');
      expect(records.find((r) => r.event === 'auth_sign_in_failed')).toMatchObject({
        level: 'warn',
        code: 'invalid_credentials',
        status: 400,
      });
      expect(JSON.stringify(records)).not.toMatch(/secret@corp\.test|hunter2/);
    } finally {
      setLogSink(() => {});
    }
  });
});

describe('toSafeAuthMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Incorrect email or password.'],
    [{ status: 429 }, 'Too many attempts. Please wait a minute and try again.'],
    [
      { name: 'AuthRetryableFetchError' },
      "Can't reach the server. Check your connection and try again.",
    ],
    [{ message: 'relation "profiles" does not exist' }, 'Sign-in failed. Please try again.'],
  ])('maps %j', (err, expected) => {
    expect(toSafeAuthMessage(err)).toBe(expected);
  });
});
