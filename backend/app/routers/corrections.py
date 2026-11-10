from fastapi import APIRouter, Depends

from ..auth import require_roles
from ..models import CorrectionRequest, Role
from ..store import Store, get_store

router = APIRouter(prefix="/correction-requests", tags=["corrections"])


@router.get("", response_model=list[CorrectionRequest], dependencies=[Depends(require_roles(Role.admin))])
def list_corrections(store: Store = Depends(get_store)) -> list[CorrectionRequest]:
    return store.list_corrections()
