/**
 * components/projects/TeamTaskPanel.tsx — вкладка «Команда» картки завдання.
 *
 * Лише командні поля: виконавець, спринт, перевірка, перешкоди, залежності,
 * обовʼязковий результат. Дедлайн і пріоритет тут більше НЕ дублюються (раніше
 * були текстом «РРРР-ММ-ДД» і числом P0–P5) — вони живуть у «Основному»
 * звичайними контролами, оцінка — у «Деталях».
 *
 * Кожне поле — рядок властивості, зміна зберігається одразу (без окремої
 * кнопки «Зберегти зміни»). Запис — field-level: береться СВІЖА задача зі
 * сховища і накладається лише змінене поле, тож правка тут не відкочує
 * паралельну правку назви чи статусу з іншого пристрою.
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { InlineTextArea, MultiOptionField, OptionField, type FieldOption } from '@/components/tasks/card/fields';
import { ActionBar, ActionButton } from '@/components/shared/ActionBar';
import { PropertyGroup, ToggleRow, type CardColors } from '@/components/tasks/card/primitives';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProjectMembers } from '@/hooks/use-project-members';
import { apiFetch } from '@/store/api';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { fetchProjectMembers } from '@/store/project-team';
import { syncProject } from '@/store/project-sync';
import { loadData, subscribeToStorage } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import type { Task } from '@/utils/taskUtils';
import {
  dependencyWarnings,
  projectedRemaining,
  resultProblem,
  taskRights,
  type TeamRole,
  type WorkloadRow,
} from '@/utils/teamwork';

import { ProjectPaletteContext } from './ProjectPaletteContext';
import { TeamResultFiles } from './TeamResultFiles';

export { TeamButton, TeamInput } from './TeamControls';

type StatusColumn = { id: string; projectId?: string; isDone: boolean; name?: string; sourceStatusId?: string; type?: string };

/**
 * Чи показувати вкладку «Команда»: проєкт має інших учасників, або задача вже
 * несе командні дані (щоб їх не сховати після виходу учасника з проєкту).
 */
/** Порядок дій у рядку: деструктивна ліворуч, основна праворуч. */
const TONE_RANK: Record<'danger' | 'secondary' | 'primary', number> = { danger: 0, secondary: 1, primary: 2 };

export function hasTeamContext(task: Pick<Task, 'projectId' | 'reviewRequired' | 'blocked' | 'dependencyIds' | 'resultRequirements' | 'reviewState'>, memberCount: number): boolean {
  if (!task.projectId) return false;
  if (memberCount > 1) return true;
  return !!(task.reviewRequired || task.blocked || task.dependencyIds?.length || task.resultRequirements?.length
    || (task.reviewState && task.reviewState !== 'none'));
}

export interface TeamTaskPanelProps {
  task: Task;
  role: TeamRole;
  onSaved?: () => void;
  /** Поле «Спринт» — його будує екран (знає спринти й шлях запису). */
  sprintSlot?: React.ReactNode;
  colors?: CardColors;
  isDark?: boolean;
}

export function TeamTaskPanel({ task, role, onSaved, sprintSlot, colors, isDark: isDarkProp }: TeamTaskPanelProps) {
  const scheme = useColorScheme();
  const isDark = isDarkProp ?? scheme === 'dark';
  const palette = useContext(ProjectPaletteContext);
  const c: CardColors = colors ?? {
    text: palette?.text ?? (isDark ? '#F0EEFF' : '#302341'),
    sub: palette?.sub ?? (isDark ? 'rgba(240,238,255,0.62)' : 'rgba(48,35,65,0.6)'),
    border: palette?.border ?? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(48,35,65,0.14)'),
    dim: palette?.dim ?? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
    accent: palette?.accent ?? '#7C3AED',
    sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };
  const { tr } = useI18n();
  const { user } = useAuth();
  const uid = String(user?.id ?? '');
  const pid = task.projectId!;
  const members = useProjectMembers(pid).filter(m => m.role !== 'viewer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [startColumn, setStartColumn] = useState<string | null>(null);
  // «Заблоковано» без причини не зберігається: перемикач спершу відкриває поле.
  const [blockingDraft, setBlockingDraft] = useState(false);
  const [feedback, setFeedback] = useState(task.reviewFeedback ?? '');

  useEffect(() => {
    void loadData<StatusColumn[]>('task_statuses', []).then(columns => {
      const col = columns.find(x => x.projectId === pid && x.sourceStatusId === 'status-in-progress')
        ?? columns.find(x => x.projectId === pid && x.type === 'in_progress');
      setStartColumn(col?.id ?? null);
    });
  }, [pid]);
  useEffect(() => {
    void fetchProjectMembers(pid).catch(() => {});
    let mounted = true;
    const read = () => { void loadData<Task[]>('tasks', []).then(rows => { if (mounted) setTasks(rows); }); };
    read();
    const off = subscribeToStorage(key => { if (key === 'tasks') read(); });
    return () => { mounted = false; off(); };
  }, [pid]);
  useEffect(() => { setBlockingDraft(false); setError(''); setFeedback(task.reviewFeedback ?? ''); }, [task.id, task.reviewFeedback]);

  const rights = taskRights(task, role, uid);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  // Навантаження залежить лише від полів, що входять у підрахунок
  // (виконавець, оцінка, дедлайн, статус), — а не від кожного updatedAt:
  // інакше кожна правка опису чи коментаря слала запит /workload/.
  useEffect(() => {
    if (!rights.lead) return;
    void apiFetch<{ results: WorkloadRow[] }>(`/projects/${encodeURIComponent(pid)}/workload/`)
      .then(r => setWorkload(r.results)).catch(() => {});
  }, [pid, rights.lead, task.assigneeId, task.estimatedMinutes, task.deadline, task.status, task.reviewState]);
  const load = workload.find(row => row.userId === task.assigneeId);
  const remaining = load ? projectedRemaining(load, task, task) : null;

  const memberName = (id: string | null | undefined) => {
    const m = members.find(x => String(x.user.id) === id);
    if (!m) return null;
    return String(m.user.id) === uid ? tr.taskAssigneeMe : (m.user.name || m.user.email);
  };
  const memberOptions = (exclude?: string | null): FieldOption[] => members
    .filter(m => String(m.user.id) !== exclude)
    .map(m => ({
      id: String(m.user.id),
      label: String(m.user.id) === uid ? tr.taskAssigneeMe : (m.user.name || m.user.email),
      sub: m.user.name ? m.user.email : undefined,
      icon: 'person.fill' as const,
    }));

  const commit = async (patch: Partial<Task>) => {
    setError('');
    setBusy(true);
    try {
      const all = await loadData<Task[]>('tasks', []);
      const fresh = all.find(t => t.id === task.id) ?? task;
      const next: Task = { ...fresh, ...patch, updatedAt: new Date().toISOString() };
      if (next.blocked && !next.blockReason?.trim()) { setError(tr.cardTeamErrBlockReason); return; }
      if (patch.reviewState === 'pending' || patch.status === 'done') {
        const problem = resultProblem(next);
        if (problem) { setError(problem); return; }
      }
      if (patch.reviewState === 'changes_requested' && !next.reviewFeedback?.trim()) { setError(tr.cardTeamErrFeedback); return; }
      if (patch.status) {
        const columns = await loadData<StatusColumn[]>('task_statuses', []);
        const reviewCol = patch.reviewState === 'pending'
          ? columns.find(x => x.projectId === pid && (x.sourceStatusId === 'team-review' || /перевір|review/i.test(x.name ?? '')))
          : undefined;
        const col = reviewCol ?? columns.find(x => x.projectId === pid && (patch.status === 'done' ? x.isDone : !x.isDone));
        if (col) next.kanbanColumnId = col.id;
      }
      await saveSyncedChanges('tasks', all, all.map(t => t.id === task.id ? next : t));
      onSaved?.();
      void syncProject(pid);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !!task.blocked || blockingDraft;
  const deps = useMemo(
    () => tasks.filter(t => t.projectId === pid && t.id !== task.id && !t.backlogKind),
    [tasks, pid, task.id],
  );
  const warnings = useMemo(() => dependencyWarnings(task, tasks), [task, tasks]);
  const requirementOptions: FieldOption[] = [
    { id: 'summary', label: tr.cardTeamReqSummary },
    { id: 'link', label: tr.cardTeamReqLink },
    { id: 'file', label: tr.cardTeamReqFile },
  ];

  // ── Дії, що рухають задачу (вгорі: це те, заради чого вкладку відкривають)
  const actions: { key: string; label: string; icon: IconSymbolName; onPress: () => void; tone?: 'primary' | 'danger' }[] = [];
  if (rights.take) actions.push({ key: 'take', label: tr.cardTeamTake, icon: 'person.badge.plus', onPress: () => void commit({ assigneeId: uid }) });
  if (rights.execute && startColumn && task.kanbanColumnId !== startColumn && task.status !== 'done' && task.reviewState !== 'pending' && task.reviewState !== 'needs_reviewer') {
    actions.push({ key: 'start', label: tr.cardTeamStart, icon: 'play.fill', onPress: () => void commit({ kanbanColumnId: startColumn }) });
  }
  if (rights.submit && task.status !== 'done' && task.reviewState !== 'pending' && task.reviewState !== 'needs_reviewer') {
    actions.push(task.reviewRequired
      ? { key: 'submit', label: tr.cardTeamSubmitReview, icon: 'paperplane.fill', tone: 'primary', onPress: () => void commit({ reviewState: 'pending', status: 'active' }) }
      : { key: 'done', label: tr.cardTeamComplete, icon: 'checkmark.circle.fill', tone: 'primary', onPress: () => void commit({ status: 'done' }) });
  }
  if (rights.submit && task.reviewState === 'pending') {
    actions.push({ key: 'recall', label: tr.cardTeamRecall, icon: 'arrow.uturn.backward', onPress: () => void commit({ reviewState: 'none', status: 'active' }) });
  }
  if (rights.review) {
    actions.push({ key: 'approve', label: tr.cardTeamApprove, icon: 'checkmark.seal', tone: 'primary', onPress: () => void commit({ reviewState: 'approved', status: 'done' }) });
    actions.push({ key: 'return', label: tr.cardTeamReturn, icon: 'arrow.counterclockwise', tone: 'danger', onPress: () => void commit({ reviewState: 'changes_requested', status: 'active', reviewFeedback: feedback.trim() }) });
  }
  if (rights.execute && task.status === 'done') {
    actions.push({ key: 'reopen', label: tr.cardTeamReopen, icon: 'arrow.counterclockwise', onPress: () => void commit({ status: 'active', reviewState: 'none' }) });
  }

  const reviewBanner = task.reviewState === 'needs_reviewer' ? { text: tr.cardTeamNeedsReviewer, color: '#F59E0B', icon: 'clock' as const }
    : task.reviewState === 'pending' ? { text: tr.cardTeamPending, color: '#F59E0B', icon: 'clock' as const }
    : task.reviewState === 'approved' ? { text: tr.cardTeamApproved, color: '#10B981', icon: 'checkmark.seal' as const }
    : task.reviewState === 'changes_requested' ? { text: tr.cardTeamChangesRequested, color: '#EF4444', icon: 'exclamationmark.circle' as const }
    : null;

  const reviewerOptions = memberOptions(task.assigneeId);

  return (
    <View>
      {reviewBanner ? (
        <View style={[st.banner, { borderColor: reviewBanner.color + '55', backgroundColor: reviewBanner.color + '14' }]}>
          <IconSymbol name={reviewBanner.icon} size={15} color={reviewBanner.color} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: reviewBanner.color, fontWeight: '700', fontSize: 13 }}>{reviewBanner.text}</Text>
            {task.reviewFeedback ? (
              <Text style={{ color: c.text, fontSize: 13, marginTop: 2 }}>{tr.cardTeamRemarks}: {task.reviewFeedback}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {actions.length > 0 ? (
        // Спільна композиція дій (ActionBar): деструктивна → вторинні →
        // основна, однакові 44pt і проміжки на всіх платформах.
        <ActionBar>
          {[...actions]
            .sort((a, b) => TONE_RANK[a.tone ?? 'secondary'] - TONE_RANK[b.tone ?? 'secondary'])
            .map(a => (
              <ActionButton
                key={a.key}
                label={a.label}
                icon={a.icon}
                tone={a.tone === 'danger' ? 'danger' : a.tone === 'primary' ? 'primary' : 'secondary'}
                disabled={busy}
                grow={1}
                onPress={a.onPress}
                colors={c}
              />
            ))}
        </ActionBar>
      ) : null}

      {rights.review ? (
        <View style={{ marginTop: 10 }}>
          {/* Звичайне поле, а не «зберегти при втраті фокуса»: текст читає
              кнопка «Повернути», і натискання може випередити blur. */}
          <TextInput
            value={feedback}
            onChangeText={setFeedback}
            multiline
            placeholder={tr.cardTeamFeedback}
            placeholderTextColor={c.sub}
            accessibilityLabel={tr.cardTeamFeedback}
            style={[st.input, { color: c.text, borderColor: c.border }]}
          />
        </View>
      ) : null}

      {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}

      <PropertyGroup title={tr.cardTeamResponsibility} colors={c}>
        <OptionField
          icon="person.fill"
          label={tr.taskAssignee}
          options={memberOptions()}
          value={task.assigneeId ?? null}
          selectedLabel={memberName(task.assigneeId)}
          onChange={id => void commit({ assigneeId: id })}
          emptyOption={{ label: tr.taskAssigneeUnassigned, icon: 'person.slash' }}
          disabled={!rights.lead || busy}
          colors={c}
          isDark={isDark}
        />
        {sprintSlot ?? null}
      </PropertyGroup>
      {load ? (
        <Text style={[st.note, { color: remaining !== null && remaining < 0 ? '#EF4444' : c.sub }]}>
          {remaining === null
            ? tr.cardTeamLoadUnknown
            : tr.cardTeamLoadLeft.replace('{h}', String(Math.round(remaining / 6) / 10))}
          {remaining !== null && remaining < 0 ? ` · ${tr.cardTeamOverload}` : ''}
        </Text>
      ) : null}

      <PropertyGroup title={tr.cardTeamReview} colors={c}>
        <ToggleRow
          icon="checkmark.seal"
          label={tr.cardTeamReviewRequired}
          value={!!task.reviewRequired}
          onChange={v => void commit({ reviewRequired: v, ...(!v ? { reviewerId: null, reviewState: 'none' as const } : {}) })}
          disabled={!rights.lead || busy}
          colors={c}
        />
        {task.reviewRequired ? (
          <OptionField
            icon="person.2.fill"
            label={tr.cardTeamReviewer}
            options={reviewerOptions}
            value={task.reviewerId ?? null}
            selectedLabel={memberName(task.reviewerId)}
            onChange={id => void commit({ reviewerId: id, ...(task.reviewState === 'needs_reviewer' && id ? { reviewState: 'pending' as const } : {}) })}
            emptyOption={{ label: tr.taskAssigneeUnassigned, icon: 'person.slash' }}
            disabled={!rights.lead || busy}
            colors={c}
            isDark={isDark}
          />
        ) : null}
      </PropertyGroup>

      <PropertyGroup title={tr.cardTeamObstacles} colors={c}>
        <ToggleRow
          icon="hand.raised"
          label={tr.cardTeamBlocked}
          value={blocked}
          onChange={v => {
            if (!v) { setBlockingDraft(false); if (task.blocked) void commit({ blocked: false }); return; }
            if (task.blockReason?.trim()) void commit({ blocked: true });
            else setBlockingDraft(true);
          }}
          disabled={!rights.execute || busy}
          colors={c}
        />
        {blocked ? (
          <OptionField
            icon="person.fill"
            label={tr.cardTeamBlockedBy}
            options={memberOptions()}
            value={task.blockedById ?? null}
            selectedLabel={memberName(task.blockedById)}
            onChange={id => void commit({ blockedById: id })}
            emptyOption={{ label: tr.taskAssigneeUnassigned, icon: 'person.slash' }}
            disabled={!rights.execute || busy || !task.blocked}
            colors={c}
            isDark={isDark}
          />
        ) : null}
        {rights.lead || (task.dependencyIds?.length ?? 0) > 0 ? (
          <MultiOptionField
            icon="arrow.triangle.2.circlepath"
            label={tr.cardTeamDependencies}
            options={deps.map(t => ({ id: t.id, label: t.title }))}
            value={task.dependencyIds ?? []}
            onChange={ids => void commit({ dependencyIds: ids })}
            disabled={!rights.lead || busy}
            colors={c}
            isDark={isDark}
          />
        ) : null}
      </PropertyGroup>
      {blocked ? (
        <View style={{ marginTop: 8 }}>
          <InlineTextArea
            value={task.blockReason ?? ''}
            onCommit={text => {
              if (blockingDraft && !task.blocked) {
                if (text) void commit({ blocked: true, blockReason: text });
              } else void commit({ blockReason: text });
            }}
            placeholder={tr.cardTeamBlockReason}
            label={tr.cardTeamBlockReason}
            editable={rights.execute}
            colors={c}
          />
          {blockingDraft && !task.blocked ? (
            <Text style={[st.note, { color: '#F59E0B' }]}>{tr.cardTeamErrBlockReason}</Text>
          ) : null}
        </View>
      ) : null}
      {warnings.map(t => (
        <Text key={t.id} style={[st.note, { color: '#A46B1B' }]}>{tr.cardTeamDepWarn.replace('{title}', t.title)}</Text>
      ))}

      <PropertyGroup title={tr.cardTeamResult} colors={c}>
        <MultiOptionField
          icon="list.bullet.clipboard"
          label={tr.cardTeamRequiredResult}
          options={requirementOptions}
          value={task.resultRequirements ?? []}
          onChange={ids => void commit({ resultRequirements: ids as Task['resultRequirements'] })}
          disabled={!rights.lead || busy}
          colors={c}
          isDark={isDark}
        />
      </PropertyGroup>
      <View style={{ marginTop: 8, gap: 8 }}>
        <InlineTextArea
          value={task.resultSummary ?? ''}
          onCommit={text => void commit({ resultSummary: text })}
          placeholder={tr.cardTeamResultSummary}
          label={tr.cardTeamResultSummary}
          editable={rights.execute}
          minHeight={56}
          colors={c}
        />
        <InlineTextArea
          value={(task.resultLinks ?? []).join('\n')}
          onCommit={text => void commit({ resultLinks: text.split('\n').map(s => s.trim()).filter(Boolean) })}
          placeholder={tr.cardTeamResultLinks}
          label={tr.cardTeamResultLinks}
          editable={rights.execute}
          colors={c}
        />
        <TeamResultFiles projectId={pid} ids={task.resultFiles ?? []} editable={rights.execute} onChange={files => void commit({ resultFiles: files })} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  banner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  error:     { color: '#D94040', marginTop: 10, fontSize: 13 },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 56, fontSize: 14, textAlignVertical: 'top' },
  note:      { fontSize: 12, marginTop: 6, marginLeft: 2 },
});
