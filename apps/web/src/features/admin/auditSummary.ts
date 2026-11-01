import type { AdminAuditRow } from '../tickets/types';

export function summarizeAudit(r: AdminAuditRow): string {
  const target = r.targetName ?? 'a user';
  const o = r.oldValue ?? {};
  const n = r.newValue ?? {};
  switch (r.action) {
    case 'user_role_changed':
      return `${target}: role ${String(o.role)} → ${String(n.role)}`;
    case 'user_active_changed':
      return `${target} ${n.active ? 'reactivated' : 'deactivated'}`;
    case 'category_created':
      return `Created category "${String(n.name)}"`;
    case 'category_updated':
      return `Updated category "${String(n.name)}"`;
    case 'team_membership_changed':
      return `${target} ${n.member ? 'added to' : 'removed from'} ${typeof n.team_name === 'string' ? n.team_name : 'a team'}`;
    default:
      return r.action;
  }
}
