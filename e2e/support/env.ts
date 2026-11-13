import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const COMPOSE_FILE = path.join(REPO_ROOT, "docker-compose.yaml");
/** A Compose project of its own, so the tests never touch a stack you run yourself. */
export const COMPOSE_PROJECT = process.env.E2E_COMPOSE_PROJECT ?? "appointment-matchmaker-e2e";
export const PORT = process.env.E2E_PORT ?? "18000";
export const BASE_URL = `http://localhost:${PORT}`;

/** Must match the defaults in docker-compose.yaml. */
export const DB_USER = "appointment";
export const DB_NAME = "appointment";

/** Demo accounts seeded into an empty database (SEED_DEMO_DATA=true). */
export const ADMIN = { username: "admin", password: "admin123" } as const;
export const ORIENTADOR = { username: "orientador", password: "orientador123" } as const;
export const ESPECIALISTA = { username: "especialista", password: "especialista123" } as const;
