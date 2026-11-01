import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, space } from '../theme/tokens';

type Tone = 'info' | 'warning' | 'danger' | 'success';
const TONE: Record<Tone, { fg: string; bg: string }> = {
  info: { fg: colors.info, bg: colors.infoBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  success: { fg: colors.success, bg: colors.successBg },
};

/** Inline status/feedback message (also used for offline and sync notices). Text carries the meaning, not color. */
export function Notice({ tone = 'info', children }: { tone?: Tone; children: string }) {
  const t = TONE[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: t.bg }]}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
      <Text style={[styles.text, { color: t.fg }]}>{children}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space[3] },
  text: { fontFamily: fonts.medium, fontSize: fontSize.sm },
});
