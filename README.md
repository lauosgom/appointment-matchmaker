# Appointment Matchmaker

A web app for matching appointments with specialists. It has two parts:

- `backend/`: a FastAPI API (see [backend/README.md](backend/README.md))
- `frontend/`: a React/TanStack app (see [frontend/README.md](frontend/README.md))

The API contract is in [openapi.yaml](openapi.yaml).

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
| `DATABASE_URL` | `sqlite:////data/appointments.db` | SQLAlchemy database URL (SQLite works as is; other databases need their driver added to the backend) |
| `SEED_DEMO_DATA` | `true` | Load the demo data into an empty database on startup |

Example:

```sh
docker run -d --name appointment-matchmaker -p 8000:8000 -v appointments-data:/data \
  -e SEED_DEMO_DATA=false \
  appointment-matchmaker
```

## Local development (without Docker)

```sh
make install   # install backend (uv) and frontend (npm) dependencies
make dev       # backend on :8000 and frontend dev server together
make test      # run all tests
```

Run `make help` to list every target.
