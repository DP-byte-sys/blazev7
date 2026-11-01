// Structured, privacy-safe logging. One JSON object per line. Never log secrets or user content.
// Redaction is a safety net (key names + obvious patterns); the real rule is: log codes, kinds, ids and durations, not text.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogRecord = { ts: string; level: LogLevel; event: string } & Record<string, unknown>;
export type LogSink = (record: LogRecord) => void;

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SENSITIVE_KEY =
  /pass(word|wd)?|token|secret|authorization|api[-_]?key|cookie|session|e-?mail|title|description|body|summary|reason|note|message|name|phone|address/i;
const JWT = /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAX_STRING = 200;
const MAX_ITEMS = 20;
const MAX_DEPTH = 3;

export function redact(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (typeof value === 'string') {
    const scrubbed = value.replace(JWT, '[jwt]').replace(EMAIL, '[email]');
    return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…` : scrubbed;
  }
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return {
      errorType: value.name,
      ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    }; // never the message or stack
  }
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return String(typeof value);
}

const consoleSink: LogSink = (r) => {
  let line: string;
  try {
    line = JSON.stringify(r);
  } catch {
    line = JSON.stringify({ ts: r.ts, level: r.level, event: r.event, note: 'unserializable' });
  }
  (r.level === 'debug' ? console.log : console[r.level])(line);
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(
  opts: { sink?: () => LogSink; now?: () => Date; minLevel?: LogLevel } = {},
): Logger {
  const { sink = () => consoleSink, now = () => new Date(), minLevel = 'info' } = opts;
  const emit = (level: LogLevel, event: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    try {
      const safe = (redact(fields ?? {}) ?? {}) as Record<string, unknown>;
      sink()({ ...safe, ts: now().toISOString(), level, event });
    } catch {
      /* logging must never break the app */
    }
  };
  return {
    debug: (e, f) => emit('debug', e, f),
    info: (e, f) => emit('info', e, f),
    warn: (e, f) => emit('warn', e, f),
    error: (e, f) => emit('error', e, f),
  };
}

let currentSink: LogSink = consoleSink;
/** Swap where app logs go (a log service later; silent in tests). */
export function setLogSink(sink: LogSink): void {
  currentSink = sink;
}
export const logger = createLogger({ sink: () => currentSink });
