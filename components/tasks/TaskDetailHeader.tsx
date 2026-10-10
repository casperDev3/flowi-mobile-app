import { Atlas } from '@/constants/atlas';
/**
 * components/tasks/TaskDetailHeader.tsx — липка шапка картки завдання.
 *
 * Живе в `header` у DetailPane, тобто ПОЗА прокруткою: у довгій задачі
 * (підзавдання, історія, сесії таймера) кнопка ✕ і перемикач вкладок лишаються
 * на місці, гортається лише тіло.
 *
 * Картка одна для особистих і проєктних задач (телефон — лист, планшет —
 * колонка праворуч). Окремого «режиму редагування» більше немає: назва
 * правиться тут же, тапом по ній, решта полів — рядками властивостей у
 * вкладках. Вкладки: Основне · Деталі · Команда (лише задача командного
 * проєкту) · Активність.
 *
 * Кнопка таймера (`timerSlot`) стоїть тут же, між назвою і вкладками: шапка
 * не гортається, тож «Старт таймера» під рукою на будь-якій вкладці.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ACTION } from '@/components/shared/actionMetrics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

export type TaskDetailTab = 'main' | 'details' | 'team' | 'activity';


/** Порядок вкладок; «Команда» вставляється лише коли вона має сенс. */
export function taskDetailTabs(showTeam: boolean): TaskDetailTab[] {
  return showTeam ? ['main', 'details', 'team', 'activity'] : ['main', 'details', 'activity'];
}

export interface TaskDetailHeaderProps {
  title: string;
  externalSource?: {provider:string;url?:string};
  /** Що стоїть перед назвою — напр. позначка «виконано». */
  leading?: React.ReactNode;
  /** Бейдж праворуч від назви (пріоритет). */
  badge?: React.ReactNode;
  tab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
  /** Вкладка «Команда» (задача проєкту з учасниками). */
  showTeam?: boolean;
  /** Крапка на вкладці «Активність», коли таймер задачі йде. */
  timerRunning: boolean;
  /** Перейменування на місці. Відсутній — назва лише для читання (глядач). */
  onRename?: (title: string) => void;
  onClose: () => void;
  /** Копіювати завдання як Markdown. Без нього кнопки немає. */
  onCopy?: () => void;
  /**
   * Додаткові дії шапки (іконки 44×44 перед «копіювати»), напр. «Стежити»
   * в задачі проєкту. Для кнопки — `TaskDetailHeaderAction`.
   */
  actions?: React.ReactNode;
  /** Кнопка старт/стоп таймера під назвою (TaskTimerButton). Без неї — нічого. */
  timerSlot?: React.ReactNode;
  /** Показувати «ручку» листа (лише на вузькому екрані). */
  showHandle: boolean;
  colors: { text: string; sub: string; border: string; dim: string; accent: string };
  tr: Translations;
}

export function TaskDetailHeader({
  title, leading, badge, tab, onTabChange, showTeam = false, timerRunning, onRename, onClose, onCopy, actions,
  timerSlot, showHandle, externalSource, colors: c, tr,
}: TaskDetailHeaderProps) {
  const tabs = taskDetailTabs(showTeam);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<TextInput>(null);
  // Синк міг змінити назву, поки поле закрите — показуємо свіжу.
  useEffect(() => { if (!renaming) setDraft(title); }, [title, renaming]);
  // Закриття картки посеред перейменування не дає onBlur — зберігаємо при демонтажі.
  const latest = useRef({ renaming, draft, title, onRename });
  latest.current = { renaming, draft, title, onRename };
  useEffect(() => () => {
    const l = latest.current;
    const next = l.draft.trim();
    if (l.renaming && next && next !== l.title.trim()) l.onRename?.(next);
  }, []);

  const commit = () => {
    // onSubmitEditing і onBlur приходять обидва — зберігаємо один раз.
    if (!latest.current.renaming) return;
    latest.current.renaming = false;
    const next = draft.trim();
    setRenaming(false);
    // Порожня назва не зберігається: задача без назви в списку — дірка.
    if (next && next !== title.trim()) onRename?.(next);
    else setDraft(title);
  };

  const labels: Record<TaskDetailTab, string> = {
    main: tr.cardTabMain,
    details: tr.cardTabDetails,
    team: tr.cardTabTeam,
    activity: tr.cardTabActivity,
  };

  return (
    <View style={st.wrap}>
      {externalSource?.url && /^https?:\/\//.test(externalSource.url) && <TouchableOpacity accessibilityRole="link" onPress={()=>void Linking.openURL(externalSource.url!)} style={{paddingVertical:8}}><Text style={{color:c.accent}}>Відкрити у вихідному сервісі · {externalSource.provider}</Text></TouchableOpacity>}
      {showHandle ? <View style={[st.handle, { backgroundColor: c.border }]} /> : null}

      <View style={st.titleRow}>
        {leading ? <View style={st.leading}>{leading}</View> : null}

        <View style={st.titleBox}>
          {renaming ? (
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              onSubmitEditing={commit}
              autoFocus
              returnKeyType="done"
              blurOnSubmit
              multiline
              accessibilityLabel={tr.taskNamePlaceholder}
              style={[st.title, st.titleInput, { color: c.text, borderColor: c.accent, backgroundColor: c.dim }]}
            />
          ) : onRename ? (
            <TouchableOpacity
              onPress={() => setRenaming(true)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint={tr.cardRenameHint}
              style={{ flex: 1 }}>
              <Text numberOfLines={3} accessibilityRole="header" style={[st.title, { color: c.text }]}>{title}</Text>
            </TouchableOpacity>
          ) : (
            <Text numberOfLines={3} accessibilityRole="header" style={[st.title, { color: c.text }]}>{title}</Text>
          )}
          {!renaming && badge ? <View style={st.badge}>{badge}</View> : null}
        </View>

        <View style={st.trailing}>
          {!renaming ? actions : null}
          {onCopy && !renaming ? (
            <TouchableOpacity
              onPress={onCopy}
              accessibilityRole="button"
              accessibilityLabel={tr.copyTask}
              style={st.iconBtn}>
              <IconSymbol name="doc.on.doc" size={ACTION.iconOnly} color={c.sub} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr.close}
            style={st.iconBtn}>
            <IconSymbol name="xmark" size={ACTION.iconOnly} color={c.sub} />
          </TouchableOpacity>
        </View>
      </View>

      {timerSlot ? <View style={st.timer}>{timerSlot}</View> : null}

      <View style={[st.tabs, { backgroundColor: c.dim }]} accessibilityRole="tablist">
        {tabs.map(key => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onTabChange(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={labels[key]}
              style={[st.tab, { backgroundColor: active ? c.accent : 'transparent' }]}>
              <Text numberOfLines={1} style={{ color: active ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>
                {labels[key]}
              </Text>
              {key === 'activity' && timerRunning ? (
                <View style={[st.runDot, { backgroundColor: active ? '#fff' : '#6366F1' }]} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** Іконка-дія шапки картки (той самий розмір, що «копіювати» і ✕). */
export function TaskDetailHeaderAction({ icon, label, onPress, color, active }: {
  icon: React.ComponentProps<typeof IconSymbol>['name'];
  label: string;
  onPress: () => void;
  color: string;
  /** Увімкнений перемикач (напр. «Стежу») — озвучується як selected. */
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={st.iconBtn}>
      <IconSymbol name={icon} size={ACTION.iconOnly} color={color} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap:       { paddingBottom: 10 },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  titleRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  leading:    { paddingTop: 2 },
  titleBox:   { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  title:      { flex: 1, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  titleInput: { borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 8, paddingVertical: 4 },
  badge:      { marginLeft: 8, marginTop: 2 },
  // Кнопки шапки — повні 44×44 (раніше 32 + hitSlop, що впирався в сусіда);
  // міри й розмір іконки — спільні з ActionBar, однакові на всіх платформах.
  trailing:   { flexDirection: 'row', alignItems: 'center', marginTop: -10, marginRight: -10 },
  iconBtn:    { width: ACTION.height, height: ACTION.height, borderRadius: ACTION.radius, alignItems: 'center', justifyContent: 'center' },
  timer:      { marginBottom: 10 },
  tabs:       { flexDirection: 'row', gap: 4, borderRadius: Atlas.radius.medium, padding: 4 },
  tab:        { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  runDot:     { width: 6, height: 6, borderRadius: 3 },
});
