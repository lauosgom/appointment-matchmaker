"""Pydantic schemas: the request/response shapes defined in openapi.yaml."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class Role(str, Enum):
    admin = "admin"
    orientador = "orientador"
    especialista = "especialista"


class CategoryKind(str, Enum):
    department = "department"
    area = "area"


class AssignmentStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    discarded = "discarded"


class DisplayStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    discarded = "discarded"
    past = "past"


class AvailabilityBy(str, Enum):
    specialist = "specialist"
    department = "department"
    area = "area"


# ---------------------------------------------------------------- Error
class Error(BaseModel):
    message: str


# ---------------------------------------------------------------- Auth
class LoginRequest(BaseModel):
    username: str
    password: str


class User(BaseModel):
    id: str
    username: str
    fullName: str
    email: EmailStr
    role: Role
    active: bool
    specialistId: str | None = None


class LoginResponse(BaseModel):
    user: User
    token: str


class PasswordResetRequestBody(BaseModel):
    email: EmailStr


class PasswordResetRequestResponse(BaseModel):
    demoToken: str | None = None


class PasswordResetConfirmBody(BaseModel):
    token: str
    newPassword: str = Field(min_length=6)


# ---------------------------------------------------------------- Users
class UserInput(BaseModel):
    username: str
    fullName: str
    email: EmailStr
    role: Role
    active: bool
    specialistId: str | None = None
    password: str | None = None


# ---------------------------------------------------------------- Categories
class Category(BaseModel):
    id: str
    code: str
    name: str
    active: bool


class CategoryInput(BaseModel):
    code: str
    name: str
    active: bool


class UsageWarning(BaseModel):
    specialists: int
    pendingAppointments: int


# ---------------------------------------------------------------- Specialists
class Specialist(BaseModel):
    id: str
    code: str
    fullName: str
    departmentIds: list[str]
    areaIds: list[str]
    active: bool


class SpecialistInput(BaseModel):
    code: str
    fullName: str
    departmentIds: list[str]
    areaIds: list[str]
    active: bool


class PendingAppointmentsResponse(BaseModel):
    count: int


# ---------------------------------------------------------------- Slots
class Slot(BaseModel):
    id: str
    specialistId: str
    start: datetime
    durationMin: int
    active: bool


class SlotWithBooked(Slot):
    booked: bool


class SlotsAddBody(BaseModel):
    starts: list[datetime]


class SlotActiveBody(BaseModel):
    active: bool


# ---------------------------------------------------------------- Settings
class Settings(BaseModel):
    durationMin: int
    yearLetters: dict[str, str]


class DurationBody(BaseModel):
    minutes: int = Field(ge=5, le=480)


class NeedsReviewResponse(BaseModel):
    needsReview: list[Slot]


class YearLettersBody(BaseModel):
    letters: str = Field(pattern=r"^[A-Za-z]{2}$")


# ---------------------------------------------------------------- Availability
class AvailabilityResult(BaseModel):
    specialist: Specialist
    slot: Slot


# ---------------------------------------------------------------- Assignments
class Assignment(BaseModel):
    id: str
    slotId: str
    specialistId: str
    start: datetime
    durationMin: int
    personName: str | None = None
    personPhone: str | None = None
    status: AssignmentStatus
    code: str | None = None
    createdAt: datetime
    createdBy: str
    confirmedAt: datetime | None = None
    confirmedBy: str | None = None
    closedAt: datetime | None = None
    closedBy: str | None = None
    closeReason: str | None = None


class CreateAssignmentBody(BaseModel):
    slotId: str
    personName: str | None = None
    personPhone: str | None = None


class ReasonBody(BaseModel):
    reason: str


# ---------------------------------------------------------------- Corrections
class CorrectionRequest(BaseModel):
    id: str
    assignmentId: str
    message: str
    createdBy: str
    createdAt: datetime


class CorrectionMessageBody(BaseModel):
    message: str
