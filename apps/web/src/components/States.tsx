import type { ReactNode } from 'react';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <p className="muted">{message}</p>
    </div>
  );
}
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <h2>{title}</h2>
      {body ? <p className="muted">{body}</p> : null}
      {action}
    </div>
  );
}
export function ErrorState({
  title = 'Something went wrong',
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state state-error" role="alert">
      <h2>{title}</h2>
      {body ? <p className="muted">{body}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn-outline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
