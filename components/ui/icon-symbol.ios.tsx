import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      // NAT-05: декоративна іконка — інакше VoiceOver читав імʼя SF Symbol
      // («archive, Архів», «calendar, calendar, Календар»). Підпис дає
      // батьківська кнопка/рядок.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
