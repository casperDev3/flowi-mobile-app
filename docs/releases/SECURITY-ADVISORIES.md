# Mobile dependency review — S1, 2026-10-09

Baseline: Expo 54.0.37 / React Native 0.81.5; audit: 1 critical, 47 high, 5 moderate nodes. Ancestors amplify three root high/critical advisories across Expo/Metro/Jest; counts are not independent exploits.

| Package | Scope and decision |
|---|---|
| shell-quote | Expo/launch-editor toolchain; upgrade to 1.12.0 closes [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). Critical count becomes zero. |
| brace-expansion 1.x | Patch existing override from 1.1.18 to 1.1.21; closes recursion/quadratic DoS advisories. |
| source-map-js | Override 1.2.2 closes indexed-source-map DoS. |
| braces 3.0.3 | Metro/Jest glob parsing, not application runtime. No patched upstream version at review. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Trusted checkout and glob config only; untrusted PR jobs get no production secrets. |
| node-forge 1.4.0 | Expo CLI / code-signing certificate tooling, not bundled app runtime. No patched upstream version at review. [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Do not accept external certificate/signature inputs as trusted verification. |
| sprintf-js | Moderate toolchain formatting DoS; no patched upstream version. Track separately; no downgrade of Jest/Expo to conceal it. |

After compatible overrides: 0 critical, 45 high, 5 moderate nodes; direct high roots are braces and node-forge. These are **reviewed toolchain risks**, not fixed packages. The candidate gate accepts only these exact two advisory URLs until 2026-11-09, rejects new high/critical findings and requires both production bundles' source maps to exclude braces/node-forge/shell-quote. A missing audit service response or missing source maps fails the gate.

## Migration checklist

- Keep Expo/RN versions compatible; no automatic `npm audit fix --force` downgrade.
- Update package.json and lockfile together; verify fresh `npm ci`.
- Run all tests/types/lint and export iOS + Android production bundles, with source-map reachability evidence.
- Generate native projects from tracked app config/modules/targets in a clean checkout, never overwrite the developer's native folders.
- Compile iOS simulator Release and Android Release; inspect native-module/entitlement differences.
- Verify physical devices: auth, offline sync, push delivery, HealthKit/Android health, media and widget.
- Signed store builds and device smoke are separate acceptance gates; JS export does not satisfy them.

## Reproduced test failure

The apparent finance-feed/tablet failure was order-dependent: task-card.test mounted a running ElapsedClock and never unmounted it. The shared interval fired after Jest tore down that file, causing an import-after-teardown followed by React's window.dispatchEvent error in the next suite. Fix: track every renderer in task-card.test and unmount in afterEach inside act. Assertions remain unchanged; no forceExit, skipped test or mocked-out clock was introduced. Full suite after fix: 214 suites / 2876 tests passed.

Clean Linux CI also exposed stale relative `file:` overrides in the npm lockfile (vendor paths nested under query-string/metro). Both shims are now root file dependencies referenced by `$dependency` overrides, so npm ci resolves checked-in vendor directories consistently. The date regression now runs its UTC+3 fixture in a child process with an explicit timezone instead of depending on the runner timezone.

Session client tests additionally cover a delayed old refresh after a new login and a WS refresh racing password change. Temporary refresh 503 now retains tokens (the old audit reproduction is converted into an assertion of the corrected behavior); no auth assertions were removed.
