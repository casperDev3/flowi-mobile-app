/**
 * app/archive.tsx — Архів завдань (виконані).
 *
 * Layout System v2.4: архів — одна головна зона (список/сітка карток без
 * окремої картки деталей: у виконаної задачі дії — лише «Відновити» й
 * «Видалити», і вони вже на рядку). Тому динамічної зони тут немає, а є:
 *   • свайп рядка вліво — «Відновити» / «Видалити» без кнопок;
 *   • масовий вибір — довгий тап по картці, далі тапи додають/знімають;
 *     BulkActionBar «N вибрано · Дії ▾ · ✕» з тими самими операціями;
 *   • стани зони — скелет під час читання, «Повторити» при збої читання
 *     (а не «порожньо», ERR-01), порожньо з однією дією (скинути фільтр).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { PriorityFilterChips } from '@/components/tasks/PriorityFilterChips';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useI18n } from '@/store/i18n';
import { loadData, loadDataResult, retryStorageRead } from '@/store/storage';
import { haptic } from '@/utils/haptics';
import { BulkActionBar, SwipeRow, ZoneEmpty, ZoneError, ZoneSkeleton, type BulkAction } from '@/components/layout-zones';
import { updateSynced } from '@/store/synced-storage';
import { isSameDay } from '@/utils/dateUtils';
import { restoredColumnIdForTask, type TaskStatusColumn } from '@/utils/taskStatuses';
import {
  comparePriority,
  matchesPriorityFilter,
  normalizePriority,
  PRIORITY_LEVELS,
  priorityColor,
  priorityLabel,
  type LegacyPriority,
  type PriorityLevel,
  type TaskPriority,
} from '@/utils/taskUtils';
import { WIDE_CONTENT_MAX_WIDTH, useContentWidth } from '@/hooks/use-content-width';
import { useBreakpointValue } from '@/hooks/use-responsive';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { FilterBar, FilterSelect, KpiCounter, MeshBackground, PageHeader, useFiltersV25 } from '@/components/ds';
import { AccentIcon } from '@/components/shared/GlassBits';

type Status = 'active' | 'done';

interface SubTask { id: string; title: string; done: boolean; }
interface Task {
  integrationArchived?: boolean;
  // priority може бути відсутнім: задачі, створені з деталі проєкту старими
  // збірками, його не мали (CONTRACT §D.4.4) — і такі записи вже є в даних.
  id: string; title: string; description: string; priority?: LegacyPriority; priorityLevel?: TaskPriority; status: Status;
  subtasks: SubTask[]; createdAt: string; estimatedMinutes?: number; deadline?: string; projectId?: string;
}

function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (isSameDay(d, now)) return 'Сьогодні';
  if (diff === 1) return 'Завтра';
  if (diff < 0) return `${Math.abs(diff)} дн тому`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

type SortBy = 'newest' | 'oldest' | 'priority' | 'name';

/** Сортування архіву для FilterSelect (планшет, DS v2.5) — ті самі варіанти, що й чипи телефона. */
const ARCHIVE_SORT_OPTIONS: readonly { value: SortBy; label: string; icon: 'arrow.down.circle' | 'arrow.up.circle' | 'exclamationmark.circle' | 'textformat.abc' }[] = [
  { value: 'newest',   label: 'Нові',      icon: 'arrow.down.circle' },
  { value: 'oldest',   label: 'Старі',     icon: 'arrow.up.circle' },
  { value: 'priority', label: 'Пріоритет', icon: 'exclamationmark.circle' },
  { value: 'name',     label: 'А–Я',       icon: 'textformat.abc' },
];
/** Елемент сітки архіву: завдання або порожня комірка-добивка рядка. */
type GridItem = Task | { padId: string };


interface Palette {
  /** Поверхня картки (DS surface.card). */
  card: string;
  /** Колір «виконано» (DS status.success). */
  success: string;
  /** Колір видалення (DS status.danger). */
  danger: string;
  border: string;
  text: string;
  sub: string;
  accent: string;
  dim: string;
}

interface ArchiveCardProps {
  task: Task;
  isDark: boolean;
  c: Palette;
  restoreLabel: string;
  deleteLabel: string;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  /** Масовий вибір (Layout System v2.4). */
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
}

/**
 * Картка винесена й мемоізована: у списку на сотні виконаних завдань
 * перемальовування всіх рядків на кожен tap по фільтру помітне оком.
 */
const ArchiveCard = React.memo(function ArchiveCard({
  task, isDark, c, restoreLabel, deleteLabel, onRestore, onDelete, selected, selectionMode, onToggleSelect,
}: ArchiveCardProps) {
  // Задача без (валідного) пріоритету — без бейджа, а не TypeError.
  const prioLevel = normalizePriority(task);
  return (
    // Omni (DS v2.2): суцільна картка surface.card з м'якою тінню, без рамки,
    // скла й бічної смуги. Довгий тап — масовий вибір; у режимі вибору тап
    // перемикає вибір (вибрана — контур action.primary, як у списку Завдань).
    <Pressable
      onLongPress={() => { haptic.light(); onToggleSelect(task.id); }}
      onPress={selectionMode ? () => onToggleSelect(task.id) : undefined}
      accessibilityState={selectionMode ? { selected } : undefined}
      style={[ar.card, { backgroundColor: c.card, borderWidth: 2, borderColor: selected ? c.text : 'transparent' }, shadow[isDark ? 'dark' : 'light'].card]}>
      {selectionMode ? (
        <View style={{ marginRight: 10 }} accessible={false}>
          <IconSymbol name={selected ? 'checkmark.circle.fill' : 'circle'} size={20} color={selected ? c.text : c.sub} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
          <AnimatedCheck
            checked={true}
            size={18}
            radius={5}
            color={c.success}
            /* read-only: no onPress */
          />
          <Text
            style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.medium, flex: 1, marginLeft: 8, textDecorationLine: 'line-through', lineHeight: 18 }}
            numberOfLines={2}>
            {task.title}
          </Text>
        </View>

        {/* Badge row: мета зліва, пріоритет — у правому нижньому куті
            (рішення власника, п. 4 — як в особистих картках списку). */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginLeft: 26 }}>
          {task.subtasks.length > 0 && (
            <View style={[ar.badge, { backgroundColor: c.dim }]}>
              <IconSymbol name="list.bullet" size={10} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginLeft: 4 }}>
                {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}
              </Text>
            </View>
          )}
          {task.deadline && (
            <View style={[ar.badge, { backgroundColor: c.dim }]}>
              <IconSymbol name="calendar" size={10} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginLeft: 4 }}>
                {deadlineLabel(task.deadline)}
              </Text>
            </View>
          )}
          {prioLevel !== null && (
            <View style={{ marginLeft: 'auto' }}>
              <PriorityBadge level={prioLevel} />
            </View>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 6, marginLeft: 10 }}>
        <TouchableOpacity
          onPress={() => onRestore(task.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={restoreLabel}
          style={[ar.iconBtn, { backgroundColor: c.dim }]}>
          <IconSymbol name="arrow.uturn.backward" size={14} color={c.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDelete(task.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={[ar.iconBtn, { backgroundColor: c.dim }]}>
          <IconSymbol name="trash" size={14} color={c.danger} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
});

/** Проміжок між картками архіву (і між рядками, і між колонками). */
const CARD_GAP = 12;

export default function ArchiveScreen() {
  const readingWidth = useContentWidth();
  /**
   * Планшет (рішення 6): картки архіву короткі, тож портрет — дві в ряд,
   * ландшафт — три, у ширшій колонці (Layout.wideMaxWidth). Телефон — одна
   * колонка в стелі для читання, як і було.
   */
  const columns = useBreakpointValue({ compact: 1, medium: 2, expanded: 3 });
  const contentWidth = useMemo(
    () => (columns > 1 ? { ...readingWidth, maxWidth: WIDE_CONTENT_MAX_WIDTH } : readingWidth),
    [columns, readingWidth],
  );
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  // Мультивибір P0…P5; порожній = усі.
  const [filterPriorities, setFilterPriorities] = useState<PriorityLevel[]>([]);
  const [sort, setSort] = useState<SortBy>('newest');
  // DS v2.5: на планшеті фільтри — один ряд FilterBar; телефон — як було.
  const filtersV25 = useFiltersV25();

  // Колонки статусів — лише щоб знати, куди повертати завдання з архіву
  // (`restoredColumnIdForTask`). Ref, а не стан: мутації архіву йдуть чергою
  // асинхронно, і замикання на значенні зі стану читало б застарілий набір.
  const statusColumnsRef = useRef<TaskStatusColumn[]>([]);

  /** Стан головної зони: скелет → список; збій читання → «Повторити» (ERR-01). */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const readTasks = useCallback(async (retry: boolean) => {
    const [stored, columns] = await Promise.all([
      (retry ? retryStorageRead : loadDataResult)<Task[]>('tasks', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    statusColumnsRef.current = columns;
    if (!stored.ok || !Array.isArray(stored.value)) {
      if (__DEV__) console.warn('[archive] задачі не прочитались:', stored.ok ? 'не масив' : stored.error);
      setLoadState('error');
      return;
    }
    setTasks(stored.value);
    setLoadState('ready');
  }, []);
  const reloadTasks = useCallback(() => readTasks(false), [readTasks]);
  useFocusEffect(useCallback(() => {
    void reloadTasks();
  }, [reloadTasks]));
  // Задачу могли завершити чи повернути деінде (веб, інший пристрій), поки
  // архів відкритий, — пул синку пише 'tasks', і список оновлюється одразу.
  useStorageRefresh(['tasks', 'task_statuses'], reloadTasks);

  const done = useMemo(() => tasks
    .filter(t => (t.status === 'done' || t.integrationArchived) && matchesPriorityFilter(t, filterPriorities))
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      // P0→P5, без пріоритету — у кінці.
      if (sort === 'priority') return comparePriority(a, b);
      return a.title.localeCompare(b.title, 'uk');
    }), [tasks, filterPriorities, sort]);

  // Мутації архіву — завжди read-modify-write по СВІЖОМУ стану сховища.
  // saveSynced диффить масив: будь-який id, якого в ньому немає, іде на
  // сервер як DELETE. Стан екрана (`tasks`) — знімок на момент фокусу, тож
  // задачі, що підтягнулись синхронізацією поки екран відкритий, у ньому
  // відсутні — зберігати його цілком не можна. Мутації йдуть по черзі, щоб
  // два швидкі тапи не перезаписали результат одне одного.
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const mutateTasks = useCallback((fn: (fresh: Task[]) => Task[]) => {
    const run = async () => {
      // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
      // ними інакше пішов би на сервер як DELETE.
      const updated = await updateSynced<Task>('tasks', fn);
      setTasks(updated);
    };
    const next = mutationQueue.current.then(run, run);
    mutationQueue.current = next.catch(err => {
      if (__DEV__) console.warn('[archive] tasks mutation failed', err);
    });
    return next;
  }, []);

  const restore = useCallback((id: string) => {
    // Разом зі статусом міняється й КОЛОНКА: сам по собі `status: 'active'`
    // лишав завдання в колонці «Готово», і воно поверталось зі списку зі
    // зеленим бейджем «Готово» всередині секції «До роботи».
    void mutateTasks(fresh => fresh.map(t => (t.id === id
      ? { ...t, status: 'active' as Status, kanbanColumnId: restoredColumnIdForTask(t, statusColumnsRef.current) }
      : t)))
      .catch(() => {});
  }, [mutateTasks]);

  const deleteForever = useCallback((id: string) => {
    // ERR-13: підтвердження незворотної дії — через словник, не літералами.
    Alert.alert(
      tr.deletePermanently,
      tr.taskWillBeDeleted,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.delete, style: 'destructive', onPress: () => {
          void mutateTasks(fresh => fresh.filter(t => t.id !== id)).catch(() => {});
        }},
      ]
    );
  }, [mutateTasks, tr]);

  // ─── Масовий вибір (Layout System v2.4) ──────────────────────────────────
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
  const toggleSelect = useCallback((id: string) => {
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const bulkRestore = useCallback(() => {
    const ids = new Set(bulkIds);
    clearBulk();
    void mutateTasks(fresh => fresh.map(t => (ids.has(t.id)
      ? { ...t, status: 'active' as Status, kanbanColumnId: restoredColumnIdForTask(t, statusColumnsRef.current) }
      : t)))
      .catch(() => {});
  }, [bulkIds, clearBulk, mutateTasks]);
  const bulkDelete = useCallback(() => {
    const ids = new Set(bulkIds);
    if (!ids.size) return;
    Alert.alert(
      tr.deletePermanently,
      `${ids.size} × ${tr.tasks}\n${tr.cannotUndo}`,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.delete, style: 'destructive', onPress: () => {
          clearBulk();
          // Як і «Очистити архів»: лише ті, що досі виконані.
          void mutateTasks(fresh => fresh.filter(t => !(ids.has(t.id) && (t.status === 'done' || t.integrationArchived))))
            .catch(() => {});
        }},
      ],
    );
  }, [bulkIds, clearBulk, mutateTasks, tr]);
  const bulkActions = useMemo<BulkAction[]>(() => [
    { key: 'restore', label: tr.restore, icon: 'arrow.uturn.backward', onPress: bulkRestore, testID: 'archive-bulk-restore' },
    { key: 'delete', label: tr.delete, icon: 'trash.fill', tone: 'danger', onPress: bulkDelete, testID: 'archive-bulk-delete' },
  ], [tr.restore, tr.delete, bulkRestore, bulkDelete]);

  const filtersApplied = filterPriorities.length > 0;
  const withSubtasks = useMemo(() => done.filter(t => t.subtasks.length > 0).length, [done]);

  const clearAll = useCallback(() => {
    if (done.length === 0) return;
    // Видаляємо рівно те, що показано в діалозі (після фільтрів), а не
    // «усі виконані». Id фіксуємо в момент відкриття діалогу.
    const ids = new Set(done.map(t => t.id));
    const count = ids.size;
    Alert.alert(
      tr.clearArchive,
      // ЗАГОЛОВОК і КНОПКИ — зі словника; сам текст із числом лишається
      // українським: ключа з підстановкою {count} для нього в
      // `store/translations.ts` немає, а словник — не ця зона (ERR-13).
      filtersApplied
        ? `Видалити ${count} завдань назавжди? Буде видалено лише те, що зараз видно після фільтрів.`
        : `Видалити ${count} завдань назавжди?`,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.clear, style: 'destructive', onPress: () => {
          // Задачу, яку тим часом повернули в роботу на іншому пристрої,
          // не чіпаємо — видаляємо лише ті, що досі виконані.
          void mutateTasks(fresh => fresh.filter(t => !(ids.has(t.id) && t.status === 'done')))
            .catch(() => {});
        }},
      ]
    );
  }, [done, filtersApplied, mutateTasks, tr]);

  // Палітра стабільна між рендерами — інакше React.memo на картці
  // не спрацює: новий об'єкт кольорів щоразу рахувався б як зміна пропа.
  // DS v2: семантичні токени; «виконано» — status.success.
  const tk = dsTokens(isDark);
  const c = useMemo(() => {
    const t = dsTokens(isDark);
    return {
      bg1:     t.bg.canvas,
      bg2:     t.bg.canvas,
      // Omni: суцільні картки; вкладене (бейджі, кнопки) — surface.subtle.
      card:    t.surface.card,
      border:  t.border.hairline,
      text:    t.text.primary,
      sub:     t.text.secondary,
      accent:  t.status.success,
      success: t.status.success,
      danger:  t.status.danger,
      dim:     t.surface.subtle,
    };
  }, [isDark]);

  /**
   * Неповний останній рядок сітки добиваємо порожніми комірками: інакше
   * одинока картка (flex:1) розтягнулась би на всю ширину рядка.
   */
  const gridData = useMemo<GridItem[]>(() => {
    const rest = columns > 1 ? (columns - (done.length % columns)) % columns : 0;
    if (rest === 0) return done;
    return [...done, ...Array.from({ length: rest }, (_, i) => ({ padId: `__pad${i}` }))];
  }, [done, columns]);

  const renderItem = useCallback(({ item }: { item: GridItem }) => ('padId' in item ? (
    <View style={ar.gridCell} accessible={false} importantForAccessibility="no-hide-descendants" />
  ) : (
    // У сітці комірка ділить рядок порівну (flex:1); minWidth:0 — щоб довга
    // назва не розпирала колонку. На телефоні обгортка нічого не змінює.
    <View style={columns > 1 ? ar.gridCell : undefined}>
    {/* Свайп вліво — «Відновити» / «Видалити» без кнопок; у режимі вибору — ні. */}
    <SwipeRow
      enabled={!selectionMode}
      radius={radius.nested}
      actions={[
        { key: 'restore', label: tr.restore, icon: 'arrow.uturn.backward', onPress: () => restore(item.id), testID: `archive-swipe-restore-${item.id}` },
        { key: 'delete', label: tr.delete, icon: 'trash.fill', tone: 'danger', onPress: () => deleteForever(item.id), testID: `archive-swipe-delete-${item.id}` },
      ]}>
      <ArchiveCard
        task={item}
        isDark={isDark}
        c={c}
        restoreLabel={tr.restore}
        deleteLabel={tr.delete}
        onRestore={restore}
        onDelete={deleteForever}
        selected={bulkIds.has(item.id)}
        selectionMode={selectionMode}
        onToggleSelect={toggleSelect}
      />
    </SwipeRow>
    </View>
  )), [isDark, c, tr.restore, tr.delete, restore, deleteForever, columns, bulkIds, selectionMode, toggleSelect]);

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Заголовок жорстко українською був єдиним у шапці — тепер із
            словника, як решта рядків. «Архів» є в сайдбарі, тож на планшеті
            стрілку «Назад» ScreenHeader ховає сам. */}
        <ScreenHeader
          title={tr.archive}
          color={c.text}
          paddingBottom={14}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.text,
            style: { backgroundColor: c.card, borderColor: 'transparent' },
          }}
          actions={done.length > 0 ? (
            <>
              <HeaderButton
                onPress={clearAll}
                accessibilityLabel={tr.clearArchive}>
                <IconSymbol name="trash" size={18} color={c.danger} />
              </HeaderButton>
            </>
          ) : undefined}>
          {/* Omni: KPI сторінки — скільки виконаних завдань у вибірці (після
              фільтра пріоритету) і скільки з них мали підзавдання. */}
          {done.length > 0 ? (
            <PageHeader
              bleed={20}
              kpis={
                <>
                  <KpiCounter value={done.length} label={tr.allCompleted} />
                  {withSubtasks > 0 ? <KpiCounter value={withSubtasks} label={tr.subtasks} /> : null}
                </>
              }
            />
          ) : null}
        </ScreenHeader>

        {filtersV25 ? (
          <View style={[contentWidth, { paddingHorizontal: 20, marginBottom: 12 }]}>
            <FilterBar
              label={tr.filters}
              testID="archive-filter-bar"
              items={[
                {
                  id: 'priority',
                  active: filterPriorities.length,
                  node: (
                    <FilterSelect<string>
                      label={tr.priority}
                      allLabel={tr.filterAll}
                      multiple
                      value={filterPriorities.map(String)}
                      onChange={next => setFilterPriorities(
                        PRIORITY_LEVELS.filter(l => next.includes(String(l))),
                      )}
                      options={PRIORITY_LEVELS.map(level => ({
                        value: String(level),
                        label: priorityLabel(level),
                        color: priorityColor(level) as string,
                      }))}
                    />
                  ),
                },
                {
                  id: 'sort',
                  active: sort !== 'newest',
                  node: (
                    <FilterSelect<SortBy>
                      label={tr.sorting}
                      value={sort}
                      neutralValue="newest"
                      onChange={v => setSort(v ?? 'newest')}
                      options={ARCHIVE_SORT_OPTIONS}
                    />
                  ),
                },
              ]}
              onReset={() => { setFilterPriorities([]); setSort('newest'); }}
              resetLabel={tr.priorityFilterReset}
            />
          </View>
        ) : (
        <>
        {/* Filter by priority — у тій самій колонці, що й картки нижче. */}
        <View style={[contentWidth, { paddingHorizontal: 20, marginBottom: 8 }]}>
          <PriorityFilterChips
            value={filterPriorities}
            onChange={setFilterPriorities}
            colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
          />
        </View>

        {/* Sort */}
        <View style={[contentWidth, { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 12 }]}>
          {([
            { key: 'newest',   label: 'Нові',      icon: 'arrow.down.circle' },
            { key: 'oldest',   label: 'Старі',     icon: 'arrow.up.circle' },
            { key: 'priority', label: 'Пріоритет', icon: 'exclamationmark.circle' },
            { key: 'name',     label: 'А–Я',       icon: 'textformat.abc' },
          ] as const).map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setSort(opt.key)}
              // DS v2: сортування — pill-чипи, активний — action.primary.
              accessibilityRole="button"
              accessibilityState={{ selected: sort === opt.key }}
              style={[ar.chip, { backgroundColor: sort === opt.key ? tk.action.primary : c.card }]}>
              <IconSymbol name={opt.icon as any} size={12} color={sort === opt.key ? tk.text.onAction : c.sub} />
              <Text style={{ color: sort === opt.key ? tk.text.onAction : c.text, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        </>
        )}

        {/* Архів росте без стелі — список віртуалізований, інакше
            кількасот карток монтуються всі одразу. */}
        {loadState === 'loading' ? (
          <ZoneSkeleton variant="list" rows={5} style={[contentWidth, { paddingHorizontal: 20 }]} />
        ) : loadState === 'error' ? (
          <ZoneError testID="archive-error" onRetry={() => { setLoadState('loading'); void readTasks(true); }} />
        ) : (
        <FlatList
          // numColumns не можна міняти «на льоту» — при повороті планшета
          // список перемонтовується з новим ключем.
          key={`archive-cols-${columns}`}
          data={gridData}
          keyExtractor={item => ('padId' in item ? item.padId : item.id)}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: CARD_GAP } : undefined}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ArchiveSeparator}
          renderItem={renderItem}
          ListEmptyComponent={filtersApplied ? (
            // Порожньо через фільтр — одна дія: скинути фільтр.
            <ZoneEmpty
              testID="archive-empty-filtered"
              icon="archivebox"
              title={tr.archiveEmpty}
              actionLabel={tr.resetFilter}
              onAction={() => setFilterPriorities([])}
            />
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 72 }}>
              <AccentIcon isDark={isDark} icon="archivebox.fill" accent="lavender" size="lg" style={ar.emptyIcon} />
              <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontFamily: fontFamily.semibold }}>{tr.archiveEmpty}</Text>
              <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 4 }}>{tr.completedTasksAppear}</Text>
            </View>
          )}
        />
        )}
        <BulkActionBar
          testID="archive-bulk-bar"
          count={bulkIds.size}
          actions={bulkActions}
          onClear={clearBulk}
        />
      </SafeAreaView>
    </View>
  );
}

function ArchiveSeparator() {
  return <View style={{ height: CARD_GAP }} />;
}

const ar = StyleSheet.create({
  gridCell:   { flex: 1, minWidth: 0, maxWidth: '100%' },
  chip:       { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6 },
  emptyIcon:  { width: 80, height: 80, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  card:       { borderRadius: radius.nested, padding: 16, flexDirection: 'row', alignItems: 'center' },
  badge:      { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn:    { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
