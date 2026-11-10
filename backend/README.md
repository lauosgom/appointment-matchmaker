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

```sh
DATABASE_URL=sqlite:////var/data/appointments.db uv run uvicorn app.main:app
```

The schema only uses portable types and queries (no SQLite-specific SQL), so other
databases need just their driver and a URL. For example, PostgreSQL:

```sh
uv add "psycopg[binary]"
DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/appointments uv run uvicorn app.main:app
```

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

Each test gets a fresh in-memory SQLite database. To run the suite against another
database (it drops/creates all tables, so use a throwaway one):

```sh
TEST_DATABASE_URL=postgresql+psycopg://postgres:pw@localhost:5432/test \
  uv run --with "psycopg[binary]" python -m pytest
```

## Layout

- `app/models.py` — Pydantic request/response schemas.
- `app/config.py` — environment-variable settings (`DATABASE_URL`, `SEED_DEMO_DATA`).
- `app/db.py` — engine/session setup; the only backend-specific code (SQLite pragmas, pooling).
- `app/tables.py` — SQLAlchemy ORM tables (portable types; datetimes stored as UTC).
- `app/store.py` — all business rules (conflict checks, role/ownership checks, confirmation codes, etc.) over a SQLAlchemy session, raising `HTTPException` with the Spanish messages the frontend displays as-is. One transaction per request via `get_store`.
- `app/seed.py` — demo data loaded into an empty database.
- `app/security.py` — password hashing and bearer-token generation (pure functions, no FastAPI/store dependency).
- `app/auth.py` — `get_current_user` / `require_roles` FastAPI dependencies built on top of the `sessions` table.
- `app/routers/` — one module per resource group; thin HTTP layer over `Store` methods.
