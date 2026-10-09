/**
 * components/menu/WeekStatusCard.tsx — перемикач тижнів, статус тижня і
 * головна дія (затвердити / редагувати затверджене / запропонувати страву).
 */
import { Atlas } from '@/constants/atlas';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { addDays, type MenuDetail } from '@/store/menu-api';

import type { MenuBitsApi } from './MenuBits';
import { dateLabel, weekKindLabel } from './model';
import type { MenuColors } from './theme';

export function WeekStatusCard({
  menu,
  current,
  next,
  canEdit,
  editApproved,
  onEditApproved,
  pendingWeek,
  proposalsOpen,
  onWeek,
  onPublish,
  onPropose,
  bits,
  c,
}: {
  menu: MenuDetail;
  current: string;
  next: string;
  canEdit: boolean;
  editApproved: boolean;
  onEditApproved: (v: boolean) => void;
  pendingWeek: number;
  proposalsOpen: boolean;
  onWeek: (week: string) => void;
  onPublish: () => void;
  onPropose: () => void;
  bits: MenuBitsApi;
  c: MenuColors;
}) {
  const { btn, iconBtn, badge, text } = bits;
  const approved = !!menu.published_at;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: Atlas.radius.xlarge,
        padding: 12,
        gap: 12,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {iconBtn('chevron.left', 'Попередній тиждень', () => onWeek(addDays(menu.week, -7)))}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
            {dateLabel(menu.week)} — {dateLabel(addDays(menu.week, 6))}
          </Text>
          <Text style={{ color: c.sub, fontSize: 12 }}>
            {weekKindLabel(menu.week, current, next, menu.archived)}
          </Text>
        </View>
        {iconBtn('chevron.right', 'Наступний тиждень', () => onWeek(addDays(menu.week, 7)), menu.week >= next)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {approved
          ? canEdit && editApproved
            ? badge('warn', 'Редагування затвердженого', 'pencil')
            : badge('ok', 'Затверджено', 'checkmark.seal')
          : canEdit
            ? badge('warn', 'Чернетка')
            : badge('muted', 'Не затверджено')}
        <Text style={{ color: c.sub, fontSize: 12, flexShrink: 1 }}>
          {menu.timezone} · {menu.is_owner ? 'Ви власник' : 'Ви учасник'}
        </Text>
        <View style={{ flexGrow: 1 }} />
        {canEdit &&
          approved &&
          (editApproved
            ? btn('Готово', () => onEditApproved(false), true)
            : btn('Редагувати', () => onEditApproved(true), false, false, 'pencil'))}
        {canEdit &&
          !approved &&
          btn(
            pendingWeek ? `Опрацюйте пропозиції: ${pendingWeek}` : 'Затвердити тиждень',
            onPublish,
            true,
            pendingWeek > 0,
          )}
        {!menu.is_owner && proposalsOpen && btn('＋ Пропозиція на наступний тиждень', onPropose, true)}
      </View>
      {canEdit &&
        approved &&
        editApproved &&
        text('Зміни в затвердженому меню надсилають сповіщення учасникам.', true)}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {(
          [
            [current, 'До цього тижня'],
            [next, 'До наступного'],
          ] as const
        )
          .filter(([w]) => w !== menu.week)
          .map(([w, label]) => (
            <Pressable
              key={label}
              accessibilityRole="link"
              onPress={() => onWeek(w)}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}
