/**
 * Тестовий SheetModal: без анімацій, але з тією самою ПОСЛІДОВНІСТЮ, що й
 * справжній — `onClose` приходить і коли людина закрила аркуш сама
 * (`sheet-dismiss`: свайп / тап повз / ✕), і коли батько зняв `visible`
 * (тоді — після «анімації», тобто в ефекті), але не двічі.
 */
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

export function SheetModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const wasVisible = React.useRef(false);
  const closed = React.useRef(false);
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (visible && !wasVisible.current) closed.current = false;
    if (!visible && wasVisible.current && !closed.current) { closed.current = true; onClose(); }
    wasVisible.current = visible;
  });
  if (!visible || closed.current) return null;
  return (
    <View testID="sheet">
      <TouchableOpacity testID="sheet-dismiss" onPress={() => { closed.current = true; force(n => n + 1); onClose(); }} />
      {children}
    </View>
  );
}

export function SheetHandle() { return null; }
