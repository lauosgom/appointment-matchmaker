from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_roles
from ..models import DurationBody, NeedsReviewResponse, Role, Settings, User, YearLettersBody
from ..store import Store, get_store

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=Settings)
def get_settings(store: Store = Depends(get_store), _: User = Depends(get_current_user)) -> Settings:
    return store.get_settings()


@router.put("/duration", response_model=NeedsReviewResponse, dependencies=[Depends(require_roles(Role.admin))])
def set_duration(body: DurationBody, store: Store = Depends(get_store)) -> NeedsReviewResponse:
    return NeedsReviewResponse(needsReview=store.set_duration(body.minutes))


@router.put(
    "/year-letters/{year}", response_model=Settings, dependencies=[Depends(require_roles(Role.admin))]
)
def set_year_letters(year: str, body: YearLettersBody, store: Store = Depends(get_store)) -> Settings:
    return store.set_year_letters(year, body.letters)
