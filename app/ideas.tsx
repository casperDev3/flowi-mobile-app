/**
 * app/ideas.tsx — редирект на єдиний екран «Ідеї та баги» (app/feedback.tsx).
 *
 * Окремого екрана ідей більше немає (flowi-server-app/docs/specs/feedback-inbox.md
 * §10.1). Маршрут лишається заглушкою на один реліз: на нього ведуть закладки,
 * push (`pushTapUrl` → '/ideas') і рядок у налаштуваннях. Видалити файл означало
 * б віддати людині порожній стек навігації замість екрана.
 *
 * `href` — рядок через `as never`: типи маршрутів (.expo/types/router.d.ts)
 * генеруються під час `expo start`, і новий `/feedback` потрапить туди лише
 * після наступного запуску бандлера.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function IdeasRedirect() {
  const { open } = useLocalSearchParams<{ open?: string }>();
  const query = open ? `&open=${encodeURIComponent(String(open))}` : '';
  return <Redirect href={`/feedback?kind=idea${query}` as never} />;
}
