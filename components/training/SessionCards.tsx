/**
 * components/training/SessionCards.tsx — «сьогоднішнє тренування» великою
 * карткою, тиждень стрічкою, картка стріку й XP (training-module.md §10.1).
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { formatKg } from '@/utils/trainingSessions';
import { multiplierBp } from '@/utils/trainingXp';
import type { SessionStatus, TrainingSession } from '@/utils/trainingTypes';

import { Card, PrimaryButton } from './TrainingBits';
import { fmt, TG_ACCENT, TG_ERR, TG_OK, TG_WARN, TG_XP, type TrainingColors } from './theme';

export function statusLabel(tr: Translations, status: SessionStatus | string): string {
  switch (status) {
    case 'completed': return tr.tgStatusCompleted;
    case 'partial': return tr.tgStatusPartial;
    case 'skipped': return tr.tgStatusSkipped;
    case 'missed': return tr.tgStatusMissed;
    default: return tr.tgStatusPlanned;
  }
}

export function statusColor(status: SessionStatus | string, c: TrainingColors): string {
  switch (status) {
    case 'completed': return TG_OK;
    case 'partial': return TG_WARN;
    case 'skipped':
    case 'missed': return TG_ERR;
    default: return c.sub;
  }
}

/** «пн, 6 жовтня» — дні тижня в словнику з понеділка. */
export function formatSessionDate(tr: Translations, day: string): string {
  const d = new Date(`${day}T12:00:00`);
  const wd = tr.weekdays[(d.getDay() + 6) % 7];
  return `${wd}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}`;
}

export function TodaySessionCard({ c, session, next, onOpen, noPlanText }: {
  c: TrainingColors;
  session: TrainingSession | null;
  next: TrainingSession | null;
  onOpen: (s: TrainingSession) => void;
  noPlanText: string;
}) {
  const { tr } = useI18n();
  if (!session) {
    return (
      <Card c={c}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconSymbol name="moon.fill" size={20} color={c.sub} />
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', flex: 1 }}>
            {next ? tr.tgRestDay : noPlanText}
          </Text>
        </View>
        {next ? (
          <TouchableOpacity onPress={() => onOpen(next)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
            <Text style={{ color: TG_ACCENT, fontSize: 14, fontWeight: '700' }}>
              {fmt(tr.tgNextSession, { date: `${formatSessionDate(tr, next.date)} · ${next.title || next.programName || ''}` })}
            </Text>
          </TouchableOpacity>
        ) : null}
      </Card>
    );
  }
  const open = session.status === 'planned';
  const color = statusColor(session.status, c);
  return (
    <Card c={c} accent={TG_ACCENT}>
      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{tr.tgTodaySession}</Text>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', marginTop: 6 }} numberOfLines={2}>
        {session.title || session.programName || tr.workoutsLabel}
      </Text>
      <Text style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>
        {[
          session.programName,
          fmt(tr.tgExercisesCount, { n: session.plannedExercises.length }),
          session.estimatedMin ? fmt(tr.tgMinutesShort, { n: session.estimatedMin }) : null,
        ].filter(Boolean).join(' · ')}
      </Text>
      <View style={{ marginTop: 10, gap: 4 }}>
        {session.plannedExercises.slice(0, 4).map(p => (
          <Text key={`${p.exerciseId}:${p.order}`} style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>
            {`• ${p.name} — ${p.sets ?? 1}×${p.reps}${p.weightG ? ` · ${formatKg(p.weightG)} ${tr.tgUnitKg}` : ''}`}
          </Text>
        ))}
      </View>
      {open ? (
        <PrimaryButton label={tr.tgStart} icon="play.fill" onPress={() => onOpen(session)} style={{ marginTop: 14 }} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <Text style={{ color, fontWeight: '800' }}>{statusLabel(tr, session.status)}</Text>
          <PrimaryButton label={tr.tgView} variant="soft" onPress={() => onOpen(session)} />
        </View>
      )}
    </Card>
  );
}

export function WeekStrip({ c, days, sessions, today, onOpen }: {
  c: TrainingColors;
  days: string[];
  sessions: readonly TrainingSession[];
  today: string;
  onOpen: (s: TrainingSession) => void;
}) {
  const { tr } = useI18n();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {days.map(day => {
        const s = sessions.find(x => x.date === day);
        const d = new Date(`${day}T12:00:00`);
        const isToday = day === today;
        const color = s ? statusColor(s.status, c) : c.faint;
        const label = `${formatSessionDate(tr, day)}${s ? `: ${s.title || ''} — ${statusLabel(tr, s.status)}` : `: ${tr.tgRestDayShort}`}`;
        return (
          <TouchableOpacity
            key={day}
            disabled={!s}
            onPress={() => s && onOpen(s)}
            accessibilityRole={s ? 'button' : 'text'}
            accessibilityLabel={label}
            style={{
              flex: 1, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4,
              borderWidth: 1, borderColor: isToday ? TG_ACCENT : c.border,
              backgroundColor: isToday ? TG_ACCENT + '18' : c.card,
            }}>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>{tr.weekdays[(d.getDay() + 6) % 7]}</Text>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{d.getDate()}</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s ? color : 'transparent', borderWidth: s ? 0 : 1, borderColor: c.border }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function StreakXpCard({ c, xpTotal, streakDays }: { c: TrainingColors; xpTotal: number; streakDays: number }) {
  const { tr } = useI18n();
  const mult = (multiplierBp(streakDays) / 10000).toFixed(1);
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Card c={c} style={{ flex: 1 }} accent={TG_WARN}>
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.tgStreak}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>
          {`🔥 ${fmt(tr.tgStreakDays, { n: streakDays })}`}
        </Text>
        <Text style={{ color: TG_WARN, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{fmt(tr.tgMultiplier, { x: mult })}</Text>
      </Card>
      <Card c={c} style={{ flex: 1 }} accent={TG_XP}>
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.tgXpTotal}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{`★ ${xpTotal}`}</Text>
      </Card>
    </View>
  );
}
