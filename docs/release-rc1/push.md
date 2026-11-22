# rc1: нативний пуш (FCM HTTP v1 + APNs)

Задача S3-06. Сервер надсилає пуш **напряму** провайдерам ОС: FCM HTTP v1 для Android і APNs HTTP/2 з token auth для iOS. Expo Push лишається тільки для старих рядків `kind='expo'` (збірки до 1.4.0). Ці рядки нікому не заважають: вони живуть, поки Expo приймає їхні токени.

## Код

| Де | Що |
|---|---|
| `flowi-server-app/core/notifications/channels/native.py` | `CHANNEL_PUSH_NATIVE='push_native'`, безпечний заголовок, whitelist `data`, `NativePushError` |
| `…/channels/fcm.py` | OAuth2 сервісного акаунта (JWT RS256 → oauth2.googleapis.com), `messages:send`, мапа помилок |
| `…/channels/apns.py` | provider token ES256 (кеш 50 хв), HTTP/2-клієнт, мапа `reason` → дія |
| `…/scheduler/dispatch.py` | `_send_native`: маршрут за `device.kind`, перевірка доступу на момент відправки, ретраї |
| `…/views.py` (`DevicesView`) | реєстрація `kind: fcm/apns`, `previous_token`, перевірка `bundle_id`, DELETE знімає нативні токени |
| `…/test_native_push.py` | 25 тестів, HTTP підмінено (мережа не потрібна) |
| `flowi-mobile-app/store/push.ts` | `getDevicePushTokenAsync`, `addPushTokenListener`, фолбек на Expo для сервера N-1 |
| `__tests__/push-native.test.ts` | протокол пристрою |

Міграцій немає. `DeviceRegistration` і `DeliveryAttempt` живуть у застосунку `core` (`app_label`). Значення `kind='fcm'|'apns'` і `channel='push_native'` пишуться поза `choices`: БД `choices` не перевіряє, `max_length` їх вміщує, `makemigrations --check` чистий. Наслідок: адмінка Django не дасть зберегти такий рядок через форму, бо значення немає серед choices. Коли власник міграцій `core` додаватиме наступну міграцію, варто внести обидва значення в `DEVICE_KIND_CHOICES` / `CHANNEL_CHOICES`.

## Протокол пристрою

`POST /api/notifications/devices/` (auth):

```json
{"kind": "apns", "token": "<hex 64>", "platform": "ios",
 "app_version": "1.4.0", "bundle_id": "app.flowi.mobile",
 "device_name": "iPhone", "lang": "uk", "timezone": "Europe/Kyiv",
 "previous_token": "<старий токен, лише при зміні>"}
```

- `kind=apns` ⇔ `platform=ios`, токен у hex (64–200 символів). `kind=fcm` ⇔ `platform=android`, токен до 512 символів без пробілів. Будь-що інше дає 400 з `fields`.
- Якщо `bundle_id` переданий, він має бути в `NATIVE_PUSH_BUNDLE_IDS` (типово `app.flowi.mobile`). Інакше 400 `fields.bundle_id`: токен старого `com.casper3.*` не підходить нашому topic/Firebase-проєкту.
- Запис іде через upsert за `(kind, token)`. Той самий токен від іншого акаунта переходить до нового користувача. Повторна реєстрація знову вмикає пристрій, якщо сервер його вимкнув.
- `previous_token` видаляє старий рядок **того самого користувача** (зміна токена ОС), щоб пуш не приходив двічі.
- `DELETE /api/notifications/devices/ {"token": …}` при виході знімає рядки `expo`, `fcm` і `apns` з цим токеном, і тільки поточного користувача.

Поведінка клієнта (`store/push.ts`):
1. Під час входу і холодного старту викликається `registerPushToken`. Він бере нативний токен, лише якщо дозвіл уже надано (сам дозвіл тут не запитується).
2. Незмінний запис повторно не POST-иться, але раз на 7 днів перереєструється. Так оновлюється `last_seen_at`, а пристрій, вимкнений помилкою провайдера, вмикається знову.
3. `addPushTokenListener` підключено в `setupPushInteractionHandlers`. Коли токен змінюється, клієнт робить POST з `previous_token`.
4. Сервер N-1 відповідає 400 на `kind` (або 404, якщо модуля немає). Тоді клієнт реєструє Expo-токен, як до rc1. Будь-яка інша 400 (наприклад, `bundle_id`) фолбеку не запускає.
5. Під час виходу викликається `unregisterPushToken` → DELETE. Якщо мережі немає, запит стає в чергу `push_pending_unregister` з origin.
6. `getRegistrationPushToken` (заявка на реєстрацію до входу) повертає **нативний** токен ОС (`getDevicePushTokenAsync`) разом із `kind` (`apns` на iOS, `fcm` на Android). EAS `projectId` для цього не потрібен. Без дозволу на сповіщення токена немає, і заявник дізнається про рішення через поллінг (кожні 65 с). Деталі в розділі «Пуш рішення про реєстрацію».

## Пуш рішення про реєстрацію (заявник до входу)

Спільний контракт сервера й мобільного (rc1). Назви полів збігаються з `accounts/views.py` і `core/expo_push.py::resolve_registration_push`:

| Запит | Поля (усі опційні) |
|---|---|
| `POST /api/auth/register/` (створює заявку) | `push_kind` (`'fcm'` або `'apns'`), `push_token` (нативний токен), `push_platform` (`ios` або `android`) |
| `POST /api/auth/register/status/` (поллінг) | ті самі поля. Сервер оновлює прив'язку, тільки якщо пара `(push_token, push_kind)` змінилась, тож клієнт шле їх при кожному поллінгу. Це покриває дозвіл, наданий уже після подання заявки, і зміну токена ОС |

- Якщо є `push_kind` і нативний `push_token`, сервер шле `registration_decision` через FCM v1 або APNs.
- Легасі-клієнти (до rc1) шлють Expo-токен у `push_token` без `push_kind` або в `expo_push_token`. Для них сервер і далі використовує Expo. Нативний токен через Expo сервер не шле ніколи.
- Мобільний код: `store/push.ts::getRegistrationPushToken`, `store/auth.tsx::register`, `store/registration.ts::pollRegistrationStatus`. Тести: `__tests__/push-native.test.ts` (iOS/Android, без projectId, без дозволу), `__tests__/auth.test.ts` (тіло `register`), `__tests__/registration-push.test.ts` (тіло поллінгу).

## Що летить на пристрій

Тільки ідентифікатори й безпечний заголовок. Тексту задачі, назв і сум немає:

- **title**: шаблон заголовка події з реєстру без підстановок («Вам призначили завдання»). Якщо в шаблоні є `{…}`, береться підпис події (`label`), якщо й такого немає, то «Flowi». **body порожній.**
- **data** (усі значення рядки): `type, event_type, notification_id, workspace_id, project_id, collection, local_id, request_id, invite_id, url` (легасі deep link `ftrackingapp://…`), `web_url` і `path` (шлях кабінету `/app/p/<pid>/board?task=<id>`, з якого мапиться екран застосунку).
- Android отримує data-only повідомлення з `priority: HIGH` і TTL 24 год. Ключі `title`, `message`, `body` (JSON із `data`), `categoryId`, `tag` мають формат, який розбирає `expo-notifications` (`NotificationData.kt`). `collapse_key` береться з `collapse_key` сповіщення.
- iOS отримує `aps.alert.title`, `sound`, `category`, `thread-id`, а userInfo `body` містить словник `data` (`EXNotificationSerializer`). Заголовки: `apns-push-type: alert`, `apns-priority: 10`, `apns-topic: APNS_TOPIC`, `apns-collapse-id`.

## Обробка відповідей

| Провайдер | Відповідь | Дія |
|---|---|---|
| FCM | 200 | `delivered` + `provider_message_id` (квитанцій у FCM/APNs немає) |
| FCM | 404 / `UNREGISTERED`, `SENDER_ID_MISMATCH`, 400 «registration token» | `failed`, пристрій вимикається (`disabled_reason=unregistered`), решта його черги переходить у `skipped` |
| FCM | 401 / `THIRD_PARTY_AUTH_ERROR`, 403, збій OAuth | `failed` + `logger.error` (конфігурація), пристрій не вимикається |
| FCM | 429 / `QUOTA_EXCEEDED`, 5xx, мережа | ретрай: +1 хв, +5, +30, +2 год, далі `failed`, з урахуванням `Retry-After` |
| APNs | 200 | `delivered` + `apns-id` |
| APNs | 410, `BadDeviceToken`, `DeviceTokenNotForTopic`, `Unregistered` | `failed` + вимкнення пристрою |
| APNs | 403, `InvalidProviderToken`, `ExpiredProviderToken`, `BadTopic`… | `failed` + `logger.error`, provider token скидається |
| APNs | 429, 5xx, мережа | ретрай; при мережевій помилці з'єднання перевідкривається |
| будь-який | 400 інше, 413 | `failed`, без ретраю |
| — | ключі не задано | `skipped` з `fcm_not_configured` / `apns_not_configured` |

Дедуплікація: `unique(notification, channel, device)` дає один рядок доставки на пристрій на подію, а захоплення `UPDATE … WHERE status='pending'` гарантує, що два тіки не відправлять той самий рядок двічі. Обидва механізми лишились як були.

## Матриця станів

Перевіряти на реальних пристроях: Release-збірка, `APNS_USE_SANDBOX=0`. Debug-збірка з Xcode отримує sandbox-токен, і для неї потрібен `APNS_USE_SANDBOX=1`.

| Стан | Очікування | iOS | Android |
|---|---|---|---|
| Foreground | банер за `setNotificationHandler`; тап → екран задачі; інбокс оновлюється через WS | ☐ | ☐ |
| Background | системне сповіщення, лише заголовок; тап → `/project/<pid>/tasks?open=<id>`; запис інбоксу стає прочитаним | ☐ | ☐ |
| Killed | сповіщення показується (Android — data-only high priority); тап на холодному старті → `getLastNotificationResponseAsync` → екран задачі | ☐ | ☐ |
| Інший workspace | `workspace_id` у data ≠ активний → `isForCurrentWorkspace` ігнорує тап (deep-link агент: аркуш «Відкрити в просторі B?») | ☐ | ☐ |
| Після відкликання доступу | учасника видалено з проєкту до відправки (тихі години, ретрай) → `skipped/access_revoked`, на пристрій нічого не йде | ☐ | ☐ |
| Деактивований акаунт | `is_active=False` → `skipped/recipient_inactive` | ☐ | ☐ |
| Вихід з акаунта | DELETE токена → наступні події не створюють рядків доставки | ☐ | ☐ |
| Інший акаунт на тому ж телефоні | upsert переносить токен; старі рядки першого акаунта → `skipped/device_reassigned` | ☐ | ☐ |
| Застосунок видалено | APNs 410 / FCM UNREGISTERED → пристрій вимкнено | ☐ | ☐ |
| Тихі години | рядок `pending` з `next_attempt_at` = кінець тихих годин; прочитане до того часу → `skipped/read_before_send` | ☐ | ☐ |
| Кнопки інвайту | категорія `project_invite` → «Прийняти»/«Відхилити» працюють (через `invite_id` у data) | ☐ | ☐ |

Перевірка на сервері: `DeliveryAttempt.objects.filter(channel='push_native').values('status','error_code')`.

## Кроки власника

1. **Firebase**: створити проєкт, Android-застосунок `app.flowi.mobile` і сервісний акаунт з роллю «Firebase Cloud Messaging API Admin», потім завантажити JSON. На VPS покласти його в `/etc/flowi/fcm-service-account.json` (0400, власник — користувач контейнера) і змонтувати read-only. У `.env`: `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/fcm.json`.
2. **Android-збірка**: потрібен `google-services.json` для `app.flowi.mobile` (`expo.android.googleServicesFile` в app.json + плагін gradle `com.google.gms.google-services`). Без нього `getDevicePushTokenAsync` на Android кидає помилку, і токен не реєструється. app.json і нативні файли — в зоні агента ідентичності/підпису.
3. **Apple**: Keys → новий ключ APNs (.p8), записати Key ID і Team ID. `.env`: `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID` (або `FLOWI_APPLE_TEAM_ID`), `APNS_TOPIC=app.flowi.mobile`. У профілі App ID увімкнути capability Push Notifications. `aps-environment` у `Flowi.entitlements` має бути `production` для Release/TestFlight.
4. Встановити залежності сервера (`h2` через `httpx[http2]`, уже в `requirements.lock.txt`) і перезібрати образ.
5. Пройти матрицю вище й заповнити галочки.

## Відомі обмеження

- `registration_decision` для заявника до входу йде нативно, якщо клієнт rc1 надіслав `push_kind`/`push_token`. Через Expo він іде лише для легасі-заявок (див. «Пуш рішення про реєстрацію»). На Android без `google-services.json` нативного токена немає, тож лишається тільки поллінг.
- `core/workspace_views.py::_notifications_capabilities` перелічує канали явно, тому `push_native` у `GET /workspace/` не з'явиться. Мобільному клієнту він не потрібен, бо клієнт завжди пробує нативну реєстрацію. Сам канал видно в `preferences.available_channels`.
- Один телефон зі старим (`com.casper3.*`, Expo) і новим застосунком одночасно отримає два пуші. Це два різні застосунки, і сервер не може їх зв'язати.
