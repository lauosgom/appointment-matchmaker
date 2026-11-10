"""SQLAlchemy ORM tables.

Only portable column types are used (String, Integer, Boolean, Text and a
UTC-normalising DateTime), so the same schema works on SQLite, PostgreSQL,
MySQL, etc. Datetimes are stored as naive UTC and always come back as aware
UTC datetimes, regardless of how the backend handles time zones.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, TypeDecorator, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ID = String(40)


class UTCDateTime(TypeDecorator[datetime]):
    impl = DateTime(timezone=False)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


CREATED_AT = dict(default=_utcnow)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    username: Mapped[str] = mapped_column(String(150), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean)
    specialist_id: Mapped[str | None] = mapped_column(ID, ForeignKey("specialists.id"), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, **CREATED_AT)


class CategoryRow(Base):
    """Departments and intervention areas share one table, told apart by `kind`."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("kind", "code"),)

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, **CREATED_AT)


class SpecialistCategoryRow(Base):
    __tablename__ = "specialist_categories"

    specialist_id: Mapped[str] = mapped_column(ID, ForeignKey("specialists.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[str] = mapped_column(ID, ForeignKey("categories.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)

    category: Mapped[CategoryRow] = relationship(lazy="joined")


class SpecialistRow(Base):
    __tablename__ = "specialists"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, **CREATED_AT)

    links: Mapped[list[SpecialistCategoryRow]] = relationship(
        cascade="all, delete-orphan", order_by=SpecialistCategoryRow.position, lazy="selectin"
    )


class SlotRow(Base):
    __tablename__ = "slots"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    specialist_id: Mapped[str] = mapped_column(ID, ForeignKey("specialists.id"), index=True)
    start: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    duration_min: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean)


class AssignmentRow(Base):
    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    slot_id: Mapped[str] = mapped_column(ID, ForeignKey("slots.id"), index=True)
    specialist_id: Mapped[str] = mapped_column(ID, ForeignKey("specialists.id"), index=True)
    start: Mapped[datetime] = mapped_column(UTCDateTime)
    duration_min: Mapped[int] = mapped_column(Integer)
    person_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    person_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_by: Mapped[str] = mapped_column(ID, ForeignKey("users.id"), index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    confirmed_by: Mapped[str | None] = mapped_column(ID, ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    closed_by: Mapped[str | None] = mapped_column(ID, ForeignKey("users.id"), nullable=True)
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class CorrectionRequestRow(Base):
    __tablename__ = "correction_requests"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    assignment_id: Mapped[str] = mapped_column(ID, ForeignKey("assignments.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(ID, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)


class AppSettingsRow(Base):
    """Single-row table (id == 1) with global settings."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duration_min: Mapped[int] = mapped_column(Integer)


class YearLettersRow(Base):
    __tablename__ = "year_letters"

    year: Mapped[str] = mapped_column(String(4), primary_key=True)
    letters: Mapped[str] = mapped_column(String(2))


class CounterRow(Base):
    """Named monotonically increasing counters (e.g. confirmation code numbers)."""

    __tablename__ = "counters"

    name: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[int] = mapped_column(Integer)


class SessionRow(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[str] = mapped_column(ID, ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class LoginAttemptRow(Base):
    """Failed-login counter/lockout per lower-cased username."""

    __tablename__ = "login_attempts"

    username_key: Mapped[str] = mapped_column(String(150), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class PasswordResetTokenRow(Base):
    __tablename__ = "password_reset_tokens"

    token: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[str] = mapped_column(ID, ForeignKey("users.id"))
