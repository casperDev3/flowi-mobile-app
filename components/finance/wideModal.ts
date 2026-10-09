/**
 * components/finance/wideModal.ts — рукописні модалки-аркуші на широкому вікні.
 *
 * Частина екранів (фінанси, бюджет, скарбнички, статистика) малює аркуші
 * не через SheetModal, а власним <Modal> з оверлеєм `justifyContent:
 * 'flex-end'`. На телефоні це правильно, а на планшеті давало смугу форми,
 * притиснуту до низу екрана на 720pt (або й на всю ширину). SheetModal на
 * широкому вікні вже показує центрований діалог (рішення 6) — ці модалки
 * мають поводитись так само, інакше дві форми одного екрана відкриваються
 * по-різному.
 *
 * Чиста функція (без хуків): екрани вже мають `isWide` з useResponsive().
 *
 *   const wm = wideModalStyles(isWide);
 *   <Modal animationType={wm.animation} …>
 *     <Pressable style={[s.overlay, wm.overlay]} …>
 *       <Pressable style={[s.sheetWrapper, wm.column]} …>
 *
 * `overlay` дописується ПІСЛЯ власного стилю оверлея (той задає фон), а
 * `column` — після власної обгортки аркуша (та задає поля телефона).
 */
import type { ViewStyle } from 'react-native';

import { dialogColumnStyle, sheetColumnStyle } from '@/hooks/use-content-width';

export interface WideModalStyles {
  /** Оверлей: на широкому — центрування з полями, щоб бекдроп було видно з усіх боків. */
  overlay: ViewStyle;
  /** Колонка аркуша: телефон — на всю ширину; широке — діалог Layout.dialogMaxWidth. */
  column: ViewStyle;
  /** «Виїзд знизу» для діалогу посеред екрана виглядає чужим — лише проявлення. */
  animation: 'fade' | 'slide';
}

export function wideModalStyles(isWide: boolean, phoneAnimation: 'fade' | 'slide' = 'fade'): WideModalStyles {
  if (!isWide) {
    return { overlay: {}, column: sheetColumnStyle(false), animation: phoneAnimation };
  }
  return {
    overlay: { justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
    // Поля телефонної обгортки (12 з боків, 34 знизу під home indicator)
    // у діалозі зайві: відступи дає оверлей.
    column: { ...dialogColumnStyle(), paddingHorizontal: 0, paddingBottom: 0 },
    animation: 'fade',
  };
}
