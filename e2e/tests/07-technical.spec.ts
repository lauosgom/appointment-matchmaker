// Section 7: additional technical checks — performance, concurrency,
// integrity, persistence, backup/restore and basic security.
import { request } from "@playwright/test";

import { Api, expectStatus, uid } from "../support/api";
import { compose, lit, sql, waitForApp } from "../support/compose";
import { ADMIN, BASE_URL, DB_NAME, DB_USER, ORIENTADOR } from "../support/env";
import { CODE_RE, expect, loginUI, logoutUI, test } from "../support/fixtures";

const BUDGET_MS = Number(process.env.E2E_PERF_BUDGET_MS ?? 1000);

test("performance: availability search and appointment lists answer quickly", async ({ admin, orientador }) => {
  const timed = async (fn: () => Promise<unknown>) => {
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      await fn();
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b);
  };
  const departments = await expectStatus<{ id: string }[]>(await orientador.get("/categories/department"), 200);
  const searches = await timed(() => orientador.search("department", departments[0]!.id));
  const lists = await timed(() => admin.assignments());
  const mine = await timed(() => orientador.assignments({ createdBy: orientador.user.id }));
  for (const [name, t] of [["search", searches], ["admin list", lists], ["my assignments", mine]] as const) {
    test.info().annotations.push({ type: "timing", description: `${name}: median ${t[5]!.toFixed(0)} ms, max ${t[9]!.toFixed(0)} ms` });
    expect(t[8]!, `${name} p90 under ${BUDGET_MS} ms`).toBeLessThan(BUDGET_MS);
  }
});

test("concurrency: several counselors booking and confirming at once", async ({ admin, apiAs, makeWorld }) => {
  const w = await makeWorld({ slotCount: 6 });
  const counselors = await Promise.all(
    Array.from({ length: 6 }, async () => apiAs((await admin.createUser("orientador")).creds)),
  );
  const results = await Promise.all(
    counselors.map(async (c, i) => c.confirm((await c.book(w.slots[i]!.id, `Concurrente ${i}`)).id)),
  );
  const codes = results.map((a) => a.code!);
  for (const c of codes) expect(c).toMatch(CODE_RE);
  expect(new Set(codes).size).toBe(6);
  expect(await admin.assignments({ specialistId: w.specialist.id })).toHaveLength(6);
});

test("integrity: no repeated codes and no slot held twice, across the whole database", async () => {
  expect(sql("SELECT code FROM assignments WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1"), "repeated codes").toEqual([]);
  expect(
    sql("SELECT slot_id, count(*) FROM assignments WHERE status IN ('pending','confirmed') GROUP BY slot_id HAVING count(*) > 1"),
    "slots with more than one open assignment",
  ).toEqual([]);
  expect(
    sql("SELECT id, status FROM assignments WHERE (status IN ('confirmed','cancelled')) <> (code IS NOT NULL)"),
    "codes exactly on confirmed/cancelled records",
  ).toEqual([]);
  expect(
    sql("SELECT a.id FROM assignments a JOIN slots s ON s.id = a.slot_id WHERE s.specialist_id <> a.specialist_id"),
    "assignments matching their slot's specialist",
  ).toEqual([]);
});

test("persistence: data survives restarting the containers", async ({ orientador, makeWorld }) => {
  test.setTimeout(180_000);
  const w = await makeWorld({ slotCount: 1 });
  const appt = await orientador.confirm((await orientador.book(w.slots[0]!.id, `Reinicio ${uid()}`)).id);

  compose(["restart", "db", "app"], { quiet: true });
  await waitForApp();

  // Sessions are stored in the database too, but log in afresh as a user would.
  const after = await Api.login(ADMIN);
  try {
    expect(await after.assignment(appt.id)).toMatchObject({ status: "confirmed", code: appt.code, personName: appt.personName });
    expect((await after.slots(w.specialist.id))[0]).toMatchObject({ id: w.slots[0]!.id, booked: true });
  } finally {
    await after.dispose();
  }
});

test("recovery: a pg_dump backup restores into a working copy", async ({ orientador, makeWorld }) => {
  const w = await makeWorld({ slotCount: 1 });
  const appt = await orientador.confirm((await orientador.book(w.slots[0]!.id, `Respaldo ${uid()}`)).id);
  const restored = `${DB_NAME}_restore_e2e`;
  const counts = (db: string) =>
    sql("SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM specialists), (SELECT count(*) FROM slots), (SELECT count(*) FROM assignments)", db)[0];

  const dump = compose(["exec", "-T", "db", "pg_dump", "-U", DB_USER, "-d", DB_NAME, "--no-owner"], { quiet: true });
  expect(dump).toContain("CREATE TABLE public.assignments");
  try {
    sql(`DROP DATABASE IF EXISTS ${restored}`);
    sql(`CREATE DATABASE ${restored}`);
    compose(["exec", "-T", "db", "psql", "-U", DB_USER, "-d", restored, "-v", "ON_ERROR_STOP=1", "-q"], { input: dump, quiet: true });
    expect(counts(restored)).toEqual(counts(DB_NAME));
    expect(sql(`SELECT code, person_name FROM assignments WHERE id = ${lit(appt.id)}`, restored)).toEqual([[appt.code!, appt.personName!]]);
  } finally {
    sql(`DROP DATABASE IF EXISTS ${restored}`);
  }
});

test.describe("security basics", () => {
  test("passwords are never returned and are stored hashed", async ({ admin }) => {
    const { user, creds } = await admin.createUser("orientador");
    const listed = await expectStatus<Record<string, unknown>[]>(await admin.get("/users"), 200);
    for (const u of listed) expect(Object.keys(u).filter((k) => /pass|hash/i.test(k))).toEqual([]);
    expect(JSON.stringify(listed)).not.toContain(creds.password);

    const [[hash]] = sql(`SELECT password_hash FROM users WHERE id = ${lit(user.id)}`) as [[string]];
    expect(hash).not.toContain(creds.password);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  test("session tokens are long, random and per login", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const a = await Api.login(ORIENTADOR);
      expect(a.token.length).toBeGreaterThanOrEqual(32);
      tokens.add(a.token);
      await a.dispose();
    }
    expect(tokens.size).toBe(3);
  });

  test("logging out ends the session on the server", async ({ page }) => {
    await loginUI(page, ORIENTADOR);
    const token = await page.evaluate(() =>
      Object.entries(sessionStorage).find(([k, v]) => /token/i.test(k) && v)?.[1] ?? "",
    );
    expect(token, "the browser holds a session token").not.toBe("");
    await logoutUI(page);

    const anon = await request.newContext({ baseURL: BASE_URL });
    await expect
      .poll(async () => (await anon.get("/api/assignments", { headers: { Authorization: `Bearer ${token}` } })).status(), {
        message: "a token used before logging out must stop working",
      })
      .toBe(401);
    await anon.dispose();
  });

  test("no personal data in the HTML of public pages", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toMatch(/@telefono\.org|300\d{7}/);
  });
});
