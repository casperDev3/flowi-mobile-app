/**
 * hooks/use-project-members.ts — кешовані учасники проєкту, живі.
 *
 * Читає ЛИШЕ кеш `project_members_v1` (§9.1, наповнює `store/project-team.ts`
 * при кожному відкритті екрана Учасників) — не б'є мережу сам: пікер
 * виконавця у формі завдання відкривається набагато частіше, ніж хтось міняє
 * склад команди, і мережевий запит на кожен відкритий пікер був би зайвим.
 * Соло-проєкт (без кешу) просто віддає порожній список — пікер виконавця тоді
 * не показується (див. TaskEditForm).
 *
 * Два хуки: `useProjectMembers(projectId)` — учасники ОДНОГО проєкту (пікер
 * форми), `useAllProjectMembers()` — увесь кеш одразу (списки завдань з
 * кількох проєктів, див. нижче).
 */
import { useEffect, useState } from 'react';

import { loadData, subscribeToStorage } from '@/store/storage';
import type { MemberOut } from '@/store/project-team';

const MEMBERS_CACHE_KEY = 'project_members_v1';

export function useProjectMembers(projectId: string | null | undefined): MemberOut[] {
  const all = useAllProjectMembers();
  return projectId ? all[projectId] ?? EMPTY_MEMBERS : EMPTY_MEMBERS;
}

const EMPTY_MEMBERS: MemberOut[] = [];

/**
 * Весь кеш `project_members_v1` одразу (усі проєкти, а не один) — потрібен
 * спискам, що показують завдання ОДРАЗУ з кількох проєктів («Сьогодні»,
 * «Завдання», «Всі (N)»): підпис виконавця (§4.5) шукається по
 * `task.projectId` кожного окремого завдання, тож рядку списку не досить
 * членів лише одного проєкту, як пікеру форми (`useProjectMembers` вище).
 */
export function useAllProjectMembers(): Record<string, MemberOut[]> {
  const [all, setAll] = useState<Record<string, MemberOut[]>>({});

  useEffect(() => {
    let mounted = true;
    const read = () => {
      void loadData<Record<string, MemberOut[]>>(MEMBERS_CACHE_KEY, {}).then(cache => {
        if (mounted) setAll(cache);
      });
    };
    read();
    const unsubscribe = subscribeToStorage(key => { if (key === MEMBERS_CACHE_KEY) read(); });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  return all;
}
