from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user, require_roles
from ..models import Role, User, UserInput
from ..store import Store, get_store

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[User], dependencies=[Depends(require_roles(Role.admin))])
def list_users(store: Store = Depends(get_store)) -> list[User]:
    return store.list_users()


@router.post("", response_model=User, status_code=201, dependencies=[Depends(require_roles(Role.admin))])
def create_user(input: UserInput, store: Store = Depends(get_store)) -> User:
    return store.create_user(input)


@router.get("/names", response_model=dict[str, str])
def user_names(
    store: Store = Depends(get_store), _: User = Depends(get_current_user)
) -> dict[str, str]:
    return store.user_names()


@router.get("/{id}", response_model=User)
def get_user(id: str, store: Store = Depends(get_store), _: User = Depends(get_current_user)) -> User:
    user = store.get_user(id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado.")
    return user


@router.put("/{id}", response_model=User, dependencies=[Depends(require_roles(Role.admin))])
def update_user(
    id: str, input: UserInput, store: Store = Depends(get_store), actor: User = Depends(get_current_user)
) -> User:
    return store.update_user(actor, id, input)
