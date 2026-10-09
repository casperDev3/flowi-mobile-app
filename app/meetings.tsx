/**
 * app/meetings.tsx — редирект на «Календар» (app/calendar.tsx).
 *
 * Окремого екрана нарад більше немає: зустрічі живуть у календарі разом із
 * дедлайнами завдань і спринтами. Маршрут лишається, бо на нього ведуть
 * push (`pushTapUrl` → '/meetings?open=<id>'), deep link
 * ftrackingapp://meeting/{id}, закладки й переходи з інших екранів.
 * `?open=` передається далі — календар сам відкриє деталь зустрічі.
 *
 * `href` — рядок через `as never`: типи маршрутів генеруються під час
 * `expo start`, і новий `/calendar` потрапить туди лише після запуску бандлера.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function MeetingsRedirect() {
  const { open, date } = useLocalSearchParams<{ open?: string; date?: string }>();
  // Без URLSearchParams: у React Native він реалізований не повністю.
  const qs = [
    open ? `open=${encodeURIComponent(String(open))}` : '',
    date ? `date=${encodeURIComponent(String(date))}` : '',
  ].filter(Boolean).join('&');
  return <Redirect href={(qs ? `/calendar?${qs}` : '/calendar') as never} />;
}
