/**
 * components/projects/PortfolioKpi.tsx — дашборд портфеля над списком проєктів
 * (docs/specs/projects-analytics.md §8.3).
 *
 * Шість KPI і графік «Виконано за тиждень» по ВИДИМОМУ набору проєктів — тому
 * самому, що в списку («Живі / Архів»). Компонент нічого не рахує: числа
 * приходять готовими з utils/projectStatsMetrics.ts portfolioKpi().
 *
 * Телефон — плитки горизонтальним скролером (≈2,5 у видимій області: край
 * третьої підказує, що ряд їде далі). Планшет (≥600) — сітка з трьох колонок
 * без скролу. Згорнутість памʼятається ЛОКАЛЬНО на пристрої (вибір під
 * діагональ екрана), а не в ui_preferences.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { CHART_WEEKS } from '@/utils/projectCharts';
import type { PortfolioKpi as PortfolioKpiData } from '@/utils/projectStatsMetrics';

import { Footnotes, WeekBars, type AnalyticsPalette } from './ProjectAnalytics';

/** Локальний ключ згортання. Не синкається й не бекапиться — це вибір пристрою. */
export const PORTFOLIO_COLLAPSED_KEY = 'projects_portfolio_collapsed';

const DONE_COLOR = '#10B981';
const OVERDUE_COLOR = '#EF4444';
const TABLET_MIN_WIDTH = 600;

interface Tile {
  key: string;
  value: string;
  label: string;
  color?: string;
}

export function PortfolioKpi({ kpi, palette }: { kpi: PortfolioKpiData; palette: AnalyticsPalette }) {
  const { tr } = useI18n();
  const { width } = useWindowDimensions();
  const tablet = width >= TABLET_MIN_WIDTH;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadData<boolean>(PORTFOLIO_COLLAPSED_KEY, false)
      .then(value => { if (alive) setCollapsed(value === true); })
      .catch(() => { /* немає збереженого вибору — розгорнуто */ });
    return () => { alive = false; };
  }, []);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      saveData(PORTFOLIO_COLLAPSED_KEY, next).catch(() => { /* лише зручність */ });
      return next;
    });
  }, []);

  if (kpi.projects === 0) return null;

  const tiles: Tile[] = [
    { key: 'projects', value: String(kpi.projects), label: tr.portfolioProjects },
    { key: 'tasks', value: String(kpi.total), label: tr.portfolioTasks },
    { key: 'done', value: `${kpi.done} / ${kpi.pct}%`, label: tr.projectDone, color: DONE_COLOR },
    { key: 'inProgress', value: String(kpi.inProgress), label: tr.projectInProgress },
    {
      key: 'overdue', value: String(kpi.overdue), label: tr.projectOverdueTasks,
      // Червоний — лише коли справді є прострочене (правило карток).
      color: kpi.overdue > 0 ? OVERDUE_COLOR : undefined,
    },
    { key: 'unassigned', value: String(kpi.unassigned), label: tr.projectUnassigned },
  ];

  // Телефон: 2,5 плитки на ширину контенту (екран мінус поля списку по 20).
  const phoneTileWidth = Math.max(110, (Math.min(width, 720) - 40 - 2 * 8) / 2.5);

  const renderTile = (tile: Tile) => (
    <View
      key={tile.key}
      accessible
      // Число й підпис — ОДИН вузол для читалки, інакше «6» і «проєктів»
      // звучали б як два незвʼязані елементи.
      accessibilityLabel={`${tile.value} ${tile.label}`}
      style={[
        st.tile,
        { borderColor: palette.border, backgroundColor: palette.dim },
        tablet ? { flexBasis: '31%', flexGrow: 1 } : { width: phoneTileWidth },
      ]}>
      <Text style={[st.tileValue, { color: tile.color ?? palette.text }]} numberOfLines={1}>{tile.value}</Text>
      <Text style={[st.tileLabel, { color: palette.sub }]} numberOfLines={2}>{tile.label}</Text>
    </View>
  );

  return (
    <View style={[st.wrap, { borderColor: palette.border }]}>
      <TouchableOpacity
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? tr.portfolioExpand : tr.portfolioCollapse}
        accessibilityState={{ expanded: !collapsed }}
        hitSlop={{ top: 8, bottom: 8 }}
        style={st.header}>
        <Text style={[st.title, { color: palette.text }]}>{tr.portfolioKpi}</Text>
        <IconSymbol name={collapsed ? 'chevron.down' : 'chevron.up'} size={14} color={palette.sub} />
      </TouchableOpacity>

      {collapsed ? null : (
        <>
          {tablet ? (
            <View style={st.grid}>{tiles.map(renderTile)}</View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {tiles.map(renderTile)}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 16, marginBottom: 8, gap: 8 }}>
            <Text style={[st.chartTitle, { color: palette.sub, flex: 1 }]}>{tr.doneByWeekTitle}</Text>
            <Text style={{ color: palette.sub, fontSize: 11 }}>
              {tr.portfolioWeeksTotal.replace('{n}', String(CHART_WEEKS)).replace('{count}', String(kpi.weekly.total))}
            </Text>
          </View>
          <WeekBars
            weeks={kpi.weekly.weeks}
            months={tr.monthsShort}
            color={DONE_COLOR}
            label={tr.doneByWeekTitle}
            palette={palette}
          />
          {/* Обовʼязковий рядок: без нього графік мовчки ховає частину даних. */}
          <Footnotes
            palette={palette}
            items={[
              tr.portfolioAvgWeekly.replace('{n}', formatAverage(kpi.avgWeekly)),
              kpi.weekly.earlier ? tr.portfolioEarlier.replace('{n}', String(kpi.weekly.earlier)) : '',
              kpi.weekly.undated ? tr.burndownNoDoneDate.replace('{n}', String(kpi.weekly.undated)) : '',
            ]}
          />
        </>
      )}
    </View>
  );
}

/** Середнє з одним знаком після коми; ціле — без «,0». */
function formatAverage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const st = StyleSheet.create({
  wrap:       { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 18 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 28 },
  title:      { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile:       { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  tileValue:  { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileLabel:  { fontSize: 11, marginTop: 2 },
  chartTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
