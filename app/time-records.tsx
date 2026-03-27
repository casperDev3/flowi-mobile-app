import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData } from '@/store/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  title: string;
  projectId?: string;
  timeEntries?: TaskTimeEntry[];
}

interface FlatEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  startedAt: Date;
  endedAt: Date;
  duration: number;
}

type Period = 'today' | 'week' | 'month' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сьогодні',
  week:  'Тиждень',
  month: 'Місяць',
  all:   'Весь час',
};

const MONTHS_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m || 0} хв`;
};

const fmtDurShort = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}г`;
  if (m > 0) return `${m}хв`;
  return '0';
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Сьогодні';
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  if (date.toDateString() === yest.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (period === 'week')  { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; }
  if (period === 'month') { const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; }
  return null;
}

// ─── Chart grouping ───────────────────────────────────────────────────────────

interface BarData { key: string; label: string; sublabel?: string; seconds: number; isToday?: boolean; }

function buildChartBars(entries: FlatEntry[], period: Period): BarData[] {
  const now = new Date();

  if (period === 'today') {
    // 24 hourly bars
    const map = new Map<number, number>();
    for (let h = 0; h < 24; h++) map.set(h, 0);
    for (const e of entries) map.set(e.startedAt.getHours(), (map.get(e.startedAt.getHours()) ?? 0) + e.duration);
    return Array.from(map.entries()).map(([h, s]) => ({
      key: String(h),
      label: `${String(h).padStart(2,'0')}`,
      seconds: s,
      isToday: false,
    }));
  }

  if (period === 'week') {
    // 7 daily bars (oldest → newest)
    const map = new Map<string, number>();
    const cursor = new Date(now); cursor.setDate(cursor.getDate() - 6); cursor.setHours(0,0,0,0);
    for (let i = 0; i < 7; i++) {
      map.set(dayKey(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const e of entries) {
      const k = dayKey(e.startedAt);
      if (map.has(k)) map.set(k, map.get(k)! + e.duration);
    }
    return Array.from(map.entries()).map(([k, s]) => {
      const [y, mo, d] = k.split('-').map(Number);
      const date = new Date(y, mo - 1, d);
      const dow = (date.getDay() + 6) % 7; // Mon=0
      const isToday = date.toDateString() === now.toDateString();
      return { key: k, label: WEEKDAYS[dow], sublabel: `${d}`, seconds: s, isToday };
    });
  }

  if (period === 'month') {
    // Group into ISO weeks (Mon–Sun) within the last 30 days
    const start = new Date(now); start.setDate(now.getDate() - 29); start.setHours(0,0,0,0);

    // Build week buckets: each bucket is the Monday of that week
    const weekMap = new Map<string, { seconds: number; dates: Date[] }>();
    const cursor = new Date(start);
    while (cursor <= now) {
      const dow = (cursor.getDay() + 6) % 7; // Mon=0
      const mon = new Date(cursor); mon.setDate(mon.getDate() - dow);
      const wk = dayKey(mon);
      if (!weekMap.has(wk)) weekMap.set(wk, { seconds: 0, dates: [] });
      weekMap.get(wk)!.dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const e of entries) {
      const dow = (e.startedAt.getDay() + 6) % 7;
      const mon = new Date(e.startedAt); mon.setDate(mon.getDate() - dow); mon.setHours(0,0,0,0);
      const wk = dayKey(mon);
      if (weekMap.has(wk)) weekMap.get(wk)!.seconds += e.duration;
    }

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, { seconds, dates }]) => {
        const [y, mo, d] = wk.split('-').map(Number);
        const mon = new Date(y, mo - 1, d);
        const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
        // Clamp to period range
        const rangeStart = dates[0];
        const rangeEnd = dates[dates.length - 1];
        const sameMonth = rangeStart.getMonth() === rangeEnd.getMonth();
        const label = sameMonth
          ? `${rangeStart.getDate()}–${rangeEnd.getDate()} ${MONTHS_SHORT[rangeStart.getMonth()]}`
          : `${rangeStart.getDate()} ${MONTHS_SHORT[rangeStart.getMonth()]}–${rangeEnd.getDate()} ${MONTHS_SHORT[rangeEnd.getMonth()]}`;
        const containsToday = dates.some(d2 => d2.toDateString() === now.toDateString());
        return { key: wk, label, seconds, isToday: containsToday };
      });
  }

  // 'all' — group by calendar month
  const monthMap = new Map<string, number>();
  for (const e of entries) {
    const k = `${e.startedAt.getFullYear()}-${String(e.startedAt.getMonth() + 1).padStart(2,'0')}`;
    monthMap.set(k, (monthMap.get(k) ?? 0) + e.duration);
  }
  if (monthMap.size === 0) return [];
  // Fill missing months between first and last
  const keys = Array.from(monthMap.keys()).sort();
  const [fy, fm] = keys[0].split('-').map(Number);
  const cursorM = new Date(fy, fm - 1, 1);
  const endM = new Date(now.getFullYear(), now.getMonth(), 1);
  const filled = new Map<string, number>();
  while (cursorM <= endM) {
    const k = `${cursorM.getFullYear()}-${String(cursorM.getMonth() + 1).padStart(2,'0')}`;
    filled.set(k, monthMap.get(k) ?? 0);
    cursorM.setMonth(cursorM.getMonth() + 1);
  }
  return Array.from(filled.entries()).map(([k, s]) => {
    const [y, mo] = k.split('-').map(Number);
    const isThisMonth = y === now.getFullYear() && mo === now.getMonth() + 1;
    return { key: k, label: MONTHS_SHORT[mo - 1], sublabel: mo === 1 || isThisMonth ? String(y) : undefined, seconds: s, isToday: isThisMonth };
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;

export default function TimeRecordsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [tasks, setTasks]       = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [period, setPeriod]     = useState<Period>('week');
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [filterTaskId, setFilterTaskId]       = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Project[]>('projects', []),
    ]).then(([t, p]) => { setTasks(t); setProjects(p); });
  }, []));

  const c = {
    bg1:    isDark ? '#0A0C18' : '#EEF0FF',
    bg2:    isDark ? '#121525' : '#E2E5FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,175,255,0.4)',
    text:   isDark ? '#EEEEFF' : '#1A1B33',
    sub:    isDark ? 'rgba(238,238,255,0.45)' : 'rgba(26,27,51,0.45)',
    accent: '#6366F1',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  // Flat list of completed entries with projectId
  const allEntries = useMemo<FlatEntry[]>(() => {
    const result: FlatEntry[] = [];
    for (const task of tasks) {
      for (const e of (task.timeEntries ?? [])) {
        if (!e.endedAt) continue;
        result.push({
          id: e.id,
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.projectId ?? null,
          startedAt: new Date(e.startedAt),
          endedAt: new Date(e.endedAt),
          duration: e.duration,
        });
      }
    }
    return result.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }, [tasks]);

  // Filter by period
  const periodFiltered = useMemo(() => {
    const start = periodStart(period);
    return start ? allEntries.filter(e => e.startedAt >= start) : allEntries;
  }, [allEntries, period]);

  // Projects active in this period
  const activeProjects = useMemo(() => {
    const ids = new Set(periodFiltered.map(e => e.projectId).filter(Boolean));
    return projects.filter(p => ids.has(p.id));
  }, [periodFiltered, projects]);

  // Tasks active in this period (under selected project if any)
  const activeTasks = useMemo(() => {
    const base = filterProjectId
      ? periodFiltered.filter(e => e.projectId === filterProjectId)
      : periodFiltered;
    const ids = new Set(base.map(e => e.taskId));
    return tasks.filter(t => ids.has(t.id));
  }, [periodFiltered, filterProjectId, tasks]);

  // Final filter: period → project → task
  const filtered = useMemo(() => {
    let es = periodFiltered;
    if (filterProjectId) es = es.filter(e => e.projectId === filterProjectId);
    if (filterTaskId)    es = es.filter(e => e.taskId === filterTaskId);
    return es;
  }, [periodFiltered, filterProjectId, filterTaskId]);

  // Totals
  const totalSeconds = useMemo(() => filtered.reduce((a, e) => a + e.duration, 0), [filtered]);
  const sessionCount = filtered.length;
  const taskCount    = useMemo(() => new Set(filtered.map(e => e.taskId)).size, [filtered]);

  // Chart
  const chartBars   = useMemo(() => buildChartBars(filtered, period), [filtered, period]);
  const maxBarSec   = useMemo(() => Math.max(...chartBars.map(b => b.seconds), 1), [chartBars]);

  // Chart dimensions per period
  const CHART_H    = 130;
  const BAR_MIN_H  = 3;
  const barWidth   = period === 'today' ? 10 : period === 'week' ? 34 : 56;
  const barGap     = period === 'today' ? 3  : period === 'week' ? 10 : 10;

  // List grouped by day
  const grouped = useMemo(() => {
    const map = new Map<string, FlatEntry[]>();
    for (const e of filtered) {
      const k = dayKey(e.startedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries()).map(([k, entries]) => ({ key: k, entries }));
  }, [filtered]);

  const clearFilters = () => { setFilterProjectId(null); setFilterTaskId(null); };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.accent} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text }]}>Записи часу</Text>
          {(filterProjectId || filterTaskId) ? (
            <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Скинути</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 46 }} />}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* Period pills */}
          <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
            {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => { setPeriod(p); clearFilters(); }}
                style={[s.chip, { flex: 1, justifyContent: 'center', backgroundColor: period === p ? c.accent : c.dim, borderColor: period === p ? c.accent : c.border }]}>
                <Text style={{ color: period === p ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>
                  {PERIOD_LABELS[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Stats */}
          <BlurView intensity={isDark ? 18 : 30} tint={isDark ? 'dark' : 'light'} style={[s.statsRow, { borderColor: c.border }]}>
            <StatCell value={fmtDur(totalSeconds)} label="Загальний час" color={c.accent} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border, alignSelf: 'stretch', marginVertical: 12 }} />
            <StatCell value={String(sessionCount)} label="Сесій" color={c.text} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border, alignSelf: 'stretch', marginVertical: 12 }} />
            <StatCell value={String(taskCount)} label="Завдань" color={c.text} sub={c.sub} />
          </BlurView>

          {/* Chart */}
          {chartBars.some(b => b.seconds > 0) && (
            <View style={[s.chartCard, { borderColor: c.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)' }]}>
              {/* Chart title + y-axis hint */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', flex: 1 }}>
                  {period === 'today' ? 'По годинах'
                    : period === 'week' ? 'По днях'
                    : period === 'month' ? 'По тижнях'
                    : 'По місяцях'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 10 }}>макс {fmtDur(maxBarSec)}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                {/* Y-axis */}
                <View style={{ width: 30, alignItems: 'flex-end', paddingRight: 5, height: CHART_H + 24, justifyContent: 'space-between', paddingBottom: 24 }}>
                  <Text style={{ color: c.sub, fontSize: 9 }}>{fmtDurShort(maxBarSec)}</Text>
                  <Text style={{ color: c.sub, fontSize: 9 }}>{fmtDurShort(maxBarSec / 2)}</Text>
                  <Text style={{ color: c.sub, fontSize: 9 }}>0</Text>
                </View>

                {/* Y-axis grid lines + bars */}
                <View style={{ flex: 1 }}>
                  {/* Horizontal grid */}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CHART_H, justifyContent: 'space-between', pointerEvents: 'none' }}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                    ))}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H + 24, gap: barGap, paddingBottom: 24, paddingHorizontal: 2 }}>
                      {chartBars.map((bar) => {
                        const ratio    = bar.seconds / maxBarSec;
                        const barH     = bar.seconds > 0 ? Math.max(BAR_MIN_H, Math.round(ratio * (CHART_H - 2))) : BAR_MIN_H;
                        const noData   = bar.seconds === 0;
                        const barColor = noData
                          ? (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)')
                          : bar.isToday
                          ? c.accent
                          : c.accent + 'BB';

                        return (
                          <View key={bar.key} style={{ alignItems: 'center', width: barWidth }}>
                            {/* Value label on top */}
                            {!noData && ratio > 0.1 && (
                              <Text style={{ color: bar.isToday ? c.accent : c.sub, fontSize: period === 'today' ? 7 : 9, fontWeight: '600', marginBottom: 3, textAlign: 'center' }}>
                                {fmtDurShort(bar.seconds)}
                              </Text>
                            )}
                            <View style={{ width: barWidth, height: barH, borderRadius: barWidth <= 12 ? 3 : 6, backgroundColor: barColor }} />
                            {/* X-axis label */}
                            <Text
                              style={{ color: bar.isToday ? c.accent : c.sub, fontSize: period === 'today' ? 7 : period === 'all' ? 9 : 10, fontWeight: bar.isToday ? '700' : '400', marginTop: 5, textAlign: 'center' }}
                              numberOfLines={1}>
                              {bar.label}
                            </Text>
                            {bar.sublabel && (
                              <Text style={{ color: c.sub, fontSize: 8, textAlign: 'center', opacity: 0.7 }} numberOfLines={1}>
                                {bar.sublabel}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          )}

          {/* ── Filters ── */}
          {/* Project filter */}
          {activeProjects.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[s.filterLabel, { color: c.sub }]}>Проект</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 7, paddingRight: 4 }}>
                  <TouchableOpacity
                    onPress={() => { setFilterProjectId(null); setFilterTaskId(null); }}
                    style={[s.chip, { backgroundColor: !filterProjectId ? c.accent : c.dim, borderColor: !filterProjectId ? c.accent : c.border }]}>
                    <Text style={{ color: !filterProjectId ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>Всі</Text>
                  </TouchableOpacity>
                  {activeProjects.map(proj => {
                    const projTotal = periodFiltered.filter(e => e.projectId === proj.id).reduce((a, e) => a + e.duration, 0);
                    const active = filterProjectId === proj.id;
                    return (
                      <TouchableOpacity
                        key={proj.id}
                        onPress={() => { setFilterProjectId(active ? null : proj.id); setFilterTaskId(null); }}
                        style={[s.chip, { backgroundColor: active ? proj.color : c.dim, borderColor: active ? proj.color : c.border, gap: 6 }]}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#fff' : proj.color }} />
                        <Text style={{ color: active ? '#fff' : c.text, fontSize: 12, fontWeight: '600' }}>{proj.name}</Text>
                        <Text style={{ color: active ? 'rgba(255,255,255,0.7)' : c.sub, fontSize: 11 }}>{fmtDur(projTotal)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Task filter */}
          {activeTasks.length > 1 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={[s.filterLabel, { color: c.sub }]}>Завдання</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 7, paddingRight: 4 }}>
                  <TouchableOpacity
                    onPress={() => setFilterTaskId(null)}
                    style={[s.chip, { backgroundColor: !filterTaskId ? c.accent : c.dim, borderColor: !filterTaskId ? c.accent : c.border }]}>
                    <Text style={{ color: !filterTaskId ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>Всі</Text>
                  </TouchableOpacity>
                  {activeTasks.map(t => {
                    const base = filterProjectId ? periodFiltered.filter(e => e.projectId === filterProjectId) : periodFiltered;
                    const taskTotal = base.filter(e => e.taskId === t.id).reduce((a, e) => a + e.duration, 0);
                    const active = filterTaskId === t.id;
                    const proj = t.projectId ? projects.find(p => p.id === t.projectId) : null;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setFilterTaskId(active ? null : t.id)}
                        style={[s.chip, { backgroundColor: active ? c.accent : c.dim, borderColor: active ? c.accent : c.border, gap: 5 }]}>
                        {proj && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#fff' : proj.color }} />}
                        <Text style={{ color: active ? '#fff' : c.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{t.title}</Text>
                        <Text style={{ color: active ? 'rgba(255,255,255,0.7)' : c.sub, fontSize: 11 }}>{fmtDur(taskTotal)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Active filter badges */}
          {(filterProjectId || filterTaskId) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {filterProjectId && (() => {
                const proj = projects.find(p => p.id === filterProjectId);
                return proj ? (
                  <View style={[s.activeBadge, { backgroundColor: proj.color + '20', borderColor: proj.color + '50' }]}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: proj.color }} />
                    <Text style={{ color: proj.color, fontSize: 11, fontWeight: '600' }}>{proj.name}</Text>
                    <TouchableOpacity onPress={() => { setFilterProjectId(null); setFilterTaskId(null); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <IconSymbol name="xmark" size={10} color={proj.color} />
                    </TouchableOpacity>
                  </View>
                ) : null;
              })()}
              {filterTaskId && (() => {
                const task = tasks.find(t => t.id === filterTaskId);
                return task ? (
                  <View style={[s.activeBadge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50' }]}>
                    <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{task.title}</Text>
                    <TouchableOpacity onPress={() => setFilterTaskId(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <IconSymbol name="xmark" size={10} color={c.accent} />
                    </TouchableOpacity>
                  </View>
                ) : null;
              })()}
            </View>
          )}

          {/* Sessions list */}
          {grouped.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name="timer" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, fontWeight: '600', marginTop: 14 }}>Немає записів</Text>
            </View>
          ) : (
            grouped.map(({ key, entries }) => {
              const dayTotal = entries.reduce((a, e) => a + e.duration, 0);
              return (
                <View key={key} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
                      {dayLabel(key)}
                    </Text>
                    <View style={[s.badge, { backgroundColor: c.accent + '18', borderColor: c.accent + '40' }]}>
                      <IconSymbol name="clock" size={10} color={c.accent} />
                      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>{fmtDur(dayTotal)}</Text>
                    </View>
                  </View>

                  {entries.map(entry => {
                    const proj = entry.projectId ? projects.find(p => p.id === entry.projectId) : null;
                    return (
                      <BlurView
                        key={entry.id}
                        intensity={isDark ? 16 : 30}
                        tint={isDark ? 'dark' : 'light'}
                        style={[s.entryCard, { borderColor: c.border }]}>
                        <View style={[s.entryBar, { backgroundColor: proj?.color ?? c.accent }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                            {entry.taskTitle}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            {proj && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proj.color }} />
                                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '500' }}>{proj.name}</Text>
                              </View>
                            )}
                            <Text style={{ color: c.sub, fontSize: 11 }}>
                              {entry.startedAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                              {' → '}
                              {entry.endedAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                        <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                          <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{fmtDur(entry.duration)}</Text>
                        </View>
                      </BlurView>
                    );
                  })}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  backBtn:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  statsRow:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  chartCard:   { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  filterLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  badge:       { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  entryCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, paddingRight: 12, paddingVertical: 11, marginBottom: 7, overflow: 'hidden', gap: 10 },
  entryBar:    { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 11 },
});
