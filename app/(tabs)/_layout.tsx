import {BlurView} from 'expo-blur';
import {Tabs} from 'expo-router';
import React from 'react';
import {Platform, StyleSheet} from 'react-native';

import {HapticTab} from '@/components/haptic-tab';
import {IconSymbol} from '@/components/ui/icon-symbol';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {useI18n} from '@/store/i18n';

export default function TabLayout() {
    const isDark = useColorScheme() === 'dark';
    const {tr} = useI18n();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarButton: HapticTab,
                tabBarActiveTintColor: isDark ? '#A78BFA' : '#7C3AED',
                tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(80,60,120,0.45)',
                tabBarShowLabel: false,
                tabBarStyle: {
                    position: 'absolute',
                    borderTopWidth: 0,
                    elevation: 0,
                    backgroundColor: 'transparent',
                    height: Platform.OS === 'ios' ? 88 : 68,
                    paddingTop: 14
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
                tabBarIconStyle: {marginTop: 0},
            }}>
            <Tabs.Screen
                name="containers"
                options={{
                    title: tr.tabContainers,
                    tabBarIcon: ({color}) => <IconSymbol size={32} name="archivebox.fill" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="explore"
                options={{
                    title: tr.tabFinance,
                    tabBarIcon: ({color}) => <IconSymbol size={32} name="banknote" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: tr.tabTasks,
                    tabBarIcon: ({color}) => <IconSymbol size={32} name="checklist" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="time"
                options={{href: null}}
            />
            <Tabs.Screen
                name="health"
                options={{
                    title: tr.tabHealth,
                    tabBarIcon: ({color}) => <IconSymbol size={32} name="figure.run" color={color}/>,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: tr.tabOptions,
                    tabBarIcon: ({color}) => <IconSymbol size={32} name="gearshape.fill" color={color}/>,
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({});
