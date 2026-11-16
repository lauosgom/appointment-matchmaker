"""OpenTelemetry tracing.

Every span carries a Resource with the service name, the environment and the
deployed version. Spans are exported over OTLP/HTTP only when an endpoint is
configured (OTEL_EXPORTER_OTLP_ENDPOINT); otherwise this module does nothing.

- service.name: OTEL_SERVICE_NAME, else the Cloud Run service (K_SERVICE), else "appointment-matchmaker"
- deployment.environment.name: APP_ENV (dev, production, ...), default "local"
- service.version: APP_VERSION (the image tag, baked in at build time), default "dev"
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

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
    return bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))


def resource_attributes() -> dict[str, str]:
    attributes = {
        "service.name": service_name(),
        "deployment.environment.name": environment(),
        "service.version": version(),
    }
    if revision := os.environ.get("K_REVISION"):  # set by Cloud Run
        attributes["service.instance.id"] = revision
    return attributes


def setup(app: FastAPI) -> None:
    """Trace HTTP requests. No-op unless an OTLP endpoint is configured."""
    if not enabled():
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=Resource.create(resource_attributes()))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    # Health probes would drown out real traffic.
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls="/api/health")
    log.info("OpenTelemetry on: %s", resource_attributes())
