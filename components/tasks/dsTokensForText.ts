/**
 * components/tasks/dsTokensForText.ts — токени DS v2 за кольором тексту палітри.
 *
 * Частина компонентів (шапка картки завдання, міні-календар, колонка
 * «Сьогодні», аналітика проєктів) не знає `isDark` — вона отримує лише
 * палітру екрана (`{ text, sub, … }`). Тягнути в них `useDS()` не можна:
 * хук імпортує store/theme-context → AsyncStorage, а ці компоненти
 * рендеряться в юніт-тестах без мока сховища.
 *
 * Тема однозначно випливає з кольору основного тексту: світлий текст —
 * темна тема, темний — світла. Нешестизначні значення (rgba, #111) —
 * світла тема, як і раніше за замовчуванням.
 */
import { theme, type DSTheme } from '@/constants/theme';

export function dsTokensForText(text: string | undefined): DSTheme {
  const m = /^#([0-9a-f]{6})$/i.exec(text ?? '');
  if (!m) return theme.light;
  const n = parseInt(m[1], 16);
  const luma = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luma > 0.5 ? theme.dark : theme.light;
}
