from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import config, db, seed
from .routers import (
    assignments,
    auth,
    availability,
    categories,
    corrections,
    settings,
    slots,
    specialists,
    users,
)

def init_database() -> None:
    """Create missing tables and, if enabled, load demo data into an empty database."""
    db.create_schema(db.get_engine())
    if config.seed_demo_data():
        with db.get_session_factory()() as session, session.begin():
            if seed.is_empty(session):
                seed.seed_database(session)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    yield


app = FastAPI(title="Appointment Matchmaker API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def service_error_handler(request, exc: HTTPException) -> JSONResponse:
    """Match openapi.yaml's Error schema: {"message": "..."} instead of {"detail": "..."}."""
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail})


for router in (
    auth.router,
    users.router,
    categories.router,
    specialists.router,
    slots.specialist_slots_router,
    slots.slots_router,
    settings.router,
    availability.router,
    assignments.router,
    corrections.router,
):
    app.include_router(router, prefix="/api")


def mount_frontend(app: FastAPI, root: Path) -> None:
    """Serve the built SPA: real files as-is, any other non-API path gets index.html
    so client-side routes (e.g. /agenda) survive a page reload."""
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (root / path).resolve()
        if path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)


if (frontend_root := config.frontend_dir()) is not None:
    mount_frontend(app, frontend_root)
