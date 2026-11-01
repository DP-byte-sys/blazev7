import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../src/components/AppButton';
import { AppTextField } from '../../src/components/AppTextField';
import { Notice } from '../../src/components/Notice';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/States';
import { PRIORITY_LABEL, type TicketPriority } from '../../src/features/tickets/labels';
import { useLoad } from '../../src/hooks/useLoad';
import { ticketRepository } from '../../src/repositories';
import { draftIsBlank } from '../../src/store/draftStore';
import { useDraftStore } from '../../src/store/useDraftStore';
import { colors, fonts, fontSize, minTouch, radius, space } from '../../src/theme/tokens';

const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export default function NewTicket() {
  const router = useRouter();
  const { draft, status, message, fieldErrors, persistError, update, submit, discard } =
    useDraftStore();
  const categories = useLoad(() => ticketRepository.listCategories(), []);
  const sending = status === 'sending';

  async function onSend() {
    const result = await submit();
    if (result.ok)
      router.replace({ pathname: '/tickets/[id]', params: { id: result.ticket.id, created: '1' } });
  }

  function onDiscard() {
    Alert.alert('Discard this draft?', 'The text you entered will be deleted from this device.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
    ]);
  }

  const showStatus = !!draft && !draftIsBlank(draft);
  return (
    <Screen>
      <ScreenHeader title="New ticket" />
      {showStatus && status === 'local_draft' ? (
        <Notice tone="info">Local draft — saved on this device. Not sent yet.</Notice>
      ) : null}
      {status === 'sending' ? <Notice tone="info">Sending your ticket…</Notice> : null}
      {status === 'send_failed' ? (
        <Notice tone="warning">
          Not confirmed — your draft is saved on this device. Sending again will not create a
          duplicate.
        </Notice>
      ) : null}
      {message ? (
        <Notice tone={status === 'send_failed' ? 'danger' : 'warning'}>{message}</Notice>
      ) : null}
      {persistError ? (
        <Notice tone="warning">Couldn't save your draft on this device.</Notice>
      ) : null}

      <AppTextField
        label="Title"
        value={draft?.title ?? ''}
        onChangeText={(v) => update({ title: v })}
        error={fieldErrors.title}
        editable={!sending}
      />
      <AppTextField
        label="Description"
        value={draft?.description ?? ''}
        onChangeText={(v) => update({ description: v })}
        error={fieldErrors.description}
        multiline
        editable={!sending}
      />

      <View style={{ gap: space[2] }}>
        <Text style={styles.label}>Category</Text>
        {categories.state.status === 'loading' ? (
          <LoadingState message="Loading categories…" />
        ) : null}
        {categories.state.status === 'error' ? (
          <ErrorState
            title="Couldn't load categories"
            body={categories.state.error.message}
            onRetry={categories.retry}
          />
        ) : null}
        {categories.state.status === 'ready' && categories.state.data.length === 0 ? (
          <EmptyState title="No categories available" body="Ask your administrator to add one." />
        ) : null}
        {categories.state.status === 'ready' ? (
          <View style={styles.chips} accessibilityRole="radiogroup">
            {categories.state.data.map((c) => {
              const on = draft?.categoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: sending }}
                  disabled={sending}
                  onPress={() => update({ categoryId: c.id })}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && { color: colors.textInverse }]}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {fieldErrors.category ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {fieldErrors.category}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space[2] }}>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {PRIORITIES.map((p) => {
            const on = (draft?.priority ?? 'normal') === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: sending }}
                disabled={sending}
                onPress={() => update({ priority: p })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && { color: colors.textInverse }]}>
                  {PRIORITY_LABEL[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <AppButton title="Send ticket" onPress={onSend} loading={sending} disabled={!draft} />
      {showStatus && !sending ? (
        <AppButton title="Discard draft" variant="outline" onPress={onDiscard} />
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: minTouch,
    paddingHorizontal: space[4],
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brand700, borderColor: colors.brand700 },
  chipText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  error: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.danger },
});
