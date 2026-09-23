/**
 * components/training/GroupScreenShell.tsx — каркас екранів усередині групи:
 * тло, шапка з крихтами «Групи тренувань → Назва групи» (на планшеті) або
 * «Назад» (на телефоні), плашки стану синку/доступу, прокрутний вміст.
 */
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { ScreenHeader, type Crumb } from '@/components/shared/ScreenHeader';
import { useContentWidth } from '@/hooks/use-content-width';
import { trainingRoutes } from './routes';
import { useI18n } from '@/store/i18n';

import { Notice, ScreenBackground } from './TrainingBits';
import { fmt, TG_ACCENT, type TrainingColors } from './theme';
import type { LoadIssue } from './hooks';

export function GroupScreenShell({
  c, title, groupId, groupName, actions, issue, gone, rejectedReason, onRefresh, refreshing, children, wide, scroll = true, footer,
}: {
  c: TrainingColors;
  title: string;
  groupId?: string;
  groupName?: string;
  actions?: React.ReactNode;
  issue?: LoadIssue;
  gone?: boolean;
  rejectedReason?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: React.ReactNode;
  /** Без стелі ширини колонки: для двоколонкових планшетних розкладок. */
  wide?: boolean;
  scroll?: boolean;
  /** Закріплено під прокруткою (напр. «Ваше місце» в лідерборді). */
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const { tr } = useI18n();
  const contentWidth = useContentWidth();
  const column = wide ? { width: '100%' as const, maxWidth: 1180, alignSelf: 'center' as const } : contentWidth;

  const crumbs: Crumb[] = [{ label: tr.tgTitle, onPress: () => router.navigate(trainingRoutes.list()) }];
  if (groupId && groupName && title !== groupName) {
    crumbs.push({
      label: groupName,
      onPress: () => router.navigate(trainingRoutes.group(groupId)),
    });
  }

  const notices = (
    <>
      {gone ? <Notice c={c} text={tr.tgGroupGone} tone="error" /> : null}
      {issue === 'offline' ? <Notice c={c} text={tr.tgOfflineNotice} /> : null}
      {issue === 'error' ? (
        <Notice c={c} text={tr.tgErrorGeneric} tone="error" onRetry={onRefresh} retryLabel={tr.loadErrorRetry} />
      ) : null}
      {rejectedReason ? <Notice c={c} text={fmt(tr.tgRejected, { reason: rejectedReason })} tone="warn" /> : null}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenBackground c={c} />
      <View style={column}>
        <ScreenHeader
          title={title}
          color={c.text}
          back={{ onPress: () => (router.canGoBack() ? router.back() : router.navigate(trainingRoutes.list())), label: tr.back, color: c.text }}
          crumbs={crumbs}
          crumbColor={c.sub}
          actions={actions}
        />
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[column, { paddingHorizontal: 16, paddingBottom: 100 }]}
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={TG_ACCENT} />
          ) : undefined}>
          {notices}
          {children}
        </ScrollView>
      ) : (
        <View style={[column, { flex: 1, paddingHorizontal: 16 }]}>
          {notices}
          {children}
        </View>
      )}
      {footer ? <View style={[column, { paddingHorizontal: 16, paddingBottom: 24 }]}>{footer}</View> : null}
    </View>
  );
}
