import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, fontSize, minTouch, radius, space } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'destructive';
interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}
const BG: Record<Variant, string> = {
  primary: colors.brand700,
  secondary: colors.brand100,
  outline: 'transparent',
  destructive: colors.danger,
};
const FG: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.brand800,
  outline: colors.brand700,
  destructive: colors.textInverse,
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: Props) {
  const inactive = disabled || loading; // blocks duplicate submission while pending
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: BG[variant],
          borderColor: variant === 'outline' ? colors.brand700 : 'transparent',
        },
        pressed && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FG[variant]} />
      ) : (
        <Text style={[styles.text, { color: FG[variant] }]}>{title}</Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: {
    minHeight: minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontFamily: fonts.semibold, fontSize: fontSize.md },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
