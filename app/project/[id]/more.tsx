/**
 * app/project/[id]/more.tsx — розділ «Ще» простору проєкту.
 *
 * Існує через L2: шаблон «Робочий» вмикає всі опційні розділи одразу, тож
 * ВІСІМ нижніх табів — це стан за замовчуванням. Вісім кнопок у 402pt дають
 * по 50pt на кнопку, і нативний прогін зміряв, що чотири підписи з восьми
 * обрізаються трикрапкою. Панель лишає собі стільки розділів, скільки
 * вміщується з читабельним підписом (`splitProjectNav`), а решта живе тут —
 * списком, де в кожного рядка є повна назва, іконка й нормальна ціль дотику.
 *
 * Свій екран, а не аркуш: це маршрут таб-навігатора, тож на нього працюють
 * і кнопка «назад» системи, і deep link, і підсвітка «ви тут» у самій панелі
 * (`isProjectOverflowActive` — таб «Ще» світиться, поки відкритий будь-який
 * його розділ).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { projectRoute, splitProjectNav, visibleProjectNavItems } from '@/constants/projectNav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

export default function ProjectMoreScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { width } = useResponsive();
  const { tr } = useI18n();
  const { project } = useProject(projectId);
  const role = useProjectRole(projectId);
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  const visible = useMemo(() => visibleProjectNavItems(modules, role), [modules, role]);
  const { overflow } = useMemo(() => splitProjectNav(visible, width), [visible, width]);

  // На широкому екрані (сайдбар показує всі розділи) і на «простому» проєкті
  // ділення немає — сюди можна прийти лише посиланням. Показуємо тоді ВСІ
  // розділи, а не порожню сторінку: екран усе одно мусить кудись вести.
  const rows = overflow.length > 0 ? overflow : visible;

  return (
    <ProjectScreenShell project={project} isDark={isDark} title={tr.navGroupMore}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {rows.map(item => {
          const label = String(tr[item.labelKey]);
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => router.push(projectRoute(String(projectId), item.key) as never)}
              accessibilityRole="button"
              accessibilityLabel={label}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                minHeight: 56, paddingHorizontal: 14,
                borderRadius: 14, borderWidth: 1, borderColor: c.border,
                backgroundColor: c.dim, marginBottom: 10,
              }}>
              <IconSymbol name={item.icon} size={20} color={c.accent} />
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{label}</Text>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ProjectScreenShell>
  );
}
