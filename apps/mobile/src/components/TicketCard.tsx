import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TicketSummary } from '../features/tickets/types';
import { formatRelative } from '../utils/time';
import { colors, fonts, fontSize, radius, space } from '../theme/tokens';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';

export function TicketCard({ ticket, onPress }: { ticket: TicketSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ticket.reference}, ${ticket.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Text style={styles.ref}>{ticket.reference}</Text>
      <Text style={styles.title}>{ticket.title}</Text>
      <View style={styles.row}>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
      </View>
      <Text style={styles.meta}>
        {ticket.category} · Updated {formatRelative(ticket.updatedAt)}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  ref: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.textSecondary },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.textPrimary },
  row: { flexDirection: 'row', gap: space[2] },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.textSecondary },
});
