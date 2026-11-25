import { langFromDeviceLanguages, resolveInitialLang } from '@/utils/deviceLanguage';

describe('langFromDeviceLanguages', () => {
  it('uses the first device language', () => {
    expect(langFromDeviceLanguages(['en', 'uk'])).toBe('en');
    expect(langFromDeviceLanguages(['uk', 'en'])).toBe('uk');
  });

  it('keeps Ukrainian for ru/be devices and English for others', () => {
    expect(langFromDeviceLanguages(['ru'])).toBe('uk');
    expect(langFromDeviceLanguages(['BE'])).toBe('uk');
    expect(langFromDeviceLanguages(['de'])).toBe('en');
  });

  it('falls back to Ukrainian without device info', () => {
    expect(langFromDeviceLanguages([])).toBe('uk');
    expect(langFromDeviceLanguages([null, ''])).toBe('uk');
  });
});

describe('resolveInitialLang', () => {
  it('respects an explicit saved choice', () => {
    expect(resolveInitialLang({ saved: 'uk', hasExistingInstall: false, deviceLanguageCodes: ['en'] })).toBe('uk');
    expect(resolveInitialLang({ saved: 'en', hasExistingInstall: true, deviceLanguageCodes: ['uk'] })).toBe('en');
  });

  it('keeps existing installs on Ukrainian', () => {
    expect(resolveInitialLang({ saved: null, hasExistingInstall: true, deviceLanguageCodes: ['en'] })).toBe('uk');
  });

  it('follows the device on a fresh install', () => {
    expect(resolveInitialLang({ saved: null, hasExistingInstall: false, deviceLanguageCodes: ['en-US'.slice(0, 2)] })).toBe('en');
    expect(resolveInitialLang({ saved: 'fr', hasExistingInstall: false, deviceLanguageCodes: ['uk'] })).toBe('uk');
  });
});
