import { StyleSheet, Text, View } from 'react-native';
import type { TimelineItem } from '../features/tickets/types';
import { colors, fonts, fontSize, radius, space } from '../theme/tokens';
import { formatRelative } from '../utils/time';

export function TimelineList({ items }: { items: TimelineItem[] }) {
  return (
    <View style={styles.list}>
      {items.map((i) => (
        <View
          key={i.key}
          style={[styles.item, i.kind === 'comment' && styles.comment]}
          accessible
          accessibilityLabel={`${i.title}. ${i.body ?? ''}`}
        >
          <Text style={styles.title}>{i.title}</Text>
          {i.body ? <Text style={styles.body}>{i.body}</Text> : null}
          <Text style={styles.time}>{formatRelative(i.at)}</Text>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: space[3] },
  item: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brand600,
    paddingLeft: space[3],
    gap: space[1],
  },
  comment: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 0,
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.textPrimary },
  body: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.textPrimary },
  time: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.textSecondary },
});
