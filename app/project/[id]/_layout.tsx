/**
 * app/project/[id]/_layout.tsx — оболонка простору проєкту на телефоні
 * (WORKSPACE_PROJECTS_PLAN.md §3: «телефон: нижні таби замінюються табами
 * проєкту»).
 *
 * Дзеркалить `app/(tabs)/_layout.tsx` дослівно: той самий трюк — таб-бар
 * ховається (`display:'none'`), коли `isWide`, а не сама навігація зникає,
 * бо на широкому екрані ті самі маршрути показує ProjectSidebar
 * (`app/_layout.tsx` малює його ЗАМІСТЬ NavSidebar, поки шлях лежить у
 * `/project/{id}/...`) — Tabs лишається єдиним джерелом routing і там, і там.
 *
 * Розділи для показу — `visibleProjectNavItems()` з `constants/projectNav.ts`,
 * той самий список, що читає ProjectSidebar: приховані розділи отримують
 * `href: null` (як `agent`/`time` у (tabs)/_layout) — файл лишається на
 * місці, просто не показаний у таб-барі й недосяжний з нього.
 */
import { BlurView } from 'expo-blur';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActiveTimersBar } from '@/components/time/ActiveTimersBar';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TAB_BAR_HEIGHT } from '@/constants/nav';
import { PROJECT_NAV_ITEMS, visibleProjectNavItems } from '@/constants/projectNav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { addRecentProject } from '@/store/project-sync';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

export const unstable_settings = { initialRouteName: 'overview' };

export default function ProjectLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { isWide } = useResponsive();
  const { project, loading } = useProject(id);
  const role = useProjectRole(id);

  // Вхід у проєкт — одразу «нещодавній» (свічер §3: «свічер памʼятає
  // нещодавні проєкти»), незалежно від того, звідки увійшли (список, Today,
  // сам свічер).
  useEffect(() => { if (id) void addRecentProject(id); }, [id]);

  // §9.4 «якщо користувач зараз у цьому проєкті — повернути в Особисте»:
  // спрацьовує і на добровільне видалення/вихід (locale-запис `projects`
  // прибирається одразу), і на фоновий `wipeLocalProject` при `404
  // project_not_found`/`403 not_a_member` (`store/project-sync.ts`) — обидва
  // лишають тут `project === null`. Живе в СПІЛЬНОМУ layout, а не в кожному
  // табі проєкту окремо: без цього лише Огляд показував текст «не знайдено»,
  // а решта табів і сам таб-бар лишались у «проєктному» режимі (мінор з ревʼю).
  //
  // Дебаунс — не миттєво: щойно СТВОРЕНИЙ проєкт (`app/projects.tsx` пушить
  // сюди одразу після `void mutateProjects(...)`, не чекаючи запису) на
  // перший рендер тут може ще не встигнути дійти до сховища — миттєвий
  // редірект відкидав би користувача назад в Особисте раніше, ніж запис
  // проєкту взагалі з'явиться. Зникнення `project` протягом паузи (реальне
  // видалення/вихід) скасовує таймер лише тоді, коли запис таки з'явився.
  useEffect(() => {
    if (loading || !id || project) return;
    const timer = setTimeout(() => router.replace('/(tabs)'), 800);
    return () => clearTimeout(timer);
  }, [loading, id, project, router]);

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  const visibleKeys = useMemo(
    () => new Set(visibleProjectNavItems(modules, role).map(item => item.key)),
    [modules, role],
  );

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: project?.color ?? (isDark ? '#A78BFA' : '#7C3AED'),
          tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(80,60,120,0.45)',
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
          tabBarStyle: isWide ? { display: 'none' } : {
            position: 'absolute',
            borderTopWidth: 0,
            elevation: 0,
            backgroundColor: 'transparent',
            height: TAB_BAR_HEIGHT,
            paddingTop: 10,
          },
          tabBarBackground: () => (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={[StyleSheet.absoluteFill, isDark ? {} : { backgroundColor: 'rgba(244,240,255,0.88)' }]}
            />
          ),
          tabBarIconStyle: { marginTop: 2 },
        }}>
        {PROJECT_NAV_ITEMS.map(item => (
          <Tabs.Screen
            key={item.key}
            name={item.key}
            options={{
              title: String(tr[item.labelKey]),
              href: visibleKeys.has(item.key) ? undefined : null,
              tabBarIcon: ({ color }) => <IconSymbol size={24} name={item.icon} color={color} />,
            }}
          />
        ))}
        {/*
          Учасники й Активність (§4) — не розділи проєкту з `constants/projectNav.ts`,
          тому не в мапі вище: досяжні через «Налаштування → Учасники»/Огляд →
          «Уся активність» (router.push), той самий прихований-таб трюк, що й
          `time`/`agent` у (tabs)/_layout — файл лишається на місці, просто
          без кнопки в барі.
        */}
        <Tabs.Screen name="members" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="activity" options={{ href: null, headerShown: false }} />
      </Tabs>
      <ActiveTimersBar />
    </View>
  );
}
