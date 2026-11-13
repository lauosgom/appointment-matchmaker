# End-to-end tests

Playwright tests that run against the stack in [`../docker-compose.yaml`](../docker-compose.yaml):
PostgreSQL plus the app image (backend serving the built frontend). They follow
the test plan's sections: main workflow, search and availability, business rules,
access and permissions, data and exceptional situations, presentation, and
technical checks.

## Running

You need Docker (with Compose) and Node 20+.

```sh
cd e2e
npm ci
npx playwright install chromium   # first time only
npm test                          # or, from the repo root: make test-e2e
```

`npm test` does the following:

1. Builds the image and starts a **separate** Compose project
   (`appointment-matchmaker-e2e`) on port **18000**, with a fresh, empty database
   that gets the demo data. A stack you run yourself with `docker compose up` is
   not touched.
2. Runs the tests one at a time. They share one database, and some of them change
   global settings or restart containers.
3. Removes the project and its volume.

Open the HTML report with `npm run report`. Traces and screenshots of failed tests
are in `test-results/`.

| Variable | Default | Effect |
|---|---|---|
| `E2E_PORT` | `18000` | Port for the app under test |
| `E2E_MAIL_PORT` | `18025` | Port for the stack's Mailpit, where the tests read the emails the app sends |
| `E2E_KEEP` | unset | Keep the stack and its data after the run, and reuse it on the next run instead of starting fresh |
| `E2E_NO_BUILD` | unset | Don't rebuild the image (faster when only the tests changed) |
| `E2E_PERF_BUDGET_MS` | `1000` | Response-time budget for the performance test |

Examples:

```sh
npx playwright test tests/02-search-availability.spec.ts   # one file
npx playwright test -g "Scenario 6"                        # by title
npx playwright test --grep @critical                       # the critical scenarios
E2E_KEEP=1 E2E_NO_BUILD=1 npx playwright test --headed     # watch the browser
```

## How the tests work

- Each test creates its own specialist, department, area, slots and accounts
  (`makeWorld` in `support/fixtures.ts`). Tests don't depend on each other or on the
  demo data, except for the demo `admin` and `orientador` logins.
- Main flows go through the UI. Rules that must hold on the server (permissions,
  concurrent requests) are also checked with direct API calls.
- Emails (password-recovery links) are read from the stack's Mailpit through its
  API (`support/mail.ts`).
- Some situations can't be produced through the app: an appointment whose time has
  already passed, an expired lockout or recovery link, or a session ended on the server. For these,
  the tests change the database directly with `docker compose exec db psql`
  (`support/compose.ts`).

| File | Test plan section |
|---|---|
| `01-main-workflow.spec.ts` | 1. Scenarios 1–4 |
| `02-search-availability.spec.ts` | 2. Scenarios 5–7 |
| `03-admin-business-rules.spec.ts` | 3. Scenarios 8–10 |
| `04-access-permissions.spec.ts` | 4. Access and permissions |
| `05-data-exceptions.spec.ts` | 5. Data and exceptional situations |
| `06-presentation.spec.ts` | 6. Presentation (formats, time zone, phone screen) |
| `07-technical.spec.ts` | 7. Performance, concurrency, integrity, persistence, backup restore, security |

## Not automated

- **Sessions with real users** (section 6): whether counselors and specialists
  understand the search and can tell statuses apart without instructions.
- **Browsers other than Chromium**: add Firefox or WebKit projects in
  `playwright.config.ts` if needed.
- **A confirmation made in the next year** (`fixme`, skipped): this needs control
  over the server clock.
