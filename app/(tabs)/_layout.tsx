import {BlurView} from 'expo-blur';
import {Tabs, router, usePathname} from 'expo-router';
import React, {useCallback, useEffect, useState} from 'react';
import {Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {NotificationBadge} from '@/components/notifications/NotificationBadge';
import {ActiveTimersBar} from '@/components/time/ActiveTimersBar';
import {IconSymbol} from '@/components/ui/icon-symbol';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {useI18n} from '@/store/i18n';
import {useResponsive} from '@/hooks/use-responsive';
import {isModuleEnabled, useUiModules} from '@/store/ui-preferences';
import type {Translations} from '@/store/translations';
import {
    MODULE_SETTINGS_ROUTE,
    TAB_BAR_HEIGHT,
    TAB_BAR_TINT,
    TAB_LABEL_FONT_SIZE,
    TAB_LABEL_MAX_FONT_SCALE,
    moduleLabelKey,
    type ModuleId,
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
     * місці, а дотик по ній показує заглушку з єдиною дією — увімкнути назад.
     * (На широкому екрані панелі немає взагалі: там сайдбар, і він вимкнені
     * пункти саме ХОВАЄ — місце в списку нічого не значить, а висота значить.)
     */
    const {disabledModules} = useUiModules();
    const [stub, setStub] = useState<ModuleId | null>(null);

    // Перехід на інший розділ знімає заглушку: інакше вона лишалась би
    // поверх екрана, на який користувач щойно свідомо перейшов.
    useEffect(() => { setStub(null); }, [pathname]);

    const guard = useCallback((module: ModuleId) => ({
        tabPress: (e: {preventDefault: () => void}) => {
            if (isModuleEnabled(disabledModules, module)) return;
            e.preventDefault();
            setStub(module);
        },
    }), [disabledModules]);

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
                listeners={guard('tasks')}
                options={{
                    title: tr.tabTasks,
                    tabBarLabel: tabLabel(tr.tabTasks),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="checklist" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="explore"
                listeners={guard('finance')}
                options={{
                    title: tr.tabFinance,
                    tabBarLabel: tabLabel(tr.tabFinance),
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="banknote" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="health"
                listeners={guard('health')}
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
        {stub && (
            <ModuleDisabledStub
                module={stub}
                label={String(tr[moduleLabelKey(stub) ?? 'tabOptions'])}
                tr={tr}
                isDark={isDark}
                onOpenSettings={() => { setStub(null); router.push(MODULE_SETTINGS_ROUTE as never); }}
            />
        )}
        <ActiveTimersBar/>
        </View>
    );
}

/**
 * Заглушка вимкненої вкладки.
 *
 * Це шар ПОВЕРХ вмісту, а не окремий маршрут, і він навмисно не закриває
 * панель табів: вкладка лишилась на місці, тож сусідні мусять лишитись
 * натискними — інакше єдиним виходом був би системний жест «назад», якого на
 * кореневому екрані вкладок немає.
 *
 * Панель активних таймерів малюється ПІСЛЯ цього шару (сусід нижче в
 * розмітці) і тому лишається зверху: таймер, що йде просто зараз, зупиняють
 * з будь-якого екрана, і заглушка — не виняток.
 */
function ModuleDisabledStub({
    module,
    label,
    tr,
    isDark,
    onOpenSettings,
}: {
    module: ModuleId;
    label: string;
    tr: Translations;
    isDark: boolean;
    onOpenSettings: () => void;
}) {
    const c = {
        bg:     isDark ? '#0C0C14' : '#F5F5FA',
        text:   isDark ? '#F0EEFF' : '#1A1433',
        sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
        accent: '#7C3AED',
    };
    return (
        <View
            // Заглушка перекриває вміст вкладки, але не панель під нею.
            style={[st.stub, {bottom: TAB_BAR_HEIGHT, backgroundColor: c.bg}]}
            accessibilityViewIsModal
            testID={`module-disabled-${module}`}>
            <View style={[st.stubIcon, {backgroundColor: c.accent + '1A'}]}>
                <IconSymbol name="eye.slash" size={30} color={c.accent}/>
            </View>
            <Text style={[st.stubTitle, {color: c.text}]}>{tr.modulesDisabledTitle}</Text>
            <Text style={[st.stubModule, {color: c.accent}]}>{label}</Text>
            <Text style={[st.stubBody, {color: c.sub}]}>{tr.modulesDisabledBody}</Text>
            <TouchableOpacity
                onPress={onOpenSettings}
                accessibilityRole="button"
                accessibilityLabel={tr.modulesOpenSettings}
                style={[st.stubButton, {backgroundColor: c.accent}]}>
                <Text style={st.stubButtonLabel}>{tr.modulesOpenSettings}</Text>
            </TouchableOpacity>
        </View>
    );
}

const st = StyleSheet.create({
    stub:            {position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10},
    stubIcon:        {width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 6},
    stubTitle:       {fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3},
    stubModule:      {fontSize: 14, fontWeight: '700'},
    stubBody:        {fontSize: 14, lineHeight: 20, textAlign: 'center'},
    // 48 заввишки — вище мінімальних 44pt за HIG: це єдина дія на екрані.
    stubButton:      {marginTop: 12, height: 48, borderRadius: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center'},
    stubButtonLabel: {color: '#fff', fontSize: 15, fontWeight: '700'},
});

