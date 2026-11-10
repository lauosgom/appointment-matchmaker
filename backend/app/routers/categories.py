from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_roles
from ..models import Category, CategoryInput, CategoryKind, Role, UsageWarning, User
from ..store import Store, get_store

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/{kind}", response_model=list[Category])
def list_categories(
    kind: CategoryKind, store: Store = Depends(get_store), _: User = Depends(get_current_user)
) -> list[Category]:
    return store.list_categories(kind)


@router.post(
    "/{kind}", response_model=Category, status_code=201, dependencies=[Depends(require_roles(Role.admin))]
)
def create_category(kind: CategoryKind, input: CategoryInput, store: Store = Depends(get_store)) -> Category:
    return store.create_category(kind, input)


@router.put(
    "/{kind}/{id}", response_model=Category, dependencies=[Depends(require_roles(Role.admin))]
)
def update_category(
    kind: CategoryKind, id: str, input: CategoryInput, store: Store = Depends(get_store)
) -> Category:
    return store.update_category(kind, id, input)


@router.get("/{kind}/{id}/usage", response_model=UsageWarning)
def category_usage(
    kind: CategoryKind, id: str, store: Store = Depends(get_store), _: User = Depends(get_current_user)
) -> UsageWarning:
    specialists, pending = store.category_usage(kind, id)
    return UsageWarning(specialists=specialists, pendingAppointments=pending)
