"""In-memory data store plus the business rules that operate on it.

This mirrors what the frontend's mock (frontend/src/services/mock.ts) does
in the browser: a single object holding every table, with methods that
enforce the same validation rules the frontend was built against. Routers
call these methods and translate nothing else — the HTTPException raised
here already carries the right status code and the Spanish, user-facing
message the frontend expects to display as-is.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from . import security
from .colombia_time import colombia_day_key, colombia_year
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

MAX_FAILED_ATTEMPTS = 3
LOCK_DURATION = timedelta(minutes=5)
PHONE_RE = re.compile(r"^[0-9+\s-]{7,15}$")


class StoredUser(User):
    """Internal representation of a user: the public User plus its password hash."""

    password_hash: str


def _bad_request(message: str) -> None:
    raise HTTPException(status.HTTP_400_BAD_REQUEST, message)


def _forbidden(message: str) -> None:
    raise HTTPException(status.HTTP_403_FORBIDDEN, message)


def _not_found(message: str) -> None:
    raise HTTPException(status.HTTP_404_NOT_FOUND, message)


class Store:
    def __init__(self, now: Callable[[], datetime] | None = None) -> None:
        self.now: Callable[[], datetime] = now or (lambda: datetime.now(timezone.utc))
        self.users: dict[str, StoredUser] = {}
        self.departments: dict[str, Category] = {}
        self.areas: dict[str, Category] = {}
        self.specialists: dict[str, Specialist] = {}
        self.slots: dict[str, Slot] = {}
        self.assignments: dict[str, Assignment] = {}
        self.corrections: dict[str, CorrectionRequest] = {}
        self.settings = Settings(durationMin=45, yearLetters={})
        self.confirmation_counter = 0
        self._seq = 1000
        self.sessions: dict[str, str] = {}
        self.failed_logins: dict[str, dict] = {}
        self.reset_tokens: dict[str, str] = {}

    # ------------------------------------------------------------ helpers
    def next_id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}{self._seq}"

    @staticmethod
    def _public_user(u: StoredUser) -> User:
        return User(**u.model_dump(exclude={"password_hash"}))

    def _category_list(self, kind: CategoryKind) -> dict[str, Category]:
        return self.departments if kind == CategoryKind.department else self.areas

    @staticmethod
    def _category_label(kind: CategoryKind) -> str:
        return "departamento" if kind == CategoryKind.department else "área de intervención"

    def is_booked(self, slot_id: str) -> bool:
        return any(
            a.slotId == slot_id and a.status in (AssignmentStatus.pending, AssignmentStatus.confirmed)
            for a in self.assignments.values()
        )

    @staticmethod
    def _end_of(start: datetime, duration_min: int) -> datetime:
        return start + timedelta(minutes=duration_min)

    def conflicts(
        self, specialist_id: str, start: datetime, duration_min: int, ignore_id: str | None = None
    ) -> list[Slot]:
        end = self._end_of(start, duration_min)
        return [
            s
            for s in self.slots.values()
            if s.id != ignore_id
            and s.specialistId == specialist_id
            and (s.active or self.is_booked(s.id))
            and s.start < end
            and self._end_of(s.start, s.durationMin) > start
        ]

    def pending_for(self, pred: Callable[[Assignment], bool]) -> int:
        now = self.now()
        return sum(
            1
            for a in self.assignments.values()
            if pred(a) and (a.status == AssignmentStatus.pending or (a.status == AssignmentStatus.confirmed and a.start > now))
        )

    def find_assignment(self, assignment_id: str) -> Assignment:
        a = self.assignments.get(assignment_id)
        if not a:
            _not_found("No encontramos la asignación. Actualiza la lista e inténtalo de nuevo.")
        return a  # type: ignore[return-value]

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

    # ------------------------------------------------------------ auth
    def authenticate(self, username: str, password: str) -> User:
        key = username.strip().lower()
        now = self.now()
        record = self.failed_logins.get(key)
        if record and record.get("locked_until") and record["locked_until"] > now:
            minutes = math.ceil((record["locked_until"] - now).total_seconds() / 60)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Acceso bloqueado temporalmente por varios intentos fallidos. Intenta de nuevo en {minutes} minuto(s).",
            )

        user = next((u for u in self.users.values() if u.username.lower() == key), None)
        if not user or not security.verify_password(password, user.password_hash):
            still_active = record and record.get("locked_until") and record["locked_until"] <= now
            rec = dict(record) if record and not still_active else {"count": 0, "locked_until": None}
            rec["count"] += 1
            rec["locked_until"] = None
            if rec["count"] >= MAX_FAILED_ATTEMPTS:
                rec["locked_until"] = now + LOCK_DURATION
                rec["count"] = 0
            self.failed_logins[key] = rec
            if rec["locked_until"]:
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

        self.failed_logins.pop(key, None)
        return self._public_user(user)

    def create_session(self, token: str, user_id: str) -> None:
        self.sessions[token] = user_id

    def get_user_by_token(self, token: str) -> User | None:
        user_id = self.sessions.get(token)
        if not user_id:
            return None
        user = self.users.get(user_id)
        if not user or not user.active:
            return None
        return self._public_user(user)

    def register_password_reset_token(self, email: str, token: str) -> bool:
        key = email.strip().lower()
        user = next((u for u in self.users.values() if u.email.lower() == key and u.active), None)
        if not user:
            return False
        self.reset_tokens[token] = user.id
        return True

    def reset_password(self, token: str, new_password: str) -> None:
        user_id = self.reset_tokens.get(token)
        if not user_id:
            _bad_request("El enlace de recuperación no es válido o ya fue usado. Solicita uno nuevo.")
        if len(new_password) < 6:
            _bad_request("La contraseña debe tener al menos 6 caracteres.")
        self.users[user_id].password_hash = security.hash_password(new_password)  # type: ignore[index]
        del self.reset_tokens[token]

    # ------------------------------------------------------------ users
    def list_users(self) -> list[User]:
        return [self._public_user(u) for u in self.users.values()]

    def get_user(self, user_id: str) -> User | None:
        u = self.users.get(user_id)
        return self._public_user(u) if u else None

    def user_names(self) -> dict[str, str]:
        return {u.id: u.fullName for u in self.users.values()}

    def _assert_username_available(self, username: str, ignore_id: str | None = None) -> None:
        if any(
            u.id != ignore_id and u.username.lower() == username.lower() for u in self.users.values()
        ):
            _bad_request("Ya existe un usuario con ese nombre de usuario.")

    def create_user(self, input: UserInput) -> User:
        username = input.username.strip()
        if not username:
            _bad_request("El nombre de usuario es obligatorio.")
        self._assert_username_available(username)
        if not input.password or len(input.password) < 6:
            _bad_request("La contraseña inicial debe tener al menos 6 caracteres.")
        if input.role == Role.especialista and not input.specialistId:
            _bad_request("Selecciona el especialista asociado a esta cuenta.")
        user = StoredUser(
            id=self.next_id("u"),
            username=username,
            fullName=input.fullName,
            email=input.email,
            role=input.role,
            active=input.active,
            specialistId=input.specialistId,
            password_hash=security.hash_password(input.password),
        )
        self.users[user.id] = user
        return self._public_user(user)

    def update_user(self, actor: User, user_id: str, input: UserInput) -> User:
        user = self.users.get(user_id)
        if not user:
            _not_found("Usuario no encontrado.")
        self._assert_username_available(input.username.strip(), ignore_id=user_id)  # type: ignore[arg-type]
        if user_id == actor.id and not input.active:  # type: ignore[union-attr]
            _bad_request("No puedes desactivar tu propia cuenta.")
        if input.password and len(input.password) < 6:
            _bad_request("La contraseña debe tener al menos 6 caracteres.")
        user.username = input.username.strip()  # type: ignore[union-attr]
        user.fullName = input.fullName  # type: ignore[union-attr]
        user.email = input.email  # type: ignore[union-attr]
        user.role = input.role  # type: ignore[union-attr]
        user.active = input.active  # type: ignore[union-attr]
        user.specialistId = input.specialistId  # type: ignore[union-attr]
        if input.password:
            user.password_hash = security.hash_password(input.password)  # type: ignore[union-attr]
        return self._public_user(user)  # type: ignore[arg-type]

    # ------------------------------------------------------------ categories
    def list_categories(self, kind: CategoryKind) -> list[Category]:
        return list(self._category_list(kind).values())

    def create_category(self, kind: CategoryKind, input: CategoryInput) -> Category:
        code = input.code.strip()
        name = input.name.strip()
        if not code or not name:
            _bad_request("El código y el nombre son obligatorios.")
        table = self._category_list(kind)
        if any(c.code.lower() == code.lower() for c in table.values()):
            _bad_request(f"Ya existe un {self._category_label(kind)} con el código {input.code}.")
        prefix = "d" if kind == CategoryKind.department else "a"
        category = Category(id=self.next_id(prefix), code=code, name=name, active=input.active)
        table[category.id] = category
        return category

    def update_category(self, kind: CategoryKind, category_id: str, input: CategoryInput) -> Category:
        table = self._category_list(kind)
        category = table.get(category_id)
        if not category:
            _not_found("Elemento no encontrado.")
        code = input.code.strip()
        if any(c.id != category_id and c.code.lower() == code.lower() for c in table.values()):
            _bad_request(f"Ya existe un {self._category_label(kind)} con el código {input.code}.")
        category.code = code  # type: ignore[union-attr]
        category.name = input.name  # type: ignore[union-attr]
        category.active = input.active  # type: ignore[union-attr]
        return category  # type: ignore[return-value]

    def category_usage(self, kind: CategoryKind, category_id: str) -> tuple[int, int]:
        attr = "departmentIds" if kind == CategoryKind.department else "areaIds"
        specialist_ids = [s.id for s in self.specialists.values() if category_id in getattr(s, attr)]
        pending = self.pending_for(lambda a: a.specialistId in specialist_ids)
        return len(specialist_ids), pending

    # ------------------------------------------------------------ specialists
    def list_specialists(self) -> list[Specialist]:
        return list(self.specialists.values())

    def create_specialist(self, input: SpecialistInput) -> Specialist:
        code = input.code.strip()
        full_name = input.fullName.strip()
        if not code or not full_name:
            _bad_request("El código y el nombre son obligatorios.")
        if any(s.code.lower() == code.lower() for s in self.specialists.values()):
            _bad_request(f"Ya existe un especialista con el código {input.code}.")
        specialist = Specialist(
            id=self.next_id("s"),
            code=code,
            fullName=full_name,
            departmentIds=input.departmentIds,
            areaIds=input.areaIds,
            active=input.active,
        )
        self.specialists[specialist.id] = specialist
        return specialist

    def update_specialist(self, specialist_id: str, input: SpecialistInput) -> Specialist:
        specialist = self.specialists.get(specialist_id)
        if not specialist:
            _not_found("Especialista no encontrado.")
        code = input.code.strip()
        if any(s.id != specialist_id and s.code.lower() == code.lower() for s in self.specialists.values()):
            _bad_request(f"Ya existe un especialista con el código {input.code}.")
        specialist.code = code  # type: ignore[union-attr]
        specialist.fullName = input.fullName  # type: ignore[union-attr]
        specialist.departmentIds = input.departmentIds  # type: ignore[union-attr]
        specialist.areaIds = input.areaIds  # type: ignore[union-attr]
        specialist.active = input.active  # type: ignore[union-attr]
        return specialist  # type: ignore[return-value]

    def specialist_pending_appointments(self, specialist_id: str) -> int:
        return self.pending_for(lambda a: a.specialistId == specialist_id)

    # ------------------------------------------------------------ slots
    def list_slots(self, specialist_id: str) -> list[tuple[Slot, bool]]:
        items = sorted(
            (s for s in self.slots.values() if s.specialistId == specialist_id),
            key=lambda s: s.start,
        )
        return [(s, self.is_booked(s.id)) for s in items]

    def add_slots(self, specialist_id: str, starts: list[datetime]) -> list[Slot]:
        if specialist_id not in self.specialists:
            _bad_request("Selecciona un especialista válido.")
        if not starts:
            _bad_request("Agrega al menos una fecha y hora.")
        duration = self.settings.durationMin
        now = self.now()
        created: list[Slot] = []
        for start in starts:
            if start <= now:
                _bad_request("No se pueden crear espacios en fechas u horas pasadas.")
            end = self._end_of(start, duration)
            clash = any(
                s.specialistId == specialist_id
                and (s.active or self.is_booked(s.id))
                and s.start < end
                and self._end_of(s.start, s.durationMin) > start
                for s in list(self.slots.values()) + created
            )
            if clash:
                _bad_request("Uno de los espacios está duplicado o se cruza con otro horario del especialista.")
            created.append(Slot(id=self.next_id("sl"), specialistId=specialist_id, start=start, durationMin=duration, active=True))
        for slot in created:
            self.slots[slot.id] = slot
        return created

    def set_slot_active(self, slot_id: str, active: bool) -> Slot:
        slot = self.slots.get(slot_id)
        if not slot:
            _not_found("Espacio no encontrado.")
        if self.is_booked(slot_id):
            _bad_request("Este espacio tiene una asignación o cita; no se puede modificar.")
        if active and self.conflicts(slot.specialistId, slot.start, slot.durationMin, ignore_id=slot_id):  # type: ignore[union-attr]
            _bad_request("No se puede reactivar: se cruza con otro horario del especialista.")
        slot.active = active  # type: ignore[union-attr]
        return slot  # type: ignore[return-value]

    # ------------------------------------------------------------ settings
    def get_settings(self) -> Settings:
        return self.settings

    def set_duration(self, minutes: int) -> list[Slot]:
        if minutes < 5 or minutes > 480:
            _bad_request("La duración debe ser un número entero entre 5 y 480 minutos.")
        self.settings.durationMin = minutes
        now = self.now()
        needs_review: list[Slot] = []
        for slot in self.slots.values():
            if not slot.active or self.is_booked(slot.id) or slot.start <= now:
                continue
            if self.conflicts(slot.specialistId, slot.start, minutes, ignore_id=slot.id):
                needs_review.append(slot)
            else:
                slot.durationMin = minutes
        return needs_review

    def set_year_letters(self, year: str, letters: str) -> Settings:
        if not re.fullmatch(r"\d{4}", year):
            _bad_request("El año debe tener cuatro dígitos.")
        if not re.fullmatch(r"[A-Za-z]{2}", letters):
            _bad_request("Debes indicar exactamente dos letras.")
        self.settings.yearLetters[year] = letters.upper()
        return self.settings

    # ------------------------------------------------------------ availability
    def search_availability(self, by: AvailabilityBy, ref_id: str, date: str | None) -> list[tuple[Specialist, Slot]]:
        def matches(s: Specialist) -> bool:
            if not s.active:
                return False
            if by == AvailabilityBy.specialist:
                return s.id == ref_id
            table = self.departments if by == AvailabilityBy.department else self.areas
            ids = s.departmentIds if by == AvailabilityBy.department else s.areaIds
            category = table.get(ref_id)
            return ref_id in ids and category is not None and category.active

        specialists_by_id = {s.id: s for s in self.specialists.values() if matches(s)}
        now = self.now()
        slots = sorted(
            (
                sl
                for sl in self.slots.values()
                if sl.active
                and not self.is_booked(sl.id)
                and sl.start > now
                and sl.specialistId in specialists_by_id
                and (not date or colombia_day_key(sl.start) == date)
            ),
            key=lambda s: s.start,
        )
        return [(specialists_by_id[sl.specialistId], sl) for sl in slots]

    # ------------------------------------------------------------ assignments
    def list_assignments(
        self,
        actor: User,
        specialist_id: str | None = None,
        status_filter: DisplayStatus | None = None,
        created_by: str | None = None,
    ) -> list[Assignment]:
        items = list(self.assignments.values())
        if actor.role == Role.especialista:
            items = [a for a in items if a.specialistId == actor.specialistId and a.status == AssignmentStatus.confirmed]
        elif actor.role == Role.orientador and created_by != actor.id:
            items = [a for a in items if a.status == AssignmentStatus.confirmed]

        if created_by:
            items = [a for a in items if a.createdBy == created_by]
        if specialist_id:
            items = [a for a in items if a.specialistId == specialist_id]
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
        slot = self.slots.get(slot_id)
        if not slot:
            _bad_request("El horario seleccionado no existe.")
        specialist = self.specialists.get(slot.specialistId)  # type: ignore[union-attr]
        now = self.now()
        if not slot.active or not (specialist and specialist.active) or self.is_booked(slot.id) or slot.start <= now:  # type: ignore[union-attr]
            _bad_request("Este horario ya no está disponible. Busca y selecciona otro espacio.")
        assignment = Assignment(
            id=self.next_id("as"),
            slotId=slot.id,  # type: ignore[union-attr]
            specialistId=slot.specialistId,  # type: ignore[union-attr]
            start=slot.start,  # type: ignore[union-attr]
            durationMin=slot.durationMin,  # type: ignore[union-attr]
            personName=name,
            personPhone=phone,
            status=AssignmentStatus.pending,
            createdAt=now,
            createdBy=actor.id,
        )
        self.assignments[assignment.id] = assignment
        return assignment

    def confirm_assignment(self, actor: User, assignment_id: str) -> Assignment:
        a = self.find_assignment(assignment_id)
        if a.status != AssignmentStatus.pending:
            _bad_request("Solo se pueden confirmar asignaciones pendientes.")
        if actor.role != Role.admin and a.createdBy != actor.id:
            _forbidden("Solo el orientador que inició la asignación o un administrador puede confirmarla.")
        now = self.now()
        year = colombia_year(now)
        letters = self.settings.yearLetters.get(year)
        if not letters:
            _bad_request(f"No hay letras configuradas para el año {year}. Pide al administrador que las configure.")
        self.confirmation_counter += 1
        a.code = f"{letters}{self.confirmation_counter:05d}"
        a.status = AssignmentStatus.confirmed
        a.confirmedAt = now
        a.confirmedBy = actor.id
        return a

    def discard_assignment(self, actor: User, assignment_id: str, reason: str) -> Assignment:
        a = self.find_assignment(assignment_id)
        if a.status != AssignmentStatus.pending:
            _bad_request("Solo se pueden descartar asignaciones pendientes.")
        if actor.role != Role.admin and a.createdBy != actor.id:
            _forbidden("Solo el orientador que inició la asignación o un administrador puede descartarla.")
        if not reason.strip():
            _bad_request("Indica el motivo del descarte.")
        a.status = AssignmentStatus.discarded
        a.closedAt = self.now()
        a.closedBy = actor.id
        a.closeReason = reason.strip()
        return a

    def cancel_assignment(self, actor: User, assignment_id: str, reason: str) -> Assignment:
        a = self.find_assignment(assignment_id)
        if a.status != AssignmentStatus.confirmed:
            _bad_request("Solo se pueden cancelar citas confirmadas.")
        if a.start <= self.now():
            _bad_request("No se puede cancelar una cita cuya fecha y hora ya pasaron.")
        if not reason.strip():
            _bad_request("Indica el motivo de la cancelación.")
        a.status = AssignmentStatus.cancelled
        a.closedAt = self.now()
        a.closedBy = actor.id
        a.closeReason = reason.strip()
        return a

    def request_correction(self, actor: User, assignment_id: str, message: str) -> CorrectionRequest:
        a = self.find_assignment(assignment_id)
        if a.status != AssignmentStatus.confirmed:
            _bad_request("Solo se puede solicitar corrección de citas confirmadas.")
        if not message.strip():
            _bad_request("Describe qué se debe corregir.")
        correction = CorrectionRequest(
            id=self.next_id("cr"),
            assignmentId=assignment_id,
            message=message.strip(),
            createdBy=actor.id,
            createdAt=self.now(),
        )
        self.corrections[correction.id] = correction
        return correction

    def list_corrections(self) -> list[CorrectionRequest]:
        return list(reversed(list(self.corrections.values())))


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        from .seed import seed_store

        _store = Store()
        seed_store(_store)
    return _store
