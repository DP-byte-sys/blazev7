import type { TicketStatus } from '../features/tickets/labels';
import { colors } from './tokens';

export const STATUS_TONE: Record<TicketStatus, { fg: string; bg: string }> = {
  new: { fg: colors.info, bg: colors.infoBg },
  acknowledged: { fg: colors.brand700, bg: colors.brand100 },
  in_progress: { fg: colors.warning, bg: colors.warningBg },
  resolved: { fg: colors.success, bg: colors.successBg },
  reopened: { fg: colors.danger, bg: colors.dangerBg },
};
