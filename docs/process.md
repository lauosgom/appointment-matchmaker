# Process

How work is done in this project. There is no agent team: one AI coding agent
(Claude Code) works with one developer, who sets the goals and reviews the result.
The agent's rules are in [AGENTS.md](../AGENTS.md).

## Workflow

1. **Spec first.** The behavior is defined in [spec.md](spec.md)
   ([Spanish](spec_spa.md)). The API contract is [openapi.yaml](../openapi.yaml).
   The frontend was built first against an in-memory mock; the backend was then
   written to match the contract.
2. **Small steps, committed often.** Each change is one commit with a message that
   says what changed and why.
3. **Tests with every change.** Backend behavior gets a test in `backend/tests/`.
   Bugs the end-to-end suite finds are fixed and covered by a test. See
   [testing.md](testing.md).
4. **Run before committing:** `make test`. Run `make test-e2e` for changes that
   touch the booking flow, the database or the Docker image.
5. **Deploy** from the repo root with `./deploy/gcp/deploy.sh`
   (see [deployment.md](deployment.md)).

## Conventions

- Backend dependencies are managed with `uv` (`uv sync`, `uv add <package>`).
- The frontend calls the backend only through `frontend/src/services/`
  (see [frontend/AGENTS.md](../frontend/AGENTS.md)).
- Dates are stored in UTC and shown in Colombia time.
- Secrets never go in git: `.env.local` and `deploy/gcp/config.env` are ignored.
