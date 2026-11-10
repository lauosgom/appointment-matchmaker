"""Database-backed data store plus the business rules that operate on it.

Mirrors what the frontend's mock (frontend/src/services/mock.ts) does in the
browser, persisted through SQLAlchemy. Routers call these methods and
translate nothing else — the HTTPException raised here already carries the
right status code and the Spanish, user-facing message the frontend expects
to display as-is.

A Store wraps one SQLAlchemy Session (one per request, see `get_store`): the
request's changes are committed when the endpoint returns and rolled back if
it raises. Queries stick to portable SQLAlchemy constructs; anything
backend-specific (date arithmetic, etc.) is done in Python.
"""

from __future__ import annotations

import math
import re
import uuid
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, sessionmaker

from . import security
from .colombia_time import colombia_day_key, colombia_year
from .db import get_session_factory
from .models import (
    Assignment,
    AssignmentStatus,
    AvailabilityBy,
    Category,
    CategoryInput,
    CategoryKind,
    CorrectionRequest,
    DisplayStatus,
    Role,
    Settings,
    Slot,
    Specialist,
    SpecialistInput,
    User,
    UserInput,
)
from .tables import (
    AppSettingsRow,
    AssignmentRow,
    CategoryRow,
    CorrectionRequestRow,
    CounterRow,
    LoginAttemptRow,
    PasswordResetTokenRow,
    SessionRow,
    SlotRow,
    SpecialistCategoryRow,
    SpecialistRow,
    UserRow,
    YearLettersRow,
)

MAX_FAILED_ATTEMPTS = 3
LOCK_DURATION = timedelta(minutes=5)
PHONE_RE = re.compile(r"^[0-9+\s-]{7,15}$")
DEFAULT_DURATION_MIN = 45
OPEN_STATUSES = (AssignmentStatus.pending.value, AssignmentStatus.confirmed.value)
CONFIRMATION_COUNTER = "confirmation_code"


def _bad_request(message: str) -> None:
    raise HTTPException(status.HTTP_400_BAD_REQUEST, message)


def _forbidden(message: str) -> None:
    raise HTTPException(status.HTTP_403_FORBIDDEN, message)


def _not_found(message: str) -> None:
    raise HTTPException(status.HTTP_404_NOT_FOUND, message)


def _as_utc(value: datetime) -> datetime:
    """Treat naive datetimes as UTC so they compare with the aware ones read from the DB."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


# ---------------------------------------------------------------- row -> schema
def user_out(row: UserRow) -> User:
    return User(
        id=row.id,
        username=row.username,
        fullName=row.full_name,
        email=row.email,
        role=Role(row.role),
        active=row.active,
        specialistId=row.specialist_id,
    )


def category_out(row: CategoryRow) -> Category:
    return Category(id=row.id, code=row.code, name=row.name, active=row.active)


def specialist_out(row: SpecialistRow) -> Specialist:
    return Specialist(
        id=row.id,
        code=row.code,
        fullName=row.full_name,
        departmentIds=[l.category_id for l in row.links if l.category.kind == CategoryKind.department.value],
        areaIds=[l.category_id for l in row.links if l.category.kind == CategoryKind.area.value],
        active=row.active,
    )


def slot_out(row: SlotRow) -> Slot:
    return Slot(id=row.id, specialistId=row.specialist_id, start=row.start, durationMin=row.duration_min, active=row.active)


def assignment_out(row: AssignmentRow) -> Assignment:
    return Assignment(
        id=row.id,
        slotId=row.slot_id,
        specialistId=row.specialist_id,
        start=row.start,
        durationMin=row.duration_min,
        personName=row.person_name,
        personPhone=row.person_phone,
        status=AssignmentStatus(row.status),
        code=row.code,
        createdAt=row.created_at,
        createdBy=row.created_by,
        confirmedAt=row.confirmed_at,
        confirmedBy=row.confirmed_by,
        closedAt=row.closed_at,
        closedBy=row.closed_by,
        closeReason=row.close_reason,
    )


def correction_out(row: CorrectionRequestRow) -> CorrectionRequest:
    return CorrectionRequest(
        id=row.id, assignmentId=row.assignment_id, message=row.message, createdBy=row.created_by, createdAt=row.created_at
    )


class Store:
    def __init__(self, session: Session, now: Callable[[], datetime] | None = None) -> None:
        self.session = session
        self.now: Callable[[], datetime] = now or (lambda: datetime.now(timezone.utc))

    # ------------------------------------------------------------ helpers
    @staticmethod
    def new_id(prefix: str) -> str:
        return f"{prefix}{uuid.uuid4().hex[:16]}"

    def _next_counter(self, name: str) -> int:
        """Atomically increment a named counter (row lock on backends that support it)."""
        result = self.session.execute(update(CounterRow).where(CounterRow.name == name).values(value=CounterRow.value + 1))
        if result.rowcount == 0:
            self.session.add(CounterRow(name=name, value=1))
            self.session.flush()
            return 1
        return self.session.execute(select(CounterRow.value).where(CounterRow.name == name)).scalar_one()

    @staticmethod
    def _category_label(kind: CategoryKind) -> str:
        return "departamento" if kind == CategoryKind.department else "área de intervención"

    def _booked_slot_ids(self, slot_ids: Iterable[str] | None = None) -> set[str]:
        q = select(AssignmentRow.slot_id).where(AssignmentRow.status.in_(OPEN_STATUSES))
        if slot_ids is not None:
            q = q.where(AssignmentRow.slot_id.in_(list(slot_ids)))
        return set(self.session.scalars(q))

    def is_booked(self, slot_id: str) -> bool:
        return bool(self._booked_slot_ids([slot_id]))

    @staticmethod
    def _end_of(start: datetime, duration_min: int) -> datetime:
        return start + timedelta(minutes=duration_min)

    def conflicts(
        self, specialist_id: str, start: datetime, duration_min: int, ignore_id: str | None = None
    ) -> list[SlotRow]:
        end = self._end_of(start, duration_min)
        q = select(SlotRow).where(SlotRow.specialist_id == specialist_id, SlotRow.start < end)
        if ignore_id:
            q = q.where(SlotRow.id != ignore_id)
        candidates = [s for s in self.session.scalars(q) if self._end_of(s.start, s.duration_min) > start]
        booked = self._booked_slot_ids(s.id for s in candidates)
        return [s for s in candidates if s.active or s.id in booked]

    def _pending_count(self, specialist_ids: list[str]) -> int:
        if not specialist_ids:
            return 0
        rows = self.session.execute(
            select(AssignmentRow.status, AssignmentRow.start).where(
                AssignmentRow.specialist_id.in_(specialist_ids), AssignmentRow.status.in_(OPEN_STATUSES)
            )
        )
        now = self.now()
        return sum(1 for st, start in rows if st == AssignmentStatus.pending.value or start > now)

    def _find_assignment_row(self, assignment_id: str) -> AssignmentRow:
        row = self.session.get(AssignmentRow, assignment_id)
        if not row:
            _not_found("No encontramos la asignación. Actualiza la lista e inténtalo de nuevo.")
        return row  # type: ignore[return-value]

    def find_assignment(self, assignment_id: str) -> Assignment:
        return assignment_out(self._find_assignment_row(assignment_id))

    @staticmethod
    def display_status(a: Assignment, now: datetime) -> DisplayStatus:
        if a.status == AssignmentStatus.confirmed and a.start < now:
            return DisplayStatus.past
        return DisplayStatus(a.status.value)

    def _sort_by_upcoming(self, items: list[Assignment]) -> list[Assignment]:
        now = self.now()

        def key(a: Assignment):
            is_past = a.start < now
            return (is_past, -a.start.timestamp() if is_past else a.start.timestamp())

        return sorted(items, key=key)

    def _settings_row(self) -> AppSettingsRow:
        row = self.session.get(AppSettingsRow, 1)
        if row is None:
            row = AppSettingsRow(id=1, duration_min=DEFAULT_DURATION_MIN)
            self.session.add(row)
            self.session.flush()
        return row

    def _user_by_username(self, username: str) -> UserRow | None:
        return self.session.scalars(select(UserRow).where(func.lower(UserRow.username) == username.lower())).first()

    # ------------------------------------------------------------ auth
    def authenticate(self, username: str, password: str) -> User:
        key = username.strip().lower()
        now = self.now()
        record = self.session.get(LoginAttemptRow, key)
        if record and record.locked_until and record.locked_until > now:
            minutes = math.ceil((record.locked_until - now).total_seconds() / 60)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Acceso bloqueado temporalmente por varios intentos fallidos. Intenta de nuevo en {minutes} minuto(s).",
            )

        user = self._user_by_username(key)
        if not user or not security.verify_password(password, user.password_hash):
            if record is None:
                record = LoginAttemptRow(username_key=key, count=0, locked_until=None)
                self.session.add(record)
            elif record.locked_until and record.locked_until <= now:
                record.count = 0  # previous lock expired: start counting afresh
            record.count += 1
            record.locked_until = None
            if record.count >= MAX_FAILED_ATTEMPTS:
                record.locked_until = now + LOCK_DURATION
                record.count = 0
            locked = record.locked_until is not None
            # The failed attempt must persist even though this request ends in an error.
            self.session.commit()
            if locked:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos. El acceso quedó bloqueado durante 5 minutos.",
                )
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.",
            )

        if not user.active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Esta cuenta está desactivada. Comunícate con el administrador.")

        if record is not None:
            self.session.delete(record)
        return user_out(user)

    def create_session(self, token: str, user_id: str) -> None:
        self.session.add(SessionRow(token=token, user_id=user_id, created_at=self.now()))
        self.session.flush()

    def get_user_by_token(self, token: str) -> User | None:
        row = self.session.get(SessionRow, token)
        if not row:
            return None
        user = self.session.get(UserRow, row.user_id)
        if not user or not user.active:
            return None
        return user_out(user)

    def register_password_reset_token(self, email: str, token: str) -> bool:
        key = email.strip().lower()
        user = self.session.scalars(
            select(UserRow).where(func.lower(UserRow.email) == key, UserRow.active.is_(True))
        ).first()
        if not user:
            return False
        self.session.add(PasswordResetTokenRow(token=token, user_id=user.id))
        self.session.flush()
        return True

    def reset_password(self, token: str, new_password: str) -> None:
        row = self.session.get(PasswordResetTokenRow, token)
        if not row:
            _bad_request("El enlace de recuperación no es válido o ya fue usado. Solicita uno nuevo.")
        if len(new_password) < 6:
            _bad_request("La contraseña debe tener al menos 6 caracteres.")
        user = self.session.get(UserRow, row.user_id)  # type: ignore[union-attr]
        user.password_hash = security.hash_password(new_password)  # type: ignore[union-attr]
        self.session.delete(row)

    # ------------------------------------------------------------ users
    def list_users(self) -> list[User]:
        return [user_out(u) for u in self.session.scalars(select(UserRow).order_by(UserRow.created_at, UserRow.id))]

    def get_user(self, user_id: str) -> User | None:
        u = self.session.get(UserRow, user_id)
        return user_out(u) if u else None

    def user_names(self) -> dict[str, str]:
        return {uid: name for uid, name in self.session.execute(select(UserRow.id, UserRow.full_name))}

    def _assert_username_available(self, username: str, ignore_id: str | None = None) -> None:
        existing = self._user_by_username(username)
        if existing and existing.id != ignore_id:
            _bad_request("Ya existe un usuario con ese nombre de usuario.")

    def _assert_specialist_exists(self, specialist_id: str | None) -> None:
        if specialist_id and not self.session.get(SpecialistRow, specialist_id):
            _bad_request("Selecciona un especialista válido.")

    def create_user(self, input: UserInput) -> User:
        username = input.username.strip()
        if not username:
            _bad_request("El nombre de usuario es obligatorio.")
        self._assert_username_available(username)
        if not input.password or len(input.password) < 6:
            _bad_request("La contraseña inicial debe tener al menos 6 caracteres.")
        if input.role == Role.especialista and not input.specialistId:
            _bad_request("Selecciona el especialista asociado a esta cuenta.")
        self._assert_specialist_exists(input.specialistId)
        row = UserRow(
            id=self.new_id("u"),
            username=username,
            full_name=input.fullName,
            email=str(input.email),
            role=input.role.value,
            active=input.active,
            specialist_id=input.specialistId,
            password_hash=security.hash_password(input.password),  # type: ignore[arg-type]
        )
        self.session.add(row)
        self.session.flush()
        return user_out(row)

    def update_user(self, actor: User, user_id: str, input: UserInput) -> User:
        row = self.session.get(UserRow, user_id)
        if not row:
            _not_found("Usuario no encontrado.")
        self._assert_username_available(input.username.strip(), ignore_id=user_id)
        if user_id == actor.id and not input.active:
            _bad_request("No puedes desactivar tu propia cuenta.")
        if input.password and len(input.password) < 6:
            _bad_request("La contraseña debe tener al menos 6 caracteres.")
        self._assert_specialist_exists(input.specialistId)
        row.username = input.username.strip()  # type: ignore[union-attr]
        row.full_name = input.fullName  # type: ignore[union-attr]
        row.email = str(input.email)  # type: ignore[union-attr]
        row.role = input.role.value  # type: ignore[union-attr]
        row.active = input.active  # type: ignore[union-attr]
        row.specialist_id = input.specialistId  # type: ignore[union-attr]
        if input.password:
            row.password_hash = security.hash_password(input.password)  # type: ignore[union-attr]
        self.session.flush()
        return user_out(row)  # type: ignore[arg-type]

    # ------------------------------------------------------------ categories
    def _category_rows(self, kind: CategoryKind) -> list[CategoryRow]:
        return list(self.session.scalars(select(CategoryRow).where(CategoryRow.kind == kind.value).order_by(CategoryRow.created_at, CategoryRow.id)))

    def _assert_code_available(self, kind: CategoryKind, code: str, display_code: str, ignore_id: str | None = None) -> None:
        clash = self.session.scalars(
            select(CategoryRow).where(CategoryRow.kind == kind.value, func.lower(CategoryRow.code) == code.lower())
        ).first()
        if clash and clash.id != ignore_id:
            _bad_request(f"Ya existe un {self._category_label(kind)} con el código {display_code}.")

    def list_categories(self, kind: CategoryKind) -> list[Category]:
        return [category_out(c) for c in self._category_rows(kind)]

    def create_category(self, kind: CategoryKind, input: CategoryInput) -> Category:
        code = input.code.strip()
        name = input.name.strip()
        if not code or not name:
            _bad_request("El código y el nombre son obligatorios.")
        self._assert_code_available(kind, code, input.code)
        prefix = "d" if kind == CategoryKind.department else "a"
        row = CategoryRow(id=self.new_id(prefix), kind=kind.value, code=code, name=name, active=input.active)
        self.session.add(row)
        self.session.flush()
        return category_out(row)

    def update_category(self, kind: CategoryKind, category_id: str, input: CategoryInput) -> Category:
        row = self.session.get(CategoryRow, category_id)
        if not row or row.kind != kind.value:
            _not_found("Elemento no encontrado.")
        code = input.code.strip()
        self._assert_code_available(kind, code, input.code, ignore_id=category_id)
        row.code = code  # type: ignore[union-attr]
        row.name = input.name  # type: ignore[union-attr]
        row.active = input.active  # type: ignore[union-attr]
        self.session.flush()
        return category_out(row)  # type: ignore[arg-type]

    def category_usage(self, kind: CategoryKind, category_id: str) -> tuple[int, int]:
        specialist_ids = list(
            self.session.scalars(
                select(SpecialistCategoryRow.specialist_id).where(SpecialistCategoryRow.category_id == category_id)
            )
        )
        return len(specialist_ids), self._pending_count(specialist_ids)

    # ------------------------------------------------------------ specialists
    def list_specialists(self) -> list[Specialist]:
        return [specialist_out(s) for s in self.session.scalars(select(SpecialistRow).order_by(SpecialistRow.created_at, SpecialistRow.id))]

    def _assert_specialist_code_available(self, code: str, display_code: str, ignore_id: str | None = None) -> None:
        clash = self.session.scalars(select(SpecialistRow).where(func.lower(SpecialistRow.code) == code.lower())).first()
        if clash and clash.id != ignore_id:
            _bad_request(f"Ya existe un especialista con el código {display_code}.")

    def _category_links(self, input: SpecialistInput) -> list[SpecialistCategoryRow]:
        wanted = [(cid, CategoryKind.department) for cid in dict.fromkeys(input.departmentIds)]
        wanted += [(cid, CategoryKind.area) for cid in dict.fromkeys(input.areaIds)]
        if wanted:
            ids = [cid for cid, _ in wanted]
            kinds = dict(self.session.execute(select(CategoryRow.id, CategoryRow.kind).where(CategoryRow.id.in_(ids))).all())
            if any(kinds.get(cid) != kind.value for cid, kind in wanted):
                _bad_request("Selecciona departamentos y áreas válidos.")
        return [SpecialistCategoryRow(category_id=cid, position=i) for i, (cid, _) in enumerate(wanted)]

    def create_specialist(self, input: SpecialistInput) -> Specialist:
        code = input.code.strip()
        full_name = input.fullName.strip()
        if not code or not full_name:
            _bad_request("El código y el nombre son obligatorios.")
        self._assert_specialist_code_available(code, input.code)
        row = SpecialistRow(id=self.new_id("s"), code=code, full_name=full_name, active=input.active)
        row.links = self._category_links(input)
        self.session.add(row)
        self.session.flush()
        return specialist_out(row)

    def update_specialist(self, specialist_id: str, input: SpecialistInput) -> Specialist:
        row = self.session.get(SpecialistRow, specialist_id)
        if not row:
            _not_found("Especialista no encontrado.")
        code = input.code.strip()
        self._assert_specialist_code_available(code, input.code, ignore_id=specialist_id)
        links = self._category_links(input)
        row.code = code  # type: ignore[union-attr]
        row.full_name = input.fullName  # type: ignore[union-attr]
        row.active = input.active  # type: ignore[union-attr]
        # Delete the old links before inserting new ones that may share a primary key.
        row.links.clear()  # type: ignore[union-attr]
        self.session.flush()
        row.links.extend(links)  # type: ignore[union-attr]
        self.session.flush()
        return specialist_out(row)  # type: ignore[arg-type]

    def specialist_pending_appointments(self, specialist_id: str) -> int:
        return self._pending_count([specialist_id])

    # ------------------------------------------------------------ slots
    def list_slots(self, specialist_id: str) -> list[tuple[Slot, bool]]:
        rows = list(self.session.scalars(select(SlotRow).where(SlotRow.specialist_id == specialist_id).order_by(SlotRow.start)))
        booked = self._booked_slot_ids(r.id for r in rows)
        return [(slot_out(r), r.id in booked) for r in rows]

    def add_slots(self, specialist_id: str, starts: list[datetime]) -> list[Slot]:
        if not self.session.get(SpecialistRow, specialist_id):
            _bad_request("Selecciona un especialista válido.")
        if not starts:
            _bad_request("Agrega al menos una fecha y hora.")
        duration = self._settings_row().duration_min
        now = self.now()
        created: list[SlotRow] = []
        for start in map(_as_utc, starts):
            if start <= now:
                _bad_request("No se pueden crear espacios en fechas u horas pasadas.")
            end = self._end_of(start, duration)
            clash = self.conflicts(specialist_id, start, duration) or any(
                s.start < end and self._end_of(s.start, s.duration_min) > start for s in created
            )
            if clash:
                _bad_request("Uno de los espacios está duplicado o se cruza con otro horario del especialista.")
            created.append(
                SlotRow(id=self.new_id("sl"), specialist_id=specialist_id, start=start, duration_min=duration, active=True)
            )
        self.session.add_all(created)
        self.session.flush()
        return [slot_out(s) for s in created]

    def set_slot_active(self, slot_id: str, active: bool) -> Slot:
        row = self.session.get(SlotRow, slot_id)
        if not row:
            _not_found("Espacio no encontrado.")
        if self.is_booked(slot_id):
            _bad_request("Este espacio tiene una asignación o cita; no se puede modificar.")
        if active and self.conflicts(row.specialist_id, row.start, row.duration_min, ignore_id=slot_id):  # type: ignore[union-attr]
            _bad_request("No se puede reactivar: se cruza con otro horario del especialista.")
        row.active = active  # type: ignore[union-attr]
        self.session.flush()
        return slot_out(row)  # type: ignore[arg-type]

    # ------------------------------------------------------------ settings
    def get_settings(self) -> Settings:
        letters = {r.year: r.letters for r in self.session.scalars(select(YearLettersRow).order_by(YearLettersRow.year))}
        return Settings(durationMin=self._settings_row().duration_min, yearLetters=letters)

    def set_duration(self, minutes: int) -> list[Slot]:
        if minutes < 5 or minutes > 480:
            _bad_request("La duración debe ser un número entero entre 5 y 480 minutos.")
        self._settings_row().duration_min = minutes
        now = self.now()
        candidates = list(
            self.session.scalars(select(SlotRow).where(SlotRow.active.is_(True), SlotRow.start > now).order_by(SlotRow.start))
        )
        booked = self._booked_slot_ids(s.id for s in candidates)
        needs_review: list[Slot] = []
        for slot in candidates:
            if slot.id in booked:
                continue
            if self.conflicts(slot.specialist_id, slot.start, minutes, ignore_id=slot.id):
                needs_review.append(slot_out(slot))
            else:
                slot.duration_min = minutes
                self.session.flush()
        return needs_review

    def set_year_letters(self, year: str, letters: str) -> Settings:
        if not re.fullmatch(r"\d{4}", year):
            _bad_request("El año debe tener cuatro dígitos.")
        if not re.fullmatch(r"[A-Za-z]{2}", letters):
            _bad_request("Debes indicar exactamente dos letras.")
        row = self.session.get(YearLettersRow, year)
        if row:
            row.letters = letters.upper()
        else:
            self.session.add(YearLettersRow(year=year, letters=letters.upper()))
        self.session.flush()
        return self.get_settings()

    # ------------------------------------------------------------ availability
    def search_availability(self, by: AvailabilityBy, ref_id: str, date: str | None) -> list[tuple[Specialist, Slot]]:
        q = select(SpecialistRow).where(SpecialistRow.active.is_(True))
        if by == AvailabilityBy.specialist:
            q = q.where(SpecialistRow.id == ref_id)
        else:
            kind = CategoryKind.department if by == AvailabilityBy.department else CategoryKind.area
            category = self.session.get(CategoryRow, ref_id)
            if not category or category.kind != kind.value or not category.active:
                return []
            q = q.join(SpecialistCategoryRow).where(SpecialistCategoryRow.category_id == ref_id)
        specialists = {s.id: s for s in self.session.scalars(q)}
        if not specialists:
            return []

        now = self.now()
        rows = list(
            self.session.scalars(
                select(SlotRow)
                .where(SlotRow.active.is_(True), SlotRow.start > now, SlotRow.specialist_id.in_(list(specialists)))
                .order_by(SlotRow.start)
            )
        )
        booked = self._booked_slot_ids(r.id for r in rows)
        out = {sid: specialist_out(s) for sid, s in specialists.items()}
        return [
            (out[r.specialist_id], slot_out(r))
            for r in rows
            if r.id not in booked and (not date or colombia_day_key(r.start) == date)
        ]

    # ------------------------------------------------------------ assignments
    def list_assignments(
        self,
        actor: User,
        specialist_id: str | None = None,
        status_filter: DisplayStatus | None = None,
        created_by: str | None = None,
    ) -> list[Assignment]:
        q = select(AssignmentRow)
        if actor.role == Role.especialista:
            q = q.where(
                AssignmentRow.specialist_id == actor.specialistId,
                AssignmentRow.status == AssignmentStatus.confirmed.value,
            )
        elif actor.role == Role.orientador and created_by != actor.id:
            q = q.where(AssignmentRow.status == AssignmentStatus.confirmed.value)
        if created_by:
            q = q.where(AssignmentRow.created_by == created_by)
        if specialist_id:
            q = q.where(AssignmentRow.specialist_id == specialist_id)

        items = [assignment_out(r) for r in self.session.scalars(q)]
        if status_filter:
            now = self.now()
            items = [a for a in items if self.display_status(a, now) == status_filter]

        if created_by and actor.role == Role.orientador:
            return sorted(items, key=lambda a: a.createdAt, reverse=True)
        if status_filter == DisplayStatus.pending:
            return sorted(items, key=lambda a: a.createdAt)
        return self._sort_by_upcoming(items)

    def create_assignment(self, actor: User, slot_id: str, person_name: str | None, person_phone: str | None) -> Assignment:
        name = (person_name or "").strip() or None
        phone = (person_phone or "").strip() or None
        if not name and not phone:
            _bad_request("Ingresa al menos el nombre o el número de celular de la persona.")
        if phone and not PHONE_RE.fullmatch(phone):
            _bad_request("El número de celular no es válido.")
        slot = self.session.get(SlotRow, slot_id)
        if not slot:
            _bad_request("El horario seleccionado no existe.")
        specialist = self.session.get(SpecialistRow, slot.specialist_id)  # type: ignore[union-attr]
        now = self.now()
        if not slot.active or not (specialist and specialist.active) or self.is_booked(slot.id) or slot.start <= now:  # type: ignore[union-attr]
            _bad_request("Este horario ya no está disponible. Busca y selecciona otro espacio.")
        row = AssignmentRow(
            id=self.new_id("as"),
            slot_id=slot.id,  # type: ignore[union-attr]
            specialist_id=slot.specialist_id,  # type: ignore[union-attr]
            start=slot.start,  # type: ignore[union-attr]
            duration_min=slot.duration_min,  # type: ignore[union-attr]
            person_name=name,
            person_phone=phone,
            status=AssignmentStatus.pending.value,
            created_at=now,
            created_by=actor.id,
        )
        self.session.add(row)
        self.session.flush()
        return assignment_out(row)

    def confirm_assignment(self, actor: User, assignment_id: str) -> Assignment:
        row = self._find_assignment_row(assignment_id)
        if row.status != AssignmentStatus.pending.value:
            _bad_request("Solo se pueden confirmar asignaciones pendientes.")
        if actor.role != Role.admin and row.created_by != actor.id:
            _forbidden("Solo el orientador que inició la asignación o un administrador puede confirmarla.")
        now = self.now()
        year = colombia_year(now)
        letters_row = self.session.get(YearLettersRow, year)
        if not letters_row:
            _bad_request(f"No hay letras configuradas para el año {year}. Pide al administrador que las configure.")
        number = self._next_counter(CONFIRMATION_COUNTER)
        row.code = f"{letters_row.letters}{number:05d}"  # type: ignore[union-attr]
        row.status = AssignmentStatus.confirmed.value
        row.confirmed_at = now
        row.confirmed_by = actor.id
        self.session.flush()
        return assignment_out(row)

    def _close(self, row: AssignmentRow, new_status: AssignmentStatus, actor: User, reason: str) -> Assignment:
        row.status = new_status.value
        row.closed_at = self.now()
        row.closed_by = actor.id
        row.close_reason = reason.strip()
        self.session.flush()
        return assignment_out(row)

    def discard_assignment(self, actor: User, assignment_id: str, reason: str) -> Assignment:
        row = self._find_assignment_row(assignment_id)
        if row.status != AssignmentStatus.pending.value:
            _bad_request("Solo se pueden descartar asignaciones pendientes.")
        if actor.role != Role.admin and row.created_by != actor.id:
            _forbidden("Solo el orientador que inició la asignación o un administrador puede descartarla.")
        if not reason.strip():
            _bad_request("Indica el motivo del descarte.")
        return self._close(row, AssignmentStatus.discarded, actor, reason)

    def cancel_assignment(self, actor: User, assignment_id: str, reason: str) -> Assignment:
        row = self._find_assignment_row(assignment_id)
        if row.status != AssignmentStatus.confirmed.value:
            _bad_request("Solo se pueden cancelar citas confirmadas.")
        if row.start <= self.now():
            _bad_request("No se puede cancelar una cita cuya fecha y hora ya pasaron.")
        if not reason.strip():
            _bad_request("Indica el motivo de la cancelación.")
        return self._close(row, AssignmentStatus.cancelled, actor, reason)

    def request_correction(self, actor: User, assignment_id: str, message: str) -> CorrectionRequest:
        row = self._find_assignment_row(assignment_id)
        if row.status != AssignmentStatus.confirmed.value:
            _bad_request("Solo se puede solicitar corrección de citas confirmadas.")
        if not message.strip():
            _bad_request("Describe qué se debe corregir.")
        correction = CorrectionRequestRow(
            id=self.new_id("cr"),
            assignment_id=assignment_id,
            message=message.strip(),
            created_by=actor.id,
            created_at=self.now(),
        )
        self.session.add(correction)
        self.session.flush()
        return correction_out(correction)

    def list_corrections(self) -> list[CorrectionRequest]:
        q = select(CorrectionRequestRow).order_by(CorrectionRequestRow.created_at.desc(), CorrectionRequestRow.id.desc())
        return [correction_out(r) for r in self.session.scalars(q)]


def store_session(factory: sessionmaker[Session]) -> Iterator[Store]:
    """One Store/Session (= one transaction): committed on success, rolled back on error."""
    session = factory()
    try:
        yield Store(session)
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def get_store() -> Iterator[Store]:
    """FastAPI dependency: one transaction per request.

    Use as `Depends(get_store, scope="function")` so the commit happens right
    after the endpoint returns, before the response is sent.
    """
    yield from store_session(get_session_factory())
