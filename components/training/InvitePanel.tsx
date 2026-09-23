/**
 * components/training/InvitePanel.tsx — запрошення в групу для тренера
 * (training-module.md §1.5, §8.1): посилання з роллю й терміном дії, або
 * одразу за email наявного акаунта; активні посилання з відкликанням.
 *
 * Інвайт може вести на роль `coach` (основний тренер + асистент — це
 * нормальний сценарій, §1.5). Токен/посилання сервер віддає лише в
 * одній відповіді — показуємо й даємо поділитись одразу.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { isoToLocalDateInput } from '@/utils/dateUtils';
import { copyTextToClipboard } from '@/utils/clipboard';
import {
  createTrainingInviteLink,
  inviteTrainingMemberByEmail,
  isOffline,
  listTrainingInvites,
  revokeTrainingInvite,
  trainingErrorCode,
} from '@/utils/trainingApi';
import type { TrainingInvite, TrainingRole } from '@/utils/trainingTypes';

import { Card, Chip, Field, Notice, PrimaryButton, SectionTitle } from './TrainingBits';
import { fmt, TG_ERR, type TrainingColors } from './theme';

const EXPIRY = [
  { hours: 24, key: 'tgHours24' as const },
  { hours: 168, key: 'tgDays7' as const },
  { hours: 720, key: 'tgDays30' as const },
];

export function InvitePanel({ c, groupId, onMemberAdded }: {
  c: TrainingColors;
  groupId: string;
  onMemberAdded: () => void;
}) {
  const { tr } = useI18n();
  const [mode, setMode] = useState<'link' | 'email'>('link');
  const [role, setRole] = useState<TrainingRole>('member');
  const [hours, setHours] = useState(168);
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<TrainingInvite | null>(null);
  const [invites, setInvites] = useState<TrainingInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try { setInvites(await listTrainingInvites(groupId)); } catch (e) {
      if (__DEV__) console.warn('[training] invites failed', e);
    }
  }, [groupId]);
  useEffect(() => { void load(); }, [load]);

  const explain = (e: unknown) => {
    if (isOffline(e)) return tr.tgOfflineNotice;
    const code = trainingErrorCode(e);
    if (code === 'user_not_found') return tr.tgUserNotFound;
    if (code === 'already_member') return tr.tgAlreadyInGroup;
    return tr.tgErrorGeneric;
  };

  const createLink = async () => {
    setBusy(true); setMsg(null);
    try {
      const inv = await createTrainingInviteLink(groupId, role, hours);
      setCreated(inv);
      void load();
    } catch (e) {
      setMsg({ text: explain(e), tone: 'error' });
    } finally { setBusy(false); }
  };

  const addByEmail = async () => {
    setBusy(true); setMsg(null);
    try {
      await inviteTrainingMemberByEmail(groupId, role, email);
      setEmail('');
      setMsg({ text: tr.tgMemberAdded, tone: 'info' });
      onMemberAdded();
    } catch (e) {
      setMsg({ text: explain(e), tone: 'error' });
    } finally { setBusy(false); }
  };

  const link = created?.url ?? created?.deep_link ?? '';

  return (
    <View>
      <SectionTitle c={c}>{tr.tgInvite}</SectionTitle>
      <Card c={c}>
        {msg ? <Notice c={c} text={msg.text} tone={msg.tone} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip c={c} label={tr.tgInviteLink} active={mode === 'link'} onPress={() => setMode('link')} icon="link" />
          <Chip c={c} label={tr.tgInviteByEmail} active={mode === 'email'} onPress={() => setMode('email')} icon="paperplane" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip c={c} label={tr.tgRoleMember} active={role === 'member'} onPress={() => setRole('member')} />
          <Chip c={c} label={tr.tgRoleCoach} active={role === 'coach'} onPress={() => setRole('coach')} />
        </View>
        {mode === 'link' ? (
          <>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{tr.tgExpiresIn}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {EXPIRY.map(x => <Chip key={x.hours} c={c} label={tr[x.key]} active={hours === x.hours} onPress={() => setHours(x.hours)} />)}
            </View>
            <PrimaryButton label={tr.tgCreateLink} icon="link" onPress={() => { void createLink(); }} busy={busy} />
            {link ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={{ color: c.sub, fontSize: 12 }}>{tr.tgLinkCreated}</Text>
                <Text selectable style={{ color: c.text, fontSize: 13 }}>{link}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton label={tr.tgShare} icon="square.and.arrow.up" variant="soft" style={{ flex: 1 }}
                    onPress={() => { Share.share({ message: link }).catch(() => undefined); }} />
                  <PrimaryButton label={tr.tgCopy} icon="doc.on.doc" variant="soft" style={{ flex: 1 }}
                    onPress={() => { void copyTextToClipboard(link).then(ok => ok && setMsg({ text: tr.tgCopied, tone: 'info' })); }} />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Field c={c} label={tr.tgEmail} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <PrimaryButton label={tr.tgInvite} icon="person.badge.plus" onPress={() => { void addByEmail(); }} busy={busy} disabled={!email.includes('@')} />
          </>
        )}
      </Card>

      {invites.length ? (
        <>
          <SectionTitle c={c}>{tr.tgActiveInvites}</SectionTitle>
          <Card c={c}>
            {invites.map((inv, i) => (
              <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{inv.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember}</Text>
                  <Text style={{ color: c.sub, fontSize: 12 }}>
                    {`${isoToLocalDateInput(inv.expires_at)} · ${fmt(tr.tgInviteUses, { uses: inv.max_uses ? `${inv.uses}/${inv.max_uses}` : inv.uses })}`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { void revokeTrainingInvite(groupId, inv.id).then(load).catch(() => undefined); }}
                  accessibilityRole="button"
                  accessibilityLabel={tr.tgRevoke}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="xmark.circle.fill" size={20} color={TG_ERR} />
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}
