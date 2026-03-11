import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

const MAPPING: Record<string, MaterialIconName> = {
  // Navigation
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  // Tabs
  'checklist': 'checklist',
  'banknote': 'account-balance-wallet',
  'clock.fill': 'access-time',
  'gearshape.fill': 'settings',
  // Actions
  'plus': 'add',
  'xmark': 'close',
  'checkmark': 'check',
  'trash': 'delete-outline',
  'pencil': 'edit',
  'square.and.arrow.up': 'share',
  'arrow.clockwise': 'refresh',
  // Arrows / trends
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'arrow.up.trend': 'trending-up',
  'arrow.down.trend': 'trending-down',
  'arrow.up.arrow.down': 'swap-vert',
  // Status / indicators
  'flag.fill': 'flag',
  'circle': 'radio-button-unchecked',
  'circle.fill': 'radio-button-checked',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.circle': 'check-circle-outline',
  'exclamationmark.circle': 'error-outline',
  // Time & calendar
  'timer': 'timer',
  'calendar': 'calendar-today',
  'clock': 'access-time-filled',
  // Shifts (outline style)
  'sun.horizon.fill': 'wb-twilight',
  'sun.max.fill': 'wb-sunny',
  'sunset.fill': 'nights-stay',
  'moon.fill': 'bedtime',
  // Finance
  'tag': 'label-outline',
  'doc.text': 'description',
  'wallet.pass': 'account-balance-wallet',
  // Lists
  'list.bullet': 'format-list-bulleted',
  'plus.circle': 'add-circle-outline',
  'info.circle': 'info-outline',
  'minus': 'remove',
  'ellipsis': 'more-horiz',
  // Sorting
  'arrow.up.down': 'sort',
  'text.alignleft': 'sort-by-alpha',
  // Settings
  'bell.fill': 'notifications-none',
  'bell': 'notifications-none',
  'globe': 'language',
  'person.fill': 'person-outline',
  'shield.fill': 'security',
  'hand.raised': 'privacy-tip',
  'info': 'info-outline',
  'heart.fill': 'favorite-border',
  'drop.fill': 'water-drop',
  'trash.fill': 'delete-outline',
  'icloud.fill': 'backup',
  'moon': 'dark-mode',
  'sun.max': 'light-mode',
  'circle.lefthalf.filled': 'contrast',
  'paintbrush': 'palette',
};

export type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
