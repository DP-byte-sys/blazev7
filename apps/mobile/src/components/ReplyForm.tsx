import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { validateReply } from '../features/tickets/reply';
import { colors, fonts, fontSize, space } from '../theme/tokens';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { Notice } from './Notice';

export type SendResult = { ok: true } | { ok: false; message: string };

/** Requester reply box. Nothing is shown as sent until the server confirms; the text is kept if sending fails. */
export function ReplyForm({ onSend }: { onSend: (body: string) => Promise<SendResult> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (sending) return; // blocks double-tap
    const problem = validateReply(text);
    setFieldError(problem ?? undefined);
    setSent(false);
    if (problem) return;
    setSending(true);
    setError(null);
    const result = await onSend(text.trim());
    setSending(false);
    if (result.ok) {
      setText('');
      setSent(true);
    } else {
      setError(result.message);
    }
  }

  return (
    <View style={styles.wrap}>
      <AppTextField
        label="Reply to support"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setSent(false);
          setFieldError(undefined);
        }}
        error={fieldError}
        multiline
        editable={!sending}
      />
      <Text style={styles.hint}>Support will see this reply. Please don't include passwords.</Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {sent ? <Notice tone="success">Reply sent.</Notice> : null}
      <AppButton title="Send reply" onPress={() => void submit()} loading={sending} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.textSecondary },
});
