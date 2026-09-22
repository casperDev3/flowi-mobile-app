import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { formatDuration } from '@/utils/durationFormat';
import {
  columnDistribution,
  deadlineLoad,
  doneByWeek,
  tasksForProjects,
  timeByProject,
  weekLabel,
  type ChartProjectLike,
  type ChartTaskLike,
  type WeekPoint,
} from '@/utils/projectCharts';
import type { TaskStatusColumn } from '@/utils/taskStatuses';

/** Зелений — той самий, яким усюди в застосунку позначено завершене. */
const DONE_COLOR = '#10B981';

export interface AnalyticsPalette {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
}

/**
 * Аналітика панелі проєктів — RN-версія веб-компонента
 * (flowi-web-app/components/projects/project-analytics.tsx).
 *
 * Набір графіків підібраний за одним критерієм — які поля в цих даних СПРАВДІ
 * заповнені. Колонка дошки є в кожної задачі, дедлайн — майже в кожної,
 * журнал і сесії таймера — там, де з задачею працювали. Тому графіки саме про
 * них, а не про оцінки в годинах чи відсоток готовності, яких ніхто не
 * заповнює.
 *
 * Компонент не рахує НІЧОГО: усі формули — в utils/projectCharts.ts, під
 * тестами й дослівно однакові з вебом. Це не стилістична вимога: два клієнти,
 * які показують різні цифри по одному проєкту, гірші за один клієнт без
 * графіків — не видно, котрий бреше.
 */
export function ProjectAnalytics({
  projects, tasks, columns, scopeLabel, palette,
}: {
  /** Проєкти видимого списку — живі або архівні, залежно від вкладки. */
  projects: ChartProjectLike[];
  tasks: ChartTaskLike[];
  columns: TaskStatusColumn[];
  scopeLabel: string;
  palette: AnalyticsPalette;
}) {
  const { tr } = useI18n();
  // '' — усі проєкти списку. Порожній рядок, а не null: значення слугує ще й
  // ключем чипа, і сентинель довелося б конвертувати в обидва боки.
  const [selected, setSelected] = useState('');

  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const months = tr.monthsShort;

  const scopeIds = useMemo(() => projects.map(project => project.id), [projects]);
  const focus = useMemo(
    () => (selected && scopeIds.includes(selected) ? [selected] : scopeIds),
    [selected, scopeIds],
  );

  const focusTasks = useMemo(() => tasksForProjects(tasks, focus), [tasks, focus]);
  // Час рахується по ВСЬОМУ списку, а не по вибраному проєкту: цей графік
  // відповідає на «куди йшов час», а одна смуга ні з чим не порівнюється.
  const scopeTasks = useMemo(() => tasksForProjects(tasks, scopeIds), [tasks, scopeIds]);

  // Порожній набір дає порожню воронку — чотири незаповнені жолоби. Це не
  // відповідь на «де стоять задачі», а видимість графіка; краще сказати
  // словами, що задач немає.
  const columnSlices = useMemo(
    () => (focusTasks.length ? columnDistribution(focusTasks, columns) : []),
    [focusTasks, columns],
  );
  const done = useMemo(() => doneByWeek(focusTasks), [focusTasks]);
  const load = useMemo(() => deadlineLoad(focusTasks), [focusTasks]);
  const time = useMemo(() => timeByProject(projects, scopeTasks), [projects, scopeTasks]);

  if (!projects.length) return null;

  const focusLabel = selected
    ? projects.find(project => project.id === selected)?.name ?? scopeLabel
    : scopeLabel;

  return (
    <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 18 }}>
      <Text style={[st.heading, { color: palette.text }]}>{tr.projectAnalytics}</Text>
      <Text style={[st.note, { color: palette.sub, marginTop: 4 }]}>{tr.projectAnalyticsHint}</Text>

      {/* Селектор проєкту — чипи, а не випадайка: список короткий, а окрема
          модалка заради вибору одного значення тут коштувала б більше, ніж
          рядок, що скролиться. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7, paddingVertical: 12 }}>
        {[{ id: '', name: `${tr.all} (${projects.length})` }, ...projects].map(option => {
          const active = option.id === selected;
          return (
            <TouchableOpacity
              key={option.id || 'all'}
              onPress={() => setSelected(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[st.chip, {
                backgroundColor: active ? palette.accent + '18' : palette.dim,
                borderColor: active ? palette.accent : palette.border,
              }]}>
              <Text style={{ color: active ? palette.accent : palette.sub, fontSize: 12, fontWeight: '700' }}>
                {option.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Panel title={tr.chartColumns} hint={`${focusLabel} · ${tr.projectTasks}: ${focusTasks.length}`} palette={palette}>
        {/* Порядок смуг — порядок дошки, тож ряд читається як воронка.
            Колір кожної смуги — колір її колонки на канбані. */}
        <CategoryBars
          slices={columnSlices}
          format={value => String(value)}
          emptyLabel={tr.chartNoTasksInScope}
          palette={palette}
        />
      </Panel>

      <Panel title={tr.chartDoneWeeks} hint={`${focusLabel} · ${tr.projectDone}: ${done.total}`} palette={palette}>
        <WeekBars
          weeks={done.weeks}
          months={months}
          color={DONE_COLOR}
          label={tr.chartDoneWeeks}
          palette={palette}
        />
        <Footnotes
          palette={palette}
          items={[
            done.earlier ? `${tr.chartDoneEarlier}: ${done.earlier}` : '',
            done.undated ? `${tr.chartDoneUndated}: ${done.undated}` : '',
          ]}
        />
      </Panel>

      <Panel
        title={tr.chartDeadlinesAhead}
        hint={`${focusLabel} · ${load.weeks.length} ${tr.chartWeeksSpan}`}
        palette={palette}>
        {/* Стовпчики, а не лінія: кожен тиждень — самостійна сума задач, і
            лінія домалювала б перехід між тижнями, якого не існує. */}
        <WeekBars
          weeks={load.weeks}
          months={months}
          color={palette.accent}
          label={tr.chartDeadlinesAhead}
          palette={palette}
        />
        <Footnotes
          palette={palette}
          items={[
            load.overdue ? `${tr.chartOverdueDebt}: ${load.overdue}` : '',
            load.beyond ? `${tr.chartBeyondHorizon}: ${load.beyond}` : '',
            load.undated ? `${tr.chartNoDeadline}: ${load.undated}` : '',
          ]}
        />
      </Panel>

      <Panel title={tr.chartTimeSpent} hint={`${scopeLabel} · ${tr.chartTimerSessions}`} palette={palette}>
        <CategoryBars
          slices={time}
          format={value => formatDuration(value, durationUnits)}
          emptyLabel={tr.chartNoSessions}
          palette={palette}
        />
      </Panel>
    </View>
  );
}

function Panel({
  title, hint, palette, children,
}: {
  title: string;
  hint: string;
  palette: AnalyticsPalette;
  children: React.ReactNode;
}) {
  return (
    <View style={[st.panel, { borderColor: palette.border, backgroundColor: palette.dim }]}>
      <Text style={[st.panelTitle, { color: palette.sub }]}>{title}</Text>
      <Text style={[st.note, { color: palette.sub, marginBottom: 12, marginTop: 2 }]}>{hint}</Text>
      {children}
    </View>
  );
}

/**
 * Приписки під графіком.
 *
 * Це не дрібний шрифт заради дрібного шрифту: сюди йде все, що в даних Є, а в
 * стовпчики не потрапило. Без цього рядка графік мовчки применшує обсяг
 * роботи, і користувач бачить «цього місяця нічого не зроблено» там, де
 * насправді просто немає дат.
 */
function Footnotes({ items, palette }: { items: string[]; palette: AnalyticsPalette }) {
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <Text style={[st.note, { color: palette.sub, marginTop: 8 }]}>{visible.join(' · ')}</Text>
  );
}

interface Slice { key: string; label: string; value: number; share: number; color: string }

/**
 * Горизонтальні смуги за категоріями — колонки дошки й час за проєктами.
 *
 * Колір бере кожен слайс свій, а не один на весь графік: і колонки, і проєкти
 * УЖЕ мають колір в іншому місці застосунку (канбан, картка проєкту), і другий
 * тон тут читався б як інша сутність.
 *
 * Малюється звичайними View, як уся решта графіків на мобільному
 * (MiniBarChart, TrendChart, ProjectTimeline): прямокутник із шириною у
 * відсотках не вартий ані SVG, ані ще однієї залежності.
 */
function CategoryBars({
  slices, format, emptyLabel, palette,
}: {
  slices: Slice[];
  format: (value: number) => string;
  emptyLabel: string;
  palette: AnalyticsPalette;
}) {
  if (!slices.length) {
    return <Text style={[st.note, { color: palette.sub, paddingVertical: 8 }]}>{emptyLabel}</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      {slices.map(slice => (
        <View key={slice.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: '600', flex: 1 }}>
              {slice.label}
            </Text>
            <Text style={{ color: palette.sub, fontSize: 11, fontWeight: '700', marginLeft: 8 }}>
              {format(slice.value)}
            </Text>
          </View>
          <View style={[st.track, { backgroundColor: palette.border }]}>
            {/* Нульова категорія лишається порожнім жолобом, а не зникає:
                «на перевірці нуль» — це відповідь, а діра в потоці — ні. */}
            <View style={{ width: `${slice.share * 100}%`, height: '100%', borderRadius: 3, backgroundColor: slice.color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Ряд тижнів вертикальними стовпчиками.
 *
 * Таблиці поруч, як у вебі, тут немає — на телефоні їй немає де стояти. Замість
 * неї весь ряд озвучується одним підписом для читалки: без нього графік
 * лишається чисто візуальним, тобто недоступним.
 */
function WeekBars({
  weeks, months, color, label, palette,
}: {
  weeks: WeekPoint[];
  months: readonly string[];
  color: string;
  label: string;
  palette: AnalyticsPalette;
}) {
  const height = 70;
  const peak = Math.max(1, ...weeks.map(week => week.count));
  const spoken = weeks
    .map(week => `${weekLabel(week.weekStart, months)}: ${week.count}`)
    .join(', ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${label}. ${spoken}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 3 }}>
        {weeks.map(week => (
          <View key={week.weekStart} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
            <View
              style={{
                // Порожній тиждень лишається видимою рискою, а не зникає:
                // провал у ряді — це і є відповідь «нічого не закрили».
                height: week.count ? Math.max(4, (week.count / peak) * height) : 2,
                borderRadius: 3,
                backgroundColor: week.count ? color : palette.border,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 5 }}>
        {weeks.map(week => (
          <Text
            key={week.weekStart}
            numberOfLines={1}
            style={{
              flex: 1, textAlign: 'center', fontSize: 8,
              // Поточний тиждень позначено підписом, а не окремим кольором
              // стовпчика: колір тут уже зайнятий змістом графіка.
              fontWeight: week.current ? '800' : '600',
              color: week.current ? palette.text : palette.sub,
            }}>
            {weekLabel(week.weekStart, months)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  heading:    { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  chip:       { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  panel:      { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  panelTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  note:       { fontSize: 11, lineHeight: 15 },
  track:      { height: 6, borderRadius: 3, overflow: 'hidden' },
});
