from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_roles
from ..models import (
    Assignment,
    CorrectionMessageBody,
    CorrectionRequest,
    CreateAssignmentBody,
    DisplayStatus,
    ReasonBody,
    Role,
    User,
)
from ..store import Store, get_store

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("", response_model=list[Assignment])
def list_assignments(
    specialistId: str | None = None,
    status: DisplayStatus | None = None,
    createdBy: str | None = None,
    store: Store = Depends(get_store, scope="function"),
    actor: User = Depends(get_current_user),
) -> list[Assignment]:
    return store.list_assignments(actor, specialist_id=specialistId, status_filter=status, created_by=createdBy)


@router.post(
    "",
    response_model=Assignment,
    status_code=201,
    dependencies=[Depends(require_roles(Role.admin, Role.orientador))],
)
def create_assignment(
    body: CreateAssignmentBody, store: Store = Depends(get_store, scope="function"), actor: User = Depends(get_current_user)
) -> Assignment:
    return store.create_assignment(actor, body.slotId, body.personName, body.personPhone)


@router.post(
    "/{id}/confirm",
    response_model=Assignment,
    dependencies=[Depends(require_roles(Role.admin, Role.orientador))],
)
def confirm_assignment(
    id: str, store: Store = Depends(get_store, scope="function"), actor: User = Depends(get_current_user)
) -> Assignment:
    return store.confirm_assignment(actor, id)


@router.post(
    "/{id}/discard",
    response_model=Assignment,
    dependencies=[Depends(require_roles(Role.admin, Role.orientador))],
)
def discard_assignment(
    id: str, body: ReasonBody, store: Store = Depends(get_store, scope="function"), actor: User = Depends(get_current_user)
) -> Assignment:
    return store.discard_assignment(actor, id, body.reason)


@router.post(
    "/{id}/cancel", response_model=Assignment, dependencies=[Depends(require_roles(Role.admin))]
)
def cancel_assignment(
    id: str, body: ReasonBody, store: Store = Depends(get_store, scope="function"), actor: User = Depends(get_current_user)
) -> Assignment:
    return store.cancel_assignment(actor, id, body.reason)


@router.post(
    "/{id}/correction-requests",
    response_model=CorrectionRequest,
    status_code=201,
    tags=["corrections"],
    dependencies=[Depends(require_roles(Role.orientador))],
)
def request_correction(
    id: str, body: CorrectionMessageBody, store: Store = Depends(get_store, scope="function"), actor: User = Depends(get_current_user)
) -> CorrectionRequest:
    return store.request_correction(actor, id, body.message)
