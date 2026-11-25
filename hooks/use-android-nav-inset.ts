/**
 * hooks/use-android-nav-inset.ts
 *
 * Скільки додати до нижнього відступу, щоб контрол не опинився під системною
 * панеллю навігації Android (3 кнопки ≈ 48dp, жести ≈ 16–24dp).
 *
 * app.json → android.edgeToEdgeEnabled: true (а Android 15 вмикає edge-to-edge
 * примусово), тож вікно — і RN `Modal` теж — малює під панеллю навігації.
 * Правило: на Android `базовий відступ + insets.bottom`; на iOS — 0, щоб
 * зберегти наявні відступи (34/48 тощо вже враховують home indicator).
 */
import { Platform } from 'react-native';
import { useSoftSafeAreaInsets } from '@/hooks/use-soft-safe-area-insets';

export function useAndroidNavInset(): number {
  const bottom = useSoftSafeAreaInsets().bottom || 0;
  return Platform.OS === 'android' ? bottom : 0;
}

/**
 * Стиль нижнього поля для аркуша/списку з фіксованим `paddingBottom`
 * (`ios ? X : base`): на Android → `base + insets.bottom`, на iOS → null
 * (статичний стиль лишається як є). Ставити ОСТАННІМ у масив стилів.
 */
export function useAndroidBottomPad(base = 16): { paddingBottom: number } | null {
  const navInset = useAndroidNavInset();
  return navInset > 0 ? { paddingBottom: base + navInset } : null;
}
