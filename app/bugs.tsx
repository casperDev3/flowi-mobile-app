/**
 * app/bugs.tsx — редирект на єдиний екран «Ідеї та баги» (app/feedback.tsx),
 * вкладка «Баги».
 *
 * Окремого екрана багів більше немає (flowi-server-app/docs/specs/feedback-inbox.md
 * §10.1). Маршрут лишається заглушкою на один реліз: на нього ведуть закладки
 * й рядок у налаштуваннях.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function BugsRedirect() {
  const { open } = useLocalSearchParams<{ open?: string }>();
  const query = open ? `&open=${encodeURIComponent(String(open))}` : '';
  return <Redirect href={`/feedback?kind=bug${query}` as never} />;
}
