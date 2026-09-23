/**
 * app/health-vitals.tsx — редирект на вкладку «Тіло і вітальні» розділу «Здоровʼя».
 *
 * Показники тіла злились із замірами у вкладку «Тіло і вітальні»: вага, ІМТ і пульс міряються за одну сесію з обводами.
 *
 * Файл лишається заглушкою, бо маршрут зареєстрований у `app/_layout.tsx`, а
 * на нього ведуть нагадування, нотифікації й закладки. Видалити його означало
 * б віддати людині порожній стек навігації замість екрана.
 */
import { Redirect } from 'expo-router';
import React from 'react';

export default function HealthVitalsRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/health', params: { tab: 'body' } }} />;
}
