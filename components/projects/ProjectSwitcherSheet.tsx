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

import { wideModalStyles } from '@/components/finance/wideModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { addRecentProject, getRecentProjects } from '@/store/project-sync';
import type { Project } from '@/app/projects';
import { isProjectArchived } from '@/utils/projectUtils';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

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
      // DS v2: активний — subtle-плашка + галочка; колір проєкту — лише крапка.
      style={[st.row, active && { backgroundColor: c.dim }]}>
      <View style={[st.dot, { backgroundColor: project.color }]} />
      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: active ? fontFamily.semibold : fontFamily.medium }}>
        {project.name}
      </Text>
      {active ? <IconSymbol name="checkmark" size={14} color={c.text} /> : null}
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
        <IconSymbol name="chevron.left" size={15} color={c.text} />
        <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.projectExitToPersonal}</Text>
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
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, paddingVertical: 6, paddingHorizontal: 12 }}>{tr.projectSwitcherEmpty}</Text>
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
  // Планшет: свічер — центрований діалог (рішення 6), а не смуга внизу на всю ширину.
  const { isWide } = useResponsive();
  const wm = wideModalStyles(isWide);

  const t = dsTokens(isDark);
  const c: ProjectSwitcherColors = {
    text: t.text.primary,
    sub: t.text.secondary,
    border: t.border.hairline,
    accent,
    dim: glassOf(t).surfaceSubtle,
  };

  const navigate = (projectId: string) => {
    onClose();
    if (projectId === currentProjectId) return;
    void addRecentProject(projectId);
    router.replace({ pathname: '/project/[id]', params: { id: projectId } } as never);
  };

  const exitToPersonal = () => {
    onClose();
    router.replace('/(tabs)/today');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessible={false} style={[st.overlay, { backgroundColor: t.surface.overlay }, wm.overlay]} onPress={onClose}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()} style={[st.sheetWrap, wm.column]}>
          <View style={[st.sheet, { backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }, shadow[isDark ? 'dark' : 'light'].popover]}>
            {!isWide && <View style={[st.handle, { backgroundColor: t.border.hairline }]} />}
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
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Пілюля-тригер для шапки телефону: колір+назва поточного проєкту, тап відкриває свічер. */
export function ProjectSwitcherTrigger({
  name, color, onPress, textColor, accessibilityLabel,
}: {
  name: string;
  color: string;
  onPress: () => void;
  textColor: string;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={st.trigger}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <View style={[st.dot, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={{ color: textColor, fontSize: 13, fontFamily: fontFamily.semibold, maxWidth: 180 }}>{name}</Text>
      <IconSymbol name="chevron.down" size={10} color={textColor} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: 34 },
  sheet: { borderRadius: radius.card, padding: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontFamily: fontFamily.semibold, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.4, marginTop: 12, marginBottom: 4, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill },
  dot: { width: 10, height: 10, borderRadius: 5 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, marginBottom: 2 },
});
