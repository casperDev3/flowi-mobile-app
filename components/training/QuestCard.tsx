/**
 * components/training/QuestCard.tsx — картка квеста (training-module.md §3.4).
 *
 * Учасник: вимірюваний — прогрес-бар (пише сервер), чек-завдання —
 * «Відмітити виконаним» (+ фото, якщо потрібне). Тренер: скільки учасників
 * закрили, «Перерахувати» для вимірюваного. Метрики здоровʼя — із замком:
 * тренер бачить лише «38 / 50», ніколи окремі записи.
 *
 * Фото (відкрите питання §11.5, варіант «а»): лише локальний шлях на
 * пристрої учасника. `expo-image-picker` у проєкті не встановлено — модуль
 * підключається умовно (CLAUDE.md, «Conditional native package»), а без
 * нього фото обирається системним вибором файлу.
 */
import * as DocumentPicker from 'expo-document-picker';
import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { formatMetricValue, metricInfo, progressFraction } from '@/utils/trainingQuests';
import type { Quest, QuestProgress } from '@/utils/trainingTypes';

import { Badge, Card, PrimaryButton, ProgressBar } from './TrainingBits';
import { fmt, TG_ACCENT, TG_OK, TG_XP, type TrainingColors } from './theme';

let ImagePicker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

/**
 * Фото для чек-квеста: галерея, якщо в збірці є `expo-image-picker`, інакше
 * системний вибір файлу зображення (`expo-document-picker`, вже в проєкті).
 */
export async function pickQuestPhoto(tr: Translations): Promise<string | null> {
  try {
    if (ImagePicker?.launchImageLibraryAsync) {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      return res?.canceled ? null : res?.assets?.[0]?.uri ?? null;
    }
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
    return res.canceled ? null : res.assets?.[0]?.uri ?? null;
  } catch {
    Alert.alert(tr.tgAddPhoto, tr.tgPhotoUnavailable);
    return null;
  }
}

export function questUnit(tr: Translations, q: Quest): string {
  const info = metricInfo(q.metric);
  return q.unit || (info ? tr[info.unitKey] : '');
}

export function QuestCard({ c, quest, progress, mode, doneCount, assigneeCount, onToggle, onRecompute, onEdit, busy }: {
  c: TrainingColors;
  quest: Quest;
  /** Мій прогрес (учасник) або null. */
  progress: QuestProgress | null;
  mode: 'member' | 'coach';
  doneCount?: number;
  assigneeCount?: number;
  onToggle?: (completed: boolean) => void;
  onRecompute?: () => void;
  onEdit?: () => void;
  busy?: boolean;
}) {
  const { tr } = useI18n();
  const info = metricInfo(quest.metric);
  const measurable = quest.type === 'measurable';
  const done = !!progress?.completed;
  const fraction = progressFraction(quest, progress);
  const unit = questUnit(tr, quest);

  return (
    <Card c={c} accent={done ? TG_OK : undefined} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: (done ? TG_OK : TG_ACCENT) + '22', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name={done ? 'checkmark.seal' : measurable ? 'chart.line.uptrend.xyaxis' : 'checklist'} size={18} color={done ? TG_OK : TG_ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{quest.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <Badge label={measurable ? tr.tgQuestMeasurable : tr.tgQuestCheckbox} color={c.sub} />
            <Badge label={`+${quest.xpReward ?? 0} XP`} color={TG_XP} />
            {quest.dueDate ? <Badge label={quest.dueDate} color={c.sub} /> : null}
            {info?.health ? <Badge label={`🔒 ${tr[info.labelKey]}`} color={c.sub} /> : null}
          </View>
          {quest.description ? <Text style={{ color: c.sub, fontSize: 13, marginTop: 6 }}>{quest.description}</Text> : null}
        </View>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel={tr.edit} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="pencil" size={16} color={c.sub} />
          </TouchableOpacity>
        ) : null}
      </View>

      {measurable && mode === 'member' ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          <ProgressBar c={c} fraction={fraction} color={done ? TG_OK : TG_ACCENT} />
          <Text style={{ color: c.sub, fontSize: 12 }}>
            {`${formatMetricValue(progress?.currentValue)} / ${formatMetricValue(quest.targetValue)} ${unit} · ${tr.tgQuestAuto}`}
          </Text>
        </View>
      ) : null}

      {mode === 'coach' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: c.sub, fontSize: 13 }}>
            {`${fmt(tr.tgDoneCount, { n: doneCount ?? 0 })}${assigneeCount ? ` / ${assigneeCount}` : ''}`}
            {measurable ? ` · ${tr[info?.labelKey ?? 'tgMetric']}: ${formatMetricValue(quest.targetValue)} ${unit}` : ''}
          </Text>
          {measurable && onRecompute ? (
            <PrimaryButton label={tr.tgRecompute} variant="soft" onPress={onRecompute} busy={busy} />
          ) : null}
        </View>
      ) : null}

      {!measurable && mode === 'member' && onToggle ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          {done && progress?.photoUri ? (
            <Text style={{ color: TG_OK, fontSize: 12 }}>{`📷 ${tr.tgPhotoAttached} · ${tr.tgPhotoLocalHint}`}</Text>
          ) : null}
          <PrimaryButton
            label={done ? tr.tgUndo : quest.photoRequired ? `${tr.tgMarkDone} · ${tr.tgAddPhoto}` : tr.tgMarkDone}
            icon={done ? 'arrow.uturn.backward' : quest.photoRequired ? 'camera.fill' : 'checkmark'}
            variant={done ? 'soft' : 'solid'}
            color={done ? c.sub : TG_OK}
            onPress={() => onToggle(!done)}
            busy={busy}
          />
        </View>
      ) : null}
    </Card>
  );
}
