import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepoError, Result } from '../repositories/result';

export type LoadState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: RepoError };

/** Runs an async repository call, with loading / error / ready and manual reload (pull to refresh, retry). */
export function useLoad<T>(fn: () => Promise<Result<T>>, deps: readonly unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const id = ++seq.current;
      if (mode === 'initial') setState({ status: 'loading' });
      else if (mode === 'refresh') setRefreshing(true);
      let res: Result<T>;
      try {
        res = await run();
      } catch {
        res = {
          ok: false,
          error: { kind: 'unknown', message: 'Something went wrong. Please try again.' },
        };
      }
      if (id !== seq.current) return; // a newer request superseded this one
      setRefreshing(false);
      if (mode === 'silent' && !res.ok) return; // a failed background check keeps showing what we already have
      setState(
        res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error },
      );
    },
    [run],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);
  return {
    state,
    refreshing,
    retry: () => load('initial'),
    refresh: () => load('refresh'),
    /** Background update: no spinner, and failures are ignored. */
    poll: () => load('silent'),
  };
}
