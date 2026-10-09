/**
 * components/shared/ProjectSidebar.tsx
 *
 * Сайдбар планшета/широкого екрана ВСЕРЕДИНІ простору проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: сайдбар проєкту зі свічером).
 *
 * Малює його `app/_layout.tsx` ЗАМІСТЬ NavSidebar, поки `pathname` лежить у
 * `/project/{id}/...` — та сама умова, що ховає особистий сайдбар на
 * авторизаційних екранах (SIDEBAR_HIDDEN_ON), тільки навпаки: тут ми не
 * ховаємо навігацію, а ПІДМІНЯЄМО її на іншу.
 *
 * Розділи — з того самого маніфесту `constants/projectNav.ts`, що й нижні
 * таби телефону (`app/project/[id]/_layout.tsx`): інакше набір розділів
 * розійшовся б між формфакторами для того самого проєкту.
 *
 * Верх сайдбара — у БУДЬ-ЯКОМУ стані (і згорнутому теж):
 *   1. «‹ Усі проєкти» — назад до списку проєктів (`/projects`), а не в
 *      Особисте: вихід в Особисте лишився першим рядком свічера.
 *   2. Ідентичність проєкту — кольорова плитка з ініціалом + назва; тап
 *      відкриває свічер проєктів. Згорнутий сайдбар показує саму плитку, тож
 *      «в якому я проєкті» видно завжди.
 *   3. Кнопка згортання (іконка сайдбара) — поруч із назвою / під плиткою.
 *
 * Ширина згорнутого — та сама рейка, що в особистого (Layout.railWidth), і
 * її знає useScreenWidth() через sidebar-mode: сітки екранів розширюються.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';
import { ProjectSwitcherSheet } from '@/components/projects/ProjectSwitcherSheet';
import {
  projectSidebarWidthFor, setProjectSidebarCollapsed, useProjectSidebarCollapsed,
} from '@/components/shared/sidebar-mode';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { goProjectsList, projectRoute, visibleProjectNavItems, type ProjectSectionKey } from '@/constants/projectNav';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

const COLLAPSED_KEY = 'project-sidebar-collapsed';
const GROUPS_KEY = 'project-sidebar-groups';

/** Групи розділів. Перша — без заголовка (щоденне), решта згортаються. */
const GROUPS: { id: string; labelKey: 'projectNavGroupTasks' | 'projectNavGroupWork' | 'projectNavGroupTeam' | null; keys: ProjectSectionKey[] }[] = [
  { id: 'main', labelKey: null, keys: ['overview', 'my-work', 'tasks', 'calendar'] },
  // id груп — старі підписи: так лишаються чинними вже збережені згортання.
  { id: 'Завдання', labelKey: 'projectNavGroupTasks', keys: ['backlog', 'archive', 'sprints'] },
  { id: 'Робота', labelKey: 'projectNavGroupWork', keys: ['notes', 'time', 'budget'] },
  { id: 'Команда', labelKey: 'projectNavGroupTeam', keys: ['discussions', 'workload', 'members'] },
];

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
  const collapsed = useProjectSidebarCollapsed();
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    void loadData<boolean>(COLLAPSED_KEY, false).then(v => setProjectSidebarCollapsed(!!v));
    void loadData<string[]>(GROUPS_KEY, []).then(v => setClosed(Array.isArray(v) ? v : []));
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setProjectSidebarCollapsed(next);
    void saveData(COLLAPSED_KEY, next);
  };
  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter(n => n !== id) : [...closed, id];
    setClosed(next);
    void saveData(GROUPS_KEY, next);
  };

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

  const goSection = (route: string) => router.push(route as never);
  const name = project?.name ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || '•';
  const collapseLabel = collapsed ? tr.projectSidebarExpand : tr.projectSidebarCollapse;

  const navRow = (key: ProjectSectionKey, icon: React.ComponentProps<typeof IconSymbol>['name'], label: string, route: string) => {
    const active = pathname === route || pathname.startsWith(route + '/');
    return (
      <TouchableOpacity
        key={key}
        onPress={() => goSection(route)}
        accessibilityRole="menuitem"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        style={[st.row, collapsed && st.rowCollapsed, active && { backgroundColor: c.activeBg }]}>
        <IconSymbol name={icon} size={19} color={active ? c.accent : c.sub} />
        {!collapsed && (
          <Text numberOfLines={1} style={{ color: active ? c.accent : c.text, fontSize: 14, fontWeight: active ? '700' : '500', flex: 1 }}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[st.root, { width: projectSidebarWidthFor(collapsed), backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 10 }]}
      accessibilityRole="menu">
      {/* 1. Назад до списку проєктів — завжди, і в рейці теж. */}
      <TouchableOpacity
        onPress={() => goProjectsList(router as never)}
        accessibilityRole="link"
        accessibilityLabel={tr.projectBackToProjectsA11y}
        style={[st.row, collapsed && st.rowCollapsed]}>
        <IconSymbol name="chevron.left" size={15} color={c.sub} />
        {!collapsed && <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, fontWeight: '700', flex: 1 }}>{tr.projectBackToProjects}</Text>}
      </TouchableOpacity>

      {/* 2–3. Ідентичність проєкту (тап — свічер) + згортання. */}
      <View style={[st.identity, collapsed && st.identityCollapsed, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => setSwitcherOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tr.projectSwitchProjectA11y.replace('{name}', name)}
          style={[st.identityBtn, collapsed && st.identityBtnCollapsed]}>
          <View style={[st.avatar, { backgroundColor: accent }]}>
            <Text style={st.avatarText}>{initial}</Text>
          </View>
          {collapsed ? (
            // Рейка: під плиткою — коротка назва, щоб проєкт упізнавався не лише за кольором.
            <Text numberOfLines={1} style={[st.brandCollapsed, { color: c.sub }]}>{name}</Text>
          ) : (
            <>
              <Text numberOfLines={2} style={[st.brand, { color: c.text }]}>{name}</Text>
              <IconSymbol name="chevron.down" size={11} color={c.sub} />
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={collapseLabel}
          accessibilityState={{ expanded: !collapsed }}
          style={st.iconBtn}>
          <IconSymbol name="sidebar.left" size={18} color={c.sub} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}>
        {GROUPS.map((group, index) => {
          const groupItems = group.keys.flatMap(key => items.filter(item => item.key === key));
          if (!groupItems.length) return null;
          const groupClosed = !collapsed && !!group.labelKey && closed.includes(group.id);
          const label = group.labelKey ? tr[group.labelKey] : '';
          return (
            <View key={group.id} style={{ marginBottom: collapsed ? 4 : 10 }}>
              {collapsed && index > 0 ? <View style={[st.sep, { backgroundColor: c.border }]} /> : null}
              {!collapsed && group.labelKey ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ expanded: !groupClosed }}
                  onPress={() => toggleGroup(group.id)}
                  style={st.groupHead}>
                  <Text style={[st.groupTitle, { color: c.sub }]}>{label.toUpperCase()}</Text>
                  <IconSymbol name={groupClosed ? 'chevron.right' : 'chevron.down'} size={10} color={c.sub} />
                </TouchableOpacity>
              ) : null}
              {!groupClosed && groupItems.map(item =>
                navRow(item.key, item.icon, String(tr[item.labelKey]), projectRoute(projectId, item.key)))}
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 10, gap: 4 }}>
        {!collapsed && <ActiveTimersSidebarCard projectId={projectId} colors={{ border: c.border, text: c.text, sub: c.sub, accent: c.accent, activeBg: c.activeBg }} />}
        {navRow('settings', 'gearshape.fill', tr.tabOptions, projectRoute(projectId, 'settings'))}
      </View>

      {project ? (
        <ProjectSwitcherSheet
          visible={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          currentProjectId={project.id}
          isDark={isDark}
          accent={accent}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root:       { borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  identity:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 10, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  identityCollapsed: { flexDirection: 'column', gap: 2 },
  identityBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 6, borderRadius: Atlas.radius.medium },
  identityBtnCollapsed: { flex: 0, alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'center', gap: 3, paddingHorizontal: 0, paddingVertical: 4 },
  brandCollapsed: { fontSize: 10, fontWeight: '600', maxWidth: '100%', textAlign: 'center' },
  avatar:     { width: 32, height: 32, borderRadius: Atlas.radius.large, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  brand:      { fontSize: 16, fontWeight: Atlas.type.headingWeight, flex: 1 },
  iconBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Atlas.radius.medium },
  groupHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: 10, borderRadius: Atlas.radius.small },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  sep:        { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginVertical: 6 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingHorizontal: 10, borderRadius: Atlas.radius.medium },
  rowCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
});
