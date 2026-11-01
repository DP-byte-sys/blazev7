import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../src/components/AppButton';
import { EnvBanner } from '../src/components/EnvBanner';
import { Screen } from '../src/components/Screen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useAuth } from '../src/features/auth/AuthProvider';
import { colors, fonts, fontSize, space } from '../src/theme/tokens';

export default function Profile() {
  const { session, profile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <EnvBanner />
      <ScreenHeader title="Profile" />
      <View style={styles.block}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{profile?.display_name ?? '—'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{session?.user.email ?? '—'}</Text>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{profile?.role ?? '—'}</Text>
      </View>
      <Text style={styles.hint}>
        Your role is managed by an administrator and cannot be changed here.
      </Text>
      <AppButton
        title="Sign out"
        variant="outline"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  block: { gap: space[1] },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: space[3],
  },
  value: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.textPrimary },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.textSecondary },
});
