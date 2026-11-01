/**
 * components/menu/MenuZones.tsx — статична зона екрана «Меню» на ПЛАНШЕТІ
 * (Layout System v2.4).
 *
 *   [статична: тиждень · зведення · групи] ┃ [головна: дні тижня] ┃ [динамічна: день]
 *
 * Статична стоїть поруч лише там, де вистачає ширини (ZoneLayout вирішує сам);
 * інакше картка тижня лишається вгорі головної зони, як і раніше. Телефон цих
 * компонентів не бачить.
 */
import { Atlas } from '@/constants/atlas';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KpiCounter } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, shadow } from '@/constants/theme';
import { weekDays, type MenuDetail, type MenuSpace } from '@/store/menu-api';

import { emptySlotCount, visibleSpaces } from './model';
import { fillMenuZone, useMenuZoneStrings } from './menuZoneStrings';
import type { MenuColors } from './theme';

/** Числа зведення тижня (чиста функція — для тестів). */
export function menuWeekSummary(menu: Pick<MenuDetail, 'week' | 'week_meals' | 'entries'>) {
  const days = weekDays(menu.week);
  const inWeek = menu.entries.filter((e) => days.includes(e.date));
  const withMenu = new Set(inWeek.map((e) => e.date)).size;
  return { dishes: inWeek.length, daysWithMenu: withMenu, days: days.length, emptySlots: emptySlotCount(menu) };
}

function Card({ c, children, label }: { c: MenuColors; children: React.ReactNode; label?: string }) {
  return (
    <View
      accessibilityLabel={label}
      style={[st.card, { backgroundColor: c.card, ...shadow[c.isDark ? 'dark' : 'light'].card }]}>
      {children}
    </View>
  );
}

function Row({ c, label, value }: { c: MenuColors; label: string; value: string | number }) {
  return (
    <View style={st.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[st.rowLabel, { color: c.sub }]}>{label}</Text>
      <Text numberOfLines={1} style={[st.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

export function MenuZoneStatic({
  weekCard,
  menu,
  spaces,
  currentId,
  pending,
  onOpenRequests,
  onSelectSpace,
  busy,
  c,
}: {
  /** Картка тижня (WeekStatusCard) — та сама, що в головній на вужчому вікні. */
  weekCard: React.ReactNode;
  menu: MenuDetail;
  spaces: readonly MenuSpace[];
  currentId: string;
  /** Звернення на розгляді (усі тижні). */
  pending: number;
  onOpenRequests: () => void;
  onSelectSpace: (id: string) => void;
  busy: boolean;
  c: MenuColors;
}) {
  const s = useMenuZoneStrings();
  const sum = menuWeekSummary(menu);
  const groups = visibleSpaces(spaces, false, currentId);
  return (
    <View style={st.root} testID="menu-static-zone">
      {weekCard}

      <Card c={c} label={s.summaryA11y}>
        <Text accessibilityRole="header" style={[st.title, { color: c.text }]}>{s.summary}</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          <KpiCounter value={sum.dishes} label={s.dishes} />
          <KpiCounter value={`${sum.daysWithMenu}/${sum.days}`} label={s.daysWithMenu} />
          {menu.week_meals.length > 0 ? <KpiCounter value={sum.emptySlots} label={s.emptySlots} /> : null}
        </View>
        <View style={[st.section, { borderTopColor: c.border }]}>
          <Row c={c} label={s.members} value={menu.members.length} />
          <Row c={c} label={s.role} value={menu.is_owner ? s.owner : s.member} />
        </View>
        <Pressable
          onPress={onOpenRequests}
          accessibilityRole="button"
          accessibilityLabel={fillMenuZone(s.requestsA11y, { n: pending })}
          testID="menu-static-requests"
          style={({ pressed }) => [st.requests, { backgroundColor: c.dim, opacity: pressed ? 0.7 : 1 }]}>
          <IconSymbol name="tray" size={16} color={c.text} />
          <Text style={[st.requestsText, { color: c.text }]}>{s.requests}</Text>
          {pending > 0 ? (
            <View style={[st.count, { backgroundColor: c.primary }]}>
              <Text style={[st.countText, { color: c.onPrimary }]}>{pending}</Text>
            </View>
          ) : null}
          <IconSymbol name="chevron.right" size={12} color={c.sub} />
        </Pressable>
      </Card>

      {groups.length > 1 ? (
        <Card c={c} label={s.groupsA11y}>
          <Text accessibilityRole="header" style={[st.title, { color: c.text }]}>{s.groups}</Text>
          <View style={{ marginTop: 8 }}>
            {groups.map((g) => {
              const selected = g.id === currentId;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => onSelectSpace(g.id)}
                  disabled={busy || selected}
                  accessibilityRole="button"
                  accessibilityLabel={fillMenuZone(s.groupSelectA11y, { name: g.name })}
                  accessibilityState={{ selected, disabled: busy || selected }}
                  style={({ pressed }) => [
                    st.group,
                    { backgroundColor: selected || pressed ? c.dim : 'transparent' },
                  ]}>
                  <IconSymbol name={selected ? 'checkmark.circle.fill' : 'person.2.fill'} size={16} color={selected ? c.text : c.sub} />
                  <Text numberOfLines={1} style={[st.groupName, { color: c.text }]}>{g.name}</Text>
                  {g.archived ? <Text style={[st.rowLabel, { color: c.sub }]}>{s.archived}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { gap: 12, paddingBottom: 12 },
  card: { borderRadius: Atlas.radius.xlarge, padding: 16 },
  title: { fontSize: 17, fontFamily: fontFamily.semibold },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: fontFamily.regular },
  rowValue: { flexShrink: 1, fontSize: 14, fontFamily: fontFamily.semibold, textAlign: 'right', fontVariant: ['tabular-nums'] },
  requests: { marginTop: 16, minHeight: 44, borderRadius: 999, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestsText: { flex: 1, fontSize: 14, fontFamily: fontFamily.semibold },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  group: { minHeight: 44, borderRadius: Atlas.radius.large, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupName: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
});
