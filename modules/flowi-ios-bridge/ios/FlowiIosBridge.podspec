# Локальний Expo-модуль (autolinking з modules/), docs/specs/watch-lockscreen-v1.md §7.1.
Pod::Spec.new do |s|
  s.name           = 'FlowiIosBridge'
  s.version        = '1.0.0'
  s.summary        = 'Flowi iOS bridge: WatchConnectivity, Live Activity, pending device actions'
  s.description    = 'Native bridge for the Flowi app (Apple Watch link, timer Live Activity, App Group action queue).'
  s.license        = 'UNLICENSED'
  s.author         = 'Flowi'
  s.homepage       = 'https://api.flowi.casperdev.site'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # ActivityKit є лише з iOS 16.1 — слабке лінкування, щоб застосунок
  # запускався на 15.x (виклики там закриті #available).
  s.frameworks = 'WatchConnectivity'
  s.weak_frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
