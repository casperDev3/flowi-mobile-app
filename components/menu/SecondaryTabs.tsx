/**
 * components/menu/SecondaryTabs.tsx — вкладки «Звернення», «Учасники» і
 * «Група» екрана меню. Стан (фільтр, історія) і запити лишаються в екрані;
 * тут лише розмітка й виклики переданих дій.
 */
import React from 'react';
import { Text } from 'react-native';

import { feedbackStatus, meals, menuApi, type MenuDetail } from '@/store/menu-api';

import { confirmAction } from './confirm';
import type { MenuBitsApi } from './MenuBits';
import { dateLabel, type Editor } from './model';
import type { MenuColors } from './theme';

type Run = (fn: () => Promise<unknown>, note?: string) => Promise<void>;

export function RequestsTab({
  menu,
  id,
  next,
  filter,
  onFilter,
  history,
  onHistory,
  proposalsOpen,
  open,
  run,
  bits,
  c,
}: {
  menu: MenuDetail;
  id: string;
  next: string;
  filter: string;
  onFilter: (f: string) => void;
  history: boolean;
  onHistory: (v: boolean) => void;
  proposalsOpen: boolean;
  open: (e: Editor) => void;
  run: Run;
  bits: MenuBitsApi;
  c: MenuColors;
}) {
  const { btn, row, panel, text } = bits;
  const shown = menu.feedback.filter(
    (f) => f.kind === filter && (history ? f.status !== 'pending' : f.status === 'pending'),
  );
  return (
    <>
      {row(
        <>
          {btn('Пропозиції', () => onFilter('proposal'), filter === 'proposal')}
          {btn('Скарги', () => onFilter('complaint'), filter === 'complaint')}
          {btn(history ? 'На розгляді' : 'Історія', () => onHistory(!history))}
        </>,
      )}
      {text('Приватно: звернення бачать лише автор і власник.', true)}
      {proposalsOpen && btn('Запропонувати страву', () => open({ kind: 'proposal' }), true)}
      {shown.map((f) =>
        panel(
          <>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {f.kind === 'complaint' ? f.snapshot.title || 'Скарга' : f.text}
            </Text>
            {text(
              `${f.author} · ${f.date ? dateLabel(f.date) : 'Вільна ідея'}${f.meal ? ' · ' + meals[f.meal] : ''} · ${feedbackStatus[f.status] || f.status}`,
              true,
            )}
            {f.kind === 'complaint' && text(f.text)}
            {!!f.description && text(f.description)}
            {f.dish_changed && text('Страву змінено або видалено після звернення.', true)}
            {!!f.response && text('Відповідь: ' + f.response)}
            {row(
              <>
                {f.status === 'pending' &&
                  !menu.archived &&
                  menu.is_owner &&
                  btn('Розглянути', () => open({ kind: 'review', item: f }), true)}
                {f.status === 'pending' && !menu.archived && f.is_mine && f.kind === 'proposal' && f.week === next && (
                  <>
                    {btn('Редагувати', () => open({ kind: 'proposal', item: f }))}
                    {btn(
                      'Відкликати',
                      () =>
                        void (async () => {
                          if (await confirmAction('Відкликати пропозицію?'))
                            await run(
                              () => menuApi.review(id, f.id, { status: 'withdrawn', version: f.updated_at }),
                              'Пропозицію відкликано',
                            );
                        })(),
                    )}
                  </>
                )}
              </>,
            )}
          </>,
          String(f.id),
        ),
      )}
      {!shown.length && panel(text(history ? 'Історія поки порожня' : 'Усе опрацьовано'))}
    </>
  );
}

export function MembersTab({
  menu,
  id,
  userId,
  open,
  run,
  bits,
}: {
  menu: MenuDetail;
  id: string;
  userId?: string;
  open: (e: Editor) => void;
  run: Run;
  bits: MenuBitsApi;
}) {
  const { btn, panel, text } = bits;
  return (
    <>
      {menu.is_owner && !menu.archived && btn('Запросити учасників', () => open({ kind: 'invite' }), true)}
      {menu.members.map((m) =>
        panel(
          <>
            {text(m.name + (m.owner ? ' · Власник' : ''))}
            {!m.owner &&
              !menu.archived &&
              (menu.is_owner || String(m.id) === userId) &&
              btn(
                menu.is_owner ? 'Видалити учасника' : 'Вийти з групи',
                () =>
                  void (async () => {
                    if (await confirmAction('Припинити доступ до групи? Історія звернень збережеться.'))
                      await run(() => menuApi.leave(id, m.id), 'Доступ припинено');
                  })(),
              )}
          </>,
          String(m.id),
        ),
      )}
      {menu.is_owner &&
        menu.invites.map((i) =>
          panel(
            <>
              {text(
                `${i.email || 'Спільне посилання'} · ${i.revoked ? 'Відкликано' : 'до ' + new Date(i.expires_at).toLocaleDateString('uk-UA')}`,
                true,
              )}
              {!i.revoked &&
                !menu.archived &&
                btn(
                  'Відкликати запрошення',
                  () =>
                    void (async () => {
                      if (await confirmAction('Відкликати посилання? Учасники залишаться в групі.'))
                        await run(() => menuApi.revoke(id, i.id), 'Запрошення відкликано');
                    })(),
                )}
            </>,
            i.id,
          ),
        )}
    </>
  );
}

export function GroupTab({
  menu,
  id,
  open,
  run,
  bits,
  c,
}: {
  menu: MenuDetail;
  id: string;
  open: (e: Editor) => void;
  run: Run;
  bits: MenuBitsApi;
  c: MenuColors;
}) {
  const { btn, panel, text, row } = bits;
  return panel(
    <>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{menu.name}</Text>
      {text(menu.timezone + ' · Понеділок — неділя', true)}
      {text(menu.meals.map((m) => meals[m]).join(' · '))}
      {text('Нові прийоми їжі застосовуються лише до ще не створених тижнів.', true)}
      {menu.is_owner &&
        row(
          <>
            {!menu.archived && btn('Налаштувати групу', () => open({ kind: 'settings' }))}
            {btn(
              menu.archived ? 'Відновити групу' : 'Архівувати групу',
              () =>
                void (async () => {
                  if (
                    await confirmAction(
                      menu.archived
                        ? 'Відновити групу? Старі запрошення залишаться відкликаними.'
                        : 'Архівувати групу? Учасники збережуть доступ до історії.',
                    )
                  )
                    await run(() => menuApi.settings(id, { archived: !menu.archived }), 'Стан групи оновлено');
                })(),
            )}
          </>,
        )}
    </>,
  );
}
