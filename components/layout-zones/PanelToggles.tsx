/**
 * components/layout-zones/PanelToggles.tsx — три точки під головною зоною
 * (Layout System v2.4, сторінка 05 специфікації).
 *
 *   ● ліва    — статична зона on/off   (лише коли вона взагалі вміщається)
 *   ● середня — головна зона, завжди увімкнена (неактивна кнопка-індикатор)
 *   ● права   — панель деталей on/off
 * → 4 стани: усе / без статичної / без деталей / фокус. Ті самі перемикачі —
 * і в «Списку», і в «Колонках» (рішення 02).
 *
 * Кожна точка — кнопка 44×44 з видимою крапкою 10pt; увімкнена — action.primary,
 * вимкнена — порожнє кільце. Роль switch + checked; підпис називає зону.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDSTheme } from '@/components/shared/useDSTheme';
import { radius } from '@/constants/theme';
import type { ZonePanel } from '@/hooks/use-zone-state';

import { useZoneStrings } from './strings';

export function PanelToggles({ panels, onToggle, staticAvailable = true, style, testID }: {
  panels: { static: boolean; dynamic: boolean };
  onToggle: (panel: ZonePanel) => void;
  /** Статична зона вміщається поруч (інакше ліва точка прихована). */
  staticAvailable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useDSTheme();
  const s = useZoneStrings();

  const dot = (on: boolean, locked = false) => (
    <View
      style={[
        st.dot,
        on ? { backgroundColor: locked ? t.text.secondary : t.action.primary } : { borderWidth: 1.5, borderColor: t.text.secondary },
      ]}
    />
  );

  return (
    <View testID={testID} accessibilityLabel={s.panelsToggle} style={[st.row, { backgroundColor: t.surface.card }, style]}>
      {staticAvailable ? (
        <Pressable
          testID={testID ? `${testID}-static` : undefined}
          onPress={() => onToggle('static')}
          accessibilityRole="switch"
          accessibilityState={{ checked: panels.static }}
          accessibilityLabel={s.panelStatic}
          style={st.btn}>
          {dot(panels.static)}
        </Pressable>
      ) : null}
      <View
        accessible
        accessibilityRole="switch"
        accessibilityState={{ checked: true, disabled: true }}
        accessibilityLabel={s.panelMain}
        style={st.btn}>
        {dot(true, true)}
      </View>
      <Pressable
        testID={testID ? `${testID}-dynamic` : undefined}
        onPress={() => onToggle('dynamic')}
        accessibilityRole="switch"
        accessibilityState={{ checked: panels.dynamic }}
        accessibilityLabel={s.panelDynamic}
        style={st.btn}>
        {dot(panels.dynamic)}
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: 4 },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
