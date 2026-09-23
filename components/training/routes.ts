/**
 * components/training/routes.ts — маршрути модуля тренувань в одному місці.
 *
 * `.expo/types/router.d.ts` генерує лише `expo start`, тож для щойно доданих
 * файлів типізовані маршрути ще не знають `/training/...` — звідси `as Href`,
 * як у решті застосунку для нових екранів (app/(tabs)/settings.tsx,
 * app/invite.tsx). Рядки зібрані тут, щоб каст жив в одному місці, а не в
 * кожному `router.push`.
 */
import type { Href } from 'expo-router';

type GroupSection = 'programs' | 'members' | 'quests' | 'leaderboard' | 'exercises';

export const trainingRoutes = {
  list: (): Href => '/training' as Href,
  group: (groupId: string): Href =>
    ({ pathname: '/training/[groupId]', params: { groupId } }) as unknown as Href,
  section: (groupId: string, section: GroupSection): Href =>
    ({ pathname: `/training/[groupId]/${section}`, params: { groupId } }) as unknown as Href,
  program: (groupId: string, programId: string): Href =>
    ({ pathname: '/training/[groupId]/program/[programId]', params: { groupId, programId } }) as unknown as Href,
  member: (groupId: string, userId: number | string): Href =>
    ({ pathname: '/training/[groupId]/member/[userId]', params: { groupId, userId: String(userId) } }) as unknown as Href,
  session: (sessionId: string): Href =>
    ({ pathname: '/training/session/[sessionId]', params: { sessionId } }) as unknown as Href,
  invite: (params: { ws?: string; g?: string; t?: string }): Href =>
    ({ pathname: '/training/invite', params }) as unknown as Href,
};
