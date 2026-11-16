"""Application metrics (OpenTelemetry).

Instruments are no-ops until `telemetry.setup` binds them to a real meter, so
the code can record unconditionally. Every data point carries the Resource's
service.name, deployment.environment.name and service.version (see telemetry.py).

| metric | kind | attributes | answers |
|---|---|---|---|
| slots.count | gauge | state = open / held / confirmed | is there supply for the demand? |
| assignments.transitions | counter | outcome = held / confirmed / discarded / cancelled | hold-to-confirm rate |
| bookings.conflicts | counter | reason = already_booked / concurrent_booking | double-booking attempts |
| db.query.duration | histogram (s) | db.system | database latency |
| db.health.check.duration | histogram (s) | | /api/health query time |
| db.health.failures | counter | | /api/health could not reach the database |

HTTP latency and error rate per route come from the FastAPI instrumentation
(http.server.request.duration, with http.route and http.response.status_code).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone

from opentelemetry import metrics as otel_metrics
from opentelemetry.metrics import CallbackOptions, Meter, Observation
from sqlalchemy import Engine, event, func, select

log = logging.getLogger(__name__)

METER_NAME = "appointment_matchmaker"

transitions = None
conflicts = None
query_duration = None
health_duration = None
health_failures = None


def bind(meter: Meter, session_factory: Callable | None = None) -> None:
    """Create the instruments on `meter`. `session_factory` enables the slots gauge."""
    global transitions, conflicts, query_duration, health_duration, health_failures
    transitions = meter.create_counter(
        "assignments.transitions",
        unit="{assignment}",
        description="Assignments by outcome: held (created), confirmed, discarded, cancelled",
    )
    conflicts = meter.create_counter(
        "bookings.conflicts",
        unit="{attempt}",
        description="Attempts to book a slot that someone else already holds",
    )
    query_duration = meter.create_histogram(
        "db.query.duration", unit="s", description="Time spent executing one SQL statement"
    )
    health_duration = meter.create_histogram(
        "db.health.check.duration", unit="s", description="Time of the /api/health database query"
    )
    health_failures = meter.create_counter(
        "db.health.failures", unit="{check}", description="/api/health checks that could not reach the database"
    )
    if session_factory is not None:
        meter.create_observable_gauge(
            "slots.count",
            callbacks=[_slots_callback(session_factory)],
            unit="{slot}",
            description="Upcoming slots by state: open (bookable), held (pending assignment), confirmed",
        )


bind(otel_metrics.get_meter(METER_NAME))


def count_slots(session) -> dict[str, int]:
    """Upcoming slots by state. Imported lazily: store.py imports this module."""
    from .tables import AssignmentRow, SlotRow, SpecialistRow

    now = datetime.now(timezone.utc)
    taken = select(AssignmentRow.slot_id).where(AssignmentRow.status.in_(("pending", "confirmed")))
    open_slots = session.scalar(
        select(func.count())
        .select_from(SlotRow)
        .join(SpecialistRow, SpecialistRow.id == SlotRow.specialist_id)
        .where(SlotRow.active.is_(True), SpecialistRow.active.is_(True), SlotRow.start > now, SlotRow.id.not_in(taken))
    )
    held = session.scalar(select(func.count()).select_from(AssignmentRow).where(AssignmentRow.status == "pending"))
    confirmed = session.scalar(
        select(func.count())
        .select_from(AssignmentRow)
        .where(AssignmentRow.status == "confirmed", AssignmentRow.start > now)
    )
    return {"open": open_slots or 0, "held": held or 0, "confirmed": confirmed or 0}


def _slots_callback(session_factory: Callable):
    def callback(_options: CallbackOptions):
        try:
            with session_factory() as session:
                counts = count_slots(session)
        except Exception:  # the database being down must not break metric export
            log.warning("Could not count slots for telemetry", exc_info=True)
            return
        for state, value in counts.items():
            yield Observation(value, {"state": state})

    return callback


def instrument_engine(engine: Engine) -> None:
    """Record the duration of every SQL statement in db.query.duration."""

    @event.listens_for(engine, "before_cursor_execute")
    def _start(conn, _cursor, _statement, _parameters, _context, _executemany) -> None:
        conn.info.setdefault("query_start", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def _stop(conn, _cursor, _statement, _parameters, _context, _executemany) -> None:
        started = conn.info.get("query_start")
        if started:
            query_duration.record(time.perf_counter() - started.pop(), {"db.system": engine.dialect.name})
