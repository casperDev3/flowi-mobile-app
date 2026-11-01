/**
 * components/ds — примітиви Design System v2.
 * Токени: constants/theme.ts; хук: hooks/use-ds.ts; опис: docs/design-system-v2.md.
 */
export { Card, type CardProps } from './Card';
export { PillButton, type PillButtonProps, type PillButtonVariant } from './PillButton';
export { Chip, type ChipProps } from './Chip';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export { DisplayNumber, type DisplayNumberProps } from './DisplayNumber';
export { Skeleton, SkeletonCard, type SkeletonProps } from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { AIBlock, AIOrb, type AIBlockProps } from './AIBlock';
export { PromoCard, type PromoCardProps } from './PromoCard';
// ── Liquid Glass (DS v2.1) ──
export { GlassBackdrop, GlassSurface, isNativeLiquidGlass, type GlassSurfaceProps, type GlassVariant } from './Glass';
export { MeshBackground, type MeshBackgroundProps } from './MeshBackground';
export { GlassScreen, type GlassScreenProps } from './GlassScreen';
export { IconChip, type IconChipProps } from './IconChip';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { AccentProvider, useModuleAccent, useResolvedAccent } from './AccentContext';
// ── Omni layout (DS v2.2) ──
export { SignatureGradient, signatureAt, type SignatureGradientProps } from './Signature';
export {
  BentoGrid, BentoCard, BentoCardHeader, BentoArrowButton, BentoPeriodPill, useBentoColors,
  BENTO_COLUMNS, BENTO_MIN_COLUMN,
  type BentoGridProps, type BentoCardProps, type BentoCardHeaderProps, type BentoVariant, type BentoColors,
} from './Bento';
export { PageHeader, KpiCounter, type PageHeaderProps, type KpiCounterProps, type KpiDeltaTone } from './PageHeader';
export { SectionTabs, type SectionTab, type SectionTabsProps } from './SectionTabs';
export { SegmentedProgress, type SegmentedProgressProps } from './SegmentedProgress';
export { HatchedBars, type HatchedBar, type HatchedBarsProps } from './HatchedBars';
export { Tag, PriorityFlag, type TagProps, type PriorityFlagProps, type Priority } from './Tag';
export { Avatar, AvatarStack, initialsOf, type AvatarPerson, type AvatarProps, type AvatarStackProps } from './AvatarStack';
export { OverlaySurface, OverlayScrim, OverlayMaterial, overlayFillStyle, type OverlaySurfaceProps } from './OverlaySurface';
// ── Filters (DS v2.5, лише не-compact) ──
export * from './filters';
