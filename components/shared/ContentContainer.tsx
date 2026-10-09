/**
 * components/shared/ContentContainer.tsx — центрована колонка вмісту зі
 * стелею ширини та бічними полями за класом вікна.
 *
 * На телефоні — просто поля 16pt (як і було в екранах вручну). На планшеті
 * вміст не розповзається від краю до краю: 'reading' тримає 720pt (форми,
 * налаштування, текст), 'wide' — 1200pt (дашборди, сітки карток).
 *
 * Використання:
 *   <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
 *     <ContentContainer variant="wide">
 *       <ResponsiveGrid>{cards}</ResponsiveGrid>
 *     </ContentContainer>
 *   </ScrollView>
 *
 * `gutter={false}` — без бічних полів (коли поля дає батько, напр. картка).
 * Компонент лише обрамлює: фон, прокрутка й відступи зверху/знизу — справа
 * екрана.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Layout } from '@/constants/tokens';
import { useResponsive } from '@/hooks/use-responsive';

export type ContentVariant = 'reading' | 'wide' | 'full';

export function contentMaxWidthFor(variant: ContentVariant): number | undefined {
  if (variant === 'reading') return Layout.readingMaxWidth;
  if (variant === 'wide') return Layout.wideMaxWidth;
  return undefined;
}

export interface ContentContainerProps {
  variant?: ContentVariant;
  /** Бічні поля за класом вікна (default: true). */
  gutter?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

export function ContentContainer({
  variant = 'reading', gutter = true, style, children, testID,
}: ContentContainerProps) {
  const { sizeClass } = useResponsive();
  const maxWidth = contentMaxWidthFor(variant);
  return (
    <View
      testID={testID}
      style={[
        // width:'100%' обов'язкове: з alignSelf:'center' без нього колонка
        // стиснулась би до ширини вмісту.
        { width: '100%', alignSelf: 'center' },
        maxWidth ? { maxWidth } : null,
        gutter ? { paddingHorizontal: Layout.gutter[sizeClass] } : null,
        style,
      ]}>
      {children}
    </View>
  );
}
