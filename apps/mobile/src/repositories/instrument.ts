import { logger } from '../lib/logger';
import type { Result } from './result';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFn = (...args: any[]) => Promise<Result<unknown>>;

/**
 * Wraps every repository method so failures are logged with the operation name, error kind and duration.
 * Arguments are NOT logged (they contain user text); `describe` may add safe identifiers such as ids.
 */
export function instrument<T extends { [K in keyof T]: AsyncFn }>(
  repo: T,
  describe?: (op: string, args: unknown[]) => Record<string, unknown>,
): T {
  const out = {} as T;
  for (const op of Object.keys(repo) as (keyof T & string)[]) {
    const fn = repo[op] as AsyncFn;
    out[op] = (async (...args: unknown[]) => {
      const started = Date.now();
      const result = await fn(...args);
      const extra = describe?.(op, args) ?? {};
      const durationMs = Date.now() - started;
      if (result.ok) logger.debug('repo_ok', { op, durationMs, ...extra });
      else {
        const { kind } = result.error;
        logger[
          kind === 'unknown'
            ? 'error'
            : kind === 'network' || kind === 'unconfigured'
              ? 'warn'
              : 'info'
        ]('repo_failed', { op, kind, durationMs, ...extra });
      }
      return result;
    }) as T[typeof op];
  }
  return out;
}
