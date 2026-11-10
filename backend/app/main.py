from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

app = FastAPI(title="Appointment Matchmaker API", version="1.0.0")

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
