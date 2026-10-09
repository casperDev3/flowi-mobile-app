/**
 * «Прийняти / Відхилити» для запрошення в проєкт (decision 7) — і в картці
 * центру сповіщень (`project.invite_pending`), і на екрані «Запрошення».
 *
 * Після відповіді кнопки змінюються на підсумок («Ви приєдналися» з
 * переходом у проєкт / «Запрошення відхилено»): сервер архівує картку, але
 * інбокс перечитується не миттєво — людина не мусить гадати, чи спрацювало.
 */
import { Atlas } from '@/constants/atlas';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { respondToInvite, type InviteDecision } from '@/store/invite-inbox';
import { inviteFailureText } from '@/store/invite-messages';
import { haptic } from '@/utils/haptics';

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

export function InviteActions({ inviteId, accent, text, sub, border, onDone }: Props) {
  const { tr } = useI18n();
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
        <IconSymbol name="checkmark.circle.fill" size={16} color="#10B981" />
        <Text style={[st.result, { color: text }]}>{tr.inviteAcceptedShort}</Text>
        {state.projectId ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/project/[id]/overview', params: { id: state.projectId! } } as never)}
            accessibilityRole="button"
            style={[st.btn, { backgroundColor: accent, flex: 0, paddingHorizontal: 14 }]}>
            <Text style={st.btnPrimaryText}>{tr.inviteJoinedOpenProject}</Text>
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
        style={[st.btn, { backgroundColor: accent, opacity: busy ? 0.7 : 1 }]}>
        {busy && state.decision === 'accept'
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={st.btnPrimaryText}>{tr.inviteAccept}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={confirmDecline}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy: busy && state.decision === 'decline' }}
        style={[st.btn, { borderWidth: 1, borderColor: border, opacity: busy ? 0.7 : 1 }]}>
        {busy && state.decision === 'decline'
          ? <ActivityIndicator color={sub} size="small" />
          : <Text style={[st.btnText, { color: text }]}>{tr.inviteDecline}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { flex: 1, minHeight: 44, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnText: { fontSize: 14, fontWeight: '700' },
  result: { flex: 1, fontSize: 13, fontWeight: '600' },
});
