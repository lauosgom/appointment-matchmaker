# Backend

FastAPI implementation of `/openapi.yaml`. In-memory store (nothing persists across restarts), bcrypt-hashed passwords, bearer-token sessions.

## Run

```sh
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

API is served under `/api` (matching the `servers.url` in openapi.yaml). Interactive docs at `/docs`.

## Demo users

Seeded on startup (see `app/seed.py`):

| username | password | role |
|---|---|---|
| admin | admin123 | admin |
| orientador | orientador123 | orientador |
| especialista | especialista123 | especialista |

## Test

```sh
uv run pytest
```

## Layout

- `app/models.py` — Pydantic request/response schemas.
- `app/store.py` — in-memory tables plus all business rules (conflict checks, role/ownership checks, confirmation codes, etc.), raising `HTTPException` with the Spanish messages the frontend displays as-is.
- `app/seed.py` — demo data loaded into a fresh `Store`.
- `app/security.py` — password hashing and bearer-token generation (pure functions, no FastAPI/store dependency).
- `app/auth.py` — `get_current_user` / `require_roles` FastAPI dependencies built on top of the store's session table.
- `app/routers/` — one module per resource group; thin HTTP layer over `Store` methods.
