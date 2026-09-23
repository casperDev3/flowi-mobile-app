/**
 * components/training/QuestFormSheet.tsx — квест тренера (training-module.md
 * §3.4): тип, метрика (метрики здоровʼя — із замком і поясненням), ціль,
 * дати, нагорода XP (клемпиться сервером до [10, 300]), кому.
 */
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { metricInfo, QUEST_METRICS, validateQuest } from '@/utils/trainingQuests';
import type { Quest, QuestMetric, TrainingMember } from '@/utils/trainingTypes';
import { XP_QUEST_MAX, XP_QUEST_MIN } from '@/utils/trainingXp';

import { Chip, Field, Notice, PrimaryButton, Stepper } from './TrainingBits';
import { TrainingSheet } from './TrainingSheet';
import { TG_ACCENT, TG_ERR, type TrainingColors } from './theme';

export function QuestFormSheet({ c, visible, quest, members, onClose, onSave, onArchive }: {
  c: TrainingColors;
  visible: boolean;
  quest: Quest | null;
  members: readonly TrainingMember[];
  onClose: () => void;
  onSave: (q: Quest) => void;
  onArchive?: () => void;
}) {
  const { tr } = useI18n();
  const [draft, setDraft] = useState<Quest | null>(quest);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !quest) return;
    setDraft(quest);
    setTarget(quest.targetValue != null ? String(quest.targetValue) : '');
    setError(null);
  }, [visible, quest]);

  if (!draft) return null;
  const measurable = draft.type === 'measurable';
  const info = metricInfo(draft.metric);
  const assignees = new Set((draft.assigneeIds ?? []).map(Number));
  const candidates = members.filter(m => m.role === 'member');

  const save = () => {
    const t = Number(target.replace(',', '.'));
    const q: Quest = measurable
      ? { ...draft, title: draft.title.trim(), targetValue: Number.isFinite(t) ? t : 0, unit: info ? tr[info.unitKey] : draft.unit }
      : { ...draft, title: draft.title.trim(), metric: undefined, targetValue: undefined, unit: undefined };
    if (!q.startDate) q.startDate = null;
    if (!q.dueDate) q.dueDate = null;
    const issues = validateQuest(q);
    if (issues.length) { setError(tr.tgQuestInvalid); return; }
    onSave(q);
  };

  const toggleAssignee = (id: number) => {
    const next = new Set(assignees);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDraft({ ...draft, assigneeIds: [...next] });
  };

  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={draft.title || tr.tgNewQuest}
      footer={(
        <>
          {onArchive ? <PrimaryButton label={tr.tgArchive} variant="soft" color={TG_ERR} onPress={onArchive} style={{ flex: 1 }} /> : null}
          <PrimaryButton label={tr.save} onPress={save} style={{ flex: 1 }} />
        </>
      )}>
      {error ? <Notice c={c} text={error} tone="error" /> : null}
      <Field c={c} label={tr.tgQuestTitle} value={draft.title} onChangeText={title => setDraft({ ...draft, title })} maxLength={200} />
      <Field c={c} label={tr.tgGroupDescription} value={draft.description ?? ''} onChangeText={description => setDraft({ ...draft, description })} multiline maxLength={1000} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip c={c} label={tr.tgQuestMeasurable} active={measurable} onPress={() => setDraft({ ...draft, type: 'measurable', metric: draft.metric ?? 'session_count' })} />
        <Chip c={c} label={tr.tgQuestCheckbox} active={!measurable} onPress={() => setDraft({ ...draft, type: 'checkbox' })} />
      </View>

      {measurable ? (
        <>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{tr.tgMetric}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {QUEST_METRICS.map(m => (
              <Chip
                key={m.metric}
                c={c}
                label={`${m.health ? '🔒 ' : ''}${tr[m.labelKey]}`}
                active={draft.metric === m.metric}
                onPress={() => setDraft({ ...draft, metric: m.metric as QuestMetric })}
              />
            ))}
          </View>
          {info?.health ? <Text style={{ color: c.sub, fontSize: 12, marginBottom: 10 }}>{tr.tgHealthMetricHint}</Text> : null}
          <Field
            c={c}
            label={`${tr.tgTarget}${info ? `, ${tr[info.unitKey]}` : ''}`}
            value={target}
            onChangeText={setTarget}
            keyboardType="numbers-and-punctuation"
          />
        </>
      ) : (
        <TouchableOpacity
          onPress={() => setDraft({ ...draft, photoRequired: !draft.photoRequired })}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!draft.photoRequired }}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <IconSymbol name={draft.photoRequired ? 'checkmark.square.fill' : 'square.dashed'} size={20} color={TG_ACCENT} />
          <Text style={{ color: c.text, fontSize: 15 }}>{tr.tgPhotoRequired}</Text>
        </TouchableOpacity>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field c={c} label={tr.tgStartDate} value={draft.startDate ?? ''} onChangeText={startDate => setDraft({ ...draft, startDate })}
          autoCapitalize="none" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
        <Field c={c} label={tr.tgDueDate} value={draft.dueDate ?? ''} onChangeText={dueDate => setDraft({ ...draft, dueDate })}
          autoCapitalize="none" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
      </View>
      <Stepper
        c={c}
        label={tr.tgXpReward}
        value={draft.xpReward ?? 100}
        step={10}
        min={XP_QUEST_MIN}
        max={XP_QUEST_MAX}
        onChange={xpReward => setDraft({ ...draft, xpReward })}
      />

      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>{tr.tgSelectMembers}</Text>
      <Chip c={c} label={tr.tgAllMembers} active={assignees.size === 0} onPress={() => setDraft({ ...draft, assigneeIds: [] })} />
      {candidates.map(m => {
        const on = assignees.has(m.user.id);
        return (
          <TouchableOpacity
            key={m.user.id}
            onPress={() => toggleAssignee(m.user.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={m.user.name || m.user.email}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconSymbol name={on ? 'checkmark.circle.fill' : 'circle'} size={20} color={on ? TG_ACCENT : c.faint} />
            <Text style={{ color: c.text, fontSize: 15 }}>{m.user.name || m.user.email}</Text>
          </TouchableOpacity>
        );
      })}
    </TrainingSheet>
  );
}
