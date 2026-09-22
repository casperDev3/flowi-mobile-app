/**
 * components/tasks/CalendarGrid.tsx
 *
 * Сітка місяця: заголовок з перемиканням, ряд днів тижня і клітинки.
 * Використовується трьома календарями — фільтром за датою та вибором
 * дедлайну в обох формах.
 *
 * Сама сітка приходить готовою (monthGrid), бо її будує той, хто знає
 * рік і місяць; тут лише малювання й обробка натискань.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

/**
 * Ціль дотику 44×44 навколо стрілки 36×36 — той самий прийом, що вже стоїть
 * у HEADER_BUTTON_HIT_SLOP (components/shared/ScreenHeader.tsx) і в чекбоксі
 * TaskCompactCard: сама кнопка лишається 36pt на око, а натискання ловиться
 * за нормою HIG.
 *
 * Тут slop симетричний, на відміну від хедера. У хедері 4pt по горизонталі —
 * компроміс із сусідньою кнопкою за 7pt; стрілки місяця стоять по краях
 * рядка, між ними — заголовок на flex:1, тож перекриватися нема з чим, і
 * 4pt з усіх боків дають рівно 44×44.
 */
export const CALENDAR_NAV_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

export function CalendarGrid({ year, month, markedDays, selectedDate, todayDate, weeks, onPrevMonth, onNextMonth, onSelectDay, c, months, weekdays }: {
  year: number; month: number; markedDays: Set<string>; selectedDate: string | null;
  todayDate: Date; weeks: (number | null)[][]; onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDay: (d: Date) => void; c: any;
  months: string[]; weekdays: string[];
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity onPress={onPrevMonth} style={st.navBtn} hitSlop={CALENDAR_NAV_HIT_SLOP}>
          <IconSymbol name="chevron.left" size={20} color={c.sub} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
          {months[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={st.navBtn} hitSlop={CALENDAR_NAV_HIT_SLOP}>
          <IconSymbol name="chevron.right" size={20} color={c.sub} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {weekdays.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1 }} />;
            const dayDate = new Date(year, month, day);
            const keyStr = `${year}-${month}-${day}`;
            const isToday = dayDate.toDateString() === todayDate.toDateString();
            const isSel = selectedDate === dayDate.toDateString();
            const hasMark = markedDays.has(keyStr);
            return (
              <TouchableOpacity
                key={di}
                onPress={() => onSelectDay(dayDate)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <View style={[st.dayCell, isSel && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }]}>
                  <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                </View>
                {hasMark && !isSel && <View style={[st.daydot, { backgroundColor: c.accent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </>
  );
}

const st = StyleSheet.create({
  navBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:  { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
