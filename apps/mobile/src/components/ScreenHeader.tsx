import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, space } from '../theme/tokens';

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: space[1], paddingBottom: space[4] },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xxl, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.textSecondary },
});
