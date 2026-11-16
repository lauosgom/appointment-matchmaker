# Testing

| Level | Where | What it covers | Run |
|---|---|---|---|
| Unit | `backend/tests/` (`test_config`, `test_mailer`, `test_manage`), `frontend/src/lib`, `frontend/src/services/mock.test.ts` | Pure logic: URL normalization, email building, the CLI, date and time-zone handling, the mock's business rules | `make test` |
| Integration | `backend/tests/` (the rest) | The real FastAPI app with a real database through HTTP: auth, users, specialists, slots, availability, assignments, corrections, settings, persistence, database constraints | `make test` |
| Integration (Postgres) | the same backend tests | Same suite against PostgreSQL | `make db-up`, then `make test-backend-pg` |
| End to end | `e2e/` (Playwright) | The built Docker image plus PostgreSQL in a browser: main workflow, search, business rules, roles and permissions, bad data, presentation, technical checks | `make test-e2e` |

`make test` runs the backend and frontend unit and integration tests in one command
(112 backend and 20 frontend tests at the time of writing). The end-to-end suite
needs Docker and starts its own stack, so it's a separate command.

The e2e suite follows the sections of the test plan, and it has found real bugs
(booking races, among others), which were fixed and covered by backend tests.
