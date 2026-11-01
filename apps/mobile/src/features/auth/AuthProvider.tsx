import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { logger } from '../../lib/logger';
import { supabase } from '../../lib/supabase';
import { toSafeAuthMessage } from './errors';

export type Role = 'requester' | 'agent' | 'supervisor' | 'admin';
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  active: boolean;
}
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unconfigured';

/** The slice of the Supabase auth API this app uses (lets tests inject a fake). */
export interface AuthApi {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  onAuthStateChange(cb: (event: string, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(c: { email: string; password: string }): Promise<{ error: unknown }>;
  signOut(): Promise<{ error: unknown }>;
  startAutoRefresh?(): Promise<void>;
  stopAutoRefresh?(): Promise<void>;
}

async function defaultLoadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, active')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return (data as Profile | null) ?? null;
}

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  notice: string | null;
  signIn(email: string, password: string): Promise<{ ok: boolean; message?: string }>;
  signOut(): Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

interface Props {
  children: ReactNode;
  /** Injection points for tests. Defaults use the real Supabase client. */
  auth?: AuthApi | null;
  loadProfile?: (userId: string) => Promise<Profile | null>;
}

export function AuthProvider({
  children,
  auth = supabase ? (supabase.auth as unknown as AuthApi) : null,
  loadProfile = defaultLoadProfile,
}: Props) {
  const configured = auth !== null;
  const [initialised, setInitialised] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        setInitialised(true);
      })
      .catch(() => {
        if (!cancelled) setInitialised(true);
      });
    const { data: sub } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [auth]);

  // Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
  useEffect(() => {
    if (!auth?.startAutoRefresh || !auth.stopAutoRefresh) return;
    const l = AppState.addEventListener('change', (s) => {
      void (s === 'active' ? auth.startAutoRefresh?.() : auth.stopAutoRefresh?.());
    });
    return () => l.remove();
  }, [auth]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadProfile(userId)
      .then((p) => {
        if (!cancelled) setLoaded({ userId, profile: p });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ userId, profile: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  // Derived, so a previous user's profile can never be shown for a new session.
  const profileReady = userId === null || loaded?.userId === userId;
  const profile = userId !== null && loaded?.userId === userId ? loaded.profile : null;

  // Deactivated accounts are signed out. (Real enforcement is server-side: inactive users have no access via RLS.)
  const deactivated = !!profile && !profile.active;
  useEffect(() => {
    if (!deactivated || !auth) return;
    logger.info('auth_deactivated_signout');
    void auth
      .signOut()
      .finally(() => setNotice('This account has been deactivated. Contact your administrator.'));
  }, [deactivated, auth]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!auth) return { ok: false, message: 'The app is not connected to a backend yet.' };
      setNotice(null);
      try {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          const info = error as { code?: string; status?: number };
          logger.warn('auth_sign_in_failed', { code: info.code, status: info.status }); // never the email or password
          return { ok: false, message: toSafeAuthMessage(error) };
        }
        return { ok: true };
      } catch (e) {
        logger.warn('auth_sign_in_failed', { error: e });
        return { ok: false, message: toSafeAuthMessage(e) };
      }
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    if (!auth) return;
    await auth.signOut();
    setSession(null); // clear local state even if the network call failed
  }, [auth]);

  const status: AuthStatus = !configured
    ? 'unconfigured'
    : !initialised || (session && !profileReady)
      ? 'loading'
      : session
        ? 'signedIn'
        : 'signedOut';
  const value = useMemo<AuthValue>(
    () => ({ status, session, profile, notice, signIn, signOut }),
    [status, session, profile, notice, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
