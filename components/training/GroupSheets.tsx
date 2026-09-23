/**
 * components/training/GroupSheets.tsx — створення групи й приєднання за
 * запрошенням (training-module.md §8, §8.1).
 *
 * `JoinInvitePanel` спільний для аркуша на списку груп і для екрана
 * `app/training/invite.tsx` (відкривається з посилання): preview → accept.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { getCachedWorkspace } from '@/store/api-config';
import { useI18n } from '@/store/i18n';
import {
  acceptTrainingInvite,
  createTrainingGroup,
  previewTrainingInvite,
  trainingErrorCode,
} from '@/utils/trainingApi';
import { parseTrainingInvite, type ParsedTrainingInvite } from '@/utils/trainingQuests';
import { newTrainingId, upsertCachedGroup } from '@/utils/trainingSync';
import type { TrainingGroupSummary, TrainingInvitePreview } from '@/utils/trainingTypes';
import { PROGRAM_COLORS } from '@/utils/trainingPrograms';

import { Card, Chip, Field, Notice, PrimaryButton } from './TrainingBits';
import { TrainingSheet } from './TrainingSheet';
import { fmt, TG_ACCENT, type TrainingColors } from './theme';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv';
  } catch {
    return 'Europe/Kyiv';
  }
}

export function CreateGroupSheet({ visible, onClose, onCreated, c, scope }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (group: TrainingGroupSummary) => void;
  c: TrainingColors;
  scope: string;
}) {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(TG_ACCENT);
  const [weekStart, setWeekStart] = useState<0 | 1>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id генерується ОДИН раз на відкриття аркуша: повтор після мережевої
  // помилки має піти з тим самим id (сервер ідемпотентний за id).
  const [groupId, setGroupId] = useState(() => newTrainingId('g'));

  useEffect(() => {
    if (!visible) return;
    setName(''); setDescription(''); setColor(TG_ACCENT); setWeekStart(1); setError(null);
    setGroupId(newTrainingId('g'));
  }, [visible]);

  const create = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const group = await createTrainingGroup(groupId, {
        id: groupId, name: name.trim(), color, description: description.trim(),
        timezone: deviceTimezone(), weekStart, updatedAt: new Date().toISOString(),
      });
      await upsertCachedGroup(scope, group);
      onCreated(group);
    } catch (e) {
      const code = trainingErrorCode(e);
      setError(code === 'offline' || code === 'network' || code === 'timeout' ? tr.tgOfflineNotice : tr.tgErrorGeneric);
    } finally {
      setBusy(false);
    }
  }, [name, groupId, color, description, weekStart, scope, onCreated, tr]);

  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={tr.tgCreateGroup}
      footer={(
        <>
          <PrimaryButton label={tr.cancel} onPress={onClose} variant="soft" style={{ flex: 1 }} />
          <PrimaryButton label={tr.tgCreate} onPress={create} busy={busy} disabled={!name.trim()} style={{ flex: 1 }} />
        </>
      )}>
      {error && <Notice c={c} text={error} tone="error" />}
      <Field c={c} label={tr.tgGroupName} value={name} onChangeText={setName} placeholder={tr.tgGroupNamePlaceholder} maxLength={200} autoFocus />
      <Field c={c} label={tr.tgGroupDescription} value={description} onChangeText={setDescription} placeholder={tr.tgGroupDescriptionPlaceholder} maxLength={500} />
      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{tr.tgColor}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {PROGRAM_COLORS.map(col => (
          <Chip key={col} c={c} label="●" color={col} active={color === col} onPress={() => setColor(col)} accessibilityLabel={`${tr.tgColor} ${col}`} />
        ))}
      </View>
      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{tr.tgWeekStart}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip c={c} label={tr.tgWeekStartMon} active={weekStart === 1} onPress={() => setWeekStart(1)} />
        <Chip c={c} label={tr.tgWeekStartSun} active={weekStart === 0} onPress={() => setWeekStart(0)} />
      </View>
      <Text style={{ color: c.faint, fontSize: 12 }}>{`${tr.tgTimezone}: ${deviceTimezone()}`}</Text>
    </TrainingSheet>
  );
}

function sameOrigin(a: string | null, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const norm = (s: string) => s.trim().replace(/\/+$/, '').replace(/\/api$/, '').toLowerCase();
  return norm(a) === norm(b);
}

export function JoinInvitePanel({ c, initial, onJoined }: {
  c: TrainingColors;
  initial?: ParsedTrainingInvite | null;
  onJoined: (group: TrainingGroupSummary, alreadyMember: boolean) => void;
}) {
  const { tr } = useI18n();
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedTrainingInvite | null>(initial ?? null);
  const [preview, setPreview] = useState<TrainingInvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback((e: unknown) => {
    const code = trainingErrorCode(e);
    if (code === 'invite_invalid') return tr.tgInviteInvalid;
    if (code === 'invite_expired') return tr.tgInviteExpired;
    if (code === 'offline' || code === 'network' || code === 'timeout') return tr.tgOfflineNotice;
    return tr.tgErrorGeneric;
  }, [tr]);

  const check = useCallback(async (p: ParsedTrainingInvite | null) => {
    setPreview(null); setError(null);
    if (!p) { setError(tr.tgInviteInvalid); return; }
    const current = getCachedWorkspace()?.origin ?? null;
    if (!sameOrigin(p.ws, current)) {
      setError(fmt(tr.tgInviteOtherWorkspace, { ws: p.ws ?? '' }));
      return;
    }
    setParsed(p);
    setBusy(true);
    try {
      setPreview(await previewTrainingInvite(p.token));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }, [tr, explain]);

  useEffect(() => {
    if (initial) void check(initial);
    // Лише перший показ: повторна перевірка — кнопкою.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback(async () => {
    if (!parsed) return;
    setBusy(true); setError(null);
    try {
      const res = await acceptTrainingInvite(parsed.token);
      onJoined(res.group, res.already_member);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, onJoined, explain]);

  return (
    <View>
      {!initial && (
        <>
          <Field
            c={c}
            label={tr.tgInviteCodeLabel}
            value={input}
            onChangeText={setInput}
            placeholder={tr.tgInviteCodePlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PrimaryButton
            label={tr.tgInviteCheck}
            variant="soft"
            onPress={() => { void check(parseTrainingInvite(input)); }}
            disabled={!input.trim()}
            busy={busy && !preview}
          />
        </>
      )}
      {error && <View style={{ marginTop: 12 }}><Notice c={c} text={error} tone="error" /></View>}
      {preview && (
        <Card c={c} accent={preview.group.color || TG_ACCENT} style={{ marginTop: 12 }}>
          <Text style={{ color: c.sub, fontSize: 13 }}>{tr.tgInviteTo}</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginTop: 4 }}>{preview.group.name}</Text>
          <Text style={{ color: c.sub, fontSize: 13, marginTop: 6 }}>
            {fmt(tr.tgInviteAs, { role: preview.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember })}
          </Text>
          {preview.invited_by?.name ? (
            <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{fmt(tr.tgInviteFrom, { name: preview.invited_by.name })}</Text>
          ) : null}
          <PrimaryButton label={tr.tgInviteJoin} onPress={join} busy={busy} style={{ marginTop: 14 }} />
        </Card>
      )}
    </View>
  );
}

export function JoinGroupSheet({ visible, onClose, onJoined, c }: {
  visible: boolean;
  onClose: () => void;
  onJoined: (group: TrainingGroupSummary, alreadyMember: boolean) => void;
  c: TrainingColors;
}) {
  const { tr } = useI18n();
  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={tr.tgJoinGroup}
      footer={<PrimaryButton label={tr.cancel} onPress={onClose} variant="soft" style={{ flex: 1 }} />}>
      {visible ? <JoinInvitePanel c={c} onJoined={onJoined} /> : null}
    </TrainingSheet>
  );
}
