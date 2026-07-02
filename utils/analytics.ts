// Абстракція аналітики подій.
// Зараз: dev-консоль / no-op у проді. Підключити провайдера (Amplitude/PostHog/тощо)
// у track()/screen() — решта коду не зміниться.

type Props = Record<string, unknown>;

export function track(event: string, props?: Props): void {
  if (__DEV__) console.log('[analytics]', event, props ?? {});
  // provider.track(event, props)
}

/** Перегляд екрана */
export function screen(name: string, props?: Props): void {
  track('screen_view', { screen: name, ...props });
}

// Готові події для конверсійних гачків (див. analysis/READINESS_AND_TIERS.md)
export const Events = {
  HealthEntryAdded: 'health_entry_added',
  PreventionReminderSet: 'prevention_reminder_set',
  ReportExported: 'report_exported',
  SharedGroupCreated: 'shared_group_created',
  SharedSecretShared: 'shared_secret_shared',
  UpsellShown: 'upsell_shown',
} as const;
