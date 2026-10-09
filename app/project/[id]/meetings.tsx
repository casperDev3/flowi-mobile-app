/**
 * app/project/[id]/meetings.tsx — редирект на «Календар» проєкту
 * (app/project/[id]/calendar.tsx).
 *
 * Окремого розділу «Наради» в проєкті більше немає (рішення власника:
 * календар замінює наради) — зустрічі проєкту живуть у його календарі разом
 * із дедлайнами й спринтами, і там же відкривається форма наради. Маршрут
 * лишається, бо на нього ведуть push, закладки й старі переходи; `?open=`,
 * `?create=` і `?date=` передаються далі — календар сам відкриє зустріч або
 * форму нової. Так само, як загальний app/meetings.tsx → /calendar.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ProjectMeetingsRedirect() {
  const { id, open, create, date } = useLocalSearchParams<{ id: string; open?: string; create?: string; date?: string }>();
  const params: Record<string, string> = { id: String(id ?? '') };
  if (open) params.open = String(open);
  if (create) params.create = String(create);
  if (date) params.date = String(date);
  return <Redirect href={{ pathname: '/project/[id]/calendar', params } as never} />;
}
