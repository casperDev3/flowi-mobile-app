import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: isDark ? '#A78BFA' : '#7C3AED',
        tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: 'transparent',
          height: Platform.OS === 'ios' ? 88 : 68,
        },
        tabBarBackground: () =>
          Platform.OS === 'android' ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'systemChromeMaterial'}
              style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0E0C1A' : '#F0EEFF' }]}
            />
          ) : (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'systemChromeMaterial'}
              style={StyleSheet.absoluteFill}
            />
          ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarIconStyle: { marginTop: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Завдання',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Фінанси',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} />,
        }}
      />
      <Tabs.Screen
        name="time"
        options={{
          title: 'Час',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "Здоров'я",
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="heart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Опції',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({});
