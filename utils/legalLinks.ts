import { Platform } from 'react-native';

/**
 * Публічні правові сторінки Flowi (flowi-web-app: app/privacy, app/terms,
 * app/contact, app/delete-account). Англійська версія — `?lang=en`.
 */
export const LEGAL_ORIGIN = 'https://app.flowi.com.ua';
export const SUPPORT_EMAIL = 'dev@imtech.com.ua';
export const APP_STORE_ID = '6838272703';
export const ANDROID_PACKAGE = 'app.flowi.mobile';

export type LegalPageId = 'privacy' | 'terms' | 'contact' | 'delete-account';

export function legalUrl(page: LegalPageId, lang: string): string {
  return `${LEGAL_ORIGIN}/${page}${lang === 'en' ? '?lang=en' : ''}`;
}

export function legalLinks(lang: string): { page: LegalPageId; label: string }[] {
  const en = lang === 'en';
  return [
    { page: 'privacy', label: en ? 'Privacy' : 'Приватність' },
    { page: 'terms', label: en ? 'Terms' : 'Умови' },
    { page: 'delete-account', label: en ? 'Account deletion' : 'Видалення акаунта' },
    { page: 'contact', label: en ? 'Contact' : 'Контакти' },
  ];
}

export function feedbackMailUrl(lang: string, appVersion?: string): string {
  const subject = encodeURIComponent(`${lang === 'en' ? 'Flowi feedback' : 'Відгук про Flowi'}${appVersion ? ` (${appVersion})` : ''}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
}

/** Сторінка відгуку в магазині застосунків поточної платформи. */
export function rateAppUrl(os: string = Platform.OS): string {
  return os === 'android'
    ? `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
    : `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
}

/**
 * Донати розробнику (Donatello/PayPal) — лише поза магазинами застосунків.
 * App Store 3.1.1 і правила Google Play вимагають для «чайових» розробнику
 * вбудованих покупок; зовнішні посилання дозволені тільки благодійним організаціям.
 */
export function donationsEnabled(os: string = Platform.OS): boolean {
  return os === 'web';
}
