/**
 * components/training/SessionCards.tsx — «сьогоднішнє тренування» великою
 * карткою, тиждень стрічкою, картка стріку й XP (training-module.md §10.1).
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { BentoCard, useBentoColors } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { formatKg } from '@/utils/trainingSessions';
import { multiplierBp } from '@/utils/trainingXp';
import type { SessionStatus, TrainingSession } from '@/utils/trainingTypes';

import { Card, PrimaryButton } from './TrainingBits';
import { fmt, TG_ACCENT, TG_ERR, TG_OK, TG_WARN, TG_XP, type TrainingColors } from './theme';
import { fontFamily } from '@/constants/theme';

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
          <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, flex: 1 }}>
            {next ? tr.tgRestDay : noPlanText}
          </Text>
        </View>
        {next ? (
          <TouchableOpacity onPress={() => onOpen(next)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
            <Text style={{ color: TG_ACCENT, fontSize: 14, fontFamily: fontFamily.bold }}>
              {fmt(tr.tgNextSession, { date: `${formatSessionDate(tr, next.date)} · ${next.title || next.programName || ''}` })}
            </Text>
          </TouchableOpacity>
        ) : null}
      </Card>
    );
  }
  // Omni: сьогоднішнє тренування — ЄДИНА «темна» картка сторінки групи
  // (як Meeting card в Omni): білий текст, біла pill-дія.
  return (
    <BentoCard variant="dark" title={tr.tgTodaySession} icon="figure.run">
      <TodaySessionBody c={c} session={session} onOpen={onOpen} />
    </BentoCard>
  );
}

function TodaySessionBody({ c, session, onOpen }: {
  c: TrainingColors;
  session: TrainingSession;
  onOpen: (s: TrainingSession) => void;
}) {
  const { tr } = useI18n();
  const bc = useBentoColors();
  const open = session.status === 'planned';
  // Статус на темній картці — світлий текст, колір статусу лише в крапці.
  const color = statusColor(session.status, c);
  return (
    <>
      <Text style={{ color: bc.text, fontSize: 22, fontFamily: fontFamily.semibold }} numberOfLines={2}>
        {session.title || session.programName || tr.workoutsLabel}
      </Text>
      <Text style={{ color: bc.textSecondary, fontSize: 13, marginTop: 4 }}>
        {[
          session.programName,
          fmt(tr.tgExercisesCount, { n: session.plannedExercises.length }),
          session.estimatedMin ? fmt(tr.tgMinutesShort, { n: session.estimatedMin }) : null,
        ].filter(Boolean).join(' · ')}
      </Text>
      <View style={{ marginTop: 10, gap: 4 }}>
        {session.plannedExercises.slice(0, 4).map(p => (
          <Text key={`${p.exerciseId}:${p.order}`} style={{ color: bc.text, fontSize: 14 }} numberOfLines={1}>
            {`• ${p.name} — ${p.sets ?? 1}×${p.reps}${p.weightG ? ` · ${formatKg(p.weightG)} ${tr.tgUnitKg}` : ''}`}
          </Text>
        ))}
      </View>
      {open ? (
        <PrimaryButton label={tr.tgStart} icon="play.fill" onPress={() => onOpen(session)} color={bc.actionBg}
          style={{ marginTop: 14 }} textColor={bc.actionText} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ color: bc.text, fontFamily: fontFamily.semibold }}>{statusLabel(tr, session.status)}</Text>
          </View>
          <PrimaryButton label={tr.tgView} onPress={() => onOpen(session)} color={bc.actionBg} textColor={bc.actionText} />
        </View>
      )}
    </>
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
              flex: 1, minHeight: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 4,
              backgroundColor: isToday ? c.t.action.primary : c.chip,
            }}>
            <Text style={{ color: isToday ? c.t.text.onAction : c.sub, fontSize: 11, fontFamily: fontFamily.medium }}>{tr.weekdays[(d.getDay() + 6) % 7]}</Text>
            <Text style={{ color: isToday ? c.t.text.onAction : c.text, fontSize: 15, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
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
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.bold }}>{tr.tgStreak}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontFamily: fontFamily.semibold, marginTop: 4 }}>
          {`🔥 ${fmt(tr.tgStreakDays, { n: streakDays })}`}
        </Text>
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginTop: 2 }}>{fmt(tr.tgMultiplier, { x: mult })}</Text>
      </Card>
      <Card c={c} style={{ flex: 1 }} accent={TG_XP}>
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.bold }}>{tr.tgXpTotal}</Text>
        <Text style={{ color: c.text, fontSize: 24, fontFamily: fontFamily.semibold, marginTop: 4 }}>{`★ ${xpTotal}`}</Text>
      </Card>
    </View>
  );
}
