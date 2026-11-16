import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .. import metrics
from ..store import Store, get_store

router = APIRouter(tags=["health"])


@router.get("/health", include_in_schema=True)
def health(store: Store = Depends(get_store, scope="function")) -> JSONResponse:
    """Public liveness/readiness check: 200 when the app can reach its database."""
    started = time.perf_counter()
    try:
        store.session.execute(text("SELECT 1"))
    except Exception:
        metrics.health_failures.add(1)
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    finally:
        metrics.health_duration.record(time.perf_counter() - started)
    return JSONResponse(content={"status": "ok"})
