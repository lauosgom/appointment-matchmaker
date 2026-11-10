"""Seed data so the frontend has something to show against a fresh store.

Mirrors frontend/src/services/mock.ts's createSeedState(): same departments,
areas, specialists and demo users/passwords, and a similar spread of slots
over the next few days.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import security
from .colombia_time import colombia_year
from .models import Category, Settings, Slot, Specialist
from .store import Store, StoredUser

HOURS = [14, 16, 20]  # UTC == 9:00, 11:00, 15:00 Colombia time


def seed_store(store: Store) -> Store:
    now = store.now()

    departments = [
        Category(id="d1", code="PSI", name="Psicología", active=True),
        Category(id="d2", code="JUR", name="Orientación jurídica", active=True),
        Category(id="d3", code="TSO", name="Trabajo social", active=True),
    ]
    areas = [
        Category(id="a1", code="DUE", name="Duelo", active=True),
        Category(id="a2", code="ANS", name="Ansiedad", active=True),
        Category(id="a3", code="FAM", name="Familia y pareja", active=True),
        Category(id="a4", code="VIO", name="Violencia", active=True),
    ]
    specialists = [
        Specialist(id="s1", code="ESP-001", fullName="Dra. Marta Restrepo", departmentIds=["d1"], areaIds=["a1", "a2"], active=True),
        Specialist(id="s2", code="ESP-002", fullName="Dr. Andrés Cárdenas", departmentIds=["d1", "d3"], areaIds=["a3"], active=True),
        Specialist(id="s3", code="ESP-003", fullName="Dra. Lucía Henao", departmentIds=["d2"], areaIds=["a4"], active=True),
        Specialist(id="s4", code="ESP-004", fullName="Lic. Camilo Ríos", departmentIds=["d3"], areaIds=["a2", "a3"], active=True),
    ]

    for d in departments:
        store.departments[d.id] = d
    for a in areas:
        store.areas[a.id] = a
    for s in specialists:
        store.specialists[s.id] = s

    base = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    n = 0
    for day in range(1, 7):
        for s in specialists:
            for h in HOURS:
                if (day + h + int(s.id[1:])) % 3 == 0:
                    continue
                n += 1
                slot = Slot(
                    id=f"sl{n}",
                    specialistId=s.id,
                    start=base + timedelta(days=day, hours=h),
                    durationMin=45,
                    active=True,
                )
                store.slots[slot.id] = slot

    store.users["u1"] = StoredUser(
        id="u1", username="admin", fullName="Ana Administradora", email="admin@telefono.org",
        role="admin", active=True, password_hash=security.hash_password("admin123"),
    )
    store.users["u2"] = StoredUser(
        id="u2", username="orientador", fullName="Óscar Orientador", email="orientador@telefono.org",
        role="orientador", active=True, password_hash=security.hash_password("orientador123"),
    )
    store.users["u3"] = StoredUser(
        id="u3", username="especialista", fullName="Dra. Marta Restrepo", email="marta@telefono.org",
        role="especialista", active=True, specialistId="s1", password_hash=security.hash_password("especialista123"),
    )

    year = colombia_year(now)
    store.settings = Settings(durationMin=45, yearLetters={year: "AK"})

    return store
