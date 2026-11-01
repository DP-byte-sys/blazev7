import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { Text } from 'react-native';
import { AuthProvider, useAuth, type AuthApi, type Profile } from '../features/auth/AuthProvider';
import { toSafeAuthMessage } from '../features/auth/errors';
import { setLogSink, type LogRecord } from '../lib/logger';

const makeSession = (id = 'user-1'): Session =>
  ({
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, email: 'u@example.test' },
  }) as unknown as Session;

function fakeAuth(initial: Session | null, signInError: unknown = null) {
  let listener: ((e: string, s: Session | null) => void) | null = null;
  const api: AuthApi & { signOut: jest.Mock; signInWithPassword: jest.Mock } = {
    getSession: jest.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: jest.fn((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    signInWithPassword: jest.fn(async () => {
      if (!signInError) listener?.('SIGNED_IN', makeSession());
      return { error: signInError };
    }),
    signOut: jest.fn(async () => {
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  return api;
}

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'user-1',
  display_name: 'Test User',
  role: 'requester',
  active: true,
  ...over,
});

function Probe() {
  const a = useAuth();
  return (
    <>
      <Text testID="status">{a.status}</Text>
      <Text testID="role">{a.profile?.role ?? 'none'}</Text>
      <Text testID="notice">{a.notice ?? ''}</Text>
      <Text
        testID="signin"
        onPress={() => {
          void a.signIn(' u@example.test ', 'pw').then((r) => {
            (globalThis as { __r?: unknown }).__r = r;
          });
        }}
      >
        signin
      </Text>
      <Text testID="signout" onPress={() => void a.signOut()}>
        signout
      </Text>
    </>
  );
}
const mount = async (auth: AuthApi | null, load = async () => profile()) =>
  render(
    <AuthProvider auth={auth} loadProfile={load}>
      <Probe />
    </AuthProvider>,
  );
const status = () => screen.getByTestId('status').props.children;

describe('AuthProvider', () => {
  it('is signedOut when there is no stored session', async () => {
    await mount(fakeAuth(null));
    await waitFor(() => expect(status()).toBe('signedOut'));
  });

  it('restores an existing session and loads the profile (session restore)', async () => {
    await mount(fakeAuth(makeSession()));
    await waitFor(() => expect(status()).toBe('signedIn'));
    expect(screen.getByTestId('role').props.children).toBe('requester');
  });

  it('reports unconfigured when no backend client exists', async () => {
    await mount(null);
    await waitFor(() => expect(status()).toBe('unconfigured'));
  });

  it('signs in, trimming the email, and becomes signedIn', async () => {
    const auth = fakeAuth(null);
    await mount(auth);
    await waitFor(() => expect(status()).toBe('signedOut'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('signin'));
    });
    await waitFor(() => expect(status()).toBe('signedIn'));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'u@example.test',
      password: 'pw',
    });
  });

  it('stays signedOut and returns a SAFE message when credentials are wrong', async () => {
    const auth = fakeAuth(null, {
      code: 'invalid_credentials',
      message: 'Invalid login credentials for user@secret.test',
    });
    await mount(auth);
    await waitFor(() => expect(status()).toBe('signedOut'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('signin'));
    });
    await waitFor(() => expect((globalThis as { __r?: { ok: boolean } }).__r?.ok).toBe(false));
    expect((globalThis as { __r?: { message: string } }).__r?.message).toBe(
      'Incorrect email or password.',
    );
    expect(status()).toBe('signedOut');
  });

  it('signs out and clears the profile', async () => {
    const auth = fakeAuth(makeSession());
    await mount(auth);
    await waitFor(() => expect(status()).toBe('signedIn'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('signout'));
    });
    await waitFor(() => expect(status()).toBe('signedOut'));
    expect(screen.getByTestId('role').props.children).toBe('none');
  });

  it('signs out deactivated accounts and tells the user', async () => {
    const auth = fakeAuth(makeSession());
    await mount(auth, async () => profile({ active: false }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(status()).toBe('signedOut'));
    expect(screen.getByTestId('notice').props.children).toMatch(/deactivated/);
  });
});

describe('auth logging', () => {
  it('logs a failed sign-in with its error code but never the email', async () => {
    const records: LogRecord[] = [];
    setLogSink((r) => records.push(r));
    try {
      const auth = fakeAuth(null, {
        code: 'invalid_credentials',
        status: 400,
        message: 'Invalid login credentials for secret@corp.test',
      });
      await mount(auth);
      await waitFor(() => expect(status()).toBe('signedOut'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('signin'));
      });
      await waitFor(() =>
        expect(records.some((r) => r.event === 'auth_sign_in_failed')).toBe(true),
      );
      expect(records.find((r) => r.event === 'auth_sign_in_failed')).toMatchObject({
        level: 'warn',
        code: 'invalid_credentials',
        status: 400,
      });
      expect(JSON.stringify(records)).not.toContain('secret@corp.test');
    } finally {
      setLogSink(() => {});
    }
  });
});

describe('toSafeAuthMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Incorrect email or password.'],
    [{ message: 'Invalid login credentials' }, 'Incorrect email or password.'],
    [{ code: 'email_not_confirmed' }, 'Please confirm your email address before signing in.'],
    [{ status: 429 }, 'Too many attempts. Please wait a minute and try again.'],
    [
      { name: 'AuthRetryableFetchError' },
      "Can't reach the server. Check your connection and try again.",
    ],
    [{ message: 'database exploded: secret internals' }, 'Sign-in failed. Please try again.'],
    [null, 'Sign-in failed. Please try again.'],
  ])('maps %j', (err, expected) => {
    expect(toSafeAuthMessage(err)).toBe(expected);
  });
});
