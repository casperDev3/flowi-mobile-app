# S1 release candidate — 2026-10-09

## Scope and baseline

Three independent repositories; no unrelated work is part of this release.
Baseline before S1: server `27301011969ffd4bc9e23cf772726407b3fba089`, web `4f0ce8497c77e2f58c2ba9de6d49dc101835c3ec`, mobile `43e8ff7`.
The server's untracked `docs/changes/2026-09-26-menu-invitations.md` and `docs/changes/2026-09-27-weekly-menu-production.md` remain outside scope.

Scope: account-wide access/refresh revocation and live WS revalidation; logout-all clients; compatible dependency fixes; reproducible gates and manifests; privacy/terms/contact draft with confirmed operator only.

## Clean reproduction

1. Clone the repository into an empty directory, checkout the exact candidate SHA from the cross-repository manifest. Do not copy `.env`, `node_modules`, local databases or generated native directories.
2. Server: Python 3.13+, `pip install -r requirements.lock.txt`, provide a new non-production SECRET_KEY and temporary DATABASE_URL and `STATIC_ROOT=/tmp/flowi-ci-static` (generated assets must stay outside the checkout). Run `manage.py check`, `makemigrations --check --dry-run`, `test --noinput`, `migrate --noinput`, `collectstatic --noinput`.
3. Web: Node 22, `npm ci`, `npm run ci:release`. Core Playwright requires the candidate server, a separate disposable database and explicit FLOWI_E2E_API_PORT / FLOWI_E2E_WEB_PORT. Run the complete default Playwright configuration.
4. Mobile: Node 22, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --ci --runInBand`, `npx expo export --platform ios --platform android --source-maps --output-dir artifacts/export`, `node scripts/audit-gate.mjs`.
5. Native builds use fresh Expo prebuild in an isolated checkout. iOS simulator Release build is not App Store signing or physical-device evidence. Android APK build is not push-delivery or physical-device evidence.
6. Run `python3 scripts/release_manifest.py`. It refuses a dirty checkout and records SHA, app/dependency versions, lockfile hashes and migration hashes. CI uploads this manifest under the candidate SHA. Retain logs alongside it.

## Gates

Server deployment and image publishing depend on Server release gates. Deploy exactly `${{ github.sha }}`, not a moving origin/main. A failing test/schema/build blocks deployment.
Web Vercel buildCommand runs production dependency audit, all unit tests, lint, production build and TypeScript; GitHub runs the same categories from clean checkout.
Mobile quality gates include all tests, types, lint, both release JS bundles, source-map reachability and a time-limited advisory check. Native build workflow supplies separate iOS/Android compilation evidence. Device QA remains a separate gate.

## Migration and rollback

New migration: accounts.0006_userprofile_session_version (additive bigint, existing accounts start at zero). Apply before restarting the new API. Legacy tokens are accepted only while the account remains at version zero. Password change/reset/logout-all increments the version transactionally; old tokens cannot be made current again.

- Record previous deployed SHA, candidate SHA, Python/Node versions and applied migration list before release.
- Take and validate the pre-deploy database backup; retain its path and timestamp with restricted permissions. Existing deploy workflow does this before code replacement.
- On code failure, prefer a forward fix retaining session-version checks. **Do not roll back to a server without revocation checks**, reset session_version, or reverse migration 0006: that would re-enable revoked access tokens.
- Web: restore the prior verified Vercel deployment if necessary; API remains backward compatible. Mobile: keep the installed build; no store rollout is part of this candidate.
- A database restore can lose writes and resurrect sessions. It requires a separately assessed recovery window and invalidation of all restored tokens (rotate signing key / force fresh sessions). Never restore automatically for an application-only failure.
- Verify live API health SHA, Vercel READY deployment SHA/alias, fresh login and negative revocation tests after release.

## Session acceptance matrix

| Operation | Old access | Old refresh | New login / returned pair | Open WS |
|---|---|---|---|---|
| Password change | 401 | 401 | works with new password; returned pair works | 4401 |
| Password reset | 401 | 401 | works with new password | 4401 |
| Logout-all | 401 | 401 | works with unchanged password | 4401 |
| Other account revokes | unaffected | unaffected | unaffected | unaffected |
| User deactivated | 401 | 401 | denied | 4401 |
| Membership removed | REST denies project | account session unchanged | personal access unchanged | 4403 |

REST and refresh check the database version. WS checks before outbound events, on incoming frames and every 15 seconds when idle; on-commit channel notification closes revoked sessions promptly. Failed Redis notification cannot bypass the database checks. Existing web/mobile 4401 handling refreshes once; rejected refresh clears account state through the existing expiry handler.

## Device and legal release checklist (must not be inferred from CI)

- [ ] iOS physical device: auth/change/reset/logout-all, offline sync, HealthKit, media, push delivery, widget.
- [ ] Android physical device: same auth/sync/media flows, native modules, notification permission and real push delivery.
- [ ] Store signing, entitlements and provisioning verified for the actual distribution artifact.
- [ ] Fill all fields in web `lib/legal.ts` and inline `[ПОТРІБНО ...]` policy/terms sections.
- [ ] Product confirms retention/export/deletion and provider map; competent legal reviewer approves applicability. Draft pages are not a legal approval.
