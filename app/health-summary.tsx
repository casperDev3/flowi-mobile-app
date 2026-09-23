/**
 * app/health-summary.tsx — редирект на вкладку «Огляд» розділу «Здоровʼя».
 *
 * «Зведення здоровʼя» більше не окремий екран: тренди стоять на вкладці «Огляд» просто під числами за сьогодні.
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthSummaryRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'overview' } }} />;
}
