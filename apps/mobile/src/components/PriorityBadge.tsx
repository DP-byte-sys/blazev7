import { StyleSheet, Text, View } from 'react-native';
import { PRIORITY_LABEL, type TicketPriority } from '../features/tickets/labels';
import { colors, fonts, fontSize, radius, space } from '../theme/tokens';

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const hot = priority === 'urgent' || priority === 'high';
  return (
    <View
      style={[styles.badge, { borderColor: hot ? colors.danger : colors.border }]}
      accessible
      accessibilityLabel={`Priority: ${PRIORITY_LABEL[priority]}`}
    >
      <Text style={[styles.text, { color: hot ? colors.danger : colors.textSecondary }]}>
        {PRIORITY_LABEL[priority]}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  text: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
});
