/**
 * components/projects/ProjectZones.tsx — статична й динамічна зони екрана
 * «Проєкти» на ПЛАНШЕТІ (Layout System v2.4; паритет із вебом
 * project-zone-static.tsx / project-zone-details.tsx).
 *
 *   • ProjectZoneStatic  — «Портфель»: лічильники, прогрес портфеля,
 *     найближчі терміни (тап — вибрати проєкт), мої ролі. Стоїть поруч лише
 *     там, де вистачає ширини (ZoneLayout сам вирішує).
 *   • ProjectZoneDetails — зведення ВИБРАНОГО проєкту: статус, прогрес,
 *     терміни, команда, спринт, ключові задачі.
 *   • OpenProjectButton  — ЄДИНИЙ вхід у простір проєкту з екрана зон
 *     (картка й низ панелі): тап по картці лише вибирає.
 *
 * Телефон цих компонентів не бачить: там екран лишається як був (тап по
 * картці — одразу в проєкт).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KpiCounter, SegmentedProgress } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ProjectRole } from '@/constants/projectNav';
import { fontFamily, radius, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { projectStatusOf, type ProjectStats } from '@/utils/projectStats';
import type { PortfolioKpi, ProjectCounters, SprintCard } from '@/utils/projectStatsMetrics';

import { fillZone, useProjectZoneStrings } from './projectZoneStrings';
import type { KeyTaskLike, UpcomingDeadline } from './projectsZoneModel';
import { daysUntil } from './projectsZoneModel';

/** Коротка дата без року, коли рік поточний. */
function shortDate(iso: string, locale: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── «Відкрити проєкт» ───────────────────────────────────────────────────────

export function OpenProjectButton({ name, onPress, variant = 'secondary', block = false, testID }: {
  name: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** На всю ширину (низ панелі деталей). */
  block?: boolean;
  testID?: string;
}) {
  const { t } = useDS();
  const s = useProjectZoneStrings();
  const primary = variant === 'primary';
  const fg = primary ? t.text.onAction : t.text.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fillZone(s.openA11y, { name })}
      testID={testID}
      style={({ pressed }) => [
        st.openBtn,
        block ? { alignSelf: 'stretch', flex: 1 } : null,
        { backgroundColor: primary ? t.action.primary : t.surface.subtle, opacity: pressed ? 0.75 : 1 },
      ]}>
      <Text style={[st.openText, { color: fg }]}>{s.open}</Text>
      <IconSymbol name="arrow.up.right" size={14} color={fg} />
    </Pressable>
  );
}

// ─── Дрібниці ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  const { t } = useDS();
  return <Text accessibilityRole="header" style={[st.sectionTitle, { color: t.text.secondary }]}>{children}</Text>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useDS();
  return (
    <View style={[st.section, { borderTopColor: t.border.hairline }]}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Row({ label, value, bad }: { label: string; value: string | number; bad?: boolean }) {
  const { t, g } = useDS();
  return (
    <View style={st.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[st.rowLabel, { color: t.text.secondary }]}>{label}</Text>
      <Text numberOfLines={1} style={[st.rowValue, { color: bad ? g.accent.coral.ink : t.text.primary }]}>{value}</Text>
    </View>
  );
}

function Pill({ label, tone }: { label: string; tone: 'neutral' | 'danger' | 'warning' }) {
  const { t } = useDS();
  const bg = tone === 'danger' ? t.status.danger : tone === 'warning' ? t.accent.amber : t.surface.subtle;
  const fg = tone === 'neutral' ? t.text.secondary : t.text.onAccent;
  return (
    <View style={[st.pill, { backgroundColor: bg }]}>
      <Text style={[st.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─── Статична зона ───────────────────────────────────────────────────────────

export function ProjectZoneStatic({
  scopeLabel, kpi, atRisk, deadlines, roles, selectedId, locale, onSelect,
}: {
  scopeLabel: string;
  kpi: PortfolioKpi;
  atRisk: number;
  deadlines: UpcomingDeadline[];
  roles: { role: ProjectRole; count: number }[];
  selectedId: string | null;
  locale: string;
  onSelect: (projectId: string) => void;
}) {
  const { t, g } = useDS();
  const s = useProjectZoneStrings();
  return (
    <View style={st.staticRoot} testID="projects-static-zone">
      <View style={[st.staticCard, { backgroundColor: t.surface.card }]}>
        <Text accessibilityRole="header" style={[st.staticTitle, { color: t.text.primary }]}>{s.portfolio}</Text>
        <Text style={[st.staticSub, { color: t.text.secondary }]}>{scopeLabel}</Text>

        <View accessibilityLabel={s.portfolioA11y} style={{ gap: 12, marginTop: 16 }}>
          <KpiCounter value={kpi.projects} label={s.kpiProjects} />
          <KpiCounter value={atRisk} label={s.kpiAtRisk} valueColor={atRisk > 0 ? t.text.primary : undefined} />
          <KpiCounter value={kpi.overdue} label={s.kpiOverdue} valueColor={kpi.overdue > 0 ? g.accent.coral.ink : undefined} />
        </View>

        {kpi.total > 0 ? (
          <View style={{ marginTop: 16, gap: 6 }}>
            <View style={st.row}>
              <Text style={[st.rowLabel, { color: t.text.secondary }]}>{s.portfolioDone}</Text>
              <Text style={[st.rowLabel, { color: t.text.secondary, fontVariant: ['tabular-nums'] }]}>{kpi.done}/{kpi.total}</Text>
            </View>
            <SegmentedProgress
              value={kpi.pct / 100}
              segments={12}
              showValue
              accessibilityLabel={fillZone(s.portfolioProgressA11y, { pct: kpi.pct })}
            />
          </View>
        ) : null}
      </View>

      <View style={[st.staticCard, { backgroundColor: t.surface.card }]}>
        <SectionTitle>{s.deadlines}</SectionTitle>
        {deadlines.length ? (
          <View style={{ marginHorizontal: -8 }}>
            {deadlines.map(row => {
              const active = row.projectId === selectedId;
              const date = shortDate(row.date, locale);
              return (
                <Pressable
                  key={row.projectId}
                  onPress={() => onSelect(row.projectId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${row.name}: ${row.kind === 'project' ? s.deadlineProject : s.deadlineTask} ${date}`}
                  style={({ pressed }) => [
                    st.deadlineRow,
                    { backgroundColor: active || pressed ? t.surface.subtle : 'transparent' },
                  ]}>
                  <View style={[st.dot, { backgroundColor: row.color }]} />
                  <Text numberOfLines={1} style={[st.deadlineName, { color: t.text.primary }]}>{row.name}</Text>
                  <Text style={[st.deadlineDate, { color: t.text.secondary }]}>{date}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[st.muted, { color: t.text.secondary }]}>{s.noDeadlines}</Text>
        )}
      </View>

      {roles.length ? (
        <View style={[st.staticCard, { backgroundColor: t.surface.card }]}>
          <SectionTitle>{s.myRole}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {roles.map(item => (
              <View
                key={item.role}
                accessible
                accessibilityLabel={`${s.roles[item.role]}: ${item.count}`}
                style={[st.roleChip, { backgroundColor: t.surface.subtle }]}>
                <Text style={[st.pillText, { color: t.text.primary }]}>{s.roles[item.role]}</Text>
                <Text style={[st.pillText, { color: t.text.secondary, fontFamily: fontFamily.regular }]}>{item.count}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Динамічна зона ──────────────────────────────────────────────────────────

export function ProjectZoneDetails({
  stats, counters, sprint, sprintsEnabled, role, atRisk, keyTasks, now, locale,
}: {
  stats: ProjectStats;
  counters: ProjectCounters;
  sprint: SprintCard | null;
  sprintsEnabled: boolean;
  role: ProjectRole;
  atRisk: boolean;
  keyTasks: KeyTaskLike[];
  now: Date;
  locale: string;
}) {
  const { t, g } = useDS();
  const s = useProjectZoneStrings();
  const { project, total, done, pct, projectOverdue, archived, upcomingDeadline } = stats;
  const status = projectStatusOf(stats);
  const description = (project as { description?: string }).description;

  return (
    <View testID="projects-dynamic-zone" style={{ gap: 4 }}>
      <View style={st.detailHead}>
        <View style={[st.dotLg, { backgroundColor: project.color }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={[type.h2, { color: t.text.primary }]}>{project.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Pill
              label={atRisk ? s.atRisk : s.status[status]}
              tone={status === 'overdue' ? 'danger' : atRisk ? 'warning' : 'neutral'}
            />
            {archived ? <Pill label={s.archived} tone="neutral" /> : null}
          </View>
        </View>
      </View>

      {description ? (
        <Text numberOfLines={4} style={[st.description, { color: t.text.secondary }]}>{description}</Text>
      ) : null}

      <Section title={s.progress}>
        {total ? (
          <>
            <View style={[st.row, { alignItems: 'baseline' }]}>
              <Text style={[st.bigNum, { color: t.text.primary }]}>{pct}%</Text>
              <Text style={[st.rowLabel, { color: t.text.secondary, fontVariant: ['tabular-nums'] }]}>
                {fillZone(s.doneOf, { done, total })}
              </Text>
            </View>
            <SegmentedProgress
              value={pct / 100}
              accessibilityLabel={fillZone(s.projectProgressA11y, { name: project.name, pct })}
            />
            <Row label={s.inProgress} value={counters.inProgress} />
            <Row label={s.overdue} value={counters.overdue} bad={counters.overdue > 0} />
            {counters.unassigned > 0 ? <Row label={s.unassigned} value={counters.unassigned} /> : null}
            {sprintsEnabled && counters.backlog > 0 ? <Row label={s.backlog} value={counters.backlog} /> : null}
          </>
        ) : (
          <Text style={[st.muted, { color: t.text.secondary }]}>{s.noTasks}</Text>
        )}
      </Section>

      {project.deadline || upcomingDeadline ? (
        <Section title={s.dates}>
          {project.deadline ? (
            <Row label={s.projectDeadline} value={shortDate(project.deadline, locale)} bad={projectOverdue} />
          ) : null}
          {upcomingDeadline ? <Row label={s.nearestDeadline} value={shortDate(upcomingDeadline, locale)} /> : null}
        </Section>
      ) : null}

      <Section title={s.team}>
        <Row label={s.myRole} value={s.roles[role]} />
      </Section>

      {sprintsEnabled ? (
        <Section title={s.sprint}>
          {sprint ? (
            <>
              <Text numberOfLines={1} style={[st.rowValue, { color: t.text.primary, textAlign: 'left' }]}>{sprint.name}</Text>
              <SegmentedProgress
                value={sprint.pct / 100}
                segments={12}
                height={8}
                showValue
                accessibilityLabel={fillZone(s.sprintProgressA11y, { name: sprint.name, pct: sprint.pct })}
              />
            </>
          ) : (
            <Text style={[st.muted, { color: t.text.secondary }]}>{s.noSprint}</Text>
          )}
        </Section>
      ) : null}

      <Section title={s.keyTasks}>
        {keyTasks.length ? (
          keyTasks.map(task => {
            const days = daysUntil(task.deadline, now);
            const late = days !== null && days < 0;
            const date = task.deadline ? shortDate(task.deadline, locale) : '';
            return (
              <View
                key={task.id}
                style={st.taskRow}
                accessible
                accessibilityLabel={[task.title, date ? `${late ? s.overdue : s.nearestDeadline}: ${date}` : ''].filter(Boolean).join(', ')}>
                <Text numberOfLines={1} style={[st.taskTitle, { color: t.text.primary }]}>{task.title}</Text>
                {date ? (
                  <Text style={[st.deadlineDate, { color: late ? g.accent.coral.ink : t.text.secondary, fontFamily: late ? fontFamily.semibold : fontFamily.regular }]}>
                    {date}
                  </Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={[st.muted, { color: t.text.secondary }]}>{total ? s.allDone : s.noKeyTasks}</Text>
        )}
      </Section>
    </View>
  );
}

/** Липкий низ панелі: «Відкрити проєкт» (головна дія) + «Редагувати» власнику. */
export function ProjectZoneFooter({ name, onOpen, onEdit }: { name: string; onOpen: () => void; onEdit?: () => void }) {
  const { t } = useDS();
  const s = useProjectZoneStrings();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <OpenProjectButton name={name} onPress={onOpen} variant="primary" block testID="projects-dynamic-open" />
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={fillZone(s.editA11y, { name })}
          style={({ pressed }) => [st.openBtn, { backgroundColor: t.surface.subtle, opacity: pressed ? 0.75 : 1 }]}>
          <IconSymbol name="pencil" size={14} color={t.text.primary} />
          <Text style={[st.openText, { color: t.text.primary }]}>{s.edit}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  openBtn: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  openText: { fontSize: 14, fontFamily: fontFamily.semibold },
  sectionTitle: { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 6 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: fontFamily.regular },
  rowValue: { flexShrink: 1, fontSize: 14, fontFamily: fontFamily.semibold, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pill: { minHeight: 24, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  staticRoot: { gap: 12 },
  staticCard: { borderRadius: radius.card, padding: space.cardPaddingCompact },
  staticTitle: { fontSize: 17, fontFamily: fontFamily.semibold },
  staticSub: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8, borderRadius: radius.control },
  deadlineName: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
  deadlineDate: { fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLg: { width: 12, height: 12, borderRadius: 6, marginTop: 8 },
  muted: { fontSize: 13, fontFamily: fontFamily.regular },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 4 },
  description: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular, marginTop: 8 },
  bigNum: { fontSize: 32, fontFamily: fontFamily.light ?? fontFamily.regular, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: fontFamily.regular },
});
