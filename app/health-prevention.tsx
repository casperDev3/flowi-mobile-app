/**
 * app/health-prevention.tsx — редирект на вкладку «Профілактика» розділу «Здоровʼя».
 *
 * Профілактика стала вкладкою розділу «Здоровʼя», а звички переїхали в неї з окремої плитки.
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthPreventionRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'prevention' } }} />;
}
