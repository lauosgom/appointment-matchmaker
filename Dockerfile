# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend as static files -------------------------------
FROM node:22-slim AS frontend
WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# STATIC_BUILD: client-only SPA build (dist/client/index.html + assets), no SSR server.
# VITE_API_URL: same-origin API, since the backend serves the frontend.
ENV STATIC_BUILD=true \
    VITE_API_URL=/api
RUN npm run build

# ---- Stage 2: Python backend that also serves the frontend ---------------------
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

# Dependencies first (cached layer), then the app itself.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend /frontend/dist/client ./static

RUN useradd --create-home --uid 1000 app && mkdir /data && chown app:app /data
USER app

ENV FRONTEND_DIR=/app/static \
    DATABASE_URL=sqlite:////data/appointments.db
VOLUME ["/data"]
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
