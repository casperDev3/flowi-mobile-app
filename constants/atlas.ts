/** Native adaptation of @atlaskit/tokens 20 shape/spacing foundations.
 * Atlaskit is React DOM; native controls retain touch targets and Dynamic Type.
 * Brand colours remain in the existing Flowi screen palettes.
 */
export const Atlas = {
  radius: { xsmall: 2, small: 4, medium: 6, large: 8, xlarge: 12, xxlarge: 16 },
  space: { s025: 2, s050: 4, s075: 6, s100: 8, s150: 12, s200: 16, s300: 24, s400: 32 },
  type: {
    headingWeight: '600' as const,
    strongWeight: '700' as const,
    label: {fontSize:12, lineHeight:16, fontWeight:'600' as const},
    body: {fontSize:14, lineHeight:20},
    heading: {fontSize:24, lineHeight:28, fontWeight:'600' as const},
  },
  controlHeight: 44,
} as const;
