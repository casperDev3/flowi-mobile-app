import {Tabs, usePathname} from 'expo-router';
import React from 'react';
import {LinearGradient} from 'expo-linear-gradient';
import {Platform, StyleSheet, Text, View} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {ModuleGate} from '@/components/shared/ModuleGate';
import {NotificationBadge} from '@/components/notifications/NotificationBadge';
import {ActiveTimersBar} from '@/components/time/ActiveTimersBar';
import {IconSymbol, type IconSymbolName} from '@/components/ui/icon-symbol';
import {GlassBackdrop} from '@/components/ds/Glass';
import {useDS} from '@/hooks/use-ds';
import {fontFamily, moduleAccent, radius, type GlassAccent} from '@/constants/theme';
import {useI18n} from '@/store/i18n';
import {useResponsive} from '@/hooks/use-responsive';
import {
    TAB_BAR_BG,
    TAB_BAR_HEIGHT,
    TAB_BAR_TINT,
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
 * Іконка таба DS v2.1 (Liquid Glass): активна вкладка — скляна pill,
 * тонована акцентом МОДУЛЯ (glass.accent[x].tint) з іконкою accent.ink
 * (≥ 3:1 на склі в обох темах) і м'яким світінням акценту (iOS); неактивна —
 * іконка text.secondary. @react-navigation малює іконку двічі (focused/не
 * focused) і перехрещує прозорістю — pill з'являється плавно. Pill ширший за
 * контейнер іконки (31pt) і виходить за нього по боках — це навмисно: висота
 * (28) вкладається рівно в контейнер, тож розкладка панелі не змінюється.
 * «Зменшити прозорість» → суцільна заливка акценту (solid) з onSolid.
 */
function TabIcon({name, color, focused, badge, accent}: {name: IconSymbolName; color: string; focused: boolean; badge?: boolean; accent: GlassAccent}) {
    const {g, isDark, reduceTransparency} = useDS();
    const a = g.accent[accent];
    return (
        <View
            style={[
                st.iconPill,
                focused && (reduceTransparency
                    ? {backgroundColor: a.solid}
                    : {
                        backgroundColor: a.tint,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: g.rim,
                        ...(Platform.OS === 'ios'
                            ? {shadowColor: a.glow, shadowOpacity: isDark ? 0.6 : 0.4, shadowRadius: 10, shadowOffset: {width: 0, height: 2}}
                            : null),
                    }),
            ]}>
            <IconSymbol size={22} name={name} color={focused ? (reduceTransparency ? a.onSolid : a.ink) : color}/>
            {badge ? <NotificationBadge variant="dot" style={{position: 'absolute', top: 1, right: 12}}/> : null}
        </View>
    );
}

function tabIcon(name: IconSymbolName, accent: GlassAccent, badge?: boolean) {
    function Icon({color, focused}: {color: string; focused: boolean}) {
        return <TabIcon name={name} color={color} focused={focused} badge={badge} accent={accent}/>;
    }
    return Icon;
}

/**
 * Тло панелі табів — Liquid Glass:
 *   iOS 26+  — нативне скло (через GlassSurface-логіку: isNativeLiquidGlass);
 *   iOS      — BlurView ultra-thin + щільна заливка glass.surfaceStrong (під
 *              підписи 11pt: композит ≈ #F3F0F8 / #24222E, text.secondary ≥ 4.5:1);
 *   Android  — майже непрозора заливка (блюру немає, а вміст під панеллю не
 *              має «просвічувати» крізь підписи);
 *   «Зменшити прозорість» — суцільне TAB_BAR_BG (як у DS v2).
 * Згори — спекулярний обідок (glass.rim) і внутрішній відблиск.
 */
function TabBarGlass() {
    const {g, isDark, reduceTransparency} = useDS();
    if (reduceTransparency) {
        return <View style={[StyleSheet.absoluteFill, {backgroundColor: isDark ? TAB_BAR_BG.dark : TAB_BAR_BG.light}]}/>;
    }
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <GlassBackdrop intensityBoost={20}/>
            <View
                style={[
                    StyleSheet.absoluteFill,
                    {backgroundColor: Platform.OS === 'android' ? (isDark ? 'rgba(23,23,26,0.92)' : 'rgba(255,255,255,0.9)') : g.surfaceStrong},
                ]}
            />
            <LinearGradient
                colors={[g.highlight, 'rgba(255,255,255,0)']}
                style={{position: 'absolute', top: 0, left: 0, right: 0, height: 18, opacity: isDark ? 0.35 : 0.6}}
            />
            <View style={{position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: isDark ? g.rim : g.rimShade}}/>
        </View>
    );
}

export default function TabLayout() {
    const {isDark} = useDS();
    const {tr} = useI18n();
    const {isWide} = useResponsive();
    const pathname = usePathname();

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
                tabBarStyle: isWide ? {display: 'none'} : {
                    position: 'absolute',
                    borderTopWidth: 0,
                    elevation: 0,
                    backgroundColor: 'transparent',
                    height: TAB_BAR_HEIGHT,
                    // paddingTop тут був 10 і створював мертву смугу: висота
                    // панелі задана числом, тож @react-navigation НЕ додає до
                    // неї нижній інсет, а віднімає його зсередини
                    // (BottomTabBar.js:87-90 + :250-252). Виходило
                    // 88 − 10 − 34 = 44pt кнопки при 88pt видимої панелі —
                    // верхні 10pt було видно, але не натиснути. Без paddingTop
                    // кнопка займає всі 54pt над home-indicator.
                },
                // DS v2.1: Liquid Glass (TabBarGlass вище). Суцільне TAB_BAR_BG
                // (constants/nav.ts, проти нього рахує контраст тест
                // audit-tabbar-a11y) — фолбек «Зменшити прозорість».
                tabBarBackground: () => <TabBarGlass/>,
                tabBarIconStyle: {marginTop: 2},
            }}>

            <Tabs.Screen
                name="today"
                options={{
                    title: tr.tabToday,
                    tabBarAccessibilityLabel: tr.tabToday,
                    tabBarLabel: tabLabel(tr.tabToday),
                    tabBarIcon: tabIcon('house.fill', moduleAccent.today),
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: tr.tabTasks,
                    tabBarAccessibilityLabel: tr.tabTasks,
                    tabBarLabel: tabLabel(tr.tabTasks),
                    tabBarIcon: tabIcon('checklist', moduleAccent.tasks),
                }}
            />
            <Tabs.Screen
                name="explore"
                options={{
                    title: tr.tabFinance,
                    tabBarAccessibilityLabel: tr.tabFinance,
                    tabBarLabel: tabLabel(tr.tabFinance),
                    tabBarIcon: tabIcon('banknote', moduleAccent.finance),
                }}
            />
            <Tabs.Screen
                name="health"
                options={{
                    title: tr.tabHealth,
                    tabBarAccessibilityLabel: tr.tabHealth,
                    tabBarLabel: tabLabel(tr.tabHealth),
                    tabBarIcon: tabIcon('figure.run', moduleAccent.health),
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: tr.tabOptions,
                    tabBarAccessibilityLabel: tr.tabOptions,
                    tabBarLabel: tabLabel(tr.tabOptions),
                    // Крапка непрочитаних сповіщень (notifications-module.md §11). Бейдж
                    // сам тримає лічильник живим — на старті й після фону.
                    tabBarIcon: tabIcon('gearshape.fill', moduleAccent.settings, true),
                }}
            />
            <Tabs.Screen
                name="time"
                options={{ href: null }}
            />
        </Tabs>
        <ModuleGate pathname={pathname} scope="tab" bottomInset={isWide ? 0 : TAB_BAR_HEIGHT}/>
        <ActiveTimersBar/>
        </View>
    );
}

const st = StyleSheet.create({
    iconPill: {
        width: 52,
        height: 28,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
