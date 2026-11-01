/**
 * «Прийняти / Відхилити» для запрошення в проєкт (decision 7) — і в картці
 * центру сповіщень (`project.invite_pending`), і на екрані «Запрошення».
 *
 * Після відповіді кнопки змінюються на підсумок («Ви приєдналися» з
 * переходом у проєкт / «Запрошення відхилено»): сервер архівує картку, але
 * інбокс перечитується не миттєво — людина не мусить гадати, чи спрацювало.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { respondToInvite, type InviteDecision } from '@/store/invite-inbox';
import { inviteFailureText } from '@/store/invite-messages';
import { haptic } from '@/utils/haptics';
import { fontFamily } from '@/constants/theme';
import { useDSTheme } from '@/components/shared/useDSTheme';

interface Props {
  inviteId: string;
  accent: string;
  text: string;
  sub: string;
  border: string;
  /** Викликається після будь-якої відповіді (успіх чи «запрошення вже неактуальне»). */
  onDone?: (decision: InviteDecision, ok: boolean) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'busy'; decision: InviteDecision }
  | { kind: 'accepted'; projectId: string | null }
  | { kind: 'declined' }
  | { kind: 'gone'; message: string };

export function InviteActions({ inviteId, accent: _accent, text, sub, border: _border, onDone }: Props) {
  const { tr } = useI18n();
  // DS v2: «Прийняти» — pill action.primary, «Відхилити» — вторинна pill.
  const { t } = useDSTheme();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const respond = useCallback(async (decision: InviteDecision) => {
    setState({ kind: 'busy', decision });
    const result = await respondToInvite(inviteId, decision);
    if (result.ok) {
      haptic.success();
      setState(decision === 'accept' ? { kind: 'accepted', projectId: result.projectId } : { kind: 'declined' });
      onDone?.(decision, true);
      return;
    }
    haptic.error();
    if (result.failure.kind === 'offline' || result.failure.kind === 'other') {
      // Тимчасовий збій — кнопки лишаються, можна повторити.
      setState({ kind: 'idle' });
      Alert.alert(tr.error, inviteFailureText(result.failure, tr));
      return;
    }
    setState({ kind: 'gone', message: inviteFailureText(result.failure, tr) });
    onDone?.(decision, false);
  }, [inviteId, onDone, tr]);

  const confirmDecline = useCallback(() => {
    Alert.alert(tr.inviteDeclineConfirmTitle, tr.inviteDeclineConfirmMsg, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.inviteDecline, style: 'destructive', onPress: () => { void respond('decline'); } },
    ]);
  }, [respond, tr]);

  if (state.kind === 'accepted') {
    return (
      <View style={st.row}>
        <IconSymbol name="checkmark.circle.fill" size={16} color={t.status.success} />
        <Text style={[st.result, { color: text }]}>{tr.inviteAcceptedShort}</Text>
        {state.projectId ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/project/[id]/overview', params: { id: state.projectId! } } as never)}
            accessibilityRole="button"
            style={[st.btn, { backgroundColor: t.action.primary, flex: 0, paddingHorizontal: 20 }]}>
            <Text style={[st.btnPrimaryText, { color: t.text.onAction }]}>{tr.inviteJoinedOpenProject}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  if (state.kind === 'declined' || state.kind === 'gone') {
    return (
      <View style={st.row} accessibilityLiveRegion="polite">
        <IconSymbol name={state.kind === 'declined' ? 'xmark' : 'exclamationmark.circle'} size={14} color={sub} />
        <Text style={[st.result, { color: sub }]}>{state.kind === 'declined' ? tr.inviteDeclinedShort : state.message}</Text>
      </View>
    );
  }

  const busy = state.kind === 'busy';
  return (
    <View style={st.row}>
      <TouchableOpacity
        onPress={() => { void respond('accept'); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy: busy && state.decision === 'accept' }}
        style={[st.btn, { backgroundColor: t.action.primary, opacity: busy ? 0.7 : 1 }]}>
        {busy && state.decision === 'accept'
          ? <ActivityIndicator color={t.text.onAction} size="small" />
          : <Text style={[st.btnPrimaryText, { color: t.text.onAction }]}>{tr.inviteAccept}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={confirmDecline}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy: busy && state.decision === 'decline' }}
        style={[st.btn, { backgroundColor: t.surface.subtle, opacity: busy ? 0.7 : 1 }]}>
        {busy && state.decision === 'decline'
          ? <ActivityIndicator color={sub} size="small" />
          : <Text style={[st.btnText, { color: t.action.secondaryText }]}>{tr.inviteDecline}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnPrimaryText: { fontSize: 14, fontFamily: fontFamily.semibold },
  btnText: { fontSize: 14, fontFamily: fontFamily.semibold },
  result: { flex: 1, fontSize: 13, fontFamily: fontFamily.semibold },
});
