import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepoError, Result } from '../repositories/result';

export type LoadState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: RepoError };

/** Runs an async repository call with loading / error / ready. `retry` shows the spinner; `refresh` updates silently. */
export function useLoad<T>(fn: () => Promise<Result<T>>, deps: readonly unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(
    async (silent: boolean) => {
      const id = ++seq.current;
      if (!silent) setState({ status: 'loading' });
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
      setState(
        res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error },
      );
    },
    [run],
  );

  useEffect(() => {
    void load(false);
  }, [load]);
  const retry = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  return { state, retry, refresh };
}
