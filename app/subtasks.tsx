/**
 * app/subtasks.tsx — підзавдання одного завдання (чек-лист).
 *
 * Layout System v2.4: екран сам є деталлю одного запису, тож зон «список +
 * деталі» тут немає. Застосовано: свайп рядка вліво («Копіювати» /
 * «Видалити» — ті самі дії, що й кнопки рядка) і стани головної зони —
 * скелет під час читання та «Повторити» при збої читання (не порожній
 * чек-лист, ERR-01). Масового вибору немає: пункт чек-листа відмічається
 * одним тапом, а видаляють їх поодинці.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useUndoToast } from '@/components/shared/UndoToast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { copyTextToClipboard } from '@/utils/clipboard';
import { loadData, loadDataResult, retryStorageRead } from '@/store/storage';
import { SwipeRow, ZoneError, ZoneSkeleton } from '@/components/layout-zones';
import { updateSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import { subtaskToggleTransition, type TaskStatusColumn } from '@/utils/taskStatuses';
import { normalizePriority, type LegacyPriority, type TaskPriority } from '@/utils/taskUtils';
import { useContentWidth } from '@/hooks/use-content-width';
import { fontFamily, radius, theme } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { BentoCard, MeshBackground, SegmentedProgress } from '@/components/ds';
import { glassOf, dsGlass } from '@/components/shared/dsTheme';

type Status = 'active' | 'done';
interface SubTask { id: string; title: string; done: boolean; }
interface Task {
  id: string; title: string; description: string;
  /** Легасі + P0–P5 (CONTRACT §B). У підзавдань власного пріоритету немає — показуємо батьківський. */
  priority?: LegacyPriority; priorityLevel?: TaskPriority; status: Status; subtasks: SubTask[];
  /** Колонка дошки: відмітка останньої підзадачі веде завдання «На перевірку». */
  kanbanColumnId?: string;
  createdAt: string; estimatedMinutes?: number; deadline?: string; projectId?: string;
}

interface SubRowProps {
  sub: SubTask;
  textColor: string;
  subColor: string;
  borderColor: string;
  dimColor: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  /** Копіювати назву підзавдання в буфер. */
  onCopy: (sub: SubTask) => void;
  copyLabel: string;
  /** Підпис кнопки видалення для VoiceOver («Видалити: <назва>»). */
  deleteLabel: string;
}

/**
 * Рядок мемоізований: набір тексту в полі «Додати підзавдання» інакше
 * перемальовує весь список на кожну натиснуту літеру.
 */
const subKey = (sub: SubTask) => sub.id;
/** Позначка «виконано» — DS status.success. */
const SUCCESS = theme.light.status.success;
const SubSeparator = () => <View style={{ height: 8 }} />;

const SubRow = React.memo(function SubRow({
  sub, textColor, subColor, borderColor: _borderColor, dimColor, onToggle, onDelete, onCopy, copyLabel, deleteLabel,
}: SubRowProps) {
  return (
    <SwipeRow
      radius={radius.nested}
      actions={[
        { key: 'copy', label: copyLabel, icon: 'doc.on.doc', onPress: () => onCopy(sub) },
        { key: 'delete', label: deleteLabel, icon: 'trash.fill', tone: 'danger', onPress: () => onDelete(sub.id) },
      ]}>
    {a11y => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggle(sub.id)}
      accessibilityActions={a11y.accessibilityActions}
      onAccessibilityAction={a11y.onAccessibilityAction}
      // Omni: рядок чек-листа — суцільна картка surface.card (dimColor), без
      // рамки; виконане — закреслене й text.secondary.
      accessibilityRole="checkbox"
      accessibilityState={{ checked: sub.done }}
      accessibilityLabel={sub.title}
      style={[st.subRow, { backgroundColor: dimColor }]}>
      <View style={[st.subCheck, { borderColor: sub.done ? SUCCESS : subColor, backgroundColor: sub.done ? SUCCESS : 'transparent' }]}>
        {sub.done && <IconSymbol name="checkmark" size={10} color="#FFFFFF" />}
      </View>
      <Text style={{
        color: sub.done ? subColor : textColor,
        textDecorationLine: sub.done ? 'line-through' : 'none',
        flex: 1, marginHorizontal: 12, fontSize: 14, fontFamily: fontFamily.medium,
      }}>
        {sub.title}
      </Text>
      <TouchableOpacity
        onPress={() => onCopy(sub)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${copyLabel}: ${sub.title}`}
        style={{ marginRight: 18 }}>
        <IconSymbol name="doc.on.doc" size={14} color={subColor} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onDelete(sub.id)}
        accessibilityRole="button"
        accessibilityLabel={`${deleteLabel}: ${sub.title}`}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}>
        <IconSymbol name="trash" size={14} color={subColor} />
      </TouchableOpacity>
    </TouchableOpacity>
    )}
    </SwipeRow>
  );
});

export default function SubtasksScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { stopTimerForTask } = useTimerContext();
  const { tr } = useI18n();
  const { show: showToast, element: toastElement } = useUndoToast(false);

  const copySubtask = useCallback((sub: SubTask) => {
    void copyTextToClipboard(sub.title).then(ok => { if (ok) showToast(tr.subtaskCopied); });
  }, [showToast, tr.subtaskCopied]);

  const [task, setTask] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  // Палітра стабільна між рендерами — інакше React.memo на рядку не спрацює.
  // DS v2: семантичні токени замість лілових відтінків.
  const tk = dsTokens(isDark);
  const c = useMemo(() => ({
    bg1:    dsTokens(isDark).bg.canvas,
    bg2:    dsTokens(isDark).bg.canvas,
    border: dsTokens(isDark).border.hairline,
    text:   dsTokens(isDark).text.primary,
    sub:    dsTokens(isDark).text.secondary,
    accent: dsGlass(isDark).accent.lavender.ink, // DS v2: акцент tasks
    dim:    glassOf(dsTokens(isDark)).surfaceSubtle,
  }), [isDark]);

  /** Стан головної зони: скелет → чек-лист; збій читання → «Повторити». */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const readTask = useCallback(async (retry: boolean) => {
    const result = await (retry ? retryStorageRead : loadDataResult)<Task[]>('tasks', []);
    if (!result.ok || !Array.isArray(result.value)) {
      if (__DEV__) console.warn('[subtasks] задачі не прочитались:', result.ok ? 'не масив' : result.error);
      setLoadState('error');
      return;
    }
    const found = result.value.find(t => t.id === taskId);
    if (found) setTask(found);
    setLoadState('ready');
  }, [taskId]);
  useEffect(() => { void readTask(false); }, [readTask]);

  const persistTask = useCallback(async (updated: Task) => {
    setTask(updated);
    await updateSynced<Task>('tasks', tasks => tasks.map(t => t.id === updated.id ? updated : t));
  }, []);

  const toggleSubtask = useCallback(async (subId: string) => {
    if (!task) return;
    const subtasks = task.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
    // Те саме правило, що й у списку завдань, і навмисно з тієї самої утиліти:
    // раніше тут стояла власна копія, яка ще й позначала завдання завершеним.
    // null — статус і колонку не чіпаємо взагалі.
    // Задача проєкту йде в «На перевірці» ВЛАСНОГО проєкту — див. утиліту.
    const statusColumns = await loadData<TaskStatusColumn[]>('task_statuses', []);
    const transition = subtaskToggleTransition(task, subtasks, statusColumns);
    await persistTask({ ...task, subtasks, ...(transition ?? {}) });
    if (!transition) return;

    // Підзадачі скінчились — рахувати час далі нема за чим, а кнопки «Стоп»
    // тут немає. Зупиняємо ПІСЛЯ власного запису 'tasks': стор дописує сесію
    // тим самим read-modify-write. Колонку він виставить у «На перевірці» —
    // рівно ту саму, що вже поклав перехід вище, тож розбіжності не буде.
    await stopTimerForTask(task.id);
    // Стор дописав завершену сесію прямо у сховище. Без перечитування
    // наступний persistTask затер би її застарілим локальним об'єктом.
    const fresh = await loadData<Task[]>('tasks', []);
    const updated = fresh.find(t => t.id === task.id);
    if (updated) setTask(updated);
  }, [task, persistTask, stopTimerForTask]);

  const deleteSubtask = useCallback(async (subId: string) => {
    if (!task) return;
    await persistTask({ ...task, subtasks: task.subtasks.filter(s => s.id !== subId) });
  }, [task, persistTask]);

  const addSubtask = useCallback(async () => {
    if (!task || !newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    await persistTask({ ...task, subtasks: [...task.subtasks, sub] });
    setNewSubtask('');
  }, [task, newSubtask, persistTask]);

  // completed subtasks go to end
  const sortedSubs = useMemo(
    () => (task ? [...task.subtasks].sort((a, b) => Number(a.done) - Number(b.done)) : []),
    [task],
  );
  const doneCount = task ? task.subtasks.filter(s => s.done).length : 0;
  const total = task ? task.subtasks.length : 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const renderSub = useCallback(({ item }: { item: SubTask }) => (
    <SubRow
      sub={item}
      textColor={c.text}
      subColor={c.sub}
      borderColor={c.border}
      dimColor={tk.surface.card}
      onToggle={toggleSubtask}
      onDelete={deleteSubtask}
      onCopy={copySubtask}
      copyLabel={tr.copySubtask}
      deleteLabel={tr.delete}
    />
  ), [c, tk.surface.card, toggleSubtask, deleteSubtask, copySubtask, tr.copySubtask, tr.delete]);

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/*
          Екрана немає в сайдбарі, тож стрілка «Назад» тут не рудимент і
          лишається й на планшеті — а поруч із нею шлях «Завдання → назва».
          Мітка пріоритету переїхала в actions, лічильник виконаного — під
          заголовок: у спільному хедері це саме ті два слоти.
        */}
        <ScreenHeader
          title={task?.title ?? tr.subtasks}
          color={c.text}
          titleStyle={st.title}
          paddingBottom={16}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.text,
            style: { backgroundColor: glassOf(tk).surface, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabTasks, onPress: () => router.push('/(tabs)') },
            { label: task?.title ?? tr.subtasks },
          ]}
          crumbColor={c.sub}
          actions={task ? <PriorityBadge level={normalizePriority(task)} size="md" /> : undefined}>
          <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] }}>{doneCount}/{total} {tr.done}</Text>
        </ScreenHeader>

        {loadState === 'loading' ? (
          <ZoneSkeleton variant="list" rows={4} style={[contentWidth, { paddingHorizontal: 20 }]} />
        ) : loadState === 'error' ? (
          <ZoneError testID="subtasks-error" onRetry={() => { setLoadState('loading'); void readTask(true); }} />
        ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {/* FlatList, а не ScrollView+map: зазвичай підзавдань одиниці, але
              імпортований чек-лист на сотні пунктів монтувався б цілком. */}
          <FlatList
            data={sortedSubs}
            keyExtractor={subKey}
            renderItem={renderSub}
            ItemSeparatorComponent={SubSeparator}
            contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={total > 0 ? (
              // Omni: bento-картка прогресу — тонкий великий відсоток +
              // сегментний прогрес фірмовим градієнтом (як картка канбану).
              <BentoCard
                compact
                title={tr.subtasks}
                icon="checklist"
                accent="lavender"
                style={{ marginBottom: 16 }}
                headerRight={
                  <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{doneCount}/{total}</Text>
                }>
                <Text style={{ color: c.text, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'] }}>
                  {pct}<Text style={{ color: c.sub, fontSize: 18, fontFamily: fontFamily.regular }}>% {tr.done}</Text>
                </Text>
                <SegmentedProgress
                  value={total > 0 ? doneCount / total : 0}
                  accessibilityLabel={`${tr.subtasks}: ${doneCount}/${total}`}
                  style={{ marginTop: 12 }}
                />
              </BentoCard>
            ) : null}
            ListFooterComponent={
              <View style={[st.addSubRow, { backgroundColor: tk.surface.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderStyle: 'dashed', marginTop: sortedSubs.length > 0 ? 8 : 0 }]}>
                <IconSymbol name="plus" size={15} color={c.sub} />
                <TextInput
                  placeholder="Додати підзавдання..."
                  placeholderTextColor={tk.text.muted}
                  value={newSubtask}
                  onChangeText={setNewSubtask}
                  onSubmitEditing={addSubtask}
                  returnKeyType="done"
                  style={{ color: c.text, flex: 1, marginLeft: 10, fontSize: 14, fontFamily: fontFamily.regular, paddingVertical: 0 }}
                />
                {newSubtask.trim() ? (
                  <TouchableOpacity onPress={addSubtask} accessibilityRole="button" accessibilityLabel={tr.add} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="checkmark.circle.fill" size={22} color={c.text} />
                  </TouchableOpacity>
                ) : null}
              </View>
            }
          />
        </KeyboardAvoidingView>
        )}
      </SafeAreaView>
      {toastElement}
    </View>
  );
}

const st = StyleSheet.create({
  // Кегль заголовка тут менший за спільні 32: у шапці стоїть назва
  // завдання, і на телефоні довга назва інакше з'їдає весь рядок.
  title:       { fontSize: 18, fontFamily: fontFamily.semibold, letterSpacing: -0.4 },
  progressBg:  { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: radius.pill },
  subRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: radius.nested, minHeight: 48, paddingHorizontal: 16, paddingVertical: 13 },
  subCheck:    { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addSubRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: radius.nested, minHeight: 48, paddingHorizontal: 16, paddingVertical: 13 },
});
