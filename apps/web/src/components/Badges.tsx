import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type TicketPriority,
  type TicketStatus,
} from '../features/tickets/labels';
import { STATUS_TONE } from '../theme/statusTone';

/** Status is always rendered as text, never by color alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="badge" style={{ color: tone.fg, background: tone.bg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const hot = priority === 'high' || priority === 'urgent';
  return (
    <span className={`badge badge-outline${hot ? ' hot' : ''}`}>{PRIORITY_LABEL[priority]}</span>
  );
}
