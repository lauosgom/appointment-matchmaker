"""Admin commands run against the configured DATABASE_URL.

    uv run python -m app.manage create-admin --username ana --full-name "Ana Pérez" --email ana@example.org

The password is asked for interactively (or read from ADMIN_PASSWORD).
Creates the tables first if the database is empty.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from fastapi import HTTPException
from pydantic import ValidationError

from . import db
from .models import Role, UserInput
from .store import store_session


def _password() -> str:
    if env := os.environ.get("ADMIN_PASSWORD"):
        return env
    first = getpass.getpass("Password (6+ characters): ")
    if first != getpass.getpass("Repeat the password: "):
        sys.exit("The passwords don't match.")
    return first


def create_admin(username: str, full_name: str, email: str, password: str) -> None:
    db.create_schema(db.get_engine())
    for store in store_session(db.get_session_factory()):
        store.create_user(
            UserInput(username=username, fullName=full_name, email=email, role=Role.admin, active=True, password=password)
        )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.manage")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="create an administrator account")
    admin.add_argument("--username", required=True)
    admin.add_argument("--full-name", required=True)
    admin.add_argument("--email", required=True, help="used for password recovery")
    args = parser.parse_args(argv)

    if args.command == "create-admin":
        try:
            create_admin(args.username, args.full_name, args.email, _password())
        except HTTPException as e:
            sys.exit(f"Not created: {e.detail}")
        except ValidationError as e:
            sys.exit(f"Not created: {e.errors()[0]['msg']}")
        print(f"Administrator '{args.username}' created.")


if __name__ == "__main__":
    main()
