/**
 * components/layout-zones — Layout System v2.4 (п'ять зон), нативні
 * відповідники вебових компонентів з тими самими назвами.
 * Документація — docs/design-system-v2.md, розділ «Layout System (v2.4)».
 */
export { ZoneLayout, zoneWidths, type ZoneLayoutProps, type ZoneWidths } from './ZoneLayout';
export {
  ZONE_MIN_WIDTH, ZONE_KEY_STEP, ZONE_HANDLE_WIDTH, resizeZoneWidth, sanitizeZoneSize, defaultDynamicWidth,
  type ZoneSizes,
} from './zoneWidths';
export { ZoneResizeHandle, type ZoneResizeHandleProps } from './ZoneResizeHandle';
export {
  useZoneSizes, setZoneSize, getZoneSizes, parseZoneSizes, ZONE_SIZES_KEY, DEFAULT_ZONE_SIZE_KEY,
} from './zoneSizes';
export { BottomSheet, type BottomSheetProps } from './BottomSheet';
export { SwipeRow, type SwipeAction, type SwipeActionTone, type SwipeRowA11y } from './SwipeRow';
export { KanbanPager, type KanbanColumn } from './KanbanPager';
export { ZoneSkeleton, ZoneEmpty, ZoneError, type ZoneSkeletonVariant } from './ZoneStates';
export { BulkActionBar, type BulkAction } from './BulkActionBar';
export { ViewModeSwitch } from './ViewModeSwitch';
export { PanelToggles } from './PanelToggles';
export { useZoneStrings, zoneStrings } from './strings';
export { OverlaySurface, OverlayScrim, OverlayMaterial, overlayFillStyle } from '@/components/ds/OverlaySurface';
export {
  useZoneState, useZonePrefs, useActiveZone, setZonePrefs, getZonePrefs, parseZonePrefs,
  ZONE_PREFS_KEY, DEFAULT_ZONE_PREFS,
  type ZoneView, type ZonePanel, type ZoneState, type ZoneSectionPrefs, type UseZoneStateOptions,
} from '@/hooks/use-zone-state';
