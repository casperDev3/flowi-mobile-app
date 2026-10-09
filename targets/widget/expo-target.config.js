/**
 * iOS-віджет головного екрана Flowi (WidgetKit + AppIntents).
 *
 * Дані — знімок, який застосунок пише в App Group (store/widget-sync.ts);
 * кроки віджет додатково читає напряму з HealthKit.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'FlowiWidget',
  displayName: 'Flowi',
  bundleIdentifier: '.widget',
  // AppIntentConfiguration (вибір дії малого віджета) і containerBackground — iOS 17+.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'HealthKit'],
  colors: {
    $accent: { light: '#7C3AED', dark: '#A78BFA' },
    $widgetBackground: { light: '#FFFFFF', dark: '#14121E' },
  },
  entitlements: {
    'com.apple.security.application-groups':
      (config.ios && config.ios.entitlements && config.ios.entitlements['com.apple.security.application-groups'])
      || ['group.com.casper3.f-tracking-app'],
    'com.apple.developer.healthkit': true,
  },
});
