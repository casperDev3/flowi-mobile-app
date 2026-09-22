/**
 * components/shared/ProjectSidebar.tsx
 *
 * Сайдбар планшета/широкого екрана ВСЕРЕДИНІ простору проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «планшет/веб: сайдбар стає сайдбаром
 * проєкту з «← Особисте» вгорі і свічером»).
 *
 * Малює його `app/_layout.tsx` ЗАМІСТЬ NavSidebar, поки `pathname` лежить у
 * `/project/{id}/...` — та сама умова, що ховає особистий сайдбар на
 * авторизаційних екранах (SIDEBAR_HIDDEN_ON), тільки навпаки: тут ми не
 * ховаємо навігацію, а ПІДМІНЯЄМО її на іншу.
 *
 * Розділи — з того самого маніфесту `constants/projectNav.ts`, що й нижні
 * таби телефону (`app/project/[id]/_layout.tsx`): інакше набір розділів
 * розійшовся б між формфакторами для того самого проєкту.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';
import { ProjectSwitcherList } from '@/components/projects/ProjectSwitcherSheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SIDEBAR_WIDTH } from '@/constants/nav';
import { projectRoute, visibleProjectNavItems } from '@/constants/projectNav';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useI18n } from '@/store/i18n';
import { addRecentProject } from '@/store/project-sync';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

export function ProjectSidebar({
  projectId, pathname, isDark,
}: {
  projectId: string;
  pathname: string;
  isDark: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();
  const { project } = useProject(projectId);
  const role = useProjectRole(projectId);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  const items = visibleProjectNavItems(modules, role);
  const accent = project?.color ?? '#7C3AED';

  const c = {
    bg:       isDark ? '#0E0C1A' : '#F4F0FF',
    border:   isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.14)',
    text:     isDark ? '#F0EEFF' : '#1A1433',
    sub:      isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.52)',
    accent,
    activeBg: isDark ? accent + '22' : accent + '18',
  };

  const goPersonal = () => router.replace('/(tabs)/today');
  const goSection = (route: string) => router.push(route as never);
  const goProject = (id: string) => {
    setSwitcherOpen(false);
    if (id === projectId) return;
    void addRecentProject(id);
    router.replace(projectRoute(id, 'overview') as never);
  };

  return (
    <View
      style={[st.root, { width: SIDEBAR_WIDTH, backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 14 }]}
      accessibilityRole="menu">
      <TouchableOpacity onPress={goPersonal} accessibilityRole="button" style={st.exitRow}>
        <IconSymbol name="chevron.left" size={14} color={c.sub} />
        <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>{tr.projectExitToPersonal}</Text>
      </TouchableOpacity>

      {project ? (
        <View style={st.header}>
          <View style={[st.dot, { backgroundColor: project.color }]} />
          <Text numberOfLines={1} style={[st.brand, { color: c.text }]}>{project.name}</Text>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {items.map(item => {
          const route = projectRoute(projectId, item.key);
          const active = pathname === route || pathname.startsWith(route + '/');
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => goSection(route)}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              style={[st.row, active && { backgroundColor: c.activeBg }]}>
              <IconSymbol name={item.icon} size={19} color={active ? c.accent : c.sub} />
              <Text
                numberOfLines={1}
                style={{ color: active ? c.accent : c.text, fontSize: 14, fontWeight: active ? '700' : '500', flex: 1 }}>
                {String(tr[item.labelKey])}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={() => setSwitcherOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: switcherOpen }}
          style={[st.groupHead, { marginTop: 18 }]}>
          <IconSymbol name={switcherOpen ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
          <Text style={[st.groupTitle, { color: c.sub, flex: 1, marginLeft: 4 }]}>
            {tr.projectSwitcherTitle.toUpperCase()}
          </Text>
        </TouchableOpacity>
        {switcherOpen ? (
          <ProjectSwitcherList
            currentProjectId={projectId}
            isDark={isDark}
            c={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent, dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
            onNavigate={goProject}
            onExit={goPersonal}
          />
        ) : null}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 10 }}>
        <ActiveTimersSidebarCard colors={{ border: c.border, text: c.text, sub: c.sub, accent: c.accent, activeBg: c.activeBg }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:       { borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  exitRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 10, marginBottom: 8 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 14 },
  dot:        { width: 12, height: 12, borderRadius: 6 },
  brand:      { fontSize: 18, fontWeight: '800', flex: 1 },
  groupHead:  { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingHorizontal: 10, borderRadius: 8 },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
});
