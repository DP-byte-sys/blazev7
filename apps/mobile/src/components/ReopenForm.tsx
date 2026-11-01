import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { validateReason } from '../features/tickets/reply';
import { colors, fonts, fontSize, space } from '../theme/tokens';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { Notice } from './Notice';
import type { SendResult } from './ReplyForm';

/** Shown only for resolved tickets. A reason is required; it is visible to support in the ticket history. */
export function ReopenForm({ onReopen }: { onReopen: (reason: string) => Promise<SendResult> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sending) return;
    const problem = validateReason(reason);
    setFieldError(problem ?? undefined);
    if (problem) return;
    setSending(true);
    setError(null);
    const result = await onReopen(reason.trim());
    setSending(false);
    if (!result.ok) setError(result.message); // on success the ticket refreshes and this form disappears
  }

  if (!open) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Still need help? You can reopen this ticket and tell support why.
        </Text>
        <AppButton title="Reopen this ticket" variant="outline" onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <AppTextField
        label="Why are you reopening this ticket?"
        value={reason}
        onChangeText={(v) => {
          setReason(v);
          setFieldError(undefined);
        }}
        error={fieldError}
        multiline
        editable={!sending}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <AppButton title="Reopen ticket" onPress={() => void submit()} loading={sending} />
      <AppButton
        title="Cancel"
        variant="outline"
        disabled={sending}
        onPress={() => {
          setOpen(false);
          setError(null);
          setFieldError(undefined);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.textSecondary },
});
