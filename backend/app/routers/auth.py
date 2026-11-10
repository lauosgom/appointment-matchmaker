from fastapi import APIRouter, Depends

from .. import security
from ..models import (
    LoginRequest,
    LoginResponse,
    PasswordResetConfirmBody,
    PasswordResetRequestBody,
    PasswordResetRequestResponse,
)
from ..store import Store, get_store

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, store: Store = Depends(get_store, scope="function")) -> LoginResponse:
    user = store.authenticate(body.username, body.password)
    token = security.generate_token()
    store.create_session(token, user.id)
    return LoginResponse(user=user, token=token)


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(
    body: PasswordResetRequestBody, store: Store = Depends(get_store, scope="function")
) -> PasswordResetRequestResponse:
    token = security.generate_token()
    found = store.register_password_reset_token(str(body.email), token)
    return PasswordResetRequestResponse(demoToken=token if found else None)


@router.post("/password-reset/confirm", status_code=204)
def confirm_password_reset(body: PasswordResetConfirmBody, store: Store = Depends(get_store, scope="function")) -> None:
    store.reset_password(body.token, body.newPassword)
