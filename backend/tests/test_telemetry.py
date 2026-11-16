from app import telemetry


def test_resource_attributes_defaults(monkeypatch):
    for name in ("OTEL_SERVICE_NAME", "K_SERVICE", "APP_ENV", "APP_VERSION", "K_REVISION"):
        monkeypatch.delenv(name, raising=False)
    assert telemetry.resource_attributes() == {
        "service.name": "appointment-matchmaker",
        "deployment.environment.name": "local",
        "service.version": "dev",
    }


def test_resource_attributes_from_environment(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "am-prod")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_VERSION", "20261116-101500-abc1234")
    attrs = telemetry.resource_attributes()
    assert attrs["service.name"] == "am-prod"
    assert attrs["deployment.environment.name"] == "production"
    assert attrs["service.version"] == "20261116-101500-abc1234"
    monkeypatch.setenv("OTEL_SERVICE_NAME", "custom")
    assert telemetry.service_name() == "custom"


def test_enabled_only_with_endpoint(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_SDK_DISABLED", raising=False)
    assert not telemetry.enabled()
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    assert telemetry.enabled()
    monkeypatch.setenv("OTEL_SDK_DISABLED", "true")
    assert not telemetry.enabled()


def test_setup_exports_spans_with_resource(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("APP_VERSION", "v1")
    exporter = InMemorySpanExporter()
    provider = TracerProvider(resource=Resource.create(telemetry.resource_attributes()))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {}

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    TestClient(app).get("/ping")
    resource = exporter.get_finished_spans()[0].resource.attributes
    assert resource["deployment.environment.name"] == "dev"
    assert resource["service.version"] == "v1"
    assert resource["service.name"]
