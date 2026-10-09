/**
 * hooks/use-project-route-id.ts — id проєкту для екранів у `app/project/[id]/*`.
 *
 * P0 (аудит 2026-10): на телефоні перехід між табами простору проєкту через
 * нижній таб-бар відкривав екран БЕЗ локального параметра `id` — Завдання
 * показували «Задач ще немає», Моя робота — особисті задачі, Календар —
 * особисті зустрічі. Layout тепер дає кожному табу `initialParams={{ id }}`,
 * а цей хук — другий запобіжник: локальний параметр → глобальний параметр →
 * сегмент шляху `/project/{id}/...`.
 */
import * as Router from 'expo-router';

import { projectIdFromPathname } from '@/constants/projectNav';

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0] || undefined;
  return v || undefined;
}

// Глобальні параметри/шлях беруться, лише якщо модуль їх має: у юніт-тестах
// expo-router часто замокано лише `useLocalSearchParams`. Наявність функції не
// змінюється між рендерами, тож порядок хуків стабільний.
const useGlobalParams: () => { id?: string | string[] } =
  typeof Router.useGlobalSearchParams === 'function' ? Router.useGlobalSearchParams : () => ({});
const usePath: () => string =
  typeof Router.usePathname === 'function' ? Router.usePathname : () => '';

export function useProjectRouteId(): string | undefined {
  const local = Router.useLocalSearchParams<{ id?: string | string[] }>();
  const global = useGlobalParams();
  const pathname = usePath();
  return first(local?.id) ?? first(global?.id) ?? (pathname ? projectIdFromPathname(pathname) ?? undefined : undefined);
}
