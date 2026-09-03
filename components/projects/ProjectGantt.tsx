import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import type { GanttChart, GanttRow } from '@/utils/projectCharts';

/**
 * Ширина колонки з назвами. Вона НЕ їде разом зі шкалою.
 *
 * 112 на телефоні: 168, як у вебі на широкому, забрали б від 390pt половину
 * рядка, і на шкалу лишилась би смужка, у якій нічого не видно навіть після
 * скролу. На планшеті місця вистачає, тож там ширша — інакше назви задач
 * обрізаються там, де їх було б де показати.
 */
const LABEL_WIDTH_NARROW = 112;
const LABEL_WIDTH_WIDE = 168;
/** Скільки пікселів віддаємо одному дню, доки шкала не стане вужчою за екран. */
const PX_PER_DAY = 7;
/** Однакова для обох колонок — саме на ній тримається вирівнювання рядків. */
const ROW_HEIGHT = 24;
const BAR_HEIGHT = 10;
/** Крок і товщина штриха — ті самі 3/6, що в CSS-градієнті на вебі. */
const HATCH_STEP = 6;
const HATCH_WIDTH = 3;

export interface GanttPalette {
  text: string;
  sub: string;
  border: string;
}

/** Коротка дата «5 чер 26» мовою інтерфейсу. */
function shortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' });
}

/**
 * Діагональне штрихування смуги, у якої початок ВИГАДАНИЙ.
 *
 * У RN немає repeating-linear-gradient, тож штрих складається з окремих
 * повернутих прямокутників. Виглядає це надлишково для косметики — але це не
 * косметика: смуга з початком, узятим із дати створення, бреше про тривалість,
 * і штрихування — єдине, що робить цю брехню видимою. Блідість тут не
 * підходить: вона читається як «менш важливе» й плутається з приглушеною
 * завершеною задачею.
 *
 * Смуги малюються з відомою ПІКСЕЛЬНОЮ шириною (шкала має власну ширину під
 * скрол), тож кількість штрихів рахується точно, без вимірювання через layout.
 */
function Hatch({ width, height, color }: { width: number; height: number; color: string }) {
  // Штрих нахилений на 45°, тож він «з'їжджає» по горизонталі рівно на висоту
  // смуги — рахуємо з запасом на цю висоту з обох боків, інакше кути лишаються
  // порожніми.
  const count = Math.ceil((width + height * 2) / HATCH_STEP);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: index * HATCH_STEP - height,
            top: -height / 2,
            width: HATCH_WIDTH,
            height: height * 2,
            backgroundColor: color,
            transform: [{ rotateZ: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

/**
 * Легенда обов'язкова, а не декоративна: без пояснення штрихування смуга з
 * вигаданим початком читається просто як «інакше намальована».
 */
function Legend({
  estimated, total, palette, tr,
}: {
  estimated: number;
  total: number;
  palette: GanttPalette;
  tr: ReturnType<typeof useI18n>['tr'];
}) {
  const swatch = { width: 24, height: BAR_HEIGHT, borderRadius: 3 } as const;
  return (
    <View style={st.legend}>
      <View style={st.legendItem}>
        <View style={[swatch, { backgroundColor: palette.text, opacity: 0.75 }]} />
        <Text style={[st.legendText, { color: palette.sub }]}>{tr.ganttLegendReal}</Text>
      </View>
      <View style={st.legendItem}>
        <View style={[swatch, { borderWidth: 1, borderColor: palette.text, overflow: 'hidden' }]}>
          <Hatch width={24} height={BAR_HEIGHT} color={palette.text} />
        </View>
        <Text style={[st.legendText, { color: palette.sub }]}>
          {tr.ganttLegendEstimated}
          {estimated ? ` (${estimated}/${total})` : ''}
        </Text>
      </View>
      <View style={st.legendItem}>
        <View style={{ width: 1, height: 12, backgroundColor: palette.text, opacity: 0.6 }} />
        <Text style={[st.legendText, { color: palette.sub }]}>{tr.ganttToday}</Text>
      </View>
      <View style={st.legendItem}>
        <View style={[swatch, { width: 10, borderRadius: 5, backgroundColor: palette.border }]} />
        <Text style={[st.legendText, { color: palette.sub }]}>{tr.ganttLegendColor}</Text>
      </View>
    </View>
  );
}

/**
 * Діаграма Ганта по задачах проєкту — RN-версія веб-компонента
 * (flowi-web-app/components/projects/project-gantt.tsx).
 *
 * Скрол лише горизонтальний і лише ВСЕРЕДИНІ шкали: колонка назв лишається на
 * місці, а екран не їде вбік. Тому це дві сусідні колонки з однаковою висотою
 * рядка, а не одна таблиця, — і тому ScrollView обгортає саме праву колонку.
 *
 * Числа сюди приходять готовими з utils/projectCharts.buildGantt: компонент не
 * рахує ані меж вікна, ані часток, ані днів. Єдина арифметика тут —
 * переведення часток у пікселі, і вона потрібна саме для скролу.
 */
export function ProjectGantt({
  chart, wide, palette,
}: {
  chart: GanttChart;
  /** Планшет: місця під назви більше, тож колонка ширша. */
  wide: boolean;
  palette: GanttPalette;
}) {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  // Ширина видимої частини шкали. Доки її не виміряно, шкала все одно має
  // ширину з днів — просто без гарантії, що вона не вужча за екран.
  const [viewport, setViewport] = useState(0);

  const { rows, todayOffset } = chart;

  if (!rows.length) {
    return (
      <Text style={[st.note, { color: palette.sub, textAlign: 'center', paddingVertical: 18 }]}>
        {chart.skipped ? `${tr.ganttNoStartDate}: ${chart.skipped}` : tr.ganttNothingToDraw}
      </Text>
    );
  }

  const labelWidth = wide ? LABEL_WIDTH_WIDE : LABEL_WIDTH_NARROW;
  // Правий відступ — це місце під смугу, яка закінчується рівно на краю вікна:
  // їй ще домальовується мінімальна ширина, і без запасу вона щоразу вмикала б
  // скрол на порожньому місці.
  const width = Math.max(viewport - 8, chart.days * PX_PER_DAY);
  // Позначка впритул до краю вікна не несе інформації (край і так підписаний
  // датою), зате її підпис наїжджає на цю дату.
  const ticks = chart.ticks.filter(tick => tick.offset > 0.04 && tick.offset < 0.96);
  const gridHeight = rows.length * ROW_HEIGHT;

  return (
    <View>
      <Legend estimated={chart.estimated} total={rows.length} palette={palette} tr={tr} />

      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <View style={{ width: labelWidth, borderRightWidth: 1, borderRightColor: palette.border, paddingRight: 8 }}>
          {rows.map(row => (
            <View key={row.taskId} style={{ height: ROW_HEIGHT, justifyContent: 'center' }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  // Завершена задача приглушена й закреслена — той самий знак,
                  // що в списку задач і на картці проєкту.
                  color: row.done ? palette.sub : palette.text,
                  textDecorationLine: row.done ? 'line-through' : 'none',
                }}>
                {row.title}
              </Text>
            </View>
          ))}
          {/* Порожній рядок під вісь місяців — тримає вирівнювання колонок. */}
          <View style={{ height: ROW_HEIGHT }} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={event => setViewport(event.nativeEvent.layout.width)}
          style={{ flex: 1 }}>
          <View style={{ width, paddingRight: 8 }}>
            {ticks.map(tick => (
              <View
                key={tick.at}
                pointerEvents="none"
                style={{
                  position: 'absolute', top: 0, left: tick.offset * width,
                  width: 1, height: gridHeight, backgroundColor: palette.border,
                }}
              />
            ))}

            {todayOffset !== null ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute', top: 0, left: todayOffset * width,
                  width: 1, height: gridHeight, backgroundColor: palette.text, opacity: 0.6,
                }}
              />
            ) : null}

            {rows.map(row => {
              // Одноденна робота дає ширину майже нуль. Без цієї стелі вона
              // зникає зовсім, і рядок виглядає як порожній.
              const barWidth = Math.max(6, row.width * width);
              return (
                <View key={row.taskId} style={{ height: ROW_HEIGHT, justifyContent: 'center' }}>
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={barLabel(row, locale, tr)}
                    style={{
                      position: 'absolute',
                      left: row.offset * width,
                      top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                      width: barWidth,
                      height: BAR_HEIGHT,
                      borderRadius: 3,
                      opacity: row.done ? 0.55 : 1,
                      // Справжній старт — суцільна заливка. Вигаданий —
                      // прозоре тло з контуром і штрихуванням: контур утримує
                      // форму там, де штрих тонкий, інакше одноденна смуга
                      // розсипається на дві риски.
                      backgroundColor: row.startSource === 'startDate' ? row.color : 'transparent',
                      borderWidth: row.startSource === 'startDate' ? 0 : 1,
                      borderColor: row.color,
                      overflow: 'hidden',
                    }}>
                    {row.startSource === 'startDate' ? null : (
                      <Hatch width={barWidth} height={BAR_HEIGHT} color={row.color} />
                    )}
                  </View>
                </View>
              );
            })}

            <View style={{ height: ROW_HEIGHT }}>
              <Text style={[st.axis, { color: palette.sub, left: 0 }]}>{shortDate(chart.from, locale)}</Text>
              {ticks.map(tick => (
                <Text
                  key={tick.at}
                  numberOfLines={1}
                  style={[st.axis, { color: palette.sub, left: tick.offset * width - 20, width: 40, textAlign: 'center' }]}>
                  {tick.label}
                </Text>
              ))}
              <Text style={[st.axis, { color: palette.sub, right: 0 }]}>{shortDate(chart.to, locale)}</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {chart.hidden || chart.skipped ? (
        <Text style={[st.note, { color: palette.sub, marginTop: 8 }]}>
          {[
            chart.hidden ? `${tr.ganttHidden}: ${chart.hidden}` : '',
            chart.skipped ? `${tr.ganttNoStartDate}: ${chart.skipped}` : '',
          ].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Підпис смуги для читалки екрана.
 *
 * Веб поруч із діаграмою тримає ще й таблицю (`<details>` + `<table>`) — на
 * телефоні їй немає де стояти, тож уся інформація рядка йде сюди: період,
 * тривалість і — головне — звідки взявся кожен край. Без цього штрихування
 * лишається чисто візуальним знаком, тобто недоступним.
 */
function barLabel(row: GanttRow, locale: string, tr: ReturnType<typeof useI18n>['tr']): string {
  const start = row.startSource === 'startDate' ? tr.ganttStartExact : tr.ganttStartFromCreated;
  const end = row.endSource === 'deadline'
    ? tr.ganttEndDeadline
    : row.endSource === 'done' ? tr.ganttEndDone : tr.ganttEndOpen;
  return `${row.title}: ${shortDate(row.start, locale)} — ${shortDate(row.end, locale)}, `
    + `${row.days} ${tr.ganttDaysShort}, ${start}, ${end}`;
}

const st = StyleSheet.create({
  legend:     { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 5 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 10, fontWeight: '600', flexShrink: 1 },
  axis:       { position: 'absolute', top: 4, fontSize: 9, fontWeight: '600' },
  note:       { fontSize: 11, lineHeight: 15 },
});
