# Megatechtrackers Database Schema

The **single source of truth** for the `megatechtrackers` PostgreSQL database schema lives in the project root: `database/schema.sql`.

## Schema file (single source of truth)

- **`database/schema.sql`** – Complete PostgreSQL schema (tables, indexes, functions, triggers, seed data). Docker mounts this as the Postgres init script; parser, consumer, alarm, ops, and SMS gateway services all use this same database. There are no other schema copies in parser_nodes or consumer_node.

## Other SQL files in the repo

These are **not** schema sources; they have specific roles:

| File | Purpose |
|------|---------|
| `database/migrations/README.md` | States that no migrations are used; schema.sql only. Do not add migration SQL files. |
| `ops_node/migration/001_schema.sql` | Legacy Operations Service schema snapshot (superseded by `database/schema.sql`) |
| `ops_node/migration/migrate_sql_server_to_cfg.sql` | One-off migration from SQL Server |
| `alarm_node/test-alarm.sql` | Test data for alarms |
| `tools/mock_sms_server/setup_mock_contacts.sql` | Mock/test contact setup |
| `docker/mariadb/*.sql` | MariaDB (Frappe) init scripts, not PostgreSQL |

## Usage

All services should run this schema on startup. The schema uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` so it's safe to run multiple times (idempotent).

### Python Services
```python
import asyncpg
from pathlib import Path

async def ensure_schema(pool: asyncpg.Pool):
    schema_path = Path(__file__).parent.parent / "database" / "schema.sql"
    schema_sql = schema_path.read_text()
    async with pool.acquire() as conn:
        await conn.execute(schema_sql)
```

### TypeScript Services
```typescript
import * as fs from 'fs';
import * as path from 'path';

async function ensureSchema(pool: Pool) {
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
}
```

## Schema Sections

| Section | Description |
|---------|-------------|
| **Extensions** | PostGIS, TimescaleDB, pg_stat_statements |
| **Tracking Tables** | trackdata, alarms, events, laststatus, unit_io_mapping, location_reference |
| **Command System** | device_config, unit, unit_config, command_outbox/sent/inbox/history |
| **Alarm System** | contacts, history, dlq, dedup, templates, modems, channel_config |
| **RabbitMQ Dedup** | processed_message_ids |
| **Functions** | update_updated_at, cleanup_old_command_history, notify_alarm_created |

## Services Using This Schema

| Service | Tables Used |
|---------|-------------|
| **Parser Service** | trackdata, alarms, events, unit_io_mapping, command_outbox (gprs), command_sent |
| **Consumer Service** | trackdata, alarms, events, laststatus, processed_message_ids |
| **Alarm Service** | alarms, alarms_* tables |
| **Operations Service** | device_config, unit, unit_config, command_* tables |
| **SMS Gateway Service** | command_outbox (sms), command_sent, command_inbox, alarms_sms_modems |

## Database Connection

All services connect to the same database:

```
postgresql://postgres:postgres@localhost:5432/tracking_db
```

(Docker and configs use the database name `tracking_db`.)

## Making Changes

1. Edit `database/schema.sql` directly
2. Use `IF NOT EXISTS` for new tables
3. **Table and view names**: Use lowercase only (e.g. `trackdata`, `laststatus`, `metric_events`). Do not use quoted mixed-case identifiers in SQL.
4. **Add new columns in the CREATE TABLE definition only** — project not launched, so do not use `ALTER TABLE ADD COLUMN` or idempotent DO blocks that add columns
5. Use `ON CONFLICT DO NOTHING` for seed data
6. Test by running schema on fresh database
7. Commit changes to version control
