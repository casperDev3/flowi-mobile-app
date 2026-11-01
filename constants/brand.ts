import type { ImageSourcePropType } from 'react-native';

/**
 * Знак Flowi без плитки: чорний гліф на світлій темі, білий — на темній.
 * Іконка застосунку/сплеш — окремо в app.json (assets/images/icon.png тощо).
 */
const MARK_BLACK: ImageSourcePropType = require('@/assets/images/logo-mark-black.png');
const MARK_WHITE: ImageSourcePropType = require('@/assets/images/logo-mark-white.png');

export function brandMark(isDark: boolean): ImageSourcePropType {
  return isDark ? MARK_WHITE : MARK_BLACK;
}
