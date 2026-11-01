# Watch + Lock screen + Live Activity + Android surfaces — v1 shared contract

Status: ARCHITECT CONTRACT, 2026-10-18. Six parallel workstreams implement against this file
without talking to each other: `server`, `web`, `mobile_js`, `watch_swift`, `ios_widget`, `android`.
Where this file and code disagree, this file wins. Where this file is silent, match surrounding code.

Hard delivery rules (all workstreams): NO commits, NO pushes, NO deploys, NO EAS builds, never touch the
production account/workspace, only ONE iOS simulator exists (do not create/boot others in parallel;
prefer `tsc`, `jest`, `manage.py test`, `xcodebuild -showBuildSettings`-level checks, or `swiftc -parse`).
Each repo already has unrelated uncommitted changes: never revert, reformat or "clean up" files you do not
own; touch only what this contract assigns to you.

---

## 0. Big picture

```
            WatchConnectivity (preferred, ack ≤3 s)
 Apple Watch ───────────────────────────────▶ iPhone app (JS applier → AsyncStorage → normal sync)
     │  same Action (same UUID) if no ack                       │
     └───────────────▶ POST /api/watch/actions/ ◀── normal sync ┘   (server writes UserItem/ProjectItem)
 GET /api/watch/today/  (server-computed snapshot, same schema the phone pushes via WC)

 Lock-screen widgets / home widget  ◀── App Group snapshot `flowi_widget_snapshot_v1` (extended, §8)
 Live Activity (timer)  ── Stop (LiveActivityIntent, in-app process) ──▶ App Group pending queue ──▶ JS applier
 Android widgets / ongoing timer notification ── Stop ──▶ SharedPreferences pending queue ──▶ JS applier
```

Invariants:
1. Every user intent originating off-app (watch, Live Activity stop, Android notification stop) is a
   **DeviceAction** (§2) with a client-generated UUID `id`. The UUID is the idempotency key AND the seed of
   every record id the action creates. Applying the same action twice, on the phone and/or on the server,
   in any order, converges to one result.
2. The phone applies actions exactly like the user doing it in the app (same storage keys, same record
   shapes, `updateSynced`), so web/other devices get them through the normal sync. The server applies
   them into the SAME entities the sync uses (UserItem / ProjectItem via the existing v2 mutation logic),
   so phone/web receive them through the normal pull.
3. Both paths stamp time fields from the action (`action.at`), never from their own clock, so the two
   results are identical except `updatedAt` LWW stamps, which the existing conflict resolver
   (`resolveConflictSide`, later `updatedAt` wins, tie → server) already converges.
4. Watch session = a separate, revocable server session (`AuthSession`, kind=`watch`), provisioned by the
   logged-in phone; no login UI on the watch.

---

## 1. Identifiers and time

| Thing | Format |
|---|---|
| `action.id` | UUID v4, lowercase, 36 chars (`8-4-4-4-12`) |
| Record id created by an action | exactly `action.id` unless stated otherwise (§3) |
| Derived ids | `wa-<action.id>` (39 chars) for time entries / history events; `<action.id>-next` (41) for recurring next occurrence; `adhoc:<action.id>` (42) for ad-hoc timer |
| `action.at` | ISO-8601 UTC with ms, e.g. `2026-10-18T09:12:33.120Z` (watch/device clock) |
| `action.tz` | IANA zone of the device, e.g. `Europe/Kyiv` |
| `action.day` | device-local `YYYY-MM-DD` at `action.at` |
| Task timer id | `task:<taskId>` (existing `taskTimerId`) |
| Meeting timer id | `meeting:<meetingId>` (existing) |
| Watch install id `watchId` | UUID v4 generated once on the watch, persisted in watch Keychain |
| Meeting occurrence key (snapshot only) | `<meetingId>@<YYYY-MM-DD>` |

All local_ids stay ≤ 64 chars (server limit).

---

## 2. DeviceAction (shared envelope)

```jsonc
{
  "id": "3f0c8f7e-5a2b-4c1d-9e1f-2a6b7c8d9e0f",
  "type": "task_complete",          // see §3
  "at": "2026-10-18T09:12:33.120Z",
  "tz": "Europe/Kyiv",              // required for watch actions; optional for live_activity/android
  "day": "2026-10-18",              // required for watch actions; optional otherwise
  "source": "watch",                // "watch" | "live_activity" | "android_notification"
  "payload": { }                    // per type, §3
}
```

TypeScript (owned by mobile_js, `utils/deviceActions.ts`, imported by android's JS file):

```ts
export type DeviceActionType =
  | 'task_complete' | 'task_create' | 'timer_start' | 'timer_stop'
  | 'expense_create' | 'habit_check' | 'note_create';
export type DeviceActionSource = 'watch' | 'live_activity' | 'android_notification';
export interface DeviceAction {
  id: string; type: DeviceActionType; at: string;
  tz?: string; day?: string; source?: DeviceActionSource;
  payload: Record<string, unknown>;
}
export type ActionStatus = 'applied' | 'duplicate' | 'rejected' | 'retry';
export type ActionRejectReason =
  | 'invalid_payload' | 'unknown_type' | 'not_found' | 'forbidden' | 'review_required'
  | 'task_done' | 'invalid_account' | 'stale' | 'conflict';
export interface ActionResult {
  id: string; status: ActionStatus; reason?: ActionRejectReason;
  record?: { collection: string; local_id: string };
}
```

### 2.1 Result statuses (identical semantics on phone and server)
- `applied` — this call changed data.
- `duplicate` — already applied before (idempotency log hit, or the target state already holds, e.g. task
  already done, timer already running/stopped with our `wa-` entry present). Treated as success.
- `rejected` — permanent; watch drops the action and shows a short error (reason-specific string).
- `retry` — transient; ONLY for `not_found` when `now - action.at < 15 min` (target may have been created
  moments ago on another path and not synced yet). Watch keeps the action and retries with backoff; after
  15 min the same call returns `rejected/not_found`.

### 2.2 Idempotency
- Server: table `WatchActionLog(user, action_id UNIQUE per user, type, status, result JSON, created_at)`.
  A repeated `action_id` returns the stored result with status rewritten to `duplicate` (unless stored
  status was `rejected`/`retry`: `rejected` is returned as-is; `retry` rows are NOT stored, so a retry is
  re-evaluated). Rows pruned after 30 days.
- Phone: AsyncStorage key `device_actions_applied_v1` → `{ id: string; status: ActionStatus; at: number }[]`,
  capped to newest 500 entries and 30 days; `retry` results are not stored.
- Both: even without a log hit, each handler checks the target state (record with id already exists →
  `duplicate`), because the other path may have applied it.

### 2.3 Validation (both sides)
- `id` must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` → else `invalid_payload`.
- `at` must parse; `at > now + 10 min` → `invalid_payload`; `at < now - 7 days` → `stale`.
- `day` (when required) must be `YYYY-MM-DD`; `tz` (when present) must be a valid IANA name, else fall back
  to user tz (server: `NotificationSettings.timezone` via `core.notifications.preferences.user_tzinfo`;
  phone: device tz).
- Unknown `type` → `unknown_type`.

---

## 3. Action types → entity effects

Field names below are the real record shapes (mobile `utils/*.ts`, server stores them verbatim in
`UserItem.data` / `ProjectItem.data`). "Stream" = personal (`UserItem`) unless the record has `projectId`
and the user is a member of that project, in which case `ProjectItem` of that project (same rule the
mobile outbox router uses, `utils/projectStream.ts`). Every written record gets `updatedAt = action.at`
(server also `client_updated_at = action.at`).

### 3.1 `task_complete` — payload `{ "taskId": string }`
Mirror of the app's checkbox "→ done" (`app/(tabs)/index.tsx` toggle / `app/project/[id]/tasks.tsx`
`toggleTask`), but **one-way**: never reopens.
1. Find task (`tasks`, personal or project stream). Missing → `not_found` (retry rule §2.1).
2. `status === 'done'` already → `duplicate`.
3. `reviewRequired === true` or non-empty `resultRequirements` → `rejected/review_required`.
   Project task where my role is `viewer`, or teamwork policy refuses → `rejected/forbidden`.
4. New record = old record with:
   - `status: 'done'`
   - `kanbanColumnId`: personal → `'status-done'`; project → first column (lowest `position`) of that
     project's `task_statuses` with type `done` or `isDone: true` (mobile: `scopedColumnFor(columns, projectId, 'done')`); fallback `'status-done'`.
   - `subtasks`: every subtask `done: true` (`closeSubtasksOnDone`).
   - `history`: append `{ id: 'wa-<action.id>', at: action.at, type: 'done', reopen? }` where `reopen` =
     `{ columnId?: old.kanbanColumnId, openSubtaskIds?: [...] }` exactly as `reopenInfoFor` (omit when empty).
   - `updatedAt: action.at`.
5. If an active timer `task:<taskId>` exists → stop it in the same action exactly as §3.4 with
   entry id `wa-<action.id>` and `endedAt = action.at` (but do NOT move the task to the review column —
   the task is done; only append the time entry + `timer_stop` history event + mirror time entry).
6. Recurring task (`recurrence` present AND `deadline` present): create next occurrence with
   id `<action.id>-next`: copy of the task with `status:'active'`, `kanbanColumnId` = todo column of the
   same scope (personal `'status-active'`), deadline from `nextOccurrenceDeadline(task, day => nextRecurrenceDate(day, rule))`
   (same algorithm as `nextRecurrenceDate` in `app/(tabs)/index.tsx`; server ports it to Python,
   day computed in `action.tz`), `subtasks` all `done:false`, `timeEntries: []`,
   `history: [{ id: 'wa-<action.id>-n', at, type: 'created' }]`, `createdAt: action.at`. If rule says no
   next date → skip. mobile_js moves `nextRecurrenceDate` into `utils/taskRecurrence.ts` (pure, tested) and
   re-imports it in `index.tsx`.
7. Result `record: { collection: 'tasks', local_id: taskId }`.

### 3.2 `task_create` — payload `{ "title": string, "deadline": string }`
- `title`: trimmed, 1..200 chars, else `invalid_payload`.
- `deadline`: ISO computed BY THE WATCH = local noon of `action.day` in `action.tz` (day-only deadline per
  `contracts/task-contract.md`: local noon anchor, NO `deadlineHasTime`). Both sides store it verbatim.
- Record id = `action.id`, personal stream, shape:
```json
{ "id": "<action.id>", "title": "...", "status": "active", "kanbanColumnId": "status-active",
  "priorityLevel": 3, "priority": "medium", "subtasks": [], "createdAt": "<at>",
  "deadline": "<payload.deadline>", "history": [{"id":"wa-<action.id>","at":"<at>","type":"created"}],
  "updatedAt": "<at>" }
```
- Exists already → `duplicate`. Result `record: {collection:'tasks', local_id: action.id}`.

### 3.3 `timer_start` — payload `{ "kind": "task", "taskId": string }` | `{ "kind": "adhoc", "label": string }`
Mirror of `store/timer-context.tsx` `startTaskTimer` / `startAdHocTimer`.
- Task: task missing → `not_found`; task done → `rejected/task_done`; `active_timers` already has
  `task:<taskId>` → `duplicate`. Else write `active_timers/task:<taskId>` =
  `{ id, taskId, label: task.title, startedAt: action.at, projectId?: task.projectId, updatedAt: at }` and
  patch the task: `kanbanColumnId` → in-progress column of its scope (personal `'status-in-progress'`;
  project: column with `sourceStatusId === 'status-in-progress'`, else type `in_progress`; if none → leave
  column unchanged, NO alert), `history` append `{ id:'wa-<action.id>', at, type:'timer_start' }`.
  `active_timers` is a PERSONAL collection (not in PROJECT_COLLECTIONS) — always UserItem.
- Adhoc: `label` trimmed 1..120. Write `active_timers/adhoc:<action.id>` = `{ id, label, startedAt: at, updatedAt: at }`.
  Exists → `duplicate`.
- Result `record: {collection:'active_timers', local_id: <timer id>}`.

### 3.4 `timer_stop` — payload `{ "timerId": string }`
Mirror of `stopTimer` in `store/timer-context.tsx` with deterministic ids:
- Timer missing: if a `time_entries` record `wa-<action.id>` exists → `duplicate`; else `not_found`
  (retry rule §2.1).
- `endedAt = action.at`; `duration = max(0, floor((endedAt - startedAt)/1000))`.
- Delete `active_timers/<timerId>` (tombstone, `operation: 'delete'`).
- If `taskId`: patch task: `kanbanColumnId` → review column of its scope (personal `'status-review'`;
  project: `sourceStatusId === 'status-review'`, else type `review`; none → unchanged) unless task is done;
  `timeEntries` append `{ id:'wa-<action.id>', startedAt, endedAt, duration }`; `history` append
  `{ id:'wa-<action.id>-s', at, type:'timer_stop' }`.
- If `meetingId`: patch meeting `timeEntries` append `{ id:'wa-<action.id>', startedAt, endedAt, duration }`.
- If `duration > 0`: write `time_entries/wa-<action.id>` =
  `{ id, task: timer.label, taskId?, duration, date: endedAt, startedAt, endedAt, projectId? }`
  (projectId = timer.projectId ?? task.projectId ?? meeting.projectId; stream per projectId rule).
- Result `record: {collection:'time_entries', local_id:'wa-<action.id>'}` (or active_timers when duration 0).
- The phone handler MUST reuse the same functions the TimerProvider uses (mobile_js extracts them to
  `store/timer-ops.ts`, see §11.2) so in-app and off-app stops never diverge.

### 3.5 `expense_create` — payload `{ "amount": number, "category": string, "accountId": string, "note"?: string }`
- `amount` finite, > 0, ≤ 1e12; rounded to the account currency decimals (BUILTIN UAH/USD = 2, else
  `finance_currencies[].decimals`, default 2).
- `category` trimmed 1..64 (a category NAME, like the app stores). Unknown name is accepted.
- Account (personal `accounts`) missing or `archived: true` → `rejected/invalid_account`.
- Record `transactions/<action.id>`:
```json
{ "id":"<action.id>", "type":"expense", "category":"Їжа", "amount": 120.5, "note":"",
  "date":"<action.at>", "accountId":"<id>", "currency":"<account.currency>", "updatedAt":"<at>" }
```
- Exists → `duplicate`.

### 3.6 `habit_check` — payload `{ "habitId": string, "done": boolean }`
Set semantics for `action.day` (not a toggle). Habit (`health_habits`, personal) missing → `not_found`.
- `done: true`: if any `log` entry falls on `action.day` (local day in `action.tz`) → `duplicate`; else
  append `action.at` to `log`.
- `done: false`: remove all `log` entries on that day; none present → `duplicate`.
- Result `record: {collection:'health_habits', local_id: habitId}`.

### 3.7 `note_create` — payload `{ "text": string }`
- `text` trimmed 1..2000. "Inbox" = personal notes list (no `projectId`, no tags).
- Record `notes/<action.id>` = `{ id, title: <first line, trimmed, max 80 chars>, body: <text>,
  createdAt: at, updatedAt: at }` (shape of `writeNote` in `utils/notes.ts`; no `tags`, no `pinned`).
- Exists → `duplicate`.

---

## 4. WatchTodaySnapshot v1 (phone-computed AND server-computed, identical schema)

```jsonc
{
  "v": 1,
  "source": "phone",                 // "phone" | "server"
  "generatedAt": "2026-10-18T09:12:40.000Z",
  "day": "2026-10-18", "tz": "Europe/Kyiv",
  "lang": "uk",                      // "uk" | "en" | null (server: NotificationSettings.lang if uk/en, else null)
  "user": { "id": "12", "name": "Ihor" },
  "tasks": [ {                       // ≤ 40, order below
    "id": "…", "title": "…",
    "projectId": null, "projectName": null,
    "deadline": "2026-10-18T09:00:00.000Z",   // stored value or null
    "hasTime": false,                         // deadlineHasTime === true
    "overdue": false, "done": false,
    "canComplete": true,                      // false: reviewRequired/resultRequirements, viewer, or done
    "timerId": null,                          // id of the running timer for this task, if any
    "recurring": false
  } ],
  "taskCounts": { "done": 2, "total": 7 },   // same rule as widget tasks ring (all today tasks, not capped)
  "habits": [ { "id": "…", "title": "Вода", "icon": "drop.fill", "color": "#0EA5E9",
                "doneToday": false, "streak": 4 } ],
  "timers": {
    "active": [ { "id": "task:…", "label": "…", "startedAt": "ISO", "taskId": "…"|null,
                  "meetingId": null, "projectName": null } ],   // oldest first (sortTimers)
    "trackedTodaySec": 4500,
    "recentLabels": ["Читання", "Пошта"]   // ≤3 distinct labels of most recent ad-hoc sessions (time_entries without taskId, newest first, plus running ad-hoc timers)
  },
  "finance": {
    "categories": [ { "name": "Їжа", "icon": "fork.knife" } ],  // exactly ≤6, see rules
    "accounts": [ { "id": "…", "name": "Картка", "currency": "UAH", "symbol": "₴", "decimals": 2, "kind": "card" } ],
    "defaultAccountId": "…"                // or null when no active accounts
  },
  "meetings": [ { "key": "<meetingId>@2026-10-18", "meetingId": "…", "title": "…",
                  "date": "2026-10-18", "time": "14:00", "durationMinutes": 60,
                  "startsAt": "ISO", "location": "…"|null } ]   // today + tomorrow, ≤20, by startsAt
}
```

Computation rules (phone: `utils/watchSnapshot.ts`, pure + jest; server: `watch/snapshot.py`):
- **My today tasks** = `isTodayTask` (`utils/taskToday.ts`) ∧ `isMyTask` (personal stream, or project task
  with `assigneeId == me` in a project where my role ≠ viewer), excluding `backlogKind`, `archivedAt`,
  `deleted`, `integrationArchived`. Server port of `isTodayTask`: done-today by last `history` `done`
  event in tz; in-progress/review by column id `status-in-progress` / `status-review` or project column
  whose `sourceStatusId` is one of those or whose type is `in_progress`/`review`; overdue (deadline local day
  < today, not done); deadline local day == today.
- **Order**: not-done first — overdue (oldest deadline first) → timed deadlines today by time → the rest
  by deadline then title; then done (most recent `done` event first).
- **Habits**: all `health_habits` (not deleted), `doneToday` / `streak` exactly as `habitDoneToday` /
  `habitStreak` (`utils/preventionUtils.ts`) in tz; app order.
- **trackedTodaySec**: sum of `time_entries.duration` whose `date` is today in tz (server: personal
  UserItem + ProjectItem time_entries with `updated_by == user`).
- **Categories top-6**: count expense transactions of the last 90 days by `category`, desc, tie → most
  recent use; icons from `categories` collection rows (`type:'expense'`), fallback icon
  `ellipsis.circle.fill`; pad up to 6 with stored expense categories in stored order, then with
  `defaultCategories(lang)` expense list (uk when lang null).
- **defaultAccountId**: `accountId` of the newest (by `date`) expense transaction if that account is active;
  else `defaultAccountId(accounts)` rule (`utils/accounts.ts`: first non-savings active, else first active).
  `accounts` = active accounts, default first, then app order. Symbol/decimals from BUILTIN
  (`UAH ₴ 2`, `USD $ 2`) + `finance_currencies`.
- **Meetings**: personal + member-project meetings, expanded with recurrence for today and tomorrow
  (server: `core.notifications.scheduler.index.iter_occurrences`; phone: existing meeting expansion in
  `utils/meetings.ts`/calendar code), skip `integrationCancelled`, deleted, `cancelled`.
- Watch keeps the snapshot with the newest `generatedAt`, then overlays its own unacked actions.

---

## 5. Server API (owner: `server`)

All paths are under `/api`, trailing slash REQUIRED. Errors use the existing envelope
`{"code": "...", "detail": "..."}`. Auth header `Authorization: Bearer <access>`.
Clients send `X-Flowi-Client`: phone `mobile/<v> (ios|android)`, web `web/<v>`, watch `watch/<v> (watchos)`.

### 5.1 Model `accounts.AuthSession` (migration `accounts/migrations/0007_authsession.py`)
| field | type |
|---|---|
| `id` | UUID pk |
| `user` | FK User, CASCADE, related_name `auth_sessions` |
| `kind` | char(10): `mobile` / `web` / `watch` / `other` |
| `platform` | char(10): `ios` / `android` / `watchos` / `web` / `''` |
| `name` | char(100) (device name; fallback from UA/kind) |
| `app_version` | char(20) |
| `watch_id` | char(64) blank (only kind=watch) |
| `user_agent` | char(255) blank |
| `created_at` | auto_now_add |
| `last_seen_at` | datetime (set on create; bumped at most once per 5 min) |
| `revoked_at` | datetime null |
| `revoked_reason` | char(20): `user` / `logout` / `logout_all` / `replaced` / `password_change` / `''` |

Index `(user, revoked_at)`.

### 5.2 Token claims and checks (`accounts/sessions.py`)
- New helper `issue_session_tokens(user, request, *, kind=None, name='', watch_id='') -> (AuthSession, RefreshToken)`:
  creates the AuthSession (kind/platform/app_version parsed from `X-Flowi-Client`, unknown → `other`;
  `name` = explicit, else body `device_name`, else derived from UA, else kind label) and returns
  `SessionRefreshToken.for_user(user)` with extra claims `sid` = session id (str) and `skind` = kind.
  simplejwt copies custom claims to the access token and keeps them through refresh rotation.
- Replace ALL four `RefreshToken.for_user(...)` call sites in `accounts/views.py` (register, login,
  password change, register-status) with the helper. Login/register accept optional body `device_name` (≤100).
- `check_session(user, token)` additionally: if `sid` in token → AuthSession(id=sid, user=user) must exist
  and `revoked_at IS NULL`, else `AuthenticationFailed(code='session_revoked')`. Tokens without `sid`
  (pre-existing logins) keep working ("legacy", not listed). This covers REST, refresh and WebSocket.
- Scope restriction: a token with `skind == 'watch'` may only call `/api/watch/*`, `/api/auth/refresh/`,
  `/api/auth/logout/`; anything else → 403 `{"code":"watch_scope"}` (enforce in `SessionJWTAuthentication`
  using `request.path`; WebSocket connect with a watch token is refused).
- `revoke_sessions(user)` (logout-all, password change) also sets `revoked_at=now, revoked_reason='logout_all'`
  (or `password_change`) on all active AuthSession rows of the user (the new session issued right after a
  password change is created after the revoke).
- `LogoutView`: also revoke the AuthSession whose `sid` is in the posted refresh token (`reason='logout'`).
- `last_seen_at` bump inside `SessionJWTAuthentication.get_user` when older than 5 min (single UPDATE).

### 5.3 Endpoints (accounts)
**POST `/api/auth/watch-session/`** — provision watch tokens. Throttle scope `watch_provision` (`30/hour`).
- Auth: any valid session EXCEPT `skind == 'watch'` (→ 403 `watch_cannot_provision`).
- Body: `{ "watch_id": "<uuid>", "device_name": "Apple Watch" }` (`watch_id` required, ≤64; name ≤100).
- Effect: revoke (reason `replaced`) every active `kind='watch'` session of this user with the same
  `watch_id`; create new AuthSession(kind=`watch`, platform=`watchos`, name, watch_id).
- 201: `{ "session": SessionOut, "access": "...", "refresh": "..." }`.

**GET `/api/auth/sessions/`** — throttle scope `sessions` (`60/min`). Watch tokens → 403 `watch_scope`.
- 200: `{ "sessions": [SessionOut], "legacy_note": true }` — active (not revoked) sessions with
  `last_seen_at` within 30 days, current first, then `last_seen_at` desc.

**DELETE `/api/auth/sessions/<uuid:session_id>/`** — scope `sessions`.
- 204 on success (sets `revoked_at`, reason `user`, then `_announce(user_id)` so WS clients recheck).
- 404 `session_not_found` (not mine / unknown / already revoked); 400 `current_session` if it is the
  caller's own session (client must use logout instead).

`SessionOut`:
```json
{ "id":"uuid", "kind":"watch", "platform":"watchos", "name":"Apple Watch",
  "app_version":"1.0.0", "created_at":"ISO", "last_seen_at":"ISO", "current": false }
```

### 5.4 Endpoints (watch) — new Django app `watch` mounted at `api/watch/`
**GET `/api/watch/today/?tz=<IANA>`** — scope `watch_read` (`120/min`). Any valid session (watch or not).
200 → WatchTodaySnapshot (`source: "server"`). Invalid/missing tz → user tz.

**POST `/api/watch/actions/`** — scope `watch_write` (`120/min`). Any valid session.
- Body: `{ "watch_id": "<uuid>"|null, "actions": [DeviceAction, ...] }`, 1..50 actions, else 400
  `invalid_request`. Actions are processed in array order, each in its own transaction (one bad action
  never rolls back others).
- 200: `{ "results": [ActionResult...], "snapshot": WatchTodaySnapshot }` (results in request order;
  snapshot computed after applying, `tz` = tz of the last action).

Write path (no new storage, no sync-contract change, no SYNC_CONTRACT_VERSION bump):
- Extract, WITHOUT behaviour change, the mutation-application body of `UserSyncV2View.post`
  (`core/views.py`) into `apply_user_mutations(user, mutations) -> (acknowledged, conflicts, rejected, wrote_anything)`
  (keeps locking, ItemRevision, reminder indexing, UserSyncMutation, cursor, prune + broadcast) and the
  body of `ProjectSyncView.post` (`core/project_views.py`) into
  `apply_project_mutations(project, user, mutations) -> same tuple` (keeps role re-read under lock,
  teamwork policy, notifications, activity, broadcasts). The views call these functions; all existing tests
  must still pass.
- Watch handlers read current records, build the new `data` per §3, and submit v2 mutations
  `{ mutation_id: "w:<action.id>:<n>", collection, local_id, operation, data, base_revision: <current revision or null>, client_updated_at: action.at }`.
  On `conflict` re-read once and retry; still conflicting → `rejected/conflict`. Policy rejection →
  `rejected/forbidden`.

### 5.5 Settings additions (`flowi_server/settings.py`, owner `server`)
`INSTALLED_APPS += ['watch']`; `DEFAULT_THROTTLE_RATES += {'watch_provision':'30/hour','sessions':'60/min','watch_read':'120/min','watch_write':'120/min'}`;
`flowi_server/urls.py`: `path('api/watch/', include('watch.urls'))` BEFORE `path('api/', include('core.urls'))`.

---

## 6. WatchConnectivity protocol (owners: `watch_swift` ⇄ `mobile_js`)

All WC dictionaries are `[String: Any]` with ONLY string values; structured data is a JSON string in
`"body"`. Key `"t"` = message type.

### 6.1 Watch → phone, `sendMessage(_:replyHandler:)` (only when `isReachable`)
| `t` | `body` (JSON) | phone reply |
|---|---|---|
| `actions` | `{"actions":[DeviceAction…]}` (≤20) | `["t":"ack","body": {"results":[ActionResult…],"snapshot": WatchTodaySnapshot\|null}]` |
| `hello` | `{"watchId","appVersion","hasToken":bool,"sessionId":string\|null,"reason":"none"\|"revoked"\|"expired"\|"user_mismatch"}` | `["t":"ok"]` |
| `snapshotRequest` | `{}` | `["t":"snapshot","body": WatchTodaySnapshot]` or `["t":"signedOut"]` |

Ack rule: the phone replies to `actions` ONLY after every action result is durable in AsyncStorage
(`updateSynced` resolved). The native bridge holds the replyHandler keyed by a request id; if JS has not
replied within **2.5 s** the native side drops it without replying. The watch treats "no reply within
3.0 s" or an error as **not acked** and sends the SAME actions to `POST /api/watch/actions/`.
Per-action: `applied`/`duplicate`/`rejected` → done (remove from queue); `retry` → keep.
Review addendum (2026-10-18): the `actions` body also carries optional `"userId"` (owner of the watch
queue: token user, else context user); the phone does not reply when it differs from the signed-in user.
Actions the phone answers with `retry` are posted to the server in the same delivery when the watch has a
token (the target may exist on the server but not yet on the phone).

### 6.2 Watch → phone, `transferUserInfo` (when not reachable)
Only `hello` is sent this way (guaranteed delivery). Actions are NEVER sent via userInfo (server path instead).

### 6.3 Phone → watch
- `updateApplicationContext(["v":"1","authed":"1"|"0","userId":"12","lang":"uk","apiBase":"https://…/api","snapshot":"<json>"])`
  — pushed (debounced 2 s) whenever the phone snapshot changes and on auth/lang changes, only if
  `isPaired && isWatchAppInstalled`. Signed out → `authed:"0"`, no snapshot.
- `transferUserInfo(["t":"auth","body": {"access","refresh","sessionId","apiBase","userId","lang","issuedAt"}])`
  — token handoff (also sent with `sendMessage` when reachable; watch dedupes by `sessionId`).
- `transferUserInfo(["t":"signout","body":{"reason":"logout"|"workspace_switch"|"revoked"}])`.

### 6.4 Provisioning rules (phone, `store/watch-link.ts`)
- On `hello` with `hasToken:false`: if phone is authed+online and `reason != "revoked"` → POST
  `/api/auth/watch-session/` `{watch_id, device_name:"Apple Watch"}` → send `auth`. If `reason == "revoked"`
  → do NOT auto-provision; set link state `revoked`; the Devices screen shows "Reconnect".
- Manual "Connect / Reconnect Apple Watch" on the Devices screen → same provisioning.
- Phone persists AsyncStorage `watch_link_v1` = `{ watchId, sessionId, provisionedAt, state: 'connected'|'revoked'|'none' }` (never tokens).
- Phone logout / workspace switch: best-effort `DELETE /api/auth/sessions/<sessionId>/` BEFORE clearing
  its own tokens, then send `signout`, then `updateApplicationContext(authed:"0")`, then clear `watch_link_v1`.
- If the watch context `userId` differs from the watch token user → watch wipes token+queue and sends
  `hello` with `reason:"user_mismatch"` (auto-provision allowed).

### 6.5 Watch token lifecycle (watch_swift)
- Tokens + `sessionId` + `apiBase` + `userId` in watch Keychain (service `com.casper3.f-tracking-app.watch`).
- 401 on any call → one `POST {apiBase}/auth/refresh/ {"refresh"}` → `{access, refresh}` (rotation: store
  BOTH). Refresh 401 with code `session_revoked` → wipe tokens, `reason="revoked"`; other 401 →
  `reason="expired"`; then send `hello`. 403 `watch_scope` is a bug (log only).

---

## 7. iOS native bridge, Live Activity, pending queue (owners: `mobile_js` + `ios_widget`)

### 7.1 Local Expo module `modules/flowi-ios-bridge/` (owner mobile_js)
`expo-module.config.json`: `{"platforms":["apple"],"apple":{"modules":["FlowiIosBridgeModule"],"appDelegateSubscribers":["FlowiIosBridgeAppDelegate"]}}`.
The AppDelegate subscriber activates `WCSession.default` in `didFinishLaunching` (so the app can be woken
by the watch) and starts observing the Darwin notification `com.casper3.f-tracking-app.pendingActions`.
Messages that arrive before JS subscribes are buffered (≤2.5 s, then dropped unreplied).

JS API (`modules/flowi-ios-bridge/index.ts`, iOS only; Android/web stubs return null/false):
```ts
export interface WatchState { supported: boolean; paired: boolean; installed: boolean; reachable: boolean; activated: boolean }
getWatchState(): WatchState
updateWatchContext(ctx: Record<string, string>): void
transferToWatch(info: Record<string, string>): void
sendToWatch(info: Record<string, string>): void           // best-effort sendMessage, no reply
replyToWatch(requestId: string, reply: Record<string, string>): void
addWatchMessageListener(cb: (e: { requestId: string; message: Record<string, string> }) => void): Subscription
addWatchUserInfoListener(cb: (e: { info: Record<string, string> }) => void): Subscription
addWatchStateListener(cb: (s: WatchState) => void): Subscription
liveActivitiesEnabled(): boolean                          // iOS ≥ 17.0 && ActivityAuthorizationInfo().areActivitiesEnabled
liveActivitySync(state: LiveActivityState | null): void   // null → end all; else start-or-update the single activity
readPendingActions(): string                              // JSON array of DeviceAction from App Group (per-key entries, §7.3)
removePendingActions(ids: string[]): void                 // removes only those ids' keys
clearPendingActions(): void                               // sign-out / account switch: drop every entry
setDeviceActionOwner(userId: string | null): void         // queue owner stamped into each action (§7.3)
addPendingActionsListener(cb: () => void): Subscription
export interface LiveActivityState { timerId: string; label: string; startedAtMs: number;
  projectName: string | null; colorHex: string | null; otherCount: number; lang: 'uk' | 'en' }
```

### 7.2 Shared Swift files — BYTE-IDENTICAL copies
`FlowiTimerAttributes.swift` must exist identically at: `targets/widget/FlowiTimerAttributes.swift`
(ios_widget), `modules/flowi-ios-bridge/ios/FlowiTimerAttributes.swift` and
`modules/flowi-ios-bridge/app-target/FlowiTimerAttributes.swift` (mobile_js).

```swift
// FlowiTimerAttributes.swift — SHARED CONTRACT, docs/specs/watch-lockscreen-v1.md §7.2.
// Byte-identical copies: targets/widget/, modules/flowi-ios-bridge/ios/, modules/flowi-ios-bridge/app-target/.
#if canImport(ActivityKit)
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct FlowiTimerAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var timerId: String
    public var label: String
    public var startedAt: Date
    public var projectName: String?
    public var colorHex: String?
    public var otherCount: Int
    public var lang: String

    public init(timerId: String, label: String, startedAt: Date, projectName: String?,
                colorHex: String?, otherCount: Int, lang: String) {
      self.timerId = timerId
      self.label = label
      self.startedAt = startedAt
      self.projectName = projectName
      self.colorHex = colorHex
      self.otherCount = otherCount
      self.lang = lang
    }
  }

  public var kind: String

  public init(kind: String = "timer") {
    self.kind = kind
  }
}
#endif
```

`FlowiStopTimerIntent.swift` must exist identically at `targets/widget/FlowiStopTimerIntent.swift`
(ios_widget) and `modules/flowi-ios-bridge/app-target/FlowiStopTimerIntent.swift` (mobile_js; added to the
MAIN APP target by mobile_js's config plugin so the intent's `perform()` runs in the app process — the
LiveActivityIntent rule — and App Intents metadata is extracted for the app).

```swift
// FlowiStopTimerIntent.swift — SHARED CONTRACT, docs/specs/watch-lockscreen-v1.md §7.2.
// Byte-identical copies: targets/widget/, modules/flowi-ios-bridge/app-target/.
import AppIntents
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

enum FlowiPendingActions {
  static let appGroup = "group.com.casper3.f-tracking-app"
  /// Кожна дія — окремий ключ `<key>.<id>` зі значенням-JSON одного DeviceAction:
  /// запис одного ключа атомарний, тож інтент і прибирання в застосунку
  /// (FlowiPendingQueue) не можуть затерти одне одного (без read-modify-write).
  static let key = "flowi_pending_device_actions_v1"
  /// userId власника черги; nil — ніхто не увійшов (FlowiPendingQueue.setOwner).
  static let ownerKey = "flowi_device_action_owner_v1"
  static let darwinName = "com.casper3.f-tracking-app.pendingActions"

  /// false — дію не поставлено (немає власника: користувач вийшов).
  @discardableResult
  static func enqueueTimerStop(timerId: String, at: Date) -> Bool {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let owner = defaults.string(forKey: ownerKey), !owner.isEmpty else { return false }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let id = UUID().uuidString.lowercased()
    let entry: [String: Any] = [
      "id": id,
      "type": "timer_stop",
      "at": iso.string(from: at),
      "source": "live_activity",
      "userId": owner,
      "payload": ["timerId": timerId],
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let string = String(data: data, encoding: .utf8) else { return false }
    defaults.set(string, forKey: "\(key).\(id)")
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName as CFString), nil, nil, true
    )
    return true
  }
}

@available(iOS 17.0, *)
struct FlowiStopTimerIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop timer"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Timer ID")
  var timerId: String

  init() {}

  init(timerId: String) {
    self.timerId = timerId
  }

  func perform() async throws -> some IntentResult {
    // Без власника (вихід із акаунта) дію не ставимо — лише закриваємо активність.
    FlowiPendingActions.enqueueTimerStop(timerId: timerId, at: Date())
    #if canImport(ActivityKit)
    for activity in Activity<FlowiTimerAttributes>.activities where activity.content.state.timerId == timerId {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    #endif
    return .result()
  }
}
```

### 7.3 Pending device-action queue
- iOS: App Group `UserDefaults(suiteName:"group.com.casper3.f-tracking-app")`, ONE KEY PER ACTION:
  `flowi_pending_device_actions_v1.<id>`, value = JSON STRING of ONE `DeviceAction` whose `id` equals the
  key suffix. Writing/removing a single key is atomic, so the intent (§7.2, possibly another process) and the
  in-app drain never overwrite each other — there is no shared array and no read-modify-write. (Revised
  2026-10-18: the original single-array value under the bare key lost «Stop» taps under concurrent writers.)
  - Writer: `FlowiPendingActions.enqueueTimerStop` (intent above). It stamps `userId` = the queue owner
    `flowi_device_action_owner_v1`; with no owner (signed out) it enqueues nothing and only ends the activity.
  - Reader: bridge `FlowiPendingQueue.read()` → JSON array of all valid entries sorted by `at`, then `id`;
    malformed entries (unparsable, or `id` ≠ key suffix) are deleted on read. `remove(ids:)` deletes only
    those keys; `clear()` deletes every entry (sign-out / account switch); `setOwner(_:)` writes/removes the
    owner key.
  - Legacy migration: a value still stored under the bare key `flowi_pending_device_actions_v1` (JSON array,
    builds ≤ 1.2.0) is split into per-key entries on the next read/remove and the bare key is removed.
- Android: `SharedPreferences("flowi_surfaces")`, still a single JSON-array value under
  `flowi_pending_device_actions_v1` — all writers (Stop receiver, §10) and the drain run in the app process
  under one `synchronized` lock, so the array is safe there. Owner key and `userId` stamping are the same.
- JS drain (mobile_js `store/device-actions.ts`, iOS; android calls the same applier from its own hook,
  `components/shared/DeviceSurfaces.tsx` → `store/android-surfaces.ts`): on app start, on `AppState` →
  active, and on the pending-actions native event: read → drop actions whose `userId` is missing or differs
  from the signed-in user → `applyDeviceActions(actions)` → remove ids whose status ≠ `retry`.

### 7.4 Live Activity behaviour (JS: mobile_js `store/live-activity.ts`; UI: ios_widget)
- Exactly ONE Flowi activity at a time, representing the NEWEST running timer (`startedAt` max);
  `otherCount` = number of other running timers. Driven from `TimerProvider.activeTimers` via
  `liveActivitySync(state|null)`. Start only when app is active (ActivityKit rule); update/end anytime.
- Gate: iOS ≥ 17.0 (the hosting widget extension's deploymentTarget is already 17.0, so 16.2–16.x devices
  have no extension to render it; this subsumes the 16.2 floor) and `areActivitiesEnabled`.
- `colorHex`: project color when known, else `#6366F1`.
- `app.json` → `ios.infoPlist.NSSupportsLiveActivities = true` (mobile_js).
- UI (ios_widget, `targets/widget/TimerLiveActivity.swift`): `ActivityConfiguration(for: FlowiTimerAttributes.self)`
  — lock screen: label, project name, `Text(state.startedAt, style: .timer)` (counts up), "+N" when
  `otherCount > 0`, Stop button `Button(intent: FlowiStopTimerIntent(timerId: state.timerId))`;
  Dynamic Island compact (dot + timer), minimal (timer glyph), expanded (label, timer, Stop).
  `widgetURL(URL(string: "ftrackingapp:///time"))`. Strings by `state.lang` from the widget's `.lproj` (§13.3).
  Registered in `FlowiWidgetBundle`.

---

## 8. Widget snapshot extension + lock-screen widgets

### 8.1 Snapshot `flowi_widget_snapshot_v1` — additive (v stays 1)
mobile_js extends `WidgetSnapshot` (`utils/widgetSnapshot.ts`) and adds `'meetings'` to
`WIDGET_SOURCE_KEYS`:
```ts
next: {
  meeting: { title: string; startsAt: string; endsAt: string; location: string | null } | null;
  task: { id: string; title: string; deadline: string | null; hasTime: boolean; overdue: boolean } | null;
};
```
- `next.meeting` = earliest meeting occurrence (personal+project, recurrence-expanded, today/tomorrow)
  with `endsAt > now`; `endsAt = startsAt + durationMinutes`.
- `next.task` = first not-done item of the §4 task order (my today tasks).
- Signed out → `next: { meeting: null, task: null }`.
Swift (ios_widget, `Snapshot.swift`) adds `var next: Next?` with optional members so older JSON decodes;
`normalized(for:)` sets `next = nil` on another day. Android parses the same JSON (optional `next`).
Widgets must schedule a timeline reload at `next.meeting.startsAt` and `endsAt` (min with existing policy).

### 8.2 Lock-screen widget (ios_widget) — separate widget kind `FlowiLockWidget`
- `supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])`, own intent
  `FlowiLockIntent: WidgetConfigurationIntent` with `@Parameter var content: FlowiLockContent`
  (default `.ringTasks`), shown only for circular.
- `enum FlowiLockContent: String, AppEnum` cases: `ringTasks, ringSteps, ringFinance, ringTime,
  actionTask, actionExpense, actionEvent, actionNote` (raw values = case names; stable config ids).
- circular: ring = `Gauge`/`FlowiRing` with the same math as the large home widget (tasks done/total,
  steps vs goal using HealthKit-or-snapshot, finance income vs expense, time trackedSec/8h or full ring +
  `Text(timer)` when running); action = SF symbol of `FlowiAction` + `widgetURL(action.url)`.
- rectangular: line 1 = next meeting (time · title) if it starts before the next task deadline or the
  task has no time, else next task (title, "overdue" marker); line 2 = linear gauge of tasks done/total +
  "3/7"; signed out → app name + sign-in hint.
- inline: `"3/7 завдань · ⏱ 1:12"` — counts + running timer (`Text(startedAt, style: .timer)`), or
  tracked today when no timer (`2г 15хв`).
- Register in `FlowiWidgetBundle` next to `FlowiWidget` and the Live Activity widget.

---

## 9. Apple Watch app (owner: `watch_swift`) — `targets/watch/`

- `expo-target.config.js`: `type: 'watch'`, `name: 'FlowiWatch'`, `displayName: 'Flowi'`,
  `bundleIdentifier: '.watchkitapp'`, `deploymentTarget: '10.0'`, `frameworks: ['SwiftUI','WatchConnectivity']`,
  `icon: '../../assets/logo_app.png'`, `colors.$accent` = `#7C3AED`/`#A78BFA`. No App Group, no HealthKit.
- `Info.plist`: `WKApplication = true`; `WKRunsIndependentlyOfCompanionApp = false`.
- SwiftUI app: `TabView` with `.tabViewStyle(.verticalPage)` pages **Today → Timer → Meetings**; toolbar
  `.topBarTrailing` "+" → sheet with **Expense / Task / Note**.
  - Today: my today tasks (§4 order; checkbox when `canComplete`; swipe/long-press "Start timer"); "+ task"
    row → dictation `TextField` → `task_create` (deadline = local noon of today, ISO UTC); habits section
    with check-off (`habit_check` set semantics) and streak badge.
  - Timer: running timers (oldest first, live `Text(.timer)`), Stop each (`timer_stop`); "Tracked today";
    "Start without task": dictation field or one of `recentLabels` (≤3) → `timer_start` adhoc.
  - Meetings: read-only today/tomorrow (time, title, location).
  - Expense: own numeric keypad (digits, decimal separator per lang, backspace; max 2 decimals or account
    decimals) → top-6 category chips → account picker defaulting to `defaultAccountId` (remember last
    used on watch) → `expense_create`.
  - Note: dictation → `note_create`.
- Optimistic UI: apply each queued action to the cached snapshot immediately; reconcile on next snapshot.
- Persistent queue (`Application Support/flowi_pending_actions.json`, FIFO). Delivery loop: on enqueue,
  app active, reachability change, `WKApplicationRefreshBackgroundTask` (~15 min): if `isReachable` →
  `sendMessage(actions)` (§6.1, 3 s timeout) → unacked → `POST /api/watch/actions/`; not reachable → server
  directly; no token → keep queued and send `hello`. Network failure → exponential backoff (5 s → 5 min).
- Snapshot sources: applicationContext; `snapshotRequest` when reachable; else `GET /api/watch/today/?tz=`.
  Cache in `Application Support/flowi_today_snapshot.json`. Newest `generatedAt` wins.
- Language: snapshot/context `lang` (fallback device). Strings in `targets/watch/{uk,en}.lproj/Localizable.strings`
  resolved through a lang-specific bundle (§13.3). Header `X-Flowi-Client: watch/1.0.0 (watchos)`.
- Signed-out state (no token AND context `authed:"0"` or no context): "Open Flowi on iPhone" screen.
- Deadline notifications: none in code (system mirrors iPhone notifications). No complications in v1.

---

## 10. Android (owner: `android`) — local Expo module `modules/flowi-android/`

Decision: native Kotlin in a local Expo module (autolinked from `modules/`), `RemoteViews` widgets (rings
rendered to a Bitmap via Canvas), plain ongoing notification with chronometer (no foreground service, no
Glance, no new Gradle plugins). Receivers/providers/activities declared in the module's
`android/src/main/AndroidManifest.xml` (manifest merge) — no config plugin, no app.json change.

- `expo-module.config.json`: `{"platforms":["android"],"android":{"modules":["com.casper3.flowi.surfaces.FlowiAndroidModule"]}}`.
- JS API `modules/flowi-android/index.ts` (no-ops on iOS/web):
```ts
setWidgetSnapshot(json: string): void          // stores + refreshes all Flowi widgets
showTimerNotification(p: { timerId: string; label: string; startedAtMs: number; otherCount: number;
  title: string; stopLabel: string; channelName: string; moreLabel: string }): void
clearTimerNotification(): void
readPendingActions(): string                     // JSON DeviceAction[]
removePendingActions(ids: string[]): void
addPendingActionsListener(cb: () => void): Subscription
```
- Widgets (snapshot in `SharedPreferences("flowi_surfaces")` key `flowi_widget_snapshot_v1`, same JSON as iOS):
  - Large (4×4): 4 rings (finance, steps, tasks, time; time ring shows `Chronometer` when running) + 4 actions.
  - Medium (4×2): 4 actions. Small (2×2): 1 action chosen in a configuration Activity (task/expense/event/note).
  - Metric (2×2): 1 ring chosen in a configuration Activity (tasks/steps/finance/time).
  - Action deep links = iOS `FlowiAction.url` values (`ftrackingapp:///?create=1`, `ftrackingapp:///explore?create=1`,
    `ftrackingapp:///calendar?create=meeting`, `ftrackingapp:///notes?create=1`); ring taps = iOS `FlowiLinks`.
  - Strings chosen in Kotlin by snapshot `lang` (uk default), mirroring `FlowiStrings` in
    `targets/widget/Actions.swift`. Signed out (`authed:false`) → actions only.
  - Refresh on `setWidgetSnapshot`, on `ACTION_DATE_CHANGED`/midnight alarm (zero numbers for a stale `day`).
- Timer notification: channel id `flowi_timer` (IMPORTANCE_LOW), notification id `7301`, ongoing,
  `setUsesChronometer(true)` + `setWhen(startedAtMs)`, content intent → `ftrackingapp:///time`, action
  "Stop" → `FlowiTimerStopReceiver`: append `{id:uuid, type:'timer_stop', at:nowIso, source:'android_notification', payload:{timerId}}`
  to the pending queue (§7.3), cancel the notification, emit `onPendingActions` if the module is alive.
- JS glue owned by android: `store/android-surfaces.ts` exporting `export function useAndroidSurfaces(): void`
  (no-op unless `Platform.OS === 'android'`): writes the snapshot via `computeWidgetSnapshot` (mobile_js
  export, §11.4) on the same triggers as `useWidgetSnapshotWriter`; shows/clears the timer notification from
  `useTimer().activeTimers` (newest timer, strings from `tr.timerNotif*`); drains the pending queue with
  `applyDeviceActions` on start / AppState active / listener. mobile_js mounts it in `app/_layout.tsx`.
- Known v1 limitation (documented, accepted): a Stop pressed while the app process is dead is applied on
  the next app start; the notification disappears immediately.

---

## 11. Mobile JS (owner: `mobile_js`)

### 11.1 Files
- `utils/deviceActions.ts` — types §2 + pure helpers (validation, deterministic ids, record builders for
  §3 that take current records and return new ones). Jest tests.
- `utils/taskRecurrence.ts` — `nextRecurrenceDate` moved from `app/(tabs)/index.tsx` (import it back there).
- `utils/watchSnapshot.ts` — pure `buildWatchSnapshot(input)` §4. Jest tests.
- `store/timer-ops.ts` — non-React start/stop operations extracted from `store/timer-context.tsx`
  (`startTaskTimerOp`, `startAdHocTimerOp`, `stopTimerOp` with optional `{ id, at, entryId, silentWorkflow }`);
  TimerProvider delegates to them (no behaviour change for in-app use; it must re-read storage / bump
  revisions after off-app ops via the existing `subscribeToStorage`).
- `store/device-actions.ts` — `export async function applyDeviceActions(actions: DeviceAction[]): Promise<ActionResult[]>`
  (sequential, idempotent per §2.2, uses `updateSynced`, triggers normal sync) + iOS pending-queue drain hook.
- `store/watch-link.ts` — `useWatchLink()`: WC events (§6), snapshot push, provisioning (§6.4), signout.
- `store/live-activity.ts` — `useTimerLiveActivity()` (§7.4).
- `store/sessions-api.ts` — `listSessions()`, `revokeSession(id)`, `provisionWatchSession(watchId)`.
- `app/devices.tsx` (Stack screen) — sessions list (kind icon, name, platform, last seen, "This device"
  badge, Revoke with confirm; legacy note) + Apple Watch block on iOS (state from bridge, Connect/Reconnect).
  Entry row from `app/account.tsx` or `app/(tabs)/settings.tsx` account section.
- `store/auth.tsx` — send `device_name` (expo-device `modelName`) on login/register; on logout / workspace
  switch run §6.4 teardown first (best-effort, never blocks logout).
- `utils/widgetSnapshot.ts`, `store/widget-sync.ts` — §8.1; export
  `export async function computeWidgetSnapshot(session: { authed: boolean; myUserId?: string | null }, now?: Date): Promise<WidgetSnapshot>`
  (gathers storage + builds) and keep `writeWidgetSnapshot` using it.
- `modules/flowi-ios-bridge/**` — §7.1/§7.2 + `app.plugin.js` (adds `app-target/*.swift` to the main app
  target via `withXcodeProject`, idempotent).
- `app/_layout.tsx` — mount `useWatchLink()`, `useTimerLiveActivity()`, `useAndroidSurfaces()` (import from
  `@/store/android-surfaces`), device-action drain; register `devices` Stack screen.
- `app.json` — `ios.infoPlist.NSSupportsLiveActivities: true`; plugins += `"./modules/flowi-ios-bridge/app.plugin.js"`.

### 11.2 Behavioural notes
- WC `actions` handler: parse → `applyDeviceActions` → compute `buildWatchSnapshot` → `replyToWatch`.
- Snapshot push: debounce 2 s on changes of the snapshot source keys (`tasks`, `task_statuses`,
  `active_timers`, `time_entries`, `transactions`, `accounts`, `categories`, `finance_currencies`,
  `health_habits`, `meetings`, `project_sync_state_v1`, `workspace_projects`, `lang_option_v1`).

---

## 12. Web (owner: `web`)

- `lib/sessions-api.ts`: `listSessions(): Promise<SessionOut[]>`, `revokeSession(id): Promise<void>` via the
  existing `apiFetch` (`lib/api.ts`).
- `components/settings/sessions-card.tsx`: list (kind icon via lucide: Smartphone/Monitor/Watch/HelpCircle,
  name, platform, "Цей пристрій", last seen relative, "Завершити" with confirm → revoke → reload list;
  `current` row has no revoke button); legacy note "Старіші входи тут не показані — для них є «Вийти з усіх
  пристроїв»." Loading / error / empty states. Ukrainian strings inline (web has no i18n layer).
- `app/app/settings/page.tsx`: render `<SessionsCard />` inside/above the existing `SessionSettings`
  card ONLY (do not touch `ModulesSection` or other sections).
- Login may send `device_name` (e.g. `"<Browser> · <OS>"` from `navigator.userAgent`) — optional.
- Tests: `lib/sessions-api.test.mjs` (node test style used in `lib/*.test.mjs`).

---

## 13. i18n

### 13.1 Mobile `store/translations.ts` (ONLY mobile_js edits; add to `Translations` interface + `uk` + `en`)
| key | uk | en |
|---|---|---|
| `devicesTitle` | Пристрої та сесії | Devices & sessions |
| `devicesRow` | Пристрої та сесії | Devices & sessions |
| `devicesThisDevice` | Цей пристрій | This device |
| `devicesKindMobile` | Телефон | Phone |
| `devicesKindWeb` | Браузер | Browser |
| `devicesKindWatch` | Apple Watch | Apple Watch |
| `devicesKindOther` | Інший пристрій | Other device |
| `devicesLastSeen` | Активність: {when} | Last active: {when} |
| `devicesRevoke` | Завершити сесію | End session |
| `devicesRevokeConfirmTitle` | Завершити сесію? | End this session? |
| `devicesRevokeConfirmBody` | Пристрій «{name}» вийде з акаунта. | “{name}” will be signed out. |
| `devicesLegacyNote` | Старіші входи тут не показані — для них є «Вийти з усіх пристроїв». | Older sign-ins aren’t listed — use “Sign out of all devices”. |
| `devicesEmpty` | Активних сесій немає | No active sessions |
| `devicesLoadError` | Не вдалося завантажити сесії | Couldn’t load sessions |
| `watchSectionTitle` | Apple Watch | Apple Watch |
| `watchConnect` | Підключити Apple Watch | Connect Apple Watch |
| `watchReconnect` | Підключити знову | Reconnect |
| `watchConnected` | Підключено | Connected |
| `watchNotPaired` | Годинник не спарено | No paired watch |
| `watchAppNotInstalled` | Встановіть Flowi на годиннику | Install Flowi on your watch |
| `watchDisconnected` | Сесію годинника завершено | Watch session ended |
| `watchConnectError` | Не вдалося підключити годинник | Couldn’t connect the watch |
| `timerNotifChannel` | Таймер | Timer |
| `timerNotifStop` | Зупинити | Stop |
| `timerNotifMore` | +{n} ще | +{n} more |
| `timerNotifTitle` | Таймер іде | Timer running |

### 13.2 Web — inline Ukrainian, matching existing settings page.

### 13.3 Swift targets
New strings go to `<target>/{uk,en}.lproj/Localizable.strings` (key = English text). Runtime language =
snapshot/state `lang`, not device: resolve with
`Bundle(path: Bundle.main.path(forResource: lang, ofType: "lproj")!)?.localizedString(forKey:value:table:)`
(fallback `uk`). Existing inline `FlowiStrings` in the widget may stay; new widget strings may extend it
instead (match surrounding code) — but `AppEnum`/intent titles stay in `.lproj` as today.

---

## 14. File ownership (exclusive) and shared-file rules

| Workstream | Owns (exclusive) |
|---|---|
| server | `flowi-server-app/accounts/{sessions.py,views.py,urls.py,models.py,admin.py}`, `accounts/migrations/0007_*`, `accounts/test_auth_sessions.py`, new `flowi-server-app/watch/**`, `core/views.py` (extraction only), `core/project_views.py` (extraction only), `flowi_server/settings.py`, `flowi_server/urls.py`, `docs/changes/2026-10-18-watch-api.md` |
| web | `flowi-web-app/lib/sessions-api.ts`, `lib/sessions-api.test.mjs`, `components/settings/**`, `app/app/settings/page.tsx` (SessionSettings area only) |
| mobile_js | `flowi-mobile-app/modules/flowi-ios-bridge/**`, `utils/{deviceActions,watchSnapshot,taskRecurrence,widgetSnapshot}.ts`, `store/{device-actions,watch-link,live-activity,sessions-api,timer-ops,timer-context,widget-sync,auth}.ts(x)`, `app/devices.tsx`, `app/_layout.tsx`, `app/account.tsx`, `app/(tabs)/settings.tsx`, `app/(tabs)/index.tsx` (recurrence import only), `app.json`, `store/translations.ts`, `__tests__/{device-actions,watch-snapshot,task-recurrence,widget-snapshot-next,timer-ops}*.test.ts` |
| watch_swift | `flowi-mobile-app/targets/watch/**` |
| ios_widget | `flowi-mobile-app/targets/widget/**` |
| android | `flowi-mobile-app/modules/flowi-android/**`, `store/android-surfaces.ts`, `__tests__/android-surfaces*.test.ts` |

Shared-file rules:
- `package.json` / `package-lock.json` (mobile, web): NOBODY edits. No new npm dependencies are needed
  (local modules are autolinked from `modules/`; native code uses only system frameworks / AndroidX
  already on the classpath). If you believe a dependency is unavoidable, stop and report instead.
  `expo-live-activity` stays in package.json untouched and unused (custom implementation chosen).
- `app.json`: ONLY mobile_js (two edits listed in §11.1). The watch target and widget changes need no
  app.json edits (`@bacons/apple-targets` discovers `targets/*/expo-target.config.js`).
- `store/translations.ts`: ONLY mobile_js; it adds every key in §13.1 (including the `timerNotif*` keys
  android consumes). android reads them via `useI18n().tr`.
- `app/_layout.tsx`: ONLY mobile_js; android must export exactly `useAndroidSurfaces(): void` from
  `store/android-surfaces.ts` so the mount compiles.
- Cross-workstream imports allowed: android → `@/utils/deviceActions` (types), `@/store/device-actions`
  (`applyDeviceActions`), `@/store/widget-sync` (`computeWidgetSnapshot`), `@/store/timer-context`
  (`useTimer`), `@/store/i18n`, `@/store/storage`, `@/store/auth`. Code against the signatures in this
  file; if the other side is not there yet, do not stub it in their files.
- Byte-identical Swift files (§7.2): copy the text from this spec verbatim; do not "improve" one copy.
- `memory/`, `contracts/`, `docs/` other than this spec and the server changes note: do not edit.
- Server `core/teamwork_policy.py`, `core/notifications/**`, `integrations/**` have unrelated
  uncommitted work — read-only for this feature.

---

## 15. Verification (each workstream, no simulator required)
- server: `.venv/bin/python manage.py test` (whole suite green) + new tests: session list/revoke/current,
  watch scope 403, refresh keeps `sid`, revoked sid → 401 `session_revoked`, each action type
  applied/duplicate/rejected/retry, phone-then-server double application converges (same local_ids),
  project-task completion through teamwork policy, snapshot shape.
- web: `npm test`, `npx tsc --noEmit`, `npm run lint` on touched files.
- mobile_js / android (JS): `npx tsc --noEmit`, `npx jest <own tests>`; whole `npx jest` must not regress.
- watch_swift / ios_widget: Swift must type-check; if Xcode project generation is needed use
  `npx expo prebuild -p ios --no-install` ONLY in a scratch copy, never commit `ios/`; do not boot a new
  simulator.
- android: Kotlin compiles (`./gradlew :flowi-android:compileDebugKotlin` in a scratch prebuild) if feasible;
  otherwise careful review.
