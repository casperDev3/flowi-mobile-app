/**
 * app/health-nutrition.tsx — редирект на вкладку «Харчування» розділу «Здоровʼя».
 *
 * Харчування стало вкладкою розділу «Здоровʼя».
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthNutritionRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'nutrition' } }} />;
}
