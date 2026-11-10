"""Pure password-hashing and token-generation helpers.

No dependency on the store or on FastAPI: kept separate so `store.py` can
hash/verify passwords without creating an import cycle with `auth.py`
(which depends on the store to resolve bearer tokens into users).
"""

from __future__ import annotations

import secrets

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def generate_token() -> str:
    return secrets.token_urlsafe(32)
