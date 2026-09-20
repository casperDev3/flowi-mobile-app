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
import { Tabs, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActiveTimersBar } from '@/components/time/ActiveTimersBar';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  TAB_BAR_BG_MEASURED,
  TAB_BAR_HEIGHT,
  TAB_BAR_TINT,
  TAB_LABEL_FONT_SIZE,
  TAB_LABEL_MAX_FONT_SCALE,
} from '@/constants/nav';
import {
  isProjectOverflowActive,
  PROJECT_NAV_ITEMS,
  splitProjectNav,
  visibleProjectNavItems,
} from '@/constants/projectNav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { addRecentProject } from '@/store/project-sync';
import { MODULES_BY_TEMPLATE, projectModules, readableTint } from '@/utils/projectUtils';

export const unstable_settings = { initialRouteName: 'overview' };

/**
 * Підпис таба власним <Text> — дослівно той самий прийом, що в
 * `app/(tabs)/_layout.tsx`: @react-navigation вимикає масштабування підпису
 * на iOS за замовчуванням (`tabBarAllowFontScaling` → false), і повернути
 * його, лишивши стелю, можна лише власним <Text> із
 * `maxFontSizeMultiplier` (NAT-07: тут підпис був 10pt і не реагував на
 * Dynamic Type взагалі).
 *
 * Копія, а не спільна функція: та лежить усередині особистого layout і не
 * експортується, а виносити її в constants/nav.ts означало б покласти JSX у
 * маніфест.
 */
function tabLabel(label: string) {
  function TabLabel({ color }: { color: string }) {
    return (
      <Text
        numberOfLines={1}
        allowFontScaling
        maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE}
        style={{ fontSize: TAB_LABEL_FONT_SIZE, fontWeight: '600', marginTop: -2, textAlign: 'center', color }}>
        {label}
      </Text>
    );
  }
  return TabLabel;
}

export default function ProjectLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { isWide, width } = useResponsive();
  const pathname = usePathname();
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
  const visibleItems = useMemo(() => visibleProjectNavItems(modules, role), [modules, role]);

  /**
   * L2: вісім табів — стан ЗА ЗАМОВЧУВАННЯМ (шаблон `work` вмикає всі п'ять
   * опційних розділів, Огляд/Завдання/Налаштування є завжди, Бюджет
   * додається власнику). На 402pt це 50pt на кнопку, і вимір на пристрої
   * показав чотири обрізані підписи з восьми. Тому в панелі лишається
   * стільки розділів, скільки вміщується з читабельним підписом, а решта —
   * у «Ще» (`more.tsx`).
   *
   * На широкому екрані панелі немає взагалі (усі розділи показує
   * ProjectSidebar), тож там ділити нічого — беремо повний список.
   */
  const { tabs, overflow } = useMemo(
    () => (isWide ? { tabs: visibleItems, overflow: [] } : splitProjectNav(visibleItems, width)),
    [isWide, visibleItems, width],
  );
  const visibleKeys = useMemo(() => new Set(tabs.map(item => item.key)), [tabs]);

  // Таб «Ще» мусить світитись, поки відкритий БУДЬ-ЯКИЙ його розділ —
  // інакше на цих екранах жодна кнопка панелі не показує «ви тут».
  const overflowActive = isProjectOverflowActive(pathname, overflow);

  const tabBarBg = isDark ? TAB_BAR_BG_MEASURED.dark : TAB_BAR_BG_MEASURED.light;
  const inactiveTint = isDark ? TAB_BAR_TINT.dark.inactive : TAB_BAR_TINT.light.inactive;
  /**
   * NAT-08: активний таб брав колір проєкту як є, і `#F59E0B` з палітри дав
   * 1.95:1 на світлому тлі панелі — активна вкладка була видна ГІРШЕ за
   * неактивні. Колір лишається кольором проєкту, але доведеним до 4.5:1
   * проти зміряного тла панелі.
   */
  const activeTint = readableTint(
    project?.color ?? (isDark ? TAB_BAR_TINT.dark.active : TAB_BAR_TINT.light.active),
    tabBarBg,
  );

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: activeTint,
          // Неактивні — той самий набір, що в особистій панелі (A11Y-06:
          // rgba(80,60,120,0.45) давало 2.24:1 і тут теж).
          tabBarInactiveTintColor: inactiveTint,
          tabBarShowLabel: true,
          // Стилю підпису немає навмисно: кожен таб віддає підпис через
          // tabLabel() — лише так він масштабується під Dynamic Type (NAT-07).
          tabBarStyle: isWide ? { display: 'none' } : {
            position: 'absolute',
            borderTopWidth: 0,
            elevation: 0,
            backgroundColor: 'transparent',
            height: TAB_BAR_HEIGHT,
            // paddingTop: 10 звідси прибрано — висота панелі задана числом,
            // тож @react-navigation не додає нижній інсет, а віднімає його
            // зсередини: верхні 10pt було видно, але не натиснути. Те саме
            // вже прибрано в особистій панелі.
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
              tabBarLabel: tabLabel(String(tr[item.labelKey])),
              tabBarIcon: ({ color }) => <IconSymbol size={24} name={item.icon} color={color} />,
            }}
          />
        ))}
        {/*
          «Ще» (L2) — з'являється лише тоді, коли розділи не вмістились у
          панель. Колір тут рахується САМ, а не береться з `color` навігатора:
          для навігатора цей таб не сфокусований, поки відкритий розділ, що
          живе всередині нього, — а показати «ви тут» треба саме тоді.
        */}
        <Tabs.Screen
          name="more"
          options={{
            title: tr.navGroupMore,
            href: overflow.length > 0 ? undefined : null,
            tabBarLabel: tabLabel(tr.navGroupMore),
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="ellipsis" color={color} />,
            // Поки відкритий розділ із «Ще», навігатор вважає цей таб
            // неактивним — підміна робить «неактивний» колір активним.
            ...(overflowActive ? { tabBarInactiveTintColor: activeTint } : {}),
          }}
        />
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
