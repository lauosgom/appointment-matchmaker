HOST ?= 127.0.0.1
PORT ?= 8000

.PHONY: help run install install-backend install-frontend backend frontend dev test test-backend test-frontend docker-build docker-run

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: install-backend install-frontend  ## Install all dependencies

install-backend:  ## Install backend dependencies (uv)
	cd backend && uv sync

install-frontend:  ## Install frontend dependencies (npm)
	cd frontend && npm install

run:  ## Run the API with auto-reload (override with HOST=0.0.0.0 PORT=8080; docs at /docs)
	cd backend && uv run uvicorn app.main:app --reload --host $(HOST) --port $(PORT)

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

test-frontend:  ## Run frontend tests
	cd frontend && npm test

IMAGE ?= appointment-matchmaker

docker-build:  ## Build the Docker image (frontend served by the backend)
	docker build -t $(IMAGE) .

docker-run:  ## Run the Docker image on PORT (SQLite data kept in the appointments-data volume)
	docker run --rm -p $(PORT):8000 -v appointments-data:/data $(IMAGE)
