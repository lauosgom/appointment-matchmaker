from fastapi import APIRouter, Depends, Query

from ..auth import get_current_user
from ..models import AvailabilityBy, AvailabilityResult, User
from ..store import Store, get_store

router = APIRouter(prefix="/availability", tags=["availability"])


@router.get("/search", response_model=list[AvailabilityResult])
def search_availability(
    by: AvailabilityBy,
    id: str,
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    store: Store = Depends(get_store),
    _: User = Depends(get_current_user),
) -> list[AvailabilityResult]:
    return [
        AvailabilityResult(specialist=specialist, slot=slot)
        for specialist, slot in store.search_availability(by, id, date)
    ]
