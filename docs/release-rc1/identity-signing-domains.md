# rc1 · Identity, signing, versions, domains, verified links (S3-01 + S3-02)

Status: code changes are done on `release/rc1` and not committed. The owner still has to do the steps in
`scripts/owner-setup-wizard.sh`.
Decisions were locked on 2026-11-22.

## 1. Identity

| What | Was | Now |
|---|---|---|
| iOS bundle id | `com.casper3.f-tracking-app` | `app.flowi.mobile` |
| Android package / namespace | `com.casper3.ftrackingapp` | `app.flowi.mobile` |
| App Group | `group.com.casper3.f-tracking-app` | `group.app.flowi.mobile` |
| Widget | `….widget` | `app.flowi.mobile.widget` |
| Watch | `….watchkitapp` | `app.flowi.mobile.watchkitapp` (`WKCompanionAppBundleIdentifier` = `app.flowi.mobile`) |
| Darwin notification (widget → app) | `com.casper3.f-tracking-app.pendingActions` | `app.flowi.mobile.pendingActions` |
| Watch keychain service | `com.casper3.f-tracking-app.watch` | `app.flowi.mobile.watch` |
| URL scheme | `ftrackingapp://` | `flowi://` is primary; `ftrackingapp://` stays as an alias (both are registered) |
| Apple Team | `D28SUT8PH4` (old account) | `FLOWI_APPLE_TEAM_ID` env → `app.config.js`; it is not in `app.json` |
| Version | 1.3.0 / build 1 | **1.4.0** / build `YYMMDDn` (currently `2611221`) |

The source of truth is `app.json`, plus a thin `app.config.js` layer that adds the Team ID and
`google-services.json` from env or `~/.flowi-signing`. `/ios` and `/android` are in `.gitignore`. The local copies
were patched to the same values (pbxproj, Info.plist, entitlements, AndroidManifest,
`build.gradle`, Kotlin `MainActivity`/`MainApplication` → `android/app/src/main/java/app/flowi/mobile/`).
`expo prebuild` rebuilds them from `app.json` and the plugins with the same result. This was checked on
2026-11-22 with `expo prebuild --platform android` in an isolated copy:
- package, namespace and `versionCode` are correct
- the schemes `flowi` and `ftrackingapp` are both registered
- the intent filter is correct
- the Kotlin files are in `app/flowi/mobile`
- `:app:bundleRelease --dry-run` without the properties fails with "Flowi release signing: …"
- `:app:assembleDebug --dry-run` passes

`expo config --type introspect` shows the correct iOS entitlements and CFBundleURLSchemes.

**Not renamed on purpose:** the Kotlin namespace of the local module `modules/flowi-android`
(`com.casper3.flowi.surfaces`). It is a library namespace, not the application id. The code uses
`context.packageName` and never hardcodes the package. Moving it would only cause churn in widget files that
other agents are editing.

**Emitters stay on `ftrackingapp:///…`**: the widgets (Swift/Kotlin), `GCAL_RETURN_URL`, `APP_SCHEME` for QR codes
and training pushes. The alias is registered and every JS parser accepts it. Moving them to `flowi://` is a
separate step, and the parsers must learn `flowi:` first (see §8).

## 2. Signing

### Android (local Gradle, no EAS)
- `plugins/withAndroidReleaseSigning.js` survives `prebuild`. It adds `signingConfigs.release` to `app/build.gradle`
  and points `buildTypes.release` at it.
- It reads values from Gradle properties, usually `~/.gradle/gradle.properties`
  (template: `scripts/android-signing.gradle.properties.example`):
  `FLOWI_UPLOAD_STORE_FILE`, `FLOWI_UPLOAD_STORE_PASSWORD`, `FLOWI_UPLOAD_KEY_ALIAS`, `FLOWI_UPLOAD_KEY_PASSWORD`.
- The keystore is `~/.flowi-signing/flowi-upload.jks` (PKCS12, RSA 4096). The wizard generates it with `keytool` and
  never overwrites an existing one.
- **Release without the values fails loudly.** `assemble|bundle|install|package|sign…Release` throws
  `GradleException`. Debug builds do not need the values.
- Users get the app signed by **Play App Signing**. Our key is only the upload key.

### iOS (Xcode)
- Signing is "Automatically manage signing" with the new team. The wizard writes the Team ID into the local pbxproj
  (all 3 targets). For a fresh prebuild, use `export FLOWI_APPLE_TEAM_ID=…`.
- Capabilities:
  - `app.flowi.mobile`: App Groups, Associated Domains, HealthKit (+ Background Delivery), Push.
  - `.widget`: App Groups, HealthKit.
  - `.watchkitapp`: no capabilities.

## 3. Build number

```bash
npm run build-number            # today; n=1, or +1 if a build already happened today (max 9)
npm run build-number -- --n 2   # explicit n
npm run build-number -- --version 1.4.1   # also changes the marketing version
npm run build-number:check      # check that every location agrees (exit 1 on mismatch)
```

The script patches these locations:
- `app.json`: `ios.buildNumber` (string) and `android.versionCode` (int)
- `build.gradle`: `versionCode`, and `versionName` when `--version` is given
- pbxproj: `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` for all 6 configurations (app, widget, watch)
- `Info.plist`

Missing native directories are skipped. A Jest test (`__tests__/release-identity.test.ts`) runs `--check`.

## 4. Domains: old → new

| Purpose | Old | New | Behaviour of the old host after the cutover |
|---|---|---|---|
| Django API (REST) | `https://api.flowi.casperdev.site/api/…` | `https://api.flowi.com.ua/api/…` | **proxied** to Django (N-1 clients) |
| WebSocket | `wss://api.flowi.casperdev.site/ws/…` | `wss://api.flowi.com.ua/ws/…` | **proxied** |
| Django admin, static | `…casperdev.site/admin/`, `/static/` | `api.flowi.com.ua/admin/`, `/static/` | **proxied** |
| Web cabinet | `https://api.flowi.casperdev.site/app/…`, `https://flowi.casperdev.site/…` | `https://app.flowi.com.ua/app/…` | **301** → `https://app.flowi.com.ua{uri}` |
| Invites | `https://api.flowi.casperdev.site/invite?…` | `https://app.flowi.com.ua/invite?…` | **301** (query string preserved) |
| Login / legal | `…/login`, `/privacy`, `/terms` | `app.flowi.com.ua/…` | **301** |
| AASA | — (not served) | `https://app.flowi.com.ua/.well-known/apple-app-site-association` | the old host proxies `/.well-known/*` to Next without a redirect |
| assetlinks | — | `https://app.flowi.com.ua/.well-known/assetlinks.json` | same |
| Health | `…casperdev.site/api/health/`, `/healthz` | `api.flowi.com.ua/api/health/`, `app.flowi.com.ua/healthz` | API health is proxied, web `/healthz` gets a 301 |
| Server `WEB_APP_URL` (links in emails/push) | `https://api.flowi.casperdev.site` | `https://app.flowi.com.ua` | code default changed; prod env is set by the owner |
| Mobile default API | `https://api.flowi.casperdev.site` | `https://api.flowi.com.ua` (`EXPO_PUBLIC_FLOWI_API_ORIGIN` overrides) | — |
| Web default API | `https://api.flowi.casperdev.site/api` | `https://api.flowi.com.ua/api` (`NEXT_PUBLIC_API_BASE` overrides) | — |

The front end is **Caddy** on VPS 159.89.99.91: `flowi-server-app/ops/caddy/Caddyfile.production`
(checked with `caddy adapt` 2.8). The generic self-host `Caddyfile` ({$DOMAIN}) is unchanged.
`flowi-web-app/ops/nginx.conf` is only a fallback for `app.flowi.com.ua`.

Server (`settings.py`), with the old hosts kept:
- `ALLOWED_HOSTS` default += `api.flowi.com.ua`, `app.flowi.com.ua`
- `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS` += `https://api.flowi.com.ua`, `https://app.flowi.com.ua`
- The Vercel origins stay.

**Prod env on the VPS takes precedence.** If `ALLOWED_HOSTS` is set in `/var/www/flowi-api/.env`, add the new hosts
there by hand. The wizard prepares the snippet `~/.flowi-signing/vps/api.env.snippet`.

## 5. Verified links

- iOS `associatedDomains`: `applinks:app.flowi.com.ua`, `webcredentials:app.flowi.com.ua`.
- Android `intentFilters` (`autoVerify`): host `app.flowi.com.ua`, `pathPrefix` `/invite` and `/app/`.
  The old host was removed from the filter: a host that cannot be verified breaks verification of the whole filter.
- The AASA and assetlinks content is generated by web route handlers `app/.well-known/**` from env
  (`lib/well-known.ts`, tests in `lib/well-known.test.mjs`):
  - `FLOWI_APPLE_TEAM_ID` → `appIDs: ["<TEAM>.app.flowi.mobile"]`.
  - Components are listed **exclude first**: `/login*`, `/legal*`, `/api/*`, `/.well-known/*`. Then include: `/invite*`, `/app/*`.
  - `FLOWI_ANDROID_SHA256_CERTS` holds the Play App Signing SHA-256 and the upload SHA-256, separated by commas.
    Values are normalized to `AA:BB:…` and deduplicated.
  - When env is missing or a fingerprint is broken, the route returns **404 `no-store`**, never placeholder JSON.
  - On success the route returns `200 application/json`, `Cache-Control: public, max-age=3600`, with no redirect.

## 6. Owner steps (wizard)

```bash
cd flowi-mobile-app && scripts/owner-setup-wizard.sh
```

The wizard has 16 stages:

1. `~/.flowi-signing` (0700)
2. Apple Team ID (+ local pbxproj)
3. App Group
4. 3 App IDs + capabilities
5. APNs `.p8`
6. App Store Connect record + store URL
7. Upload keystore (`keytool`) + backup
8. `~/.gradle/gradle.properties`
9. Firebase + `google-services.json`
10. FCM service account
11. DNS
12. SMTP smarthost
13. First AAB → Play Console → Play App Signing SHA-256
14. Env snippets for the VPS + `scp` + Caddy
15. `.well-known` curl checks (status, content-type, redirect without `-L`)
16. Google Digital Asset Links API + Apple CDN

Values are stored in `~/.flowi-signing/owner.env` (0600). Snippets for the VPS go to `~/.flowi-signing/vps/`.

### DNS for flowi.com.ua
| Type | Name | Value |
|---|---|---|
| A | `api` | `159.89.99.91` |
| A | `app` | `159.89.99.91` |
| TXT | `@` | `v=spf1 a:api.flowi.com.ua include:<SPF domain of the smarthost> -all` |
| TXT | `<selector>._domainkey` | `v=DKIM1; k=rsa; p=<public key from the smarthost/OpenDKIM>` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@flowi.com.ua; adkim=s; aspf=s` (first 2 weeks may be `p=none`) |

## 7. Cutover order

1. DNS A records → wait until `dig +short A api.flowi.com.ua` returns the VPS IP.
2. Server deploy (new `ALLOWED_HOSTS`/CORS/CSRF are already in code). Add the new hosts to the VPS `.env`.
3. Caddy. Today ports 80/443 on the VPS are held by **nginx**; the API deploy also ran
   `scripts/configure_meeting_uploads.py`, which edits nginx.
   - Check the upstreams: `systemctl cat flowi-api` (Daphne port) and `nginx -T | grep proxy_pass`.
     The Caddyfile defaults are `127.0.0.1:8000` and `127.0.0.1:3000`. Override them with
     `FLOWI_API_UPSTREAM` / `FLOWI_WEB_UPSTREAM` in Caddy's env.
   - `cp ops/caddy/Caddyfile.production /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile`.
   - Switch over with `systemctl disable --now nginx && systemctl enable --now caddy`. Certificates for all 4 hosts
     are issued automatically.
   - GlitchTip on `:8443` is a separate nginx vhost (`ops/glitchtip-nginx.conf`). Either move it to Caddy
     (`api.flowi.casperdev.site:8443 { reverse_proxy … }`), or keep nginx listening **only** on 8443 by removing
     the 80/443 server blocks from it.
   - The deploy workflow (`main.yml`) now runs `configure_meeting_uploads.py` only while nginx is active. Under Caddy
     the body limit is `request_body max_size 64MB`.
4. Web deploy to the VPS (`self-host.yml` builds with `NEXT_PUBLIC_API_BASE=https://api.flowi.com.ua/api` and checks
   `https://app.flowi.com.ua/healthz`). Add `/etc/flowi/web.env` from `web.env.snippet`.
5. `WEB_APP_URL=https://app.flowi.com.ua`, `PUBLIC_API_URL`/`PUBLIC_WS_URL` → api.flowi.com.ua (VPS `.env`), restart.
6. Wizard stages 15–16: check `.well-known`.
7. Mobile 1.4.0 → TestFlight / Internal testing → stores.
8. **Only after** 1.4.0 is available in both stores: `MIN_MOBILE_VERSION=1.4.0` (VPS env). Do not change it now.

Note: the server deploy workflow (`.github/workflows/main.yml`) checks health on the old host
`api.flowi.casperdev.site`. That host keeps working (proxy), so the check is unaffected.

## 8. Verification matrix

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Identity in app.json | `npx jest __tests__/release-identity.test.ts` | 7/7 |
| 2 | Build number in sync | `npm run build-number:check` | `OK` |
| 3 | Plists are valid | `plutil -lint ios/Flowi/Info.plist ios/Flowi/Flowi.entitlements ios/Flowi.xcodeproj/project.pbxproj` | OK |
| 4 | Android release without a key | `cd android && ./gradlew bundleRelease` without the properties | fails with "Flowi release signing: …" |
| 5 | Android release with a key | same, with properties | AAB; `keytool -printcert -jarfile app-release.aab` shows the upload SHA-256 |
| 6 | AASA | `curl -sS -o /dev/null -w '%{http_code} %{content_type} %{redirect_url}' https://app.flowi.com.ua/.well-known/apple-app-site-association` | `200 application/json` and no redirect |
| 7 | assetlinks | same for `/.well-known/assetlinks.json` | `200 application/json` |
| 8 | Google DAL | `https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://app.flowi.com.ua&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=app.flowi.mobile&target.android_app.certificate.sha256_fingerprint=<SHA>` | `"linked": true` |
| 9 | Android device | `adb shell pm get-app-links app.flowi.mobile` | `app.flowi.com.ua: verified` |
| 10 | iOS device | Settings → Developer → Universal Links → Diagnostics, `https://app.flowi.com.ua/invite?…` | opens the app |
| 11 | Path exclusions | tap `https://app.flowi.com.ua/login` from Notes | opens Safari, not the app |
| 12 | Old API (N-1) | `curl https://api.flowi.casperdev.site/api/health/` | 200 JSON |
| 13 | Old web | `curl -sI https://api.flowi.casperdev.site/invite?x=1` | `301 Location: https://app.flowi.com.ua/invite?x=1` |
| 14 | New API host | `core.test_rc1_hosts` + `curl https://api.flowi.com.ua/api/health/` | OK / 200 |
| 15 | CORS from the new cabinet | login at `https://app.flowi.com.ua/login` | no CORS errors |
| 16 | Scheme alias | `xcrun simctl openurl booted 'flowi:///notes?capture=1'` and `'ftrackingapp:///notes?capture=1'` | both open the app (see the open item for the JS parser of `flowi:`) |
| 17 | Widget ↔ app (App Group) | add a widget, change data in the app | the widget updates (the group matches on both sides) |

## 9. Open items (outside this scope)

- **The `.well-known` routes were not checked in a running Next.** `next dev` stopped on the first request with an
  advisory notice about a Next.js vulnerability. Builders are covered by unit tests and `tsc` passes.
  Rows 6–7 of the matrix gate the release: check them on staging or prod before submitting to the stores.
- **The defaults in code now point at `*.flowi.com.ua`.** Until cutover steps 1–3 are done, no web or mobile build
  from this branch can reach the API. Build only after DNS and Caddy are in place, or set
  `NEXT_PUBLIC_API_BASE` / `EXPO_PUBLIC_FLOWI_API_ORIGIN` explicitly.

- JS parsers that know only `ftrackingapp:` need to accept `flowi:` as well. These belong to the deep-links agent:
  - `store/invite-link.ts`
  - `hooks/use-incoming-invite-links.ts`
  - `components/menu/useMenuEditor.ts`
  - `store/note-capture.ts`
  - `utils/containers.ts` (`APP_SCHEME`)
  - `utils/pushLink.ts`
  - `app/+native-intent.tsx`
- Origins of invites from the old host (`ws=https://api.flowi.casperdev.site`) are compared with
  `DEFAULT_WORKSPACE_ORIGIN` in `app/invite.tsx`. `store/api-config.ts` exports `canonicalCloudOrigin()` /
  `LEGACY_CLOUD_ORIGINS`, which should be applied in `normalizeWorkspaceOrigin` (`store/workspace.ts`).
  It is the same server and the server checks `workspace_id`.
- QR stickers for containers (`https://…/c/<ws>/<slug>`) are **not** in the verified paths (the decision covers only
  `/invite*`, `/app/*`). On the new host they open the web page. To make them open the app, add `/c/*` to
  `APP_LINK_INCLUDE` and to the intent filter.
- `e2e-native/**` and `.maestro/**` now use `appId: app.flowi.mobile`. The old build on the simulator will not match:
  build 1.4.0.
