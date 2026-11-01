/**
 * components/ds/filters — уніфіковані фільтри DS v2.5 (лише планшет / не compact).
 * Опис — docs/design-system-v2.md, розділ «Filters (v2.5)».
 */
export {
  Segmented, FilterSelect, FilterSearch, FilterBar, useFiltersV25, isFilterSelectActive,
  type SegmentedOption, type SegmentedProps, type FilterOption, type FilterSelectProps,
  type FilterSelectSingleProps, type FilterSelectMultiProps, type FilterBarItem, type FilterBarProps,
} from './Filters';
export {
  FILTER_CONTROL_H, FILTER_HIT_H, FILTER_HIT_SLOP, FILTER_GAP, FILTER_SEARCH_THRESHOLD,
  partitionFilterItems, countHiddenActive, filterTriggerText, overflowTriggerText, matchesQuery, typeaheadIndex, placeFilterMenu,
  type MenuAnchor,
  type PartitionInput, type TriggerTextInput,
} from './filterLogic';
