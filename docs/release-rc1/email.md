# rc1 — пошта: Postfix-релей, DNS, протокол перевірки (S3-05)

Код: `flowi_server/settings.py` (блок Email), `core/invitation_mail.py`,
`core/invites.py::deliver_email_invite`, `core/team_views.py` (поля
`delivery_*`, ліміт повторів), `core/notifications/channels/email.py::email_configured`
(`EMAIL_NO_AUTH`), міграція `core/0031_invite_delivery_status`.
Шаблони: `flowi-server-app/ops/postfix/`. Тести: `core/test_rc1_invite_email.py`.

## 1. Схема

```
Django (flowi-api, venv на VPS) ──SMTP:25 plain, loopback──▶ Postfix (send-only)
      From: Flowi <noreply@flowi.com.ua>                       │ STARTTLS + SASL
                                                              ▼
                                                  smarthost:587 ──▶ одержувач
```

- Пароль smarthost-а живе лише в `/etc/postfix/sasl_passwd` (600, root), не в env Django.
- Django: `EMAIL_HOST=localhost`, `EMAIL_PORT=25`, `EMAIL_USE_TLS=False`,
  `EMAIL_NO_AUTH=True` (дефолти саме такі; для Postfix на хості з Docker —
  `EMAIL_HOST=host.docker.internal` + явний `EMAIL_NO_AUTH=True`).
- Старий прямий SMTP (EMAIL_HOST=smtp.gmail.com + EMAIL_USER) і далі працює,
  якщо env заданий: порт 587 → TLS за замовчуванням.
- **Увага:** без `EMAIL_HOST` у env сервер тепер СПРОБУЄ слати на
  localhost:25 (раніше пошта мовчки вимикалась). Postfix ставити ДО деплою
  rc1, інакше запрошення матимуть `delivery_status=failed` (видно адмінам,
  можна надіслати ще раз після налаштування).

## 2. Налаштування VPS (власник)

```bash
sudo apt-get install -y postfix libsasl2-modules ca-certificates   # тип: "No configuration"
sudo cp ops/postfix/main.cf.template /etc/postfix/main.cf           # замінити __SMARTHOST__, __MYHOSTNAME__
sudo cp ops/postfix/sender_canonical /etc/postfix/sender_canonical
sudo install -m 600 ops/postfix/sasl_passwd.template /etc/postfix/sasl_passwd   # вписати логін/пароль
sudo postmap /etc/postfix/sasl_passwd
sudo postfix check && sudo systemctl restart postfix
ss -ltnp | grep ':25'      # має бути лише 127.0.0.1:25
# env flowi-api: вміст ops/postfix/flowi-email.env.template, прибрати EMAIL_USER/EMAIL_PASSWORD
sudo systemctl restart flowi-api flowi-worker
```

Порт 25 назовні (ufw) — закритий; Postfix слухає лише loopback.

## 3. DNS (flowi.com.ua) — `ops/postfix/dns-records.txt`

| Запис | Значення |
|---|---|
| SPF `flowi.com.ua TXT` | `v=spf1 include:<smarthost> ip4:<VPS_IPv4> -all` |
| DKIM `<selector>._domainkey TXT` | ключ від провайдера smarthost-а (або OpenDKIM) |
| DMARC `_dmarc TXT` | `v=DMARC1; p=none; rua=mailto:dmarc@flowi.com.ua; adkim=s; aspf=r` → через 2 тижні чистих звітів `p=quarantine` |
| PTR | IP VPS → `mail.flowi.com.ua` (+ A назад) |

Перевірка: `dig +short TXT flowi.com.ua`, `dig +short TXT <selector>._domainkey.flowi.com.ua`,
`dig +short TXT _dmarc.flowi.com.ua`, `dig -x <VPS_IPv4>`.

## 4. Статус доставки запрошення

`ProjectInvite.delivery_status`: `sent` (SMTP прийняв), `failed` (+ `delivery_error`,
≤300 символів, клас + відповідь SMTP, без секретів), `skipped` (пошту не налаштовано),
`unknown` (легасі / посилання). Віддається в `pending[]` і `invite` для owner/manager,
веб показує «Лист не доставлено…» у «Очікують». «Надіслати ще раз» —
`POST /api/projects/{id}/invites/{invite_id}/resend/`: пауза 60 с (`429 resend_too_soon`),
максимум 5 листів на запрошення (`429 resend_limit`). Кожне надсилання — новий токен.
Примітка: `sent` = прийнято Postfix-ом; відмова далі по ланцюжку (bounce)
у статус не повертається — дивитись `journalctl -u postfix` / панель smarthost.

## 5. Протокол перевірки (нова + наявна адреса)

| # | Сценарій | Очікування |
|---|---|---|
| 1 | `echo test \| sendmail -f noreply@flowi.com.ua <власна адреса>` на VPS | лист у «Вхідних», `Authentication-Results: spf=pass dkim=pass dmarc=pass` |
| 2 | Запросити в проєкт **нову** адресу (акаунта немає) | 201, `delivery_status=sent`; лист від `Flowi <noreply@flowi.com.ua>`; посилання на `https://app.flowi.com.ua/invite?...` |
| 3 | Відкрити посилання → реєстрація з цим email | після входу запрошення «Прийняти/Відхилити», після прийняття — учасник |
| 4 | Запросити **наявну** адресу | лист + сповіщення в застосунку/push; прийняти з застосунку |
| 5 | Відхилити запрошення | статус `declined`, власник отримує сповіщення |
| 6 | Скасувати pending → відкрити старий лист | 410 `invite_expired`, reason `cancelled` |
| 7 | `expires_at` у минулому (staging, shell) → прийняти | 410, reason `expired` |
| 8 | Тимчасово `systemctl stop postfix` → запросити | `delivery_status=failed`, на вебі «Лист не доставлено»; запустити postfix, через 60 с «Надіслати ще раз» → `sent` |
| 9 | 6-те надсилання | 429 `resend_limit` |
| 10 | mail-tester.com | ≥ 9/10 |

Автотести: `.venv/bin/python manage.py test core.test_rc1_invite_email core.test_invites_pending`.
