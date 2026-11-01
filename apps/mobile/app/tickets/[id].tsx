import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Notice } from '../../src/components/Notice';
import { PriorityBadge } from '../../src/components/PriorityBadge';
import { ReopenForm } from '../../src/components/ReopenForm';
import { ReplyForm, type SendResult } from '../../src/components/ReplyForm';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../src/components/States';
import { StatusBadge } from '../../src/components/StatusBadge';
import { TimelineList } from '../../src/components/TimelineList';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { STATUS_LABEL } from '../../src/features/tickets/labels';
import { buildTimeline } from '../../src/features/tickets/timeline';
import { replyAlreadySent } from '../../src/features/tickets/reply';
import { useLoad } from '../../src/hooks/useLoad';
import { usePolling } from '../../src/hooks/usePolling';
import { ticketRepository } from '../../src/repositories';
import { ok } from '../../src/repositories/result';
import { colors, fonts, fontSize, space } from '../../src/theme/tokens';

export default function TicketDetail() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? '';
  const [flash, setFlash] = useState<string | null>(null);
  const { state, refreshing, retry, refresh, poll } = useLoad(async () => {
    const t = await ticketRepository.getTicket(id);
    if (!t.ok) return t;
    const tl = await ticketRepository.getTimeline(id);
    if (!tl.ok) return tl;
    return ok({
      ticket: t.data,
      timeline: buildTimeline(tl.data.events, tl.data.comments, viewerId),
    });
  }, [id, viewerId]);
  usePolling(poll); // picks up support's replies and status changes while this screen is open

  async function sendReply(body: string): Promise<SendResult> {
    setFlash(null);
    const r = await ticketRepository.addReply(id, body);
    if (r.ok) {
      await refresh();
      return { ok: true };
    }
    if (r.error.kind === 'network' || r.error.kind === 'unknown') {
      // The outcome is unknown: check whether the message actually arrived before letting the user send it again.
      const fresh = await ticketRepository.getTimeline(id);
      if (fresh.ok && replyAlreadySent(fresh.data.comments, viewerId, body, new Date())) {
        await refresh();
        return { ok: true };
      }
    }
    return { ok: false, message: r.error.message };
  }

  async function reopen(reason: string, version: number): Promise<SendResult> {
    setFlash(null);
    const r = await ticketRepository.reopenTicket(id, reason, version);
    if (r.ok) {
      setFlash('Ticket reopened. Support has been told why.');
      await refresh();
      return { ok: true };
    }
    if (r.error.kind === 'stale' || r.error.kind === 'invalid_transition') await refresh();
    return { ok: false, message: r.error.message };
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {state.status === 'loading' ? <LoadingState message="Loading ticket…" /> : null}
      {state.status === 'error' ? (
        <ErrorState
          title={
            state.error.kind === 'not_found' ? 'Ticket not found' : "Couldn't load this ticket"
          }
          body={state.error.message}
          onRetry={state.error.kind === 'not_found' ? undefined : retry}
        />
      ) : null}
      {state.status === 'ready' ? (
        <>
          {created === '1' ? (
            <Notice tone="success">{`Ticket ${state.data.ticket.reference} created. Status: ${STATUS_LABEL[state.data.ticket.status]}.`}</Notice>
          ) : null}
          <ScreenHeader title={state.data.ticket.title} subtitle={state.data.ticket.reference} />
          <View style={styles.row}>
            <StatusBadge status={state.data.ticket.status} />
            <PriorityBadge priority={state.data.ticket.priority} />
          </View>
          {state.data.ticket.category ? (
            <Text style={styles.meta}>Category: {state.data.ticket.category}</Text>
          ) : null}
          <Text style={styles.section} accessibilityRole="header">
            Description
          </Text>
          <Text style={styles.body}>{state.data.ticket.description}</Text>
          {state.data.ticket.status === 'resolved' && state.data.ticket.resolutionSummary ? (
            <>
              <Text style={styles.section} accessibilityRole="header">
                Resolution
              </Text>
              <Text style={styles.body}>{state.data.ticket.resolutionSummary}</Text>
            </>
          ) : null}
          <Text style={styles.section} accessibilityRole="header">
            Timeline
          </Text>
          <TimelineList items={state.data.timeline} />
          {flash ? <Notice tone="success">{flash}</Notice> : null}
          {state.data.ticket.status === 'resolved' ? (
            <ReopenForm onReopen={(reason) => reopen(reason, state.data.ticket.version)} />
          ) : null}
          <Text style={styles.section} accessibilityRole="header">
            Reply
          </Text>
          <ReplyForm onSend={sendReply} />
        </>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[2] },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  section: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginTop: space[3],
  },
  body: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.textPrimary },
});
