type Tone = 'info' | 'success' | 'warning' | 'danger';

/** Inline feedback. The text carries the meaning, not the color. Errors are announced as alerts. */
export function Notice({ tone = 'info', children }: { tone?: Tone; children: string }) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
