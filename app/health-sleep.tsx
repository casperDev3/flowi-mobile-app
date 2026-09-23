/**
 * app/health-sleep.tsx — редирект на вкладку «Сон» розділу «Здоровʼя».
 *
 * Сон став вкладкою розділу «Здоровʼя».
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthSleepRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'sleep' } }} />;
}
