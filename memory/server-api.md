# Server API

Django + DRF + Channels (Daphne ASGI). Деплой:
- API: `https://api.flowi.casperdev.site/api/`
- WS:  `wss://api.flowi.casperdev.site/ws/`

Локальний запуск: `cd flowi-server-app && .venv/bin/daphne -p 8000 flowi_server.asgi:application`.
Admin: `http://localhost:8000/admin` (admin/admin у dev).

## REST endpoints

### Devices
- `POST /devices/register/` → `{device_id?}` → `{id, created_at}`.

### Groups
- `POST /groups/create/` `{device_id, name?}` → створює групу + дефолтну секцію `shopping` (`Покупки`). Повертає `GroupSerializer.data` з `secret`.
- `POST /groups/join/` `{device_id, secret}` → перевіряє rate-limit (10 fail/h/IP), TTL secret (24h), додає `GroupMember`. Broadcast `member_joined`.
- `GET /groups/{id}/?device_id=` → перевіряє membership; якщо член і secret протермінований — авто-ротує. Не-членам стрипає `secret`.
- `POST /groups/{id}/leave/` `{device_id}` → видаляє `GroupMember`.
- `POST /groups/{id}/refresh-secret/` `{device_id}` → перевіряє membership → ротує secret → broadcast `secret_rotated`.
- `POST /groups/{id}/notify/` `{device_id, section_id?, section_name?, message?}` → перевіряє membership → broadcast `notification` подія.

### Sections / Items
- `GET /groups/{id}/sections/` → список секцій (без membership check ❗).
- `POST /groups/{id}/sections/` `{type, name}` → створює секцію → broadcast `section_created`.
- `GET /sections/{id}/items/` → всі items (без membership check ❗).
- `POST /sections/{id}/items/` `{device_id, local_id, data, deleted?}` → upsert → broadcast `item_updated`.

### Sync
- `POST /sync/` `{device_id, group_id, since?, items: [...]}` → застосовує incoming, повертає `{items: [...], server_time}` зі змінами інших пристроїв після `since`.

## WebSocket protocol

URL: `wss://.../ws/group/{group_id}/?device_id=`

### Server → Client події

```jsonc
// після `POST /sections/{id}/items/` або `POST /sync/`
{ "type": "item_updated", "section_id": "uuid", "item": { ...SharedItem... } }

// після `POST /groups/{id}/sections/`
{ "type": "section_created", "section": { ... } }

// після auto-rotate або refresh-secret
{ "type": "secret_rotated" }

// після join
{ "type": "member_joined", "device_id": "uuid" }

// після `POST /groups/{id}/notify/`
{
  "type": "notification",
  "from_device_id": "uuid",
  "group_id": "uuid",
  "group_name": "...",
  "section_id": "uuid|null",
  "section_name": "...",
  "message": "...",
  "timestamp": "ISO"
}
```

### Client → Server (legacy)

`GroupConsumer.receive()` приймає payload і broadcast-ить далі. **Має бути видалено** (див. S-WS-2 у QA-звіті).

## Моделі

```
Device(id: UUID, created_at)
Group(id: UUID, name, secret, secret_rotated_at, members: M2M Device)
GroupMember(device, group, joined_at)  -- through-модель
SharedSection(id: UUID, group, type, name)  -- type: shopping|tasks|notes|custom
SharedItem(id: UUID, section, local_id, device, data: JSONField, updated_at, deleted)
  -- unique_together(section, local_id)
```

## Membership pattern

Усі mutator-views (включно з GET для items/sections) починаються з:

```python
def post(self, request, group_id):
    device_id = request.data.get('device_id')  # or .query_params.get(...)
    group, err = _assert_member(device_id, group_id)
    if err: return err
    ...
```

Для resource-id, де group визначається через ланцюг (наприклад `section_id`),
helper `_resolve` у `SectionDetailView` / `ItemListCreateView` робить це
двома кроками: спочатку завантажує об’єкт, потім перевіряє членство.

Не передавати `device_id` у новий endpoint = автоматично дозволити стороннім
клієнтам цей endpoint. Завжди передавати.

## WebSocket

`GroupConsumer.connect()` парсить `device_id` з `scope['query_string']` через
`parse_qs`, перевіряє membership через `database_sync_to_async(_is_member)`,
`close(4403)` для не-членів. `receive()` no-op — клієнт ніколи не пише через
WS, лише отримує події.

## Rate limits (cache-based)

- `notify_{group_id}_{device_id}` — 10 s
- `rotate_{group_id}` — 60 s
- `sync_{ip}`, `create_{ip}` — 120 запитів / 60 с
- `join_fail_{ip}` — 10 failures / 1 год

## Status

Сервер пройшов security-аудит у session 6 (2026-06-02). Усі **Critical**
закрито. Відкритий High-залишок — у `docs/QA_SECURITY_REVIEW.md`
(headline: AsyncStorage без шифрування на клієнті, WS rate limit).
