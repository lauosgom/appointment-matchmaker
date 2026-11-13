import { execFileSync } from "node:child_process";

import { BASE_URL, COMPOSE_FILE, COMPOSE_PROJECT, DB_NAME, DB_USER, MAIL_PORT, PORT } from "./env";

const env = { ...process.env, APP_PORT: PORT, MAIL_UI_PORT: MAIL_PORT };

/** Runs `docker compose` against the e2e project and returns stdout. */
export function compose(args: string[], opts: { input?: string; quiet?: boolean } = {}): string {
  return execFileSync("docker", ["compose", "-f", COMPOSE_FILE, "-p", COMPOSE_PROJECT, ...args], {
    env,
    input: opts.input,
    encoding: "utf8",
    stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", opts.quiet ? "pipe" : "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Runs SQL in the Postgres container and returns the rows as arrays of strings. */
export function sql(query: string, database = DB_NAME): string[][] {
  const out = compose(
    ["exec", "-T", "db", "psql", "-U", DB_USER, "-d", database, "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", query],
    { quiet: true },
  );
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

/** Escapes a value for a single-quoted SQL literal. */
export const lit = (v: string) => `'${v.replaceAll("'", "''")}'`;

export async function waitForApp(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/settings`);
      // 401 means the API is up and answering (settings need a login).
      if (res.status === 401 || res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The app did not come up at ${BASE_URL} (${last})`);
}
