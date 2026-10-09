import React from 'react';
import { Text } from 'react-native';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme-context';
import { useProjectRole } from '@/hooks/use-project-role';
import type { Meeting } from '@/utils/meetings';
import type { Translations } from '@/store/translations';
import type { MeetingDetailColors } from './MeetingDetail';

export function MeetingComments({ meeting, colors, tr, locale }: { meeting: Meeting; colors: MeetingDetailColors; tr: Translations; locale: string }) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const role = useProjectRole(meeting.projectId);
  if (!meeting.projectId || !user) return <Text style={{ color: colors.sub }}>{locale.startsWith('en') ? 'Comments are available for project meetings. Use Notes for personal meetings.' : 'Коментарі доступні для зустрічей проєкту. Для особистих записів використовуйте «Нотатки».'}</Text>;
  return <CommentsSection projectId={meeting.projectId} targetType="meeting" targetId={meeting.id} readOnly={role === 'viewer'} isOwner={role === 'owner'} currentUserId={String(user.id)} colors={{ ...colors, accent: meeting.color || '#6554c0' }} isDark={isDark} locale={locale} tr={tr} />;
}
