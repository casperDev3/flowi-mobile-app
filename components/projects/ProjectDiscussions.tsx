/**
 * components/projects/ProjectDiscussions.tsx — «Обговорення» простору проєкту.
 *
 * Повʼязане завдання відкривається ТУТ, аркушем (ProjectTaskSheet), а не на
 * екрані «Завдання»: обговорення лишається під рукою. Дії теми — спільна
 * композиція ActionBar (однакові 44pt і проміжки), фільтри — ActionChip.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { CommentsSection } from '@/components/shared/CommentsSection';
import { ActionBar, ActionButton, ActionChip } from '@/components/shared/ActionBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { Layout, detailColumnWidthFor } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import type { Task } from '@/utils/taskUtils';
import { isLead, teamPreferencesId, type Discussion, type TeamPreferences } from '@/utils/teamwork';
import { projectShellColors } from './ProjectScreenShell';
import { ProjectTaskSheet } from './ProjectTaskSheet';
import { TeamInput } from './TeamTaskPanel';
import { saveProjectRecord, useProjectRecords } from './useProjectRecords';

type Filter = 'all' | 'topic' | 'chat' | 'archive';

export function ProjectDiscussions({ projectId, initialId }: { projectId: string; initialId?: string }) {
  const { user } = useAuth();
  const uid = String(user?.id ?? '');
  const role = useProjectRole(projectId);
  const { tr, lang } = useI18n();
  const dark = useColorScheme() === 'dark';
  const { project } = useProject(projectId);
  const c = projectShellColors(dark, project?.color ?? '#7C3AED', project?.appearance);
  const prefs = useProjectRecords<TeamPreferences>('team_preferences').find(p => p.projectId === projectId && p.userId === uid);
  const rooms = useProjectRecords<Discussion>('discussions').filter(d => d.projectId === projectId);
  const tasks = useProjectRecords<Task>('tasks').filter(t => t.projectId === projectId && !t.backlogKind);
  const [selected, setSelected] = useState(initialId ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Discussion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const room = rooms.find(d => d.id === selected);
  const canManage = !!room && (isLead(role) || room.authorId === uid) && role !== 'viewer';

  async function run(fn: () => Promise<unknown>) {
    setError(''); setBusy(true);
    try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  // Планшет (рішення 6): список обговорень ліворуч, відкрите — колонкою праворуч.
  // Поріг — від ширини ЕКРАНА: у просторі проєкту сайдбар займає 232pt.
  const { width } = useResponsive();
  const split = useScreenWidth() >= 900;

  const watched = !!room && !!prefs?.watchedDiscussionIds?.includes(room.id);
  const toggleWatch = () => {
    if (!room) return;
    const ids = prefs?.watchedDiscussionIds ?? [];
    void run(() => saveProjectRecord('team_preferences', {
      ...prefs, id: teamPreferencesId(projectId, uid), projectId, userId: uid,
      watchedDiscussionIds: watched ? ids.filter(id => id !== room.id) : [...ids, room.id],
    }));
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: tr.pdAll }, { key: 'topic', label: tr.pdTopics },
    { key: 'chat', label: tr.pdChats }, { key: 'archive', label: tr.pdArchive },
  ];
  const visibleRooms = rooms.filter(d =>
    (filter === 'archive' ? !!d.archivedAt : !d.archivedAt && (filter === 'all' || (d.kind ?? 'topic') === filter))
    && `${d.title} ${d.body}`.toLowerCase().includes(search.toLowerCase()));

  const listPart = (
    <>
      <TeamInput label={tr.pdSearch} value={search} onChange={setSearch} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {filters.map(f => <ActionChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} colors={c} />)}
      </ScrollView>
      {role !== 'viewer' && (
        <ActionBar align="end">
          <ActionButton
            label={tr.pdNew}
            icon="plus"
            tone="primary"
            onPress={() => setDraft({ id: `discussion-${Date.now()}`, projectId, title: '', body: '', kind: 'topic', authorId: uid, createdAt: new Date().toISOString(), taskIds: [] })}
            colors={c}
          />
        </ActionBar>
      )}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#DB4444' }}>{error}</Text>}
      {visibleRooms.map(d => (
        <Pressable
          key={d.id}
          onPress={() => setSelected(d.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: d.id === selected }}
          accessibilityLabel={`${d.kind === 'chat' ? tr.pdChat : tr.pdTopic} · ${d.title}`}
          style={({ pressed }) => ({
            minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
            borderRadius: Atlas.radius.large, borderWidth: 1,
            borderColor: d.id === selected ? c.accent : c.border, backgroundColor: c.dim, opacity: pressed ? 0.7 : 1,
          })}>
          <IconSymbol name={d.kind === 'chat' ? 'bubble.left.and.bubble.right.fill' : 'text.alignleft'} size={15} color={c.accent} />
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{d.title}</Text>
          <Text style={{ color: c.sub, fontSize: 11 }}>{d.kind === 'chat' ? tr.pdChat : tr.pdTopic}</Text>
        </Pressable>
      ))}
    </>
  );

  const roomPart = room ? (
    <View style={{ gap: 12, borderWidth: 1, borderColor: c.border, borderRadius: Atlas.radius.xlarge, padding: 14 }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontWeight: '700', fontSize: 20 }}>{room.title}</Text>
      {room.body ? <Text style={{ color: c.text }}>{room.body}</Text> : null}
      {/* Дії теми — один рядок: вторинні ліворуч, «Створити завдання» праворуч. */}
      <ActionBar>
        <ActionButton label={watched ? tr.taskUnwatch : tr.taskWatch} icon="eye" tone={watched ? 'secondary' : 'neutral'} selected={watched} onPress={toggleWatch} colors={c} />
        {canManage && <ActionButton label={tr.pdEdit} icon="pencil" tone="neutral" onPress={() => setDraft({ ...room })} colors={c} />}
        {canManage && (
          <ActionButton
            disabled={busy}
            label={room.archivedAt ? tr.pdRestore : tr.pdArchiveAction}
            icon={room.archivedAt ? 'arrow.uturn.backward' : 'archivebox'}
            tone="neutral"
            onPress={() => void run(() => saveProjectRecord('discussions', { ...room, archivedAt: room.archivedAt ? undefined : new Date().toISOString() }))}
            colors={c}
          />
        )}
        {canManage && !room.archivedAt && (
          <ActionButton
            disabled={busy}
            label={tr.pdCreateTask}
            icon="plus"
            tone="primary"
            onPress={() => void run(async () => {
              const task: Task = { id: `topic-task-${Date.now()}`, projectId, title: room.title, description: room.body, status: 'active', subtasks: [], createdAt: new Date().toISOString(), createdBy: uid };
              await saveProjectRecord('tasks', task);
              await saveProjectRecord('discussions', { ...room, taskIds: [...(room.taskIds ?? []), task.id] });
            })}
            colors={c}
          />
        )}
      </ActionBar>
      {(room.taskIds ?? []).length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{tr.pdLinkedTasks}</Text>
          {(room.taskIds ?? []).map(id => {
            const title = tasks.find(t => t.id === id)?.title ?? tr.pdTaskFallback;
            return (
              <Pressable
                key={id}
                onPress={() => setOpenTaskId(id)}
                accessibilityRole="button"
                accessibilityLabel={title}
                style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, opacity: pressed ? 0.7 : 1 })}>
                <IconSymbol name="checklist" size={15} color={c.accent} />
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
                <IconSymbol name="chevron.right" size={12} color={c.sub} />
              </Pressable>
            );
          })}
        </View>
      )}
      <CommentsSection key={room.id} projectId={projectId} targetType="discussion" targetId={room.id} isOwner={role === 'owner' && !room.archivedAt} currentUserId={role === 'viewer' || room.archivedAt ? null : uid} colors={c} isDark={dark} locale={lang} tr={tr} />
    </View>
  ) : split ? <Text style={{ color: c.sub, padding: 12 }}>{tr.discussionsSelectHint}</Text> : null;

  return (
    <View style={{ gap: 12 }}>
      {split ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>{listPart}</View>
          <View style={{ width: detailColumnWidthFor(width) }}>{roomPart}</View>
        </View>
      ) : <>{listPart}{roomPart}</>}
      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: c.bg1 }} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 80, gap: 12, width: '100%', maxWidth: Layout.readingMaxWidth, alignSelf: 'center' }}>
          {draft && <>
            <TeamInput label={tr.pdTitle} value={draft.title} onChange={v => setDraft({ ...draft, title: v })} />
            <TeamInput label={tr.pdBody} value={draft.body} onChange={v => setDraft({ ...draft, body: v })} multiline />
            <ActionBar>
              {(['topic', 'chat'] as const).map(kind => (
                <ActionChip key={kind} label={kind === 'topic' ? tr.pdTopic : tr.pdChat} selected={draft.kind === kind} onPress={() => setDraft({ ...draft, kind })} colors={c} />
              ))}
            </ActionBar>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{tr.pdLinkedTasks}</Text>
            <ActionBar>
              {tasks.map(t => (
                <ActionChip
                  key={t.id}
                  label={t.title}
                  selected={!!draft.taskIds?.includes(t.id)}
                  onPress={() => setDraft({ ...draft, taskIds: draft.taskIds?.includes(t.id) ? draft.taskIds.filter(id => id !== t.id) : [...(draft.taskIds ?? []), t.id] })}
                  colors={c}
                />
              ))}
            </ActionBar>
            <ActionBar align="stretch" wrap={false} style={{ marginTop: 8 }}>
              <ActionButton label={tr.close} tone="neutral" grow={1} onPress={() => setDraft(null)} colors={c} />
              <ActionButton
                label={tr.save}
                tone="primary"
                grow={2}
                disabled={busy || !draft.title.trim()}
                onPress={() => void run(async () => {
                  await saveProjectRecord('discussions', { ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() });
                  setSelected(draft.id); setDraft(null);
                })}
                colors={c}
              />
            </ActionBar>
          </>}
        </ScrollView>
      </Modal>
      <ProjectTaskSheet projectId={projectId} taskId={openTaskId} onClose={() => setOpenTaskId(null)} isDark={dark} />
    </View>
  );
}
