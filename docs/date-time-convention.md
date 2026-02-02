# Date/Time Convention

## Rule: UTC 0 Everywhere, Local Only for User Input/Output

- **Backend & frontend internally**: Use UTC (timezone 0) everywhere — storage, APIs, internal logic, comparisons, logging.
- **User input**: User enters local time (or working timezone). Frontend converts to UTC before sending to API.
- **User output**: Emails, SMS, UI labels, dashboards — show times in user/working/display timezone. Never show raw UTC to end users except in technical contexts.
- **Server / container timezone**: You can set it to any value (e.g. `TZ=Asia/Karachi` for logs). The app must not rely on it for datetime logic: store and compute in UTC; use explicit UTC in code and DB session. All timestamp columns use `TIMESTAMPTZ`; node-pg and other drivers return timezone-aware or UTC-normalized values.

### Summary

| Where | Use |
|-------|-----|
| PostgreSQL | UTC (session + default); columns use `TIMESTAMPTZ`; bind naive UTC or timezone-aware UTC. |
| API request/response | UTC: send/receive ISO strings with `Z` (e.g. `2026-02-01T12:00:00Z`). |
| Backend logic | `datetime.now(timezone.utc)`, parsed datetimes normalized to UTC. |
| Frontend display | `formatDate`, `toLocaleString(..., { timeZone })`, working/display timezone. |
| Frontend → API | Convert local/working time to UTC (e.g. `timeLocalToUTC`, `formatDateTimeForApiUTC`). |
| Emails / SMS | Use **Email Display Timezone** (alarm_node) so recipient sees local time. |

---

## Time-of-Day (HH:mm) Conversion

For time-only fields (IO mapping start/end, quiet hours):
- **Save**: `timeLocalToUTC(localTime)` – convert browser local to UTC before API
- **Load**: `timeUTCToLocal(utcTime)` – convert UTC from API to local for display

*Note: Existing records may have been stored in local time. Re-save to convert to UTC.*

---

## Date-Only Fields (YYYY-MM-DD)

For date-only fields (e.g. `package_end_date`, subscription expiry):
- **Storage**: Store as UTC midnight (`TIMESTAMPTZ` at `YYYY-MM-DD 00:00:00 UTC`). Backend uses `TIMESTAMPTZ`, session `timezone=UTC`.
- **Display**: Use `formatDateOnly(dateString, timezone?)` – respects working timezone when set
- **Input**: Date picker returns `YYYY-MM-DD`. Send as-is to API; backend stores as UTC midnight
- **Load into input**: `new Date(value).toISOString().split('T')[0]` for UTC-stored timestamps

---

## Date-Range (e.g. Safety Alarms)

When the user picks a **date range** (start/end date only), convert local calendar boundaries to UTC before sending:
- Start = local midnight of start date → `formatDateTimeForApiUTC(startLocal)`
- End = local end-of-day of end date → `formatDateTimeForApiUTC(endLocal, true)`
- Fleet Monitor Safety tab uses `localDateRangeToUTC(startDateStr, endDateStr)` for this.

---

## Working Timezone (managing devices in another region)

When you're in Pakistan but managing US devices (or vice versa), use the **Time** dropdown:
- **Ops frontend**: In the nav bar (persists in localStorage `ops_working_timezone`)
- **Alarm config**: In the header
- **Alarm dashboard**: In the main header (shares `alarm_working_timezone` with config)
- **Fleet Monitor**: In the header (persists in localStorage `fleet_working_timezone`)

Select the device region (e.g. US Eastern). All time displays and time inputs will use that timezone. Stored values remain UTC.

---

## External Systems & Deployment

| System | Expectation | Our usage |
|--------|-------------|-----------|
| **PostgreSQL** | UTC | Session + DB default `timezone = 'UTC'`; all pools set it. Tables use `TIMESTAMPTZ`; stored and returned in UTC. |
| **Teltonika GPS** | UTC (Unix epoch) | Codec uses epoch → UTC. ✓ |
| **Camera CMS** | UTC | **Configure the camera CMS server to UTC (timezone 0).** We send `begintime`/`endtime` as `YYYY-MM-DD HH:MM:SS` in UTC; if the CMS uses another TZ, it will misinterpret the range. Video list by date: Fleet Monitor sends year/month/day as the user's chosen calendar date; CMS (UTC) returns that calendar day in UTC. |
| **RabbitMQ** | N/A | Payload uses UTC ISO strings (e.g. `2026-02-01T12:00:00Z`). ✓ |
| **RUT200/SMS** | N/A | `received_at` uses `datetime.now(timezone.utc)`. ✓ |

**PostgreSQL:** If the DB was previously set to a non-UTC timezone (e.g. Asia/Karachi), existing rows may store local time. New rows are UTC. Document or migrate the cutover.

---

## Per-Project Summary

| Project | Storage/API | User I/O |
|---------|-------------|----------|
| PostgreSQL | UTC (session + default) | — |
| alarm_node | UTC; quiet hours UTC | Local ↔ UTC (working TZ, email display TZ) |
| consumer_node, ops_node backend, parser_nodes, sms_gateway, monitoring, access_control | UTC (`timezone.utc`, ISO with Z) | — |
| ops_node frontend, alarm UI, fleet-monitor client | API = UTC | formatDate/Time, timeLocalToUTC/timeUTCToLocal, formatDateTimeForApiUTC |
| web_app_node, mobile_app_node | — | toLocaleString for display only |

---

## JavaScript/TypeScript Helpers

### Fleet Monitor (client)
- `toLocalDatetimeLocalValue(date)` – Format for `datetime-local` input
- `formatDateTimeForApiUTC(date, isEnd)` – Format as UTC string for API (CMS is UTC 0)
- `getCurrentDateUTC()` – Current date in UTC (for CMS video playback URL fallback)
- `formatDateTime(isoString, timezone?)` – Display; uses `getWorkingTimezone()` when timezone omitted
- `formatDateValue(dateValue, timezone?)` – Display; uses working timezone when omitted
- `localDateRangeToUTC(startDateStr, endDateStr)` – Convert date-only range (local) to UTC strings for Safety/Alarms API

### Ops Node (frontend)
- `timeLocalToUTC()`, `timeUTCToLocal()` – For time-of-day fields (IO mapping)
- `formatDate()`, `formatDateTime()`, `formatFullDateTime()` – Accept optional `timezone`; use `useWorkingTimezone()` in components

### Alarm Node
- Quiet hours: frontend converts local↔UTC; backend stores/compares UTC
- `formatDate()`, `formatDateOnly()` in shared utils – Use `getWorkingTimezone()` (alarm_working_timezone)
- `utcDateToLocalYYYYMMDD(isoString, timezone?)` in shared utils – Returns `YYYY-MM-DD` in local/working TZ for loading date-only fields (e.g. package_end_date) into `<input type="date">`; use when displaying UTC-stored dates so the user sees the correct calendar day
- **Email templates**: Configure **Email Display Timezone** in the Alarm Config UI (Email Settings tab). Stored in `alarms_channel_config` (`display_timezone` for `channel_type=email`). Fallback: env `EMAIL_DISPLAY_TIMEZONE`, then UTC.

---

## UTC Audit Checklist (for reviews / CI)

Use this list when auditing **"UTC 0 everywhere, local only for user input/output"**. Check each category.

### 1. Python: wall-clock time

- [ ] **No bare `datetime.now()`** – Every use must be `datetime.now(timezone.utc)` or equivalent.
- [ ] **Parsed datetimes** – Any `fromisoformat()`, `strptime()`, or `parser.parse()` must end up UTC: if result is naive, call `.replace(tzinfo=timezone.utc)` (or convert then normalize to UTC).
- [ ] **Epochs** – Use `datetime.fromtimestamp(ts, tz=timezone.utc)` (or equivalent), not `datetime.fromtimestamp(ts)` alone.

### 2. PostgreSQL: session + binding

- [ ] **Session timezone** – Every code path that opens a DB connection sets session timezone to UTC (`SET timezone = 'UTC'` or `server_settings["timezone"] = "UTC"`). Applied in: ops_node backend, alarm_node, parser_nodes/teltonika, consumer_node, sms_gateway_node, parser_nodes/camera db_client.
- [ ] **Binding datetimes** – For `TIMESTAMPTZ` columns you can bind **naive UTC** or **timezone-aware UTC**; session `timezone=UTC` is set by all pools. Legacy helpers `_to_naive_utc` / `to_naive_utc` remain valid. Used in: consumer_node models, message_deduplicator; parser_nodes teltonika/camera models and db_client; ops_node commands + main; sms_gateway_node modem_pool + sms_service; ops_node migration.
- [ ] **Node (pg)** – With `TIMESTAMPTZ`, node-pg returns `Date` objects in UTC; no type parser needed. Session `timezone = 'UTC'` is set in alarm_node and any other Node app using `pg`.

### 3. API responses (backend → frontend)

- [ ] **Datetime in JSON** – Serialize as UTC with `Z` (e.g. `2026-02-01T12:00:00Z`) so clients interpret as UTC. In ops_node backend, Pydantic schemas (command, device, unit, io_mapping) use `json_encoders = {datetime: serialize_datetime_utc}`.
- [ ] **Never** return naive ISO without `Z` for datetime fields; clients may treat it as local.

### 4. Frontend: sending dates/times to API

- [ ] **Time-of-day (HH:mm)** – Use `timeLocalToUTC(...)` before sending (e.g. IO mapping start/end, quiet hours). Load with `timeUTCToLocal(...)`.
- [ ] **Date-only** – Date picker `YYYY-MM-DD` sent as-is; backend stores as UTC midnight. Loading into `<input type="date">` use `utcDateToLocalYYYYMMDD(...)` when value is UTC.
- [ ] **Date-range** – Use `localDateRangeToUTC(...)` or `formatDateTimeForApiUTC(...)` so API receives UTC boundaries.
- [ ] **Never** send `toLocaleString()` / `toLocaleDateString()` output as API payload; only use for display.

### 5. Frontend: display only (user output)

- [ ] **Display** – Use `formatDate`, `formatDateTime`, `toLocaleString(..., { timeZone: tz })`, or working-timezone helpers so user sees local/working time.
- [ ] **Alarm emails/SMS** – Use **Email Display Timezone** (alarm_node: `display_timezone` from config); same for SMS default template.

### 6. External input (device / API)

- [ ] **RUT200 inbox date** – `sms_gateway_node/clients/rut200_client.py`: parsed device date without Z treated as UTC (naive → `.replace(tzinfo=timezone.utc)`).
- [ ] **Camera CMS** – Document/config: CMS server should be UTC; we send UTC. Parsed timestamps normalized to UTC in camera parser.

### 7. One-off / tools

- [ ] **Mock servers, scripts** – Prefer `datetime.now(timezone.utc)` and ISO with Z for any timestamps they emit or store.
