import {Tabs, usePathname} from 'expo-router';
import React from 'react';
import {Text, View} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {ModuleGate} from '@/components/shared/ModuleGate';
import {NotificationBadge} from '@/components/notifications/NotificationBadge';
import {ActiveTimersBar} from '@/components/time/ActiveTimersBar';
import {type IconSymbolName} from '@/components/ui/icon-symbol';
import {GlassTabBarBackground, GlassTabIcon} from '@/components/shared/GlassTabBar';
import {useDS} from '@/hooks/use-ds';
import {fontFamily, moduleAccent, radius, type GlassAccent} from '@/constants/theme';
import {useI18n} from '@/store/i18n';
import {useResponsive} from '@/hooks/use-responsive';
import {useSoftSafeAreaInsets} from '@/hooks/use-soft-safe-area-insets';
import {
    TAB_BAR_TINT,
    TAB_ISLAND_HEIGHT,
    tabIslandBottom,
    tabIslandInsets,
    tabIslandOuterHeight,
    TAB_LABEL_FONT_SIZE,
    TAB_LABEL_MAX_FONT_SCALE,
} from '@/constants/nav';

export const unstable_settings = { initialRouteName: 'today' };

/**
 * Підпис таба власним <Text> замість `tabBarLabelStyle`.
 *
 * @react-navigation/bottom-tabs вимикає масштабування підпису на iOS за
 * замовчуванням (BottomTabItem.js:40 — `allowFontScaling = SUPPORTS_LARGE_CONTENT_VIEWER
 * ? false : undefined`), і перевизначити це, лишивши стиль, можна тільки
 * прапорцем `tabBarAllowFontScaling`, у якого немає стелі. Без стелі
 * Dynamic Type на максимумі дає 11pt × ~3 = 33pt підпису при 54pt висоти
 * контенту панелі — підпис обріже разом з іконкою.
 *
 * Функція-підпис віддає звичайний <Text>, а отже і `maxFontSizeMultiplier`.
 * Ім'я екрана для скрінрідера при цьому й далі бере `title`, тож
 * accessibilityLabel кнопки таба не змінюється.
 */
function tabLabel(label: string) {
    // Іменована функція, а не стрілка: @react-navigation викликає її як
    // звичайний рендер-колбек, але eslint-plugin-react бачить JSX і вимагає
    // displayName.
    function TabLabel({color}: {color: string}) {
        return (
        <Text
            numberOfLines={1}
            allowFontScaling
            maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE}
            style={{
                fontSize: TAB_LABEL_FONT_SIZE,
                fontFamily: fontFamily.semibold,
                marginTop: -2,
                textAlign: 'center',
                color,
            }}>
            {label}
        </Text>
        );
    }
    return TabLabel;
}

/**
 * Іконка таба (11.2026): без pill і обводки — виділяється сама іконка:
 * активна — TAB_BAR_TINT.active + заповнений варіант SF Symbol, неактивна —
 * приглушена контурна. Рецепт — GlassTabIcon (components/shared/GlassTabBar.tsx),
 * спільний із панеллю простору проєкту.
 */
function TabIcon({name, activeName, color, focused, badge, accent}: {name: IconSymbolName; activeName?: IconSymbolName; color: string; focused: boolean; badge?: boolean; accent: GlassAccent}) {
    return (
        <GlassTabIcon
            name={name}
            activeName={activeName}
            color={color}
            focused={focused}
            accent={accent}
            badge={badge ? <NotificationBadge variant="dot" style={{position: 'absolute', top: 1, right: 12}}/> : null}
        />
    );
}

function tabIcon(name: IconSymbolName, activeName: IconSymbolName, accent: GlassAccent, badge?: boolean) {
    function Icon({color, focused}: {color: string; focused: boolean}) {
        return <TabIcon name={name} activeName={activeName} color={color} focused={focused} badge={badge} accent={accent}/>;
    }
    return Icon;
}

/**
 * Тло панелі табів — Liquid Glass, форма острівця (GlassTabBarBackground island):
 *   iOS 26+  — нативне скло;
 *   iOS      — BlurView + щільна заливка glass.surfaceStrong (під підписи 11pt:
 *              композит ≈ #F3F0F8 / #24222E, text.secondary ≥ 4.5:1);
 *   Android  — майже непрозора заливка (вміст не «просвічує» крізь підписи);
 *   «Зменшити прозорість» — суцільне TAB_BAR_BG (як у DS v2).
 * Обідок по всьому контуру pill, скло обрізане по радіусу.
 */
function TabBarGlass() {
    return <GlassTabBarBackground island/>;
}

export default function TabLayout() {
    const {isDark, reduceTransparency} = useDS();
    const {tr} = useI18n();
    const {isWide, width} = useResponsive();
    const pathname = usePathname();
    // «М'які» інсети: без провайдера (тести шару вкладок) — нулі, не виняток.
    const insets = useSoftSafeAreaInsets();
    // Острівець: скільки знизу займає панель разом із полем і safe-area —
    // заглушці модуля й панелі таймерів, щоб не налазили на неї.
    const islandOuter = tabIslandOuterHeight(insets.bottom);
    const island = tabIslandInsets(width, insets.left, insets.right);

    /**
     * Вимкнений модуль НЕ прибирає свою вкладку з панелі.
     *
     * Панель табів — це м'язова пам'ять: «Фінанси» третім зліва. Прибравши
     * вкладку, ми зсуваємо всі інші, і людина, яка вимкнула модуль місяць
     * тому, щоразу промахується повз «Здоров'я». Тому вкладка лишається на
     * місці, а на самому маршруті замість вмісту стоїть заглушка з єдиною
     * дією — увімкнути назад (ModuleGate).
     *
     * Заглушка вирішується за pathname, а НЕ за tabPress: у вкладку приходять
     * і напряму (вхід, push, ActiveTimersBar → «Час», переходи з інших
     * екранів), і на планшеті, де панелі немає зовсім. На широкому екрані
     * заглушка займає весь вміст (bottomInset 0): там сайдбар, і вимкнені
     * пункти він ХОВАЄ — місце в списку нічого не значить, а висота значить.
     */
    return (
        // Обгортка — заради глобальної панелі активних таймерів: вона стоїть
        // абсолютним шаром просто над панеллю табів (лише на вузькому екрані,
        // див. ActiveTimersBar) і зникає разом із табами під Stack-екранами.
        <View style={{flex: 1}}>
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarButton: HapticTab,
                // Кольори — у constants/nav.ts: їх рахує тест контрасту, і той
                // самий набір має взяти панель простору проєкту.
                tabBarActiveTintColor: isDark ? TAB_BAR_TINT.dark.active : TAB_BAR_TINT.light.active,
                tabBarInactiveTintColor: isDark ? TAB_BAR_TINT.dark.inactive : TAB_BAR_TINT.light.inactive,
                tabBarShowLabel: true,
                // Стилю підпису тут немає навмисно: кожен екран віддає підпис
                // через tabLabel() — див. коментар до нього.
                // Телефон (11.2026): острівець — відокремлена pill над нижнім
                // краєм, по центру, не ширше TAB_ISLAND_MAX_WIDTH (облягає
                // 4 вкладки; поля ≥ 16 + бічний safe-area),
                // `safe-area + 8` знизу (constants/nav.ts → TAB_ISLAND_*).
                // paddingBottom: 0 — @react-navigation інакше віднімає нижній
                // інсет ізсередини панелі (BottomTabBar.js:251), а острівець
                // уже стоїть НАД ним. Відступ вмісту — useTabBarInset().
                tabBarStyle: isWide ? {display: 'none'} : {
                    position: 'absolute',
                    // start/end, а не лише left/right: BottomTabBar на iOS
                    // кладе styles.bottom {start:0,end:0}, а start/end мають
                    // пріоритет над left/right — острівець розтягувався на всю
                    // ширину (на web цього не видно).
                    start: island.left,
                    end: island.right,
                    left: island.left,
                    right: island.right,
                    bottom: tabIslandBottom(insets.bottom),
                    height: TAB_ISLAND_HEIGHT,
                    paddingBottom: 0,
                    paddingHorizontal: 4,
                    borderTopWidth: 0,
                    borderRadius: radius.pill,
                    backgroundColor: 'transparent',
                    elevation: 0,
                    // Нейтральна тінь скла (unslop: без кольорового світіння).
                    ...(reduceTransparency ? null : {
                        shadowColor: '#111113',
                        shadowOpacity: isDark ? 0.4 : 0.12,
                        shadowRadius: 16,
                        shadowOffset: {width: 0, height: 6},
                    }),
                },
                // Кнопка таба має власний padding 5 (BottomTabItem tabVerticalUiKit):
                // paddingVertical тут з'їдав висоту, і підпис обрізало до ~10pt.
                // Без нього кнопка по вмісту (іконка 30 + підпис), по центру pill.
                tabBarItemStyle: {height: TAB_ISLAND_HEIGHT, paddingVertical: 0, justifyContent: 'center'},
                // DS v2.1: Liquid Glass (TabBarGlass вище). Суцільне TAB_BAR_BG
                // (constants/nav.ts, проти нього рахує контраст тест
                // audit-tabbar-a11y) — фолбек «Зменшити прозорість».
                tabBarBackground: () => <TabBarGlass/>,
                // Кнопка розтягнута на 64 і притиснута догори (padding 5): +6 зверху
                // центрує іконку з підписом у pill (~11 / ~12pt поля).
                tabBarIconStyle: {marginTop: 6},
            }}>

            <Tabs.Screen
                name="today"
                options={{
                    title: tr.tabToday,
                    tabBarAccessibilityLabel: tr.tabToday,
                    tabBarLabel: tabLabel(tr.tabToday),
                    tabBarIcon: tabIcon('house', 'house.fill', moduleAccent.today),
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: tr.tabTasks,
                    tabBarAccessibilityLabel: tr.tabTasks,
                    tabBarLabel: tabLabel(tr.tabTasks),
                    tabBarIcon: tabIcon('checklist', 'checklist.checked', moduleAccent.tasks),
                }}
            />
            <Tabs.Screen
                name="explore"
                options={{
                    title: tr.tabFinance,
                    tabBarAccessibilityLabel: tr.tabFinance,
                    tabBarLabel: tabLabel(tr.tabFinance),
                    tabBarIcon: tabIcon('banknote', 'banknote.fill', moduleAccent.finance),
                }}
            />
            <Tabs.Screen
                name="health"
                options={{
                    title: tr.tabHealth,
                    tabBarAccessibilityLabel: tr.tabHealth,
                    tabBarLabel: tabLabel(tr.tabHealth),
                    tabBarIcon: tabIcon('figure.run', 'figure.run', moduleAccent.health),
                }}
            />
            {/* Layout System v2.4 (рішення 04): нижній бар — ЧОТИРИ головні
                розділи (Сьогодні · Задачі · Фінанси · Здоров'я). Налаштування,
                Час і решта — у шухляді ☰ (SidebarDrawer). Маршрут лишається
                робочим (href: null ховає лише кнопку бару): диплінки,
                router.push('/(tabs)/settings') і пункт сайдбара ведуть сюди
                як і раніше. Крапка непрочитаних сповіщень — на дзвонику шапки
                й пункті «Налаштування» сайдбара. */}
            <Tabs.Screen
                name="settings"
                options={{
                    title: tr.tabOptions,
                    href: null,
                }}
            />
            <Tabs.Screen
                name="time"
                options={{ href: null }}
            />
        </Tabs>
        <ModuleGate pathname={pathname} scope="tab" bottomInset={isWide ? 0 : islandOuter}/>
        <ActiveTimersBar bottom={islandOuter}/>
        </View>
    );
}

