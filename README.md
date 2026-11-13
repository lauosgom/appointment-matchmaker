# Appointment Matchmaker

A web app for matching appointments with specialists. It has two parts:

- `backend/`: a FastAPI API (see [backend/README.md](backend/README.md))
- `frontend/`: a React/TanStack app (see [frontend/README.md](frontend/README.md))

The API contract is in [openapi.yaml](openapi.yaml).

## How the application works

Counselors at a support line use the app to book follow-up appointments with
specialists. They find an open time slot, hold it for a person, and confirm it to
get an appointment code. Administrators manage the specialists, their availability
and the user accounts. Specialists see their own schedule. The full functional
scope is in [docs/spec.md](docs/spec.md) (Spanish version:
[docs/spec_spa.md](docs/spec_spa.md)).

The interface is in Spanish. All dates and times are shown in Colombia time (UTC−5).

### Roles

Each user has one of three roles. After logging in, users land on a menu that
shows only what their role can do.

| Role | Can do | Pages |
|---|---|---|
| **Admin** (`admin`) | Everything a counselor can, plus: manage users, specialists, departments and areas, and availability; set the appointment length and the yearly code letters; confirm or discard any pending assignment; cancel confirmed appointments; review correction requests | Search availability, Assignments and appointments, Availability, Specialists, Departments and areas, Users, Settings |
| **Counselor** (`orientador`) | Search availability, start assignments, confirm or discard the ones they started, see all confirmed appointments, ask an admin to correct a confirmed appointment | Search availability, Assignments and appointments |
| **Specialist** (`especialista`) | See their own confirmed appointments: today, upcoming and past. Read only | My schedule |

### Main concepts

- **Specialist**: a professional who takes appointments. Each one has a code and
  belongs to one or more **departments** and **areas of intervention**.
- **Slot**: a time when a specialist is available, loaded by an admin. Every slot
  lasts the configured appointment length. Admins can deactivate a slot.
- **Assignment**: a booking of one slot for one person, recorded with the person's
  name and/or mobile number. The reason for the call is never stored.

### The booking flow

1. **Search.** A counselor searches for open slots by specialist, department or
   area, either for the coming days or for a specific date. Only active, future
   slots of active specialists that are not already taken are shown.
2. **Start an assignment.** The counselor picks a slot, enters the person's name
   and/or mobile number, reviews the details, and saves. The assignment is now
   **pending** and the slot is held, so nobody else can book it.
3. **Confirm or discard.** The counselor who started it, or an admin, then either:
   - **confirms** it. It becomes a **confirmed** appointment and gets a unique code
     such as `AB00042`: the two letters the admin set for the current year,
     followed by a running number.
   - **discards** it, giving a reason. The slot becomes free again.
4. **After confirmation.** Counselors can't change a confirmed appointment. They can
   send a **correction request** to the admins. Only an admin can **cancel** a
   confirmed appointment (giving a reason, and only before it starts), which frees
   the slot. An admin can start a new assignment from a cancelled one with the
   person's details filled in.

```mermaid
stateDiagram-v2
    [*] --> Pending: counselor starts assignment
    Pending --> Confirmed: confirm (gets a code)
    Pending --> Discarded: discard (with reason)
    Confirmed --> Cancelled: admin cancels (with reason)
    Confirmed --> Past: start time passes
```

Discarded and cancelled assignments are kept, with who closed them, when and why,
as an operational history. On the assignments page, counselors see the
assignments they started (newest first) and all confirmed appointments. Admins see
everything and can filter by specialist and status.

### Accounts and sign-in

- Users log in with a username and password. Admins create accounts, choose the
  role and set the initial password. A deactivated account can't log in, but its
  past actions still show who did them.
- After 3 failed login attempts, the account is locked for 5 minutes.
- Users who forget their password can request a reset from the login page. They
  get an email with a link that works once and expires after 60 minutes. Setting
  a new password signs them out everywhere.
- Logging out ends the session on the server too.

### Architecture

```
Browser ──► FastAPI (one container, port 8000)
              ├── /api/*   REST API (openapi.yaml), bearer-token auth
              ├── /docs    interactive API docs
              └── /*       built frontend (single-page app)
                     │
                     ▼
               SQLAlchemy ──► SQLite (default) or another database
```

- **Frontend**: React with TanStack Router and Query, Tailwind and shadcn/ui. All
  API calls go through one services layer (`frontend/src/services/`). A built-in
  in-memory mock lets the frontend run without the backend (`VITE_USE_MOCK=true`).
- **Backend**: FastAPI. Data is stored with SQLAlchemy, passwords are hashed with
  bcrypt, and login sessions are kept in the database. Tables are created on
  startup, and demo data is loaded into an empty database unless
  `SEED_DEMO_DATA=false`.
- **In Docker**: the frontend is built into static files, and the backend serves
  them along with the API. Any page URL (for example `/agenda`) returns the app,
  which then shows the right screen.

## Running with Docker Compose

The quickest way to run the whole stack is `docker-compose.yaml`. It starts two
services: `db` (PostgreSQL 16) and `app` (built from the `Dockerfile`). The app
waits until the database is healthy before it starts.

```sh
docker compose up -d --build   # build and start: http://localhost:8000
docker compose logs -f app     # follow the app logs
docker compose down            # stop (data is kept in the pgdata volume)
docker compose down -v         # stop and delete the database
```

You can override these settings with environment variables or a `.env` file next
to `docker-compose.yaml`:

| Variable | Default | Meaning |
|---|---|---|
| `APP_PORT` | `8000` | Port on your machine for the app |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `appointment` | Database credentials and name |
| `SEED_DEMO_DATA` | `true` | Load the demo data into an empty database |
| `MAIL_UI_PORT` | `8025` | Port on your machine for Mailpit, where you read the emails the app sends |
| `APP_BASE_URL` | `http://localhost:<APP_PORT>` | Address users open the app at, used for links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM` | Mailpit | Mail server for outgoing email (see the Configuration section below) |

By default, emails such as password-recovery links go to **Mailpit**, a mail catcher
that keeps them instead of delivering them. Read them at http://localhost:8025. To
deliver real email, set the `SMTP_*` variables to your mail provider.

The database port isn't published to your machine. To open `psql`, run
`docker compose exec db psql -U appointment -d appointment`.

## Running with Docker

The `Dockerfile` builds the frontend with Node, then builds a Python image that runs
the backend. The backend also serves the frontend, so a single container runs the
whole app on one port.

You need [Docker](https://docs.docker.com/get-docker/) installed.

### Build the image

From the repository root:

```sh
docker build -t appointment-matchmaker .
```

Or use the Makefile shortcut:

```sh
make docker-build
```

### Run the container

```sh
docker run -d --name appointment-matchmaker \
  -p 8000:8000 \
  -v appointments-data:/data \
  appointment-matchmaker
```

Then open:

- App: http://localhost:8000
- API docs: http://localhost:8000/docs

The `-v appointments-data:/data` flag stores the SQLite database in a Docker volume,
so your data survives when the container is stopped or rebuilt. To use another port
on your machine, change the left side of `-p` (for example `-p 8080:8000`).

The Makefile shortcut runs it in the foreground (Ctrl+C stops it):

```sh
make docker-run              # http://localhost:8000
make docker-run PORT=8080    # http://localhost:8080
```

### Stop, view logs, restart

```sh
docker logs -f appointment-matchmaker   # follow the logs
docker stop appointment-matchmaker      # stop
docker start appointment-matchmaker     # start again
docker rm -f appointment-matchmaker     # remove the container (the data volume is kept)
```

After changing code, rebuild the image, then remove the old container and run it again:

```sh
docker build -t appointment-matchmaker .
docker rm -f appointment-matchmaker
docker run -d --name appointment-matchmaker -p 8000:8000 -v appointments-data:/data appointment-matchmaker
```

To start over with an empty database, delete the volume: `docker volume rm appointments-data`.

### Demo users

On first start, an empty database is filled with demo data, including these users:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | admin |
| `orientador` | `orientador123` | orientador |
| `especialista` | `especialista123` | especialista |

These passwords are public. For a real deployment, turn the demo data off.

### Configuration

Pass environment variables with `-e`:

| Variable | Default in the image | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:////data/appointments.db` | SQLAlchemy database URL: SQLite or PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `SEED_DEMO_DATA` | `true` | Load the demo data into an empty database on startup |
| `APP_BASE_URL` | `http://localhost:8000` | Address users open the app at; links in emails point here |
| `SMTP_HOST` | (unset) | Mail server for password-recovery emails. Unset: nothing is sent, and a warning is logged |
| `SMTP_PORT` | `587` (`465` for `ssl`, `25` for `none`) | Mail server port |
| `SMTP_SECURITY` | `starttls` | `starttls`, `ssl` or `none` |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | (unset) | Mail server login, if it needs one |
| `MAIL_FROM` | `Citas con especialistas <no-reply@localhost>` | Sender of the emails |

Example:

```sh
docker run -d --name appointment-matchmaker -p 8000:8000 -v appointments-data:/data \
  -e SEED_DEMO_DATA=false \
  appointment-matchmaker
```

### Using PostgreSQL

SQLite is the default. To use PostgreSQL instead, start a Postgres container:

```sh
make db-up   # or run it directly:
docker run -d \
  --name appointment-matchmaker-db \
  -e POSTGRES_USER=appointment \
  -e POSTGRES_PASSWORD=appointment \
  -e POSTGRES_DB=appointment \
  -p 5432:5432 \
  -v appointment-matchmaker:/var/lib/postgresql/data \
  postgres:16-alpine
```

Then point the app at it with `DATABASE_URL`. Inside a container, `localhost` is the
container itself, so put both containers on one Docker network and use the database
container's name as the host:

```sh
docker network create appointment-matchmaker
docker network connect appointment-matchmaker appointment-matchmaker-db
docker run -d --name appointment-matchmaker -p 8000:8000 --network appointment-matchmaker \
  -e DATABASE_URL=postgresql://appointment:appointment@appointment-matchmaker-db:5432/appointment \
  appointment-matchmaker
```

Tables are created on first start. With Postgres, the data lives in the
`appointment-matchmaker` volume, so the `/data` volume isn't needed.

## Deploying

To deploy to Google Cloud Run with a free Neon database and free Brevo email, see
[deploy/gcp/README.md](deploy/gcp/README.md).

## Local development (without Docker)

```sh
make install   # install backend (uv) and frontend (npm) dependencies
make dev       # backend on :8000 and frontend dev server together
make test      # run all tests
```

To develop against Postgres, run `make db-up`, then `make run-pg`.

End-to-end tests (Playwright, against `docker-compose.yaml`) are in
[`e2e/`](e2e/README.md). Run them with `make test-e2e`.

Run `make help` to list every target.
