// Каркас продуктових tiers (Free / Plus / Pro) — див. docs/analysis/READINESS_AND_TIERS.md.
// УВАГА: поки білінг не підключено — повний доступ (`pro`), щоб НЕ ламати наявні фічі.
// Щоб увімкнути монетизацію: підключити RevenueCat/StoreKit, у setTier() віддавати
// реальний рівень із підписки, і обгорнути платні точки у requireFeature().

import { Events, track } from './analytics';

export type Tier = 'free' | 'plus' | 'pro';

let _tier: Tier = 'pro';
export function setTier(t: Tier): void { _tier = t; }
export function currentTier(): Tier { return _tier; }

export type Feature =
  | 'personalGoals' | 'macros' | 'preventionFull' | 'allInsights'
  | 'unlimitedGroups' | 'autoBackup' | 'themes'
  | 'doctorReport' | 'advancedAnalytics' | 'profileSync' | 'aiAdvisor';

/** Мінімальний tier для фічі (відповідає матриці у READINESS_AND_TIERS.md) */
export const MIN_TIER: Record<Feature, Tier> = {
  personalGoals:    'plus',
  macros:           'plus',
  preventionFull:   'plus',
  allInsights:      'plus',
  unlimitedGroups:  'plus',
  autoBackup:       'plus',
  themes:           'plus',
  doctorReport:     'pro',
  advancedAnalytics:'pro',
  profileSync:      'pro',
  aiAdvisor:        'pro',
};

const RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2 };

export function hasFeature(f: Feature): boolean {
  return RANK[currentTier()] >= RANK[MIN_TIER[f]];
}

/**
 * Перевірка перед платною дією. Якщо немає доступу — фіксує upsell-подію
 * (для paywall/метрик) і повертає false.
 */
export function requireFeature(f: Feature): boolean {
  if (hasFeature(f)) return true;
  track(Events.UpsellShown, { feature: f, requiredTier: MIN_TIER[f] });
  return false;
}
