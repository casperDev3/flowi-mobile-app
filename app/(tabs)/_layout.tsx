import {BlurView} from 'expo-blur';
import {Tabs, usePathname} from 'expo-router';
import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {ModuleGate} from '@/components/shared/ModuleGate';
import {NotificationBadge} from '@/components/notifications/NotificationBadge';
import {ActiveTimersBar} from '@/components/time/ActiveTimersBar';
import {IconSymbol} from '@/components/ui/icon-symbol';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {useI18n} from '@/store/i18n';
import {useResponsive} from '@/hooks/use-responsive';
import {
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
                fontWeight: '600',
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

export default function TabLayout() {
    const isDark = useColorScheme() === 'dark';
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
                tabBarBackground: () =>
                    Platform.OS === 'android' ? (
                        <BlurView
                            intensity={80}
                            tint={isDark ? 'dark' : 'light'}
                            style={[StyleSheet.absoluteFill, {backgroundColor: isDark ? '#0E0C1A' : '#F0EEFF'}]}
                        />
                    ) : (
                        <BlurView
                            intensity={80}
                            tint={isDark ? 'dark' : 'light'}
                            style={[StyleSheet.absoluteFill, isDark ? {} : {backgroundColor: 'rgba(244,240,255,0.88)'}]}
                        />
                    ),
                tabBarIconStyle: {marginTop: 2},
            }}>

            <Tabs.Screen
                name="today"
                options={{
                    title: tr.tabToday,
                    tabBarLabel: tabLabel(tr.tabToday),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="house.fill" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: tr.tabTasks,
                    tabBarLabel: tabLabel(tr.tabTasks),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="checklist" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="explore"
                options={{
                    title: tr.tabFinance,
                    tabBarLabel: tabLabel(tr.tabFinance),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="banknote" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="health"
                options={{
                    title: tr.tabHealth,
                    tabBarLabel: tabLabel(tr.tabHealth),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="figure.run" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: tr.tabOptions,
                    tabBarLabel: tabLabel(tr.tabOptions),
                    // Крапка непрочитаних сповіщень (notifications-module.md §11). Бейдж
                    // сам тримає лічильник живим — на старті й після фону.
                    tabBarIcon: ({color}) => (
                        <View>
                            <IconSymbol size={26} name="gearshape.fill" color={color}/>
                            <NotificationBadge variant="dot" style={{position: 'absolute', top: -2, right: -6}}/>
                        </View>
                    ),
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
