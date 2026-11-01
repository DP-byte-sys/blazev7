import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, fontSize, minTouch, radius, space } from '../theme/tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
}

export function AppTextField({ label, error, multiline, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, multiline && styles.multiline, !!error && styles.inputError]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: space[1] },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  input: {
    minHeight: minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space[3],
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 120, paddingTop: space[3], textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.danger },
});
