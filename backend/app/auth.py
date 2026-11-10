"""Request-level authentication/authorization: bearer token -> current user, role gates."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import Role, User
from .store import Store, get_store

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    store: Store = Depends(get_store, scope="function"),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de autenticación.")
    user = store.get_user_by_token(credentials.credentials)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tu sesión no es válida. Vuelve a iniciar sesión.")
    return user


def require_roles(*roles: Role):
    """Dependency factory: 403s unless the current user's role is one of `roles`."""

    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para realizar esta acción.")
        return current_user

    return checker
