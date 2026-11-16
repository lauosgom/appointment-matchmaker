# Backend

FastAPI implementation of `/openapi.yaml`. Data is persisted with SQLAlchemy (SQLite by default), bcrypt-hashed passwords, bearer-token sessions stored in the database.

## Run

```sh
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Tables are created on startup if they don't exist.

## Database

Configured with environment variables:

| variable | default | meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///<backend>/appointments.db` | any [SQLAlchemy URL](https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls) |
| `SEED_DEMO_DATA` | `true` | load the demo users/catalogs/slots below into an **empty** database on startup |
| `APP_BASE_URL` | `http://localhost:8000` | public address of the app, used to build links in emails (never taken from the request's `Host` header) |
| `SMTP_HOST` | unset | SMTP server for password-recovery emails; unset → nothing is sent and a warning is logged |
| `SMTP_PORT` | `587` / `465` / `25` | depends on `SMTP_SECURITY` |
| `SMTP_SECURITY` | `starttls` | `starttls`, `ssl` or `none` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | unset | SMTP login, if needed |
| `MAIL_FROM` | `Citas con especialistas <no-reply@localhost>` | sender address |
| `MAIL_SEND_INLINE` | `false` | send emails before answering instead of in the background (needed on Cloud Run); reset requests then take at least 2 s, whether or not the email exists |

## Telemetry (OpenTelemetry)

HTTP requests are traced (SQL queries are not: the SQLAlchemy instrumentation does not yet support SQLAlchemy 2.1) and exported over OTLP/HTTP when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set; without it nothing is exported
(`OTEL_SDK_DISABLED=true` forces it off). Every span's resource carries:

| attribute | source | default |
|---|---|---|
| `service.name` | `OTEL_SERVICE_NAME`, else Cloud Run's `K_SERVICE` | `appointment-matchmaker` |
| `deployment.environment.name` | `APP_ENV` (set by the deploy: `dev`, `production`) | `local` |
| `service.version` | `APP_VERSION` (the image tag, baked in at build time; promotion to production keeps it) | `dev` |

`/api/health` is not traced. Standard `OTEL_*` variables (headers, sampler…) also work.

To read emails locally, run a mail catcher such as Mailpit
(`docker run -p 8025:8025 -p 1025:1025 axllent/mailpit:v1.27`) and start the API
with `SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURITY=none`.

```sh
DATABASE_URL=sqlite:////var/data/appointments.db uv run uvicorn app.main:app
```

PostgreSQL is supported out of the box (the `psycopg` driver is a dependency).
`postgresql://` and `postgres://` URLs are routed to psycopg automatically:

```sh
make db-up   # from the repo root: Postgres 16 in Docker on localhost:5432
DATABASE_URL=postgresql://appointment:appointment@localhost:5432/appointment uv run uvicorn app.main:app
```

The schema only uses portable types and queries (no SQLite-specific SQL), so other
databases need just their driver and a URL.

To start over with SQLite, stop the server and delete `appointments.db`.

API is served under `/api` (matching the `servers.url` in openapi.yaml). Interactive docs at `/docs`.

## Demo users

Seeded into an empty database on startup unless `SEED_DEMO_DATA=false` (see `app/seed.py`). Change these passwords, or disable seeding, for any real deployment:

| username | password | role |
|---|---|---|
| admin | admin123 | admin |
| orientador | orientador123 | orientador |
| especialista | especialista123 | especialista |

## Test

```sh
uv run pytest
```

Each test gets a fresh in-memory SQLite database. To run the suite against PostgreSQL
(it drops/creates all tables, so use a throwaway database, not the app's own):

```sh
make test-backend-pg   # from the repo root; creates appointment_test in the db-up container
# or, against any server:
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/test uv run pytest
```

## Layout

- `app/models.py` — Pydantic request/response schemas.
- `app/config.py` — environment-variable settings (database, demo data, `APP_BASE_URL`, SMTP); maps plain Postgres URLs to psycopg.
- `app/db.py` — engine/session setup; the only backend-specific code (SQLite pragmas, pooling). On startup it also upgrades databases from earlier versions (missing columns and indexes).
- `app/tables.py` — SQLAlchemy ORM tables (portable types; datetimes stored as UTC).
- `app/store.py` — all business rules (conflict checks, role/ownership checks, confirmation codes, etc.) over a SQLAlchemy session, raising `HTTPException` with the Spanish messages the frontend displays as-is. One transaction per request via `get_store`.
- `app/seed.py` — demo data loaded into an empty database.
- `app/security.py` — password hashing and bearer-token generation (pure functions, no FastAPI/store dependency).
- `app/manage.py` — admin commands, e.g. `uv run python -m app.manage create-admin …` to create the first administrator in a database without demo data.
- `app/mailer.py` — outgoing email over SMTP (password-recovery links), sent in the background after the response.
- `app/auth.py` — `get_current_user` / `require_roles` FastAPI dependencies built on top of the `sessions` table.
- `app/routers/` — one module per resource group; thin HTTP layer over `Store` methods.
