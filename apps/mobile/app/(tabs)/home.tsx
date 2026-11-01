import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../src/components/AppButton';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/States';
import { TicketCard } from '../../src/components/TicketCard';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useLoad } from '../../src/hooks/useLoad';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { ticketRepository } from '../../src/repositories';
import { draftIsBlank } from '../../src/store/draftStore';
import { useDraftStore } from '../../src/store/useDraftStore';
import { colors, fonts, fontSize, space } from '../../src/theme/tokens';

export default function Home() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? '';
  const draft = useDraftStore((s) => s.draft);
  const { state, refreshing, retry, refresh } = useLoad(
    () => ticketRepository.listMyTickets(userId),
    [userId],
  );
  useRefreshOnFocus(refresh);
  const hasDraft = !!draft && !draftIsBlank(draft);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader
        title={profile ? `Hi, ${profile.display_name}` : 'Home'}
        subtitle="Create and track your support tickets."
      />
      {hasDraft ? (
        <Notice tone="warning">
          You have an unsent draft saved on this device. It is not a ticket yet.
        </Notice>
      ) : null}
      <AppButton
        title={hasDraft ? 'Continue your draft' : 'Create a ticket'}
        onPress={() => router.push('/tickets/new')}
      />
      <Text accessibilityRole="header" style={styles.section}>
        Recent tickets
      </Text>
      {state.status === 'loading' ? <LoadingState message="Loading your tickets…" /> : null}
      {state.status === 'error' ? (
        <ErrorState title="Couldn't load your tickets" body={state.error.message} onRetry={retry} />
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <EmptyState title="No tickets yet" body="Tickets you create will appear here." />
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <View style={styles.list}>
          {state.data.slice(0, 3).map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onPress={() => router.push({ pathname: '/tickets/[id]', params: { id: t.id } })}
            />
          ))}
        </View>
      ) : null}
      <AppButton title="Profile" variant="outline" onPress={() => router.push('/profile')} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  section: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginTop: space[4],
  },
  list: { gap: space[3] },
});
