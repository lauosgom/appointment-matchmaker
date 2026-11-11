HOST ?= 127.0.0.1
PORT ?= 8000

PG_CONTAINER ?= appointment-matchmaker-db
PG_USER ?= appointment
PG_PASSWORD ?= appointment
PG_DB ?= appointment
PG_PORT ?= 5432
PG_URL ?= postgresql://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_DB)

.PHONY: help run run-pg install install-backend install-frontend backend frontend dev test test-backend test-backend-pg test-frontend docker-build docker-run db-up db-down db-shell

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: install-backend install-frontend  ## Install all dependencies

install-backend:  ## Install backend dependencies (uv)
	cd backend && uv sync

install-frontend:  ## Install frontend dependencies (npm)
	cd frontend && npm install

run:  ## Run the API with auto-reload (override with HOST=0.0.0.0 PORT=8080; docs at /docs)
	cd backend && uv run uvicorn app.main:app --reload --host $(HOST) --port $(PORT)

run-pg:  ## Run the API against the local Postgres (start it with make db-up)
	cd backend && DATABASE_URL=$(PG_URL) uv run uvicorn app.main:app --reload --host $(HOST) --port $(PORT)

backend: run  ## Alias for run

frontend:  ## Run the frontend dev server
	cd frontend && npm run dev

dev:  ## Run backend and frontend together (Ctrl+C stops both)
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) --no-print-directory run HOST=$(HOST) PORT=$(PORT) & \
	$(MAKE) --no-print-directory frontend & \
	wait

test: test-backend test-frontend  ## Run all tests

test-backend:  ## Run backend tests
	cd backend && uv run pytest

test-backend-pg:  ## Run backend tests against Postgres (throwaway appointment_test DB)
	docker exec $(PG_CONTAINER) sh -c 'psql -U $(PG_USER) -d $(PG_DB) -tc "SELECT 1 FROM pg_database WHERE datname = '"'"'$(PG_DB)_test'"'"'" | grep -q 1 || createdb -U $(PG_USER) $(PG_DB)_test'
	cd backend && TEST_DATABASE_URL=postgresql://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_DB)_test uv run pytest

test-frontend:  ## Run frontend tests
	cd frontend && npm test

IMAGE ?= appointment-matchmaker

docker-build:  ## Build the Docker image (frontend served by the backend)
	docker build -t $(IMAGE) .

docker-run:  ## Run the Docker image on PORT (SQLite data kept in the appointments-data volume)
	docker run --rm -p $(PORT):8000 -v appointments-data:/data $(IMAGE)

db-up:  ## Start Postgres 16 in Docker (data kept in the appointment-matchmaker volume)
	@docker start $(PG_CONTAINER) 2>/dev/null || docker run -d \
	  --name $(PG_CONTAINER) \
	  -e POSTGRES_USER=$(PG_USER) \
	  -e POSTGRES_PASSWORD=$(PG_PASSWORD) \
	  -e POSTGRES_DB=$(PG_DB) \
	  -p $(PG_PORT):5432 \
	  -v appointment-matchmaker:/var/lib/postgresql/data \
	  postgres:16-alpine

db-down:  ## Stop the Postgres container (data is kept)
	docker stop $(PG_CONTAINER)

db-shell:  ## Open psql in the Postgres container
	docker exec -it $(PG_CONTAINER) psql -U $(PG_USER) -d $(PG_DB)
