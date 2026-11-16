"""OpenTelemetry traces and metrics.

Every span and metric carries a Resource with the service name, the environment and the
deployed version. Spans are exported over OTLP/HTTP only when an endpoint is
configured (OTEL_EXPORTER_OTLP_ENDPOINT); otherwise this module does nothing.

- service.name: OTEL_SERVICE_NAME, else the Cloud Run service (K_SERVICE), else "appointment-matchmaker"
- deployment.environment.name: APP_ENV (dev, production, ...), default "local"
- service.version: APP_VERSION (the image tag, baked in at build time), default "dev"
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable

from fastapi import FastAPI
from sqlalchemy import Engine

log = logging.getLogger(__name__)


def service_name() -> str:
    return os.environ.get("OTEL_SERVICE_NAME") or os.environ.get("K_SERVICE") or "appointment-matchmaker"


def environment() -> str:
    return os.environ.get("APP_ENV") or "local"


def version() -> str:
    return os.environ.get("APP_VERSION") or "dev"


def enabled() -> bool:
    if os.environ.get("OTEL_SDK_DISABLED", "").strip().lower() in ("1", "true", "yes", "on"):
        return False
    return bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"))


def resource_attributes() -> dict[str, str]:
    attributes = {
        "service.name": service_name(),
        "deployment.environment.name": environment(),
        "service.version": version(),
    }
    if revision := os.environ.get("K_REVISION"):  # set by Cloud Run
        attributes["service.instance.id"] = revision
    return attributes


_providers: list = []


def setup(app: FastAPI, engine: Engine, session_factory: Callable) -> None:
    """Export traces and metrics over OTLP. No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set."""
    if not enabled():
        return
    from opentelemetry import metrics as otel_metrics
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    from . import metrics

    resource = Resource.create(resource_attributes())
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)
    meter_provider = MeterProvider(resource=resource, metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())])
    otel_metrics.set_meter_provider(meter_provider)
    _providers[:] = [tracer_provider, meter_provider]

    # Health probes would drown out real traffic.
    FastAPIInstrumentor.instrument_app(
        app, tracer_provider=tracer_provider, meter_provider=meter_provider, excluded_urls="/api/health"
    )
    metrics.bind(meter_provider.get_meter(metrics.METER_NAME), session_factory)
    metrics.instrument_engine(engine)
    log.info("OpenTelemetry on: %s", resource_attributes())


def shutdown() -> None:
    """Flush what is still buffered (called when the app stops)."""
    for provider in _providers:
        provider.shutdown()
    _providers.clear()
