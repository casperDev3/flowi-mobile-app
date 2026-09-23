/**
 * app/training/[groupId]/log/[logId].tsx — ціль push-посилання
 * `training_comment` (`ftrackingapp://training/{groupId}/log/{logId}`,
 * training-module.md §9). Свій лог — це своя сесія (`wl-<sessionId>`),
 * чужий (тренер) — сторінка учасника.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { useGroupStream, useTrainingScope } from '@/components/training/hooks';
import { trainingRoutes } from '@/components/training/routes';
import type { WorkoutLog } from '@/utils/trainingTypes';

export default function LogLinkRedirect() {
  const { groupId = '', logId = '' } = useLocalSearchParams<{ groupId: string; logId: string }>();
  const { userId } = useTrainingScope();
  const stream = useGroupStream(groupId);
  if (!stream.loaded) return null;
  const log = stream.get<WorkoutLog>('workout_logs', logId);
  const owner = log ? Number(log.userId) : null;
  if (owner !== null && owner !== userId) return <Redirect href={trainingRoutes.member(groupId, owner)} />;
  const sessionId = log?.sessionLocalId ?? (logId.startsWith('wl-') ? logId.slice(3) : null);
  if (sessionId) return <Redirect href={trainingRoutes.session(sessionId)} />;
  return <Redirect href={trainingRoutes.group(groupId)} />;
}
