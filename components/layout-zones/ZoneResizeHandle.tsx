/**
 * components/layout-zones/ZoneResizeHandle.tsx — межа між зонами, яку можна
 * тягнути (планшет; телефон зон поруч не має).
 *
 *   • перетягування пальцем / курсором (iPad з трекпадом) — без min/max,
 *     лише технічна підлога ZONE_MIN_WIDTH (resizeZoneWidth);
 *   • подвійний дотик — типова ширина;
 *   • VoiceOver: роль adjustable, свайп угору/вниз — ширше/вужче на
 *     ZONE_KEY_STEP, дія «Типова ширина».
 * Візуально — тонка ручка по центру смуги 16pt; ціль дотику ширша (hitSlop
 * у межах того самого рядка зон, тож він справді працює).
 */
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useSidebarStrings } from '@/components/shared/sidebar-strings';
import { useDSTheme } from '@/components/shared/useDSTheme';

import { ZONE_HANDLE_WIDTH, ZONE_KEY_STEP, resizeZoneWidth } from './zoneWidths';

export interface ZoneResizeHandleProps {
  /** Поточна видима ширина зони (без проміжку). */
  width: number;
  /** +1 — тягнути вправо = ширше (статична ліворуч); -1 — вліво = ширше (деталі праворуч). */
  direction: 1 | -1;
  /** Скільки максимум може мати зона, щоб головна лишилась ≥ підлоги. */
  maxWidth: number;
  /** Нова ширина; `save` — кінець жесту / крок VoiceOver. */
  onResize: (width: number, save: boolean) => void;
  onReset: () => void;
  label: string;
  testID?: string;
}

const webCursor = (Platform.OS === 'web' ? { cursor: 'col-resize' } : null) as ViewStyle | null;

export function ZoneResizeHandle({ width, direction, maxWidth, onResize, onReset, label, testID }: ZoneResizeHandleProps) {
  const { t } = useDSTheme();
  const s = useSidebarStrings();
  const [dragging, setDragging] = useState(false);
  const start = useRef(width);
  const last = useRef(width);
  const latest = useRef({ width, maxWidth, onResize, onReset });
  latest.current = { width, maxWidth, onResize, onReset };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-3, 3])
    .hitSlop({ horizontal: 10 })
    .onBegin(() => {
      start.current = latest.current.width;
      last.current = latest.current.width;
      setDragging(true);
    })
    .onUpdate(e => {
      const next = resizeZoneWidth(start.current, direction * e.translationX, latest.current.maxWidth);
      if (next !== last.current) {
        last.current = next;
        latest.current.onResize(next, false);
      }
    })
    .onEnd(() => { latest.current.onResize(last.current, true); })
    .onFinalize(() => { setDragging(false); });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .hitSlop({ horizontal: 10 })
    .onEnd((_e, ok) => { if (ok) latest.current.onReset(); });

  const step = (delta: number) => onResize(resizeZoneWidth(width, delta, maxWidth), true);

  return (
    <GestureDetector gesture={Gesture.Race(pan, doubleTap)}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={s.resizeHint}
        accessibilityValue={{ text: `${Math.round(width)} pt` }}
        accessibilityActions={[
          { name: 'increment', label: s.resizeWider },
          { name: 'decrement', label: s.resizeNarrower },
          { name: 'reset', label: s.resizeReset },
        ]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'increment') step(ZONE_KEY_STEP);
          else if (e.nativeEvent.actionName === 'decrement') step(-ZONE_KEY_STEP);
          else if (e.nativeEvent.actionName === 'reset') onReset();
        }}
        style={[st.handle, webCursor]}>
        <View
          pointerEvents="none"
          style={[st.grip, { backgroundColor: dragging ? t.text.primary : t.text.secondary }, dragging && st.gripActive]}
        />
      </View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  handle: { width: ZONE_HANDLE_WIDTH, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  grip: { width: 3, height: 36, borderRadius: 2 },
  gripActive: { width: 4, height: 56 },
});
