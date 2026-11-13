from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from fastapi.security import HTTPAuthorizationCredentials

from .. import config, mailer, security
from ..auth import bearer_scheme, get_current_user
from ..models import LoginRequest, LoginResponse, PasswordResetConfirmBody, PasswordResetRequestBody, User
from ..store import PASSWORD_RESET_TTL, Store, get_store

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, store: Store = Depends(get_store, scope="function")) -> LoginResponse:
    user = store.authenticate(body.username, body.password)
    token = security.generate_token()
    store.create_session(token, user.id)
    return LoginResponse(user=user, token=token)


@router.post("/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    _: User = Depends(get_current_user),
    store: Store = Depends(get_store, scope="function"),
) -> Response:
    """End the current session: its token stops working at once."""
    store.delete_session(credentials.credentials)  # type: ignore[union-attr]
    return Response(status_code=204)


@router.post("/password-reset/request", status_code=204)
def request_password_reset(
    body: PasswordResetRequestBody,
    background: BackgroundTasks,
    store: Store = Depends(get_store, scope="function"),
) -> Response:
    """Email a single-use, time-limited reset link to the account with this email.

    The answer is the same whether or not the email belongs to an account, and
    never contains the token: only the mailbox owner gets the link.
    """
    token = security.generate_token()
    user = store.register_password_reset_token(str(body.email), token)
    if user:
        # Runs after the response is sent (and after the token is committed).
        background.add_task(
            mailer.send_password_reset,
            to=user.email,
            full_name=user.fullName,
            username=user.username,
            link=f"{config.app_base_url()}/restablecer?token={quote(token)}",
            ttl_minutes=int(PASSWORD_RESET_TTL.total_seconds() // 60),
        )
    return Response(status_code=204)


@router.post("/password-reset/confirm", status_code=204)
def confirm_password_reset(body: PasswordResetConfirmBody, store: Store = Depends(get_store, scope="function")) -> None:
    store.reset_password(body.token, body.newPassword)
