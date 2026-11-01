import { StyleSheet, Text, View } from 'react-native';
import { STATUS_LABEL, type TicketStatus } from '../features/tickets/labels';
import { colors, fonts, fontSize, radius, space } from '../theme/tokens';

export const STATUS_TONE: Record<TicketStatus, { fg: string; bg: string }> = {
  new: { fg: colors.info, bg: colors.infoBg },
  acknowledged: { fg: colors.brand700, bg: colors.brand100 },
  in_progress: { fg: colors.warning, bg: colors.warningBg },
  resolved: { fg: colors.success, bg: colors.successBg },
  reopened: { fg: colors.danger, bg: colors.dangerBg },
};

/** Status is always shown as a text label, never by color alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <View
      style={[styles.badge, { backgroundColor: tone.bg }]}
      accessible
      accessibilityLabel={`Status: ${STATUS_LABEL[status]}`}
    >
      <Text style={[styles.text, { color: tone.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.sm,
  },
  text: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
});
