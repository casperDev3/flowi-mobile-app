import {BlurView} from 'expo-blur';
import {Tabs} from 'expo-router';
import React from 'react';
import {Platform, StyleSheet, View} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {ActiveTimersBar} from '@/components/time/ActiveTimersBar';
import {IconSymbol} from '@/components/ui/icon-symbol';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {useI18n} from '@/store/i18n';
import {useResponsive} from '@/hooks/use-responsive';
import {TAB_BAR_HEIGHT} from '@/constants/nav';

export const unstable_settings = { initialRouteName: 'today' };

export default function TabLayout() {
    const isDark = useColorScheme() === 'dark';
    const {tr} = useI18n();
    const {isWide} = useResponsive();

    return (
        // Обгортка — заради глобальної панелі активних таймерів: вона стоїть
        // абсолютним шаром просто над панеллю табів (лише на вузькому екрані,
        // див. ActiveTimersBar) і зникає разом із табами під Stack-екранами.
        <View style={{flex: 1}}>
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarButton: HapticTab,
                tabBarActiveTintColor: isDark ? '#A78BFA' : '#7C3AED',
                tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(80,60,120,0.45)',
                tabBarShowLabel: true,
                tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
                tabBarStyle: isWide ? {display: 'none'} : {
                    position: 'absolute',
                    borderTopWidth: 0,
                    elevation: 0,
                    backgroundColor: 'transparent',
                    height: TAB_BAR_HEIGHT,
                    paddingTop: 10
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
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="house.fill" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: tr.tabTasks,
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="checklist" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="explore"
                options={{
                    title: tr.tabFinance,
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="banknote" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="health"
                options={{
                    title: tr.tabHealth,
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="figure.run" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: tr.tabOptions,
                    tabBarIcon: ({color}) => <IconSymbol size={26} name="gearshape.fill" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="shared"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="agent"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="time"
                options={{ href: null }}
            />
        </Tabs>
        <ActiveTimersBar/>
        </View>
    );
}

