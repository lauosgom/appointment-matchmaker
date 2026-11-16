# Project guide for agents

Appointment Matchmaker: a web app where counselors at a support line book
appointments with specialists. Stack: FastAPI + SQLAlchemy backend, React frontend,
PostgreSQL (SQLite for quick local runs), Docker, Google Cloud Run. Start with
[README.md](README.md) for what the app does.

## Rules

- For the backend, use `uv` for dependency management:
  - `uv sync`
  - `uv add <PACKAGE-NAME>`
  - `uv run python <PYTHON-FILE>`
- Commit code to git regularly.
- Run `make test` before committing. `make help` lists every command.

## Docs

- [docs/process.md](docs/process.md): how work is done, workflow and conventions.
  This project has no agent team: one agent works with one developer.
- [docs/spec.md](docs/spec.md) ([Spanish](docs/spec_spa.md)): what the app must do.
- [openapi.yaml](openapi.yaml): the API contract between frontend and backend.
- [docs/testing.md](docs/testing.md): the test levels and how to run them.
- [e2e/README.md](e2e/README.md): the end-to-end suite.
- [docs/deployment.md](docs/deployment.md) and
  [deploy/gcp/README.md](deploy/gcp/README.md): deploying to Cloud Run.
- [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md)
  and [frontend/AGENTS.md](frontend/AGENTS.md): per-part details and rules.
