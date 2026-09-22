import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { PriorityFilterChips } from '@/components/tasks/PriorityFilterChips';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { isSameDay } from '@/utils/dateUtils';
import { restoredColumnIdForTask, type TaskStatusColumn } from '@/utils/taskStatuses';
import {
  comparePriority,
  matchesPriorityFilter,
  normalizePriority,
  type LegacyPriority,
  type PriorityLevel,
  type TaskPriority,
} from '@/utils/taskUtils';
import { useContentWidth } from '@/hooks/use-content-width';

type Status = 'active' | 'done';

interface SubTask { id: string; title: string; done: boolean; }
interface Task {
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


interface Palette {
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
}

/**
 * Картка винесена й мемоізована: у списку на сотні виконаних завдань
 * перемальовування всіх рядків на кожен tap по фільтру помітне оком.
 */
const ArchiveCard = React.memo(function ArchiveCard({
  task, isDark, c, restoreLabel, deleteLabel, onRestore, onDelete,
}: ArchiveCardProps) {
  // Задача без (валідного) пріоритету — без бейджа, а не TypeError.
  const prioLevel = normalizePriority(task);
  return (
    <BlurView
      intensity={isDark ? 18 : 35}
      tint={isDark ? 'dark' : 'light'}
      style={[ar.card, { borderColor: c.border }]}>
      {/* Green left stripe */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: c.accent, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />

      <View style={{ marginLeft: 8, flex: 1 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 }}>
          <AnimatedCheck
            checked={true}
            size={18}
            radius={5}
            color="#10B981"
            /* read-only: no onPress */
          />
          <Text
            style={{ color: c.sub, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 9, textDecorationLine: 'line-through', lineHeight: 18 }}
            numberOfLines={2}>
            {task.title}
          </Text>
        </View>

        {/* Badge row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 27 }}>
          <PriorityBadge level={prioLevel} />
          {task.subtasks.length > 0 && (
            <View style={[ar.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
              <IconSymbol name="list.bullet" size={10} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}
              </Text>
            </View>
          )}
          {task.deadline && (
            <View style={[ar.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
              <IconSymbol name="calendar" size={10} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                {deadlineLabel(task.deadline)}
              </Text>
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
          style={[ar.iconBtn, { backgroundColor: c.accent + '18', borderColor: c.accent + '40' }]}>
          <IconSymbol name="arrow.uturn.backward" size={14} color={c.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDelete(task.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={[ar.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.28)' }]}>
          <IconSymbol name="trash" size={14} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
});

export default function ArchiveScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  // Мультивибір P0…P5; порожній = усі.
  const [filterPriorities, setFilterPriorities] = useState<PriorityLevel[]>([]);
  const [sort, setSort] = useState<SortBy>('newest');

  // Колонки статусів — лише щоб знати, куди повертати завдання з архіву
  // (`restoredColumnIdForTask`). Ref, а не стан: мутації архіву йдуть чергою
  // асинхронно, і замикання на значенні зі стану читало б застарілий набір.
  const statusColumnsRef = useRef<TaskStatusColumn[]>([]);

  const reloadTasks = useCallback(async () => {
    const [stored, columns] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    statusColumnsRef.current = columns;
    setTasks(stored);
  }, []);
  useFocusEffect(useCallback(() => {
    void reloadTasks();
  }, [reloadTasks]));
  // Задачу могли завершити чи повернути деінде (веб, інший пристрій), поки
  // архів відкритий, — пул синку пише 'tasks', і список оновлюється одразу.
  useStorageRefresh(['tasks', 'task_statuses'], reloadTasks);

  const done = useMemo(() => tasks
    .filter(t => t.status === 'done' && matchesPriorityFilter(t, filterPriorities))
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

  const filtersApplied = filterPriorities.length > 0;

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
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#10B981',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  }), [isDark]);

  const renderItem = useCallback(({ item }: { item: Task }) => (
    <ArchiveCard
      task={item}
      isDark={isDark}
      c={c}
      restoreLabel={tr.restore}
      deleteLabel={tr.delete}
      onRestore={restore}
      onDelete={deleteForever}
    />
  ), [isDark, c, tr.restore, tr.delete, restore, deleteForever]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[ar.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={18} color={c.accent} />
          </TouchableOpacity>
          <Text style={[ar.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Архів</Text>
          {done.length > 0 && (
            <>
              <View style={[ar.countBadge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50' }]}>
                <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{done.length}</Text>
              </View>
              <TouchableOpacity
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel={tr.clearArchive}
                style={[ar.clearBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', marginLeft: 8 }]}>
                <IconSymbol name="trash" size={14} color="#EF4444" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Filter by priority */}
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <PriorityFilterChips
            value={filterPriorities}
            onChange={setFilterPriorities}
            colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
          />
        </View>

        {/* Sort */}
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 12 }}>
          {([
            { key: 'newest',   label: 'Нові',      icon: 'arrow.down.circle' },
            { key: 'oldest',   label: 'Старі',     icon: 'arrow.up.circle' },
            { key: 'priority', label: 'Пріоритет', icon: 'exclamationmark.circle' },
            { key: 'name',     label: 'А–Я',       icon: 'textformat.abc' },
          ] as const).map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setSort(opt.key)}
              style={[ar.chip, {
                backgroundColor: sort === opt.key ? c.accent + '20' : c.dim,
                borderColor: sort === opt.key ? c.accent : c.border,
              }]}>
              <IconSymbol name={opt.icon as any} size={11} color={sort === opt.key ? c.accent : c.sub} />
              <Text style={{ color: sort === opt.key ? c.accent : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Архів росте без стелі — список віртуалізований, інакше
            кількасот BlurView-карток монтуються всі одразу. */}
        <FlatList
          data={done}
          keyExtractor={task => task.id}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 72 }}>
              <View style={[ar.emptyIcon, { backgroundColor: c.accent + '15', borderColor: c.accent + '25' }]}>
                <IconSymbol name="archivebox.fill" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 18, fontWeight: '600' }}>Архів порожній</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 5, opacity: 0.7 }}>Виконані завдання з’являться тут</Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const ar = StyleSheet.create({
  pageTitle:  { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  backBtn:    { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  clearBtn:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card:       { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  badge:      { flexDirection: 'row', alignItems: 'center', borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  iconBtn:    { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
