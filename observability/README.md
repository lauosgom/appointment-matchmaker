# Observability stack

OpenTelemetry Collector, Prometheus, Loki, Tempo and Grafana, as a Compose
project of its own: it shares nothing with the application stack and can be
started, stopped and wiped independently.

```sh
cd observability
docker compose up -d     # Grafana: http://localhost:3000 (admin / admin)
docker compose down -v   # stop and delete the data
```

| service | role | host port |
|---|---|---|
| otel-collector | receives OTLP, routes traces → Tempo, metrics → Prometheus, logs → Loki | 4317 (gRPC), 4318 (HTTP) |
| prometheus | metrics (via remote write from the Collector) | 9090 |
| loki | logs | 3100 |
| tempo | traces | 3200 |
| grafana | UI, datasources provisioned | 3000 |

Ports are bound to `127.0.0.1` only. Change the Grafana login with
`GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`. This is a local/dev setup:
no authentication on the backends, 7-day retention, data in Docker volumes.

## Sending the app's telemetry here

The backend exports traces when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (see
[backend/README.md](../backend/README.md#telemetry-opentelemetry)):

```sh
# API run on the host
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 APP_ENV=local make run
```

For the app's own Compose stack, point it at the host's published port, e.g.
`OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318` (on Linux add
`extra_hosts: ["host.docker.internal:host-gateway"]` to the `app` service).

Open Grafana → Dashboards for the metrics. For traces, Explore → Tempo and search by `resource.service.name`,
`resource.deployment.environment.name` or `resource.service.version`.

## Dashboard

Grafana loads the **Appointment Matchmaker** dashboard
([`grafana/dashboards/`](grafana/dashboards)) with `environment` and `version`
filters. It shows the five tracked metrics: slots by state, hold-to-confirm rate,
booking conflicts, p95 latency and 5xx rate per route (also by version), and
database query time and health. The metrics are defined in
[`backend/app/metrics.py`](../backend/app/metrics.py). Prometheus names them with
underscores and units (e.g. `bookings_conflicts_total`,
`http_server_request_duration_seconds_bucket`), with the resource attributes as
labels (`deployment_environment_name`, `service_version`, `service_name`).

The backend produces traces and metrics; the logs pipeline is ready for when it
emits logs.

## Grafana Cloud (dev and production)

The deployed services send their telemetry straight to Grafana Cloud's OTLP
gateway; this Compose stack is only for local work. Grafana Cloud has a free plan
with monthly usage limits (check the current limits on its pricing page).

1. Create a free Grafana Cloud stack. On its **OpenTelemetry** tile, create a token
   (it needs permission to publish metrics and traces) and copy the OTLP endpoint
   (`https://otlp-gateway-<zone>.grafana.net/otlp`) and the
   `Authorization=Basic <token>` header.
2. Put the endpoint in `deploy/gcp/config.env` (dev) and `deploy/gcp/config.prod.env`
   (production) as `OTEL_EXPORTER_OTLP_ENDPOINT`.
3. Run `./deploy/gcp/deploy.sh` and `./deploy/gcp/deploy.sh --env prod`. Each asks for
   the header once, keeps it in Secret Manager and hands it to the service as
   `OTEL_EXPORTER_OTLP_HEADERS`. Later CI deploys only change the image, so the
   setting stays.
4. In Grafana Cloud, import `grafana/dashboards/appointment-matchmaker.json`
   (Dashboards → New → Import) and pick its Prometheus data source.

Check after the first traffic: Grafana Cloud only turns some resource attributes
into metric labels by default (`service.name` becomes `job`; `service.version` is
normally on the list; `deployment.environment.name` may not be). The others stay
in the `target_info` series. If the dashboard's **Environment** filter is empty, add
`deployment.environment.name` to the promoted resource attributes in your stack's
OTLP settings, or filter by `job` instead: dev and production already have different
service names. The dashboard has not been tried against Grafana Cloud yet.
