/**
 * Застосунок Flowi для Apple Watch (watchOS 10+, SwiftUI).
 *
 * Без App Group і HealthKit: дані приходять з iPhone через WatchConnectivity
 * (applicationContext / sendMessage) або з сервера (GET /api/watch/today/),
 * дії йдуть тим самим шляхом назад (docs/specs/watch-lockscreen-v1.md §6, §9).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'watch',
  name: 'FlowiWatch',
  displayName: 'Flowi',
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'WatchConnectivity'],
  icon: '../../assets/images/icon.png',
  colors: {
    $accent: { light: '#7C3AED', dark: '#A78BFA' },
  },
});
