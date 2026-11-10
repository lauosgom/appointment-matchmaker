from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_roles
from ..models import PendingAppointmentsResponse, Role, Specialist, SpecialistInput, User
from ..store import Store, get_store

router = APIRouter(prefix="/specialists", tags=["specialists"])


@router.get("", response_model=list[Specialist])
def list_specialists(store: Store = Depends(get_store), _: User = Depends(get_current_user)) -> list[Specialist]:
    return store.list_specialists()


@router.post(
    "", response_model=Specialist, status_code=201, dependencies=[Depends(require_roles(Role.admin))]
)
def create_specialist(input: SpecialistInput, store: Store = Depends(get_store)) -> Specialist:
    return store.create_specialist(input)


@router.put("/{id}", response_model=Specialist, dependencies=[Depends(require_roles(Role.admin))])
def update_specialist(id: str, input: SpecialistInput, store: Store = Depends(get_store)) -> Specialist:
    return store.update_specialist(id, input)


@router.get("/{id}/pending-appointments", response_model=PendingAppointmentsResponse)
def pending_appointments(
    id: str, store: Store = Depends(get_store), _: User = Depends(get_current_user)
) -> PendingAppointmentsResponse:
    return PendingAppointmentsResponse(count=store.specialist_pending_appointments(id))
