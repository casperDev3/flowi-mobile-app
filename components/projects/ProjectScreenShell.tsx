/**
 * components/projects/ProjectScreenShell.tsx — спільна обв'язка розділу
 * простору проєкту.
 *
 * Восьми екранам (`app/project/[id]/*.tsx`) потрібне те саме: тло під колір
 * проєкту, ScreenHeader із назвою розділу, і — ЛИШЕ на телефоні — пілюля
 * свічера проєкту в шапці (contract §3: «у шапці свічер проєкту»). На
 * широкому екрані свічер уже стоїть у ProjectSidebar, і другий у шапці був би
 * тим самим вибором двічі.
 *
 * Не рендерить ані ScrollView, ані FlatList: кожен екран сам вирішує, який
 * контейнер йому потрібен, — оболонка лише дає шапку й тло.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProjectSwitcherSheet, ProjectSwitcherTrigger } from '@/components/projects/ProjectSwitcherSheet';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useResponsive } from '@/hooks/use-responsive';
import type { Project } from '@/app/projects';

export function projectShellColors(isDark: boolean, accent: string) {
  return {
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    accent,
  };
}

export function ProjectScreenShell({
  project, isDark, title, actions, children, headerChildren,
}: {
  project: Project | null;
  isDark: boolean;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Під заголовком (напр. MonthPicker) — прокидається у ScreenHeader.children. */
  headerChildren?: React.ReactNode;
}) {
  const { isWide } = useResponsive();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const accent = project?.color ?? '#7C3AED';
  const c = projectShellColors(isDark, accent);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      {/* Без нативного SafeAreaView(edges=['top']) — ScreenHeader сам додає
          верхній інсет через useTopInset() (CLAUDE.md: «нативний SafeAreaView
          edges={['top']} в екранах не використовуємо»). Обидва разом двічі
          зсували шапку вниз на висоту статус-бару. */}
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={title}
          color={c.accent}
          actions={actions}
          eyebrow={!isWide && project ? (
            <ProjectSwitcherTrigger
              name={project.name}
              color={project.color}
              textColor={c.sub}
              onPress={() => setSwitcherOpen(true)}
            />
          ) : undefined}>
          {headerChildren}
        </ScreenHeader>
        {children}
      </View>
      {project ? (
        <ProjectSwitcherSheet
          visible={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          currentProjectId={project.id}
          isDark={isDark}
          accent={accent}
        />
      ) : null}
    </View>
  );
}
