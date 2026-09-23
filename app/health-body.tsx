/**
 * app/health-body.tsx — редирект на вкладку «Тіло і вітальні» розділу «Здоровʼя».
 *
 * Заміри тіла злились із показниками у вкладку «Тіло і вітальні».
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthBodyRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'body' } }} />;
}
