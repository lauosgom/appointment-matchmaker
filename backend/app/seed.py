"""Demo data so the frontend has something to show against a fresh database.

Mirrors frontend/src/services/mock.ts's createSeedState(): same departments,
areas, specialists and demo users/passwords, and a similar spread of slots
over the next few days. Only applied to an empty database (no users).
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import security
from .colombia_time import colombia_year
from .tables import (
    AppSettingsRow,
    CategoryRow,
    SlotRow,
    SpecialistCategoryRow,
    SpecialistRow,
    UserRow,
    YearLettersRow,
)

HOURS = [14, 16, 20]  # UTC == 9:00, 11:00, 15:00 Colombia time

# bcrypt is deliberately slow; the demo passwords never change, so hash each once per process.
_demo_password_hash = cache(security.hash_password)


def is_empty(session: Session) -> bool:
    return session.scalars(select(UserRow.id).limit(1)).first() is None


def seed_database(session: Session, now: Callable[[], datetime] | None = None) -> None:
    """Insert the demo data. Caller commits."""
    current = (now or (lambda: datetime.now(timezone.utc)))()
    # Rows are listed in creation order; spacing created_at keeps that order stable.
    tick = iter(range(1000))

    def created() -> datetime:
        return current - timedelta(days=1) + timedelta(microseconds=next(tick))

    for id, code, name in [("d1", "PSI", "Psicología"), ("d2", "JUR", "Orientación jurídica"), ("d3", "TSO", "Trabajo social")]:
        session.add(CategoryRow(id=id, kind="department", code=code, name=name, active=True, created_at=created()))
    for id, code, name in [
        ("a1", "DUE", "Duelo"),
        ("a2", "ANS", "Ansiedad"),
        ("a3", "FAM", "Familia y pareja"),
        ("a4", "VIO", "Violencia"),
    ]:
        session.add(CategoryRow(id=id, kind="area", code=code, name=name, active=True, created_at=created()))
    session.flush()

    specialists = [
        ("s1", "ESP-001", "Dra. Marta Restrepo", ["d1"], ["a1", "a2"]),
        ("s2", "ESP-002", "Dr. Andrés Cárdenas", ["d1", "d3"], ["a3"]),
        ("s3", "ESP-003", "Dra. Lucía Henao", ["d2"], ["a4"]),
        ("s4", "ESP-004", "Lic. Camilo Ríos", ["d3"], ["a2", "a3"]),
    ]
    for id, code, name, departments, areas in specialists:
        row = SpecialistRow(id=id, code=code, full_name=name, active=True, created_at=created())
        row.links = [SpecialistCategoryRow(category_id=c, position=i) for i, c in enumerate(departments + areas)]
        session.add(row)
    session.flush()

    base = datetime(current.year, current.month, current.day, tzinfo=timezone.utc)
    n = 0
    for day in range(1, 7):
        for sid, *_ in specialists:
            for h in HOURS:
                if (day + h + int(sid[1:])) % 3 == 0:
                    continue
                n += 1
                session.add(
                    SlotRow(
                        id=f"sl{n}",
                        specialist_id=sid,
                        start=base + timedelta(days=day, hours=h),
                        duration_min=45,
                        active=True,
                    )
                )

    users = [
        ("u1", "admin", "Ana Administradora", "admin@telefono.org", "admin", None, "admin123"),
        ("u2", "orientador", "Óscar Orientador", "orientador@telefono.org", "orientador", None, "orientador123"),
        ("u3", "especialista", "Dra. Marta Restrepo", "marta@telefono.org", "especialista", "s1", "especialista123"),
    ]
    for id, username, full_name, email, role, specialist_id, password in users:
        session.add(
            UserRow(
                id=id,
                username=username,
                full_name=full_name,
                email=email,
                role=role,
                active=True,
                specialist_id=specialist_id,
                password_hash=_demo_password_hash(password),
                created_at=created(),
            )
        )

    session.add(AppSettingsRow(id=1, duration_min=45))
    session.add(YearLettersRow(year=colombia_year(current), letters="AK"))
    session.flush()
