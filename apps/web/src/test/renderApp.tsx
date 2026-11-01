import type { Session } from '@supabase/supabase-js';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { AuthProvider, type AuthApi, type Profile, type Role } from '../features/auth/AuthProvider';
import { RepoProvider } from '../repositories/RepoContext';
import { fakeRepo, type FakeRepo } from './fakeRepo';

export const makeSession = (id = 'user-1'): Session =>
  ({
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, email: 'u@example.test' },
  }) as unknown as Session;

export function fakeAuth(initial: Session | null, signInError: unknown = null) {
  let listener: ((e: string, s: Session | null) => void) | null = null;
  const api = {
    getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: vi.fn((cb: (e: string, s: Session | null) => void) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => {
      if (!signInError) listener?.('SIGNED_IN', makeSession());
      return { error: signInError };
    }),
    signOut: vi.fn(async () => {
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  return api satisfies AuthApi;
}

export const profileFor = (role: Role, over: Partial<Profile> = {}): Profile => ({
  id: 'user-1',
  display_name: `Test ${role}`,
  role,
  active: true,
  ...over,
});

interface Options {
  session?: Session | null;
  role?: Role;
  auth?: ReturnType<typeof fakeAuth> | null;
  profile?: Profile | null;
  repo?: FakeRepo;
}

/** Renders the whole app at `path` with a fake backend. Defaults to a signed-in admin. */
export function renderApp(path: string, opts: Options = {}) {
  const session = opts.session === undefined ? makeSession() : opts.session;
  const auth = opts.auth === undefined ? fakeAuth(session) : opts.auth;
  const profile = opts.profile === undefined ? profileFor(opts.role ?? 'admin') : opts.profile;
  const repo = opts.repo ?? fakeRepo();
  return {
    auth,
    repo,
    ...render(
      <AuthProvider auth={auth} loadProfile={async () => profile}>
        <RepoProvider repo={repo}>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </RepoProvider>
      </AuthProvider>,
    ),
  };
}
