/** Native adaptation of @atlaskit/tokens 20 shape/spacing foundations.
 * Atlaskit is React DOM; native controls retain touch targets and Dynamic Type.
 *
 * DS v2 («м'який мінімалізм»): радіуси перепризначено на шкалу дизайн-системи
 * (constants/theme.ts → radius: картки 16, вкладені 12, контроли 10, pill),
 * бо ~700 стилів беруть їх саме звідси:
 *   xsmall   4  кейкапи, крихітні мітки
 *   small    6  дрібні бейджі, чекбокси, лічильники
 *   medium  10  контроли, рядки, кнопки (radius.control)
 *   large   10  поля вводу, вкладені блоки (radius.nestedCompact)
 *   xlarge  14  компактні картки, аркуші (radius.cardCompact)
 *   xxlarge 16  картки, верх bottom-sheet (radius.card)
 * Нові стилі беріть із constants/theme.ts (radius.*) напряму.
 *
 * Unslop: ваги типографіки — 500/600 (700+ не використовуємо).
 */
export const Atlas = {
  radius: { xsmall: 4, small: 6, medium: 10, large: 10, xlarge: 14, xxlarge: 16 },
  space: { s025: 2, s050: 4, s075: 6, s100: 8, s150: 12, s200: 16, s300: 24, s400: 32 },
  type: {
    headingWeight: '600' as const,
    strongWeight: '600' as const,
    label: {fontSize:12, lineHeight:16, fontWeight:'500' as const},
    body: {fontSize:14, lineHeight:20},
    heading: {fontSize:24, lineHeight:28, fontWeight:'500' as const},
  },
  controlHeight: 44,
} as const;
