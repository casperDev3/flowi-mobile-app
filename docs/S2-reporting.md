# S2 native reporting

Build-time environment (the concrete values for this workspace are in ignored `.env.local`):

```dotenv
EXPO_PUBLIC_SENTRY_DSN=https://PUBLIC_NATIVE_KEY@api.flowi.casperdev.site/api/operations/reporting/3
EXPO_PUBLIC_FLOWI_RELEASE=EXACT_40_CHARACTER_GIT_SHA
```

Use the Flowi gateway DSN above. Direct native collector ingestion is restricted to the server: the gateway removes native SDK user/device identifiers, breadcrumbs, request data, contexts and arbitrary text before GlitchTip stores the event. It accepts bounded gzip envelopes and leaves transient failures retryable by the SDK.

For a controlled crash, use an isolated development simulator and start Metro with `EXPO_PUBLIC_NATIVE_CRASH_PROBE=1`. The native-only probe crashes once per release, 20 seconds after initialization. Reopen the app to upload its cached native crash; verify the event, release tag and Telegram alert before ending the drill. Stop that Metro process after the drill. The probe is disabled outside development and when the opt-in variable is absent.

Verified on 2026-10-10: iOS 18.6 Simulator, EXC_BAD_ACCESS, event d02dad14345b47159ca598f1cb670376, Telegram Flowi topic message 140. Typecheck and probe lint passed. iOS 26.3 compiled and captured locally but had simulator relaunch failures. Physical-device and store rollout were not performed; devices require a newly built application to receive this instrumentation.
