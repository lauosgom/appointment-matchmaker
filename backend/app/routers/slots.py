from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_roles
from ..models import Role, Slot, SlotActiveBody, SlotsAddBody, SlotWithBooked, User
from ..store import Store, get_store

specialist_slots_router = APIRouter(prefix="/specialists", tags=["slots"])
slots_router = APIRouter(prefix="/slots", tags=["slots"])


@specialist_slots_router.get("/{id}/slots", response_model=list[SlotWithBooked])
def list_slots(id: str, store: Store = Depends(get_store, scope="function"), _: User = Depends(get_current_user)) -> list[SlotWithBooked]:
    return [SlotWithBooked(**slot.model_dump(), booked=booked) for slot, booked in store.list_slots(id)]


@specialist_slots_router.post(
    "/{id}/slots", response_model=list[Slot], status_code=201, dependencies=[Depends(require_roles(Role.admin))]
)
def add_slots(id: str, body: SlotsAddBody, store: Store = Depends(get_store, scope="function")) -> list[Slot]:
    return store.add_slots(id, body.starts)


@slots_router.patch("/{id}", response_model=Slot, dependencies=[Depends(require_roles(Role.admin))])
def set_slot_active(id: str, body: SlotActiveBody, store: Store = Depends(get_store, scope="function")) -> Slot:
    return store.set_slot_active(id, body.active)
