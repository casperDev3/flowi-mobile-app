# rc1 — verification of flowi-server-app (2026-11-22)

Branch `release/rc1`, nothing committed.

## Suite

| Step | Command (in `flowi-server-app/`) | Result |
|---|---|---|
| System check | `.venv/bin/python manage.py check` | 0 issues |
| Migrations | `.venv/bin/python manage.py makemigrations --check --dry-run` | No changes (new: `core.0031`, `analytics.0001`) |
| Deps | `.venv/bin/pip check` | OK |
| Full tests | `.venv/bin/python manage.py test --parallel 4` | 897 tests OK, 1 skipped |
| rc1 modules serial | `manage.py test analytics core.notifications.test_native_push core.test_rc1_* core.test_invites_pending core.test_training` | 146 OK |

The `core.test_invites_pending...test_email_sent_flag_when_smtp_works` failure reported by the push agent passes now; it was a mid-flight state of the email agent's mock change.

## Fixes made during verification

- `integrations/gcal.py`: `flowi://` added to the Google Calendar `return_to` allowlist and `AppRedirect.allowed_schemes`, next to `ftrackingapp://`, per the decision to parse both schemes. Test: `integrations.test_gcal...test_rc1_flowi_scheme_return_to_is_accepted_and_redirected`.
- `noreply@flowi.app` changed to `noreply@flowi.com.ua` in `.env.example`, `docker-compose.selfhost.yml` (x2) and the VAPID subject fallback in `core/notifications/channels/webpush.py`.
- README production section: new domains, with the old host kept as the N-1 proxy.

## Remaining legacy references (justified)

- `api.flowi.casperdev.site` / `flowi.casperdev.site` in settings (ALLOWED_HOSTS/CSRF/CORS), `ops/caddy/Caddyfile.production`, and `core/test_cors.py` / `test_rc1_hosts.py`: these are the intended N-1 proxy and alias.
- `.github/workflows/main.yml`: the health check and `PUBLIC_WS_URL` fallback use the old host. It works before and after the cutover, because Caddy proxies `/api` and `/ws`. Switch to `api.flowi.com.ua` once DNS is live (owner env change).
- `scripts/check_*_deployment.py`, `scripts/configure_meeting_uploads.py`, `ops/glitchtip-*`, `ops/provision_glitchtip.py`, `ops/environment.example` (`FLOWI_INTEGRATIONS_PUBLIC_BASE`), and `docs/google-calendar-setup.md`: these are old-host ops and docs. The Google OAuth redirect URI is registered on the old host and keeps working through the proxy. Moving it is an owner step: add the new redirect URI in the Google console first, then change the env.
- `ghcr.io/casperdev3/...` is the GitHub account or image namespace, not a domain.
- `ftrackingapp://` in `core/notifications/registry.py`, `core/expo_push.py` and the tests is the alias scheme that both old and new apps parse.
- `com.casper3.ftrackingapp` in `core/notifications/test_native_push.py` is deliberate: the test checks that a foreign bundle ID is rejected.
- `docs/releases/*`, `docs/specs/*` and `PLAN-integrations.md` are historical records.

## Not fixed (not rc1 regressions, owner or server decision)

- `settings.py` `conn_max_age=600` with Postgres under Daphne leaks connections (load finding F1, see `load.md`). Production runs SQLite today, so this matters only for the Postgres move.
- `check --deploy` warnings are from the local `DEBUG=True` env only.
