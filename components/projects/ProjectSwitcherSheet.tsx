/**
 * components/projects/ProjectSwitcherSheet.tsx — свічер проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «У шапці свічер проєкту» на телефоні,
 * «сайдбар... із «← Особисте» вгорі і свічером» на планшеті).
 *
 * Один компонент для обох поверхонь: телефонний хедер відкриває його як
 * модалку (ProjectSwitcherTrigger нижче), а ProjectSidebar планшета вбудовує
 * той самий список під своїм заголовком. Розійтися тут означало б, що
 * перелік «нещодавніх» на телефоні й на планшеті — різний.
 *
 * «← Особисте» — завжди перший рядок: вихід із простору проєкту так само
 * досяжний, як і перехід в інший проєкт, одним і тим самим жестом.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { addRecentProject, getRecentProjects } from '@/store/project-sync';
import type { Project } from '@/app/projects';
import { isProjectArchived } from '@/utils/projectUtils';

export interface ProjectSwitcherColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
  dim: string;
}

interface RowProps {
  project: Project;
  active: boolean;
  onPress: (id: string) => void;
  c: ProjectSwitcherColors;
}

function ProjectRow({ project, active, onPress, c }: RowProps) {
  return (
    <TouchableOpacity
      onPress={() => onPress(project.id)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[st.row, active && { backgroundColor: c.accent + '16' }]}>
      <View style={[st.dot, { backgroundColor: project.color }]} />
      <Text numberOfLines={1} style={{ flex: 1, color: active ? c.accent : c.text, fontSize: 14, fontWeight: active ? '700' : '600' }}>
        {project.name}
      </Text>
      {active ? <IconSymbol name="checkmark" size={14} color={c.accent} /> : null}
    </TouchableOpacity>
  );
}

/** Список проєкту — спільний для сайдбара (inline) і модалки (Modal нижче). */
export function ProjectSwitcherList({
  currentProjectId, isDark, c, onNavigate, onExit,
}: {
  currentProjectId: string;
  isDark: boolean;
  c: ProjectSwitcherColors;
  onNavigate: (projectId: string) => void;
  onExit: () => void;
}) {
  const { tr } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([loadData<Project[]>('projects', []), getRecentProjects()]).then(([p, r]) => {
      if (!mounted) return;
      setProjects(Array.isArray(p) ? p : []);
      setRecent(r);
    });
    return () => { mounted = false; };
  }, []);

  const live = useMemo(() => projects.filter(p => !isProjectArchived(p)), [projects]);
  const recentProjects = useMemo(
    () => recent.map(id => live.find(p => p.id === id)).filter((p): p is Project => !!p && p.id !== currentProjectId),
    [recent, live, currentProjectId],
  );
  const others = useMemo(
    () => [...live]
      .filter(p => !recentProjects.some(r => r.id === p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [live, recentProjects],
  );

  return (
    <>
      <TouchableOpacity
        onPress={onExit}
        accessibilityRole="button"
        style={[st.row, { marginBottom: 4 }]}>
        <IconSymbol name="chevron.left" size={15} color={c.accent} />
        <Text style={{ flex: 1, color: c.accent, fontSize: 14, fontWeight: '700' }}>{tr.projectExitToPersonal}</Text>
      </TouchableOpacity>

      {recentProjects.length > 0 && (
        <>
          <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.projectSwitcherRecent}</Text>
          {recentProjects.map(p => (
            <ProjectRow key={p.id} project={p} active={p.id === currentProjectId} onPress={onNavigate} c={c} />
          ))}
        </>
      )}

      <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.projectSwitcherAll}</Text>
      {others.length === 0 && recentProjects.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8, paddingVertical: 6 }}>{tr.projectSwitcherEmpty}</Text>
      ) : others.map(p => (
        <ProjectRow key={p.id} project={p} active={p.id === currentProjectId} onPress={onNavigate} c={c} />
      ))}
    </>
  );
}

export function ProjectSwitcherSheet({
  visible, onClose, currentProjectId, isDark, accent,
}: {
  visible: boolean;
  onClose: () => void;
  currentProjectId: string;
  isDark: boolean;
  accent: string;
}) {
  const router = useRouter();
  const { tr } = useI18n();

  const c: ProjectSwitcherColors = {
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.6)' : 'rgba(26,20,51,0.55)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    accent,
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const navigate = (projectId: string) => {
    onClose();
    if (projectId === currentProjectId) return;
    void addRecentProject(projectId);
    router.replace({ pathname: '/project/[id]/overview', params: { id: projectId } } as never);
  };

  const exitToPersonal = () => {
    onClose();
    router.replace('/(tabs)/today');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrap}>
          <BlurView
            intensity={isDark ? 50 : 70}
            tint={isDark ? 'dark' : 'light'}
            style={[st.sheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)' }]}>
            <View style={st.handle} />
            <Text style={[st.title, { color: c.text }]}>{tr.projectSwitcherTitle}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <ProjectSwitcherList
                currentProjectId={currentProjectId}
                isDark={isDark}
                c={c}
                onNavigate={navigate}
                onExit={exitToPersonal}
              />
            </ScrollView>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Пілюля-тригер для шапки телефону: колір+назва поточного проєкту, тап відкриває свічер. */
export function ProjectSwitcherTrigger({
  name, color, onPress, textColor,
}: {
  name: string;
  color: string;
  onPress: () => void;
  textColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={st.trigger}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <View style={[st.dot, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={{ color: textColor, fontSize: 12, fontWeight: '700', maxWidth: 180 }}>{name}</Text>
      <IconSymbol name="chevron.down" size={10} color={textColor} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: 34 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 18, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 10, marginBottom: 4, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 2 },
});
