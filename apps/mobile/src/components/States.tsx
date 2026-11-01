import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, space } from '../theme/tokens';
import { AppButton } from './AppButton';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.brand700} />
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? <AppButton title={actionLabel} onPress={onAction} /> : null}
    </View>
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
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={[styles.title, { color: colors.danger }]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {onRetry ? <AppButton title="Try again" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[3], padding: space[8] },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
