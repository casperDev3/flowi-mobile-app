/**
 * app/training/[groupId]/quest/[questId].tsx — ціль push-посилань
 * `ftrackingapp://training/{groupId}/quest/{questId}` (training-module.md §9):
 * окремого екрана квеста немає, тож ведемо на список квестів групи.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { trainingRoutes } from '@/components/training/routes';

export default function QuestLinkRedirect() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  return <Redirect href={trainingRoutes.section(groupId, 'quests')} />;
}
