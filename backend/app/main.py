from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
