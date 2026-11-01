import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../src/components/AppButton';
import { EnvBanner } from '../../src/components/EnvBanner';
import { AppTextField } from '../../src/components/AppTextField';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { colors, fonts, fontSize, radius, space } from '../../src/theme/tokens';

export default function SignIn() {
  const router = useRouter();
  const { status, notice, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  useEffect(() => {
    if (status === 'signedIn') router.replace('/home');
  }, [status, router]);

  async function onSubmit() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) setErrors({ form: result.message });
  }

  return (
    <Screen>
      <EnvBanner />
      <ScreenHeader title="Sign in to Blaze" subtitle="Create and track your support tickets." />
      {status === 'unconfigured' ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            This build is not connected to a backend. Copy .env.example to .env and add your
            Supabase URL and publishable key, then restart.
          </Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.warn}>
          <Text accessibilityRole="alert" style={styles.warnText}>
            {notice}
          </Text>
        </View>
      ) : null}
      <AppTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <AppTextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="password"
      />
      {errors.form ? (
        <Text accessibilityRole="alert" style={styles.formError}>
          {errors.form}
        </Text>
      ) : null}
      <AppButton
        title="Sign in"
        onPress={onSubmit}
        loading={submitting}
        disabled={status === 'unconfigured'}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  warn: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space[3] },
  warnText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.warning },
  formError: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.danger },
});
