import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/States';
import { TicketCard } from '../../src/components/TicketCard';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useLoad } from '../../src/hooks/useLoad';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { ticketRepository } from '../../src/repositories';
import { space } from '../../src/theme/tokens';

export default function Tickets() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { state, refreshing, retry, refresh } = useLoad(
    () => ticketRepository.listMyTickets(userId),
    [userId],
  );
  useRefreshOnFocus(refresh);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader title="My tickets" subtitle="Pull down to refresh." />
      {state.status === 'loading' ? <LoadingState message="Loading your tickets…" /> : null}
      {state.status === 'error' ? (
        <ErrorState title="Couldn't load your tickets" body={state.error.message} onRetry={retry} />
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          body="Tickets you create will appear here."
          actionLabel="Create a ticket"
          onAction={() => router.push('/tickets/new')}
        />
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <View style={styles.list}>
          {state.data.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onPress={() => router.push({ pathname: '/tickets/[id]', params: { id: t.id } })}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ list: { gap: space[3] } });
