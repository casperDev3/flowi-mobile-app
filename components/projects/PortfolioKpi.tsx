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
import { fontFamily, radius, theme, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';
import { BentoCard } from '@/components/ds/Bento';

/** Локальний ключ згортання. Не синкається й не бекапиться — це вибір пристрою. */
export const PORTFOLIO_COLLAPSED_KEY = 'projects_portfolio_collapsed';

// DS v2: прострочене — coral-тік. Графік — нейтральні стовпці, поточний тиждень — lime (WeekBars).
const OVERDUE_COLOR = theme.light.accent.coral;
const TABLET_MIN_WIDTH = 600;

interface Tile {
  key: string;
  value: string;
  label: string;
  color?: string;
}

export function PortfolioKpi({ kpi, palette }: { kpi: PortfolioKpiData; palette: AnalyticsPalette }) {
  const { tr } = useI18n();
  const { t } = useDS();
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
    { key: 'done', value: `${kpi.done} / ${kpi.pct}%`, label: tr.projectDone },
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
        // Omni: вкладені плитки — суцільна subtle-підкладка на білій картці
        // (скляна subtle на суцільній картці не видна).
        { backgroundColor: t.surface.subtle },
        tablet ? { flexBasis: '31%', flexGrow: 1 } : { width: phoneTileWidth },
      ]}>
      {/* KPI — тонкі великі цифри; алерт — coral-тік ліворуч від числа. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {tile.color ? <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: tile.color }} /> : null}
        <Text style={[st.tileValue, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit>{tile.value}</Text>
      </View>
      <Text style={[st.tileLabel, { color: palette.sub }]} numberOfLines={2}>{tile.label}</Text>
    </View>
  );

  return (
    <BentoCard
      title={tr.portfolioKpi}
      icon="square.grid.2x2"
      accent="lavender"
      style={{ marginBottom: 16 }}
      headerRight={
        <TouchableOpacity
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? tr.portfolioExpand : tr.portfolioCollapse}
          accessibilityState={{ expanded: !collapsed }}
          hitSlop={4}
          style={[st.toggle, { backgroundColor: t.surface.subtle }]}>
          <IconSymbol name={collapsed ? 'chevron.down' : 'chevron.up'} size={14} color={palette.text} />
        </TouchableOpacity>
      }>
      {collapsed ? null : (
        <>
          {tablet ? (
            <View style={st.grid}>{tiles.map(renderTile)}</View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 2 }}>
              {tiles.map(renderTile)}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 16, marginBottom: 8, gap: 8 }}>
            <Text style={[st.chartTitle, { color: palette.sub, flex: 1 }]}>{tr.doneByWeekTitle}</Text>
            <Text style={[type.caption, type.numeric, { color: palette.sub }]}>
              {tr.portfolioWeeksTotal.replace('{n}', String(CHART_WEEKS)).replace('{count}', String(kpi.weekly.total))}
            </Text>
          </View>
          <WeekBars
            weeks={kpi.weekly.weeks}
            months={tr.monthsShort}
            color={glassOf(t).accent.lavender.fill}
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
    </BentoCard>
  );
}

/** Середнє з одним знаком після коми; ціле — без «,0». */
function formatAverage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const st = StyleSheet.create({
  toggle:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile:       { borderRadius: radius.nested, paddingHorizontal: 16, paddingVertical: 14 },
  tileValue:  { flexShrink: 1, fontSize: 32, lineHeight: 36, fontFamily: fontFamily.light, letterSpacing: -0.64, fontVariant: ['tabular-nums'] },
  tileLabel:  { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 4 },
  chartTitle: { fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.4, textTransform: 'uppercase' },
});
