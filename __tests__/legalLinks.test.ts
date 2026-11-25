import { feedbackMailUrl, legalLinks, legalUrl, rateAppUrl } from '@/utils/legalLinks';

describe('legalLinks', () => {
  it('points legal pages at the production web app, English via ?lang=en', () => {
    expect(legalUrl('privacy', 'uk')).toBe('https://app.flowi.com.ua/privacy');
    expect(legalUrl('privacy', 'en')).toBe('https://app.flowi.com.ua/privacy?lang=en');
    expect(legalUrl('delete-account', 'en')).toBe('https://app.flowi.com.ua/delete-account?lang=en');
  });

  it('lists privacy, terms, account deletion and contact', () => {
    expect(legalLinks('en').map(l => l.page)).toEqual(['privacy', 'terms', 'delete-account', 'contact']);
    expect(legalLinks('uk')[0].label).toBe('Приватність');
  });

  it('builds support mail and store review links', () => {
    expect(feedbackMailUrl('en')).toBe('mailto:dev@imtech.com.ua?subject=Flowi%20feedback');
    expect(rateAppUrl('ios')).toBe('https://apps.apple.com/app/id6838272703?action=write-review');
    expect(rateAppUrl('android')).toBe('https://play.google.com/store/apps/details?id=app.flowi.mobile');
  });
});
