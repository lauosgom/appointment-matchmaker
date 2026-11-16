"""Business and database metrics, read back through an in-memory OpenTelemetry reader."""

import pytest
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.resources import Resource

from app import metrics, telemetry
from tests.test_assignments import free_slot


@pytest.fixture
def reader(session_factory, monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("APP_VERSION", "v1")
    reader = InMemoryMetricReader()
    provider = MeterProvider(resource=Resource.create(telemetry.resource_attributes()), metric_readers=[reader])
    metrics.bind(provider.get_meter(metrics.METER_NAME), session_factory)
    yield reader
    metrics.bind(metrics.otel_metrics.get_meter(metrics.METER_NAME))  # back to no-ops


def points(reader, name):
    """{frozenset(attributes): value} for one metric (histograms: the count)."""
    data = reader.get_metrics_data()
    out = {}
    for resource_metrics in data.resource_metrics if data else []:
        for scope in resource_metrics.scope_metrics:
            for metric in scope.metrics:
                if metric.name == name:
                    for p in metric.data.data_points:
                        out[frozenset(p.attributes.items())] = p.value if hasattr(p, "value") else p.count
    return out


def outcome(reader, name):
    return {dict(k).get("outcome") or dict(k).get("reason") or dict(k).get("state"): v for k, v in points(reader, name).items()}


def book(client, headers, slot_id, who="Juan"):
    return client.post("/api/assignments", json={"slotId": slot_id, "personName": who}, headers=headers)


def test_every_data_point_carries_environment_and_version(client, reader, orientador_headers):
    book(client, orientador_headers, free_slot(client, orientador_headers)["id"])
    resource = reader.get_metrics_data().resource_metrics[0].resource.attributes
    assert resource["deployment.environment.name"] == "dev"
    assert resource["service.version"] == "v1"
    assert resource["service.name"]


def test_hold_confirm_and_discard_are_counted(client, reader, orientador_headers):
    slots = client.get("/api/specialists/s1/slots", headers=orientador_headers).json()
    free = [s for s in slots if not s["booked"]]
    held = book(client, orientador_headers, free[0]["id"]).json()
    gone = book(client, orientador_headers, free[1]["id"], "Ana").json()
    client.post(f"/api/assignments/{gone['id']}/discard", json={"reason": "no contesta"}, headers=orientador_headers)
    confirmed = client.post(f"/api/assignments/{held['id']}/confirm", headers=orientador_headers)
    counts = outcome(reader, "assignments.transitions")
    assert counts["held"] == 2
    assert counts["discarded"] == 1
    assert confirmed.status_code == 200
    assert counts["confirmed"] == 1


def test_booking_a_taken_slot_counts_a_conflict(client, reader, orientador_headers):
    slot = free_slot(client, orientador_headers)
    assert book(client, orientador_headers, slot["id"]).status_code == 201
    assert book(client, orientador_headers, slot["id"], "Otro").status_code == 400
    assert outcome(reader, "bookings.conflicts") == {"already_booked": 1}


def test_slots_gauge_counts_states(client, reader, orientador_headers, session_factory):
    with session_factory() as session:
        before = metrics.count_slots(session)
    book(client, orientador_headers, free_slot(client, orientador_headers)["id"])
    states = outcome(reader, "slots.count")
    assert states["held"] == before["held"] + 1
    assert states["open"] == before["open"] - 1


def test_health_check_is_timed(client, reader):
    assert client.get("/api/health").status_code == 200
    assert sum(points(reader, "db.health.check.duration").values()) == 1
    assert not points(reader, "db.health.failures")


def test_sql_statements_are_timed(client, reader, session_factory):
    metrics.instrument_engine(session_factory.kw["bind"])
    client.get("/api/health")
    assert sum(points(reader, "db.query.duration").values()) >= 1
