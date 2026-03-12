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
  'trash.fill': 'delete-outline',
  'pencil': 'edit',
  'square.and.arrow.up': 'share',
  'square.and.arrow.down': 'download',
  'arrow.clockwise': 'refresh',
  'arrow.uturn.backward': 'undo',
  // Arrows / trends
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'arrow.up.trend': 'trending-up',
  'arrow.down.trend': 'trending-down',
  'arrow.up.arrow.down': 'swap-vert',
  // Status / indicators
  'flag': 'outlined-flag',
  'flag.fill': 'flag',
  'circle': 'radio-button-unchecked',
  'circle.fill': 'radio-button-checked',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.circle': 'check-circle-outline',
  'checkmark.seal': 'verified',
  'checkmark.shield.fill': 'verified-user',
  'exclamationmark.circle': 'error-outline',
  'exclamationmark.triangle.fill': 'warning',
  'xmark.circle.fill': 'cancel',
  'xmark.circle': 'highlight-off',
  // Time & calendar
  'timer': 'timer',
  'calendar': 'calendar-today',
  'clock': 'access-time-filled',
  'clock.arrow.2.circlepath': 'restore',
  // Shifts (outline style)
  'sun.horizon.fill': 'wb-twilight',
  'sun.max.fill': 'wb-sunny',
  'sunset.fill': 'nights-stay',
  'moon.fill': 'bedtime',
  // Finance & categories
  'tag': 'label-outline',
  'tag.fill': 'label',
  'doc.text': 'description',
  'wallet.pass': 'account-balance-wallet',
  'chart.bar.fill': 'bar-chart',
  'chart.line.uptrend.xyaxis': 'show-chart',
  'building.columns.fill': 'account-balance',
  'briefcase.fill': 'work',
  'laptopcomputer': 'laptop',
  'gift.fill': 'card-giftcard',
  'fork.knife': 'restaurant',
  'car.fill': 'directions-car',
  'gamecontroller.fill': 'sports-esports',
  'cross.fill': 'local-hospital',
  'ellipsis.circle.fill': 'more-horiz',
  // Lists & folders
  'list.bullet': 'format-list-bulleted',
  'list.bullet.circle.fill': 'format-list-bulleted',
  'plus.circle': 'add-circle-outline',
  'plus.circle.fill': 'add-circle',
  'info.circle': 'info-outline',
  'minus': 'remove',
  'ellipsis': 'more-horiz',
  'magnifyingglass': 'search',
  'square.grid.2x2': 'grid-view',
  'folder': 'folder-open',
  'folder.fill': 'folder',
  'folder.badge.magnifyingglass': 'folder-open',
  'archivebox.fill': 'archive',
  'tray': 'inbox',
  'note.text': 'note',
  'doc.on.clipboard': 'content-paste',
  'externaldrive': 'storage',
  'externaldrive.fill': 'storage',
  'lightbulb.fill': 'lightbulb',
  'ladybug.fill': 'bug-report',
  // Sorting & filters
  'arrow.up.down': 'sort',
  'text.alignleft': 'sort-by-alpha',
  'line.3.horizontal.decrease': 'filter-list',
  'slider.horizontal.3': 'tune',
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
