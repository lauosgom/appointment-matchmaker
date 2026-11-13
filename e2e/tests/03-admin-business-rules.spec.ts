// Section 3: administration and business rules (scenarios 8–10).
import { messageOf, uid, type Assignment } from "../support/api";
import { lit, sql } from "../support/compose";
import { ADMIN, ORIENTADOR } from "../support/env";
import { CODE_RE, expect, row, test, toast } from "../support/fixtures";
import { at, colombiaYear, dayKey } from "../support/time";

test.describe("Scenario 8 – deactivating specialists and categories", () => {
  test("specialist without pending appointments: no warning, gone from new searches", async ({
    admin,
    orientador,
    uiAs,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const page = await uiAs(ADMIN);
    await page.goto("/admin/especialistas");
    await row(page, w.specialist.code).getByRole("button", { name: "Editar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Especialista actualizado")).toBeVisible();
    await expect(row(page, w.specialist.code)).toContainText("Inactivo");

    for (const [by, id] of [
      ["specialist", w.specialist.id],
      ["department", w.department.id],
      ["area", w.area.id],
    ] as const) {
      expect(await orientador.search(by, id), `${by} search`).toEqual([]);
    }
    // Not offered in the counselor's specialist picker either.
    const counselor = await uiAs(ORIENTADOR);
    await counselor.goto("/buscar");
    await counselor.getByRole("tab", { name: "Especialista" }).click();
    await counselor.getByRole("combobox").click();
    await expect(counselor.getByRole("option", { name: new RegExp(w.specialist.code) })).toHaveCount(0);
  });

  test("specialist with a future confirmed appointment: warning, appointment kept", async ({
    admin,
    orientador,
    uiAs,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const appt = await orientador.confirm((await orientador.book(w.slots[0]!.id)).id);

    const page = await uiAs(ADMIN);
    await page.goto("/admin/especialistas");
    await row(page, w.specialist.code).getByRole("button", { name: "Editar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Este especialista tiene 1 cita(s) o asignación(es) pendientes. Se conservarán, pero ya no aparecerá en nuevas búsquedas.",
    );
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(row(page, w.specialist.code)).toContainText("Inactivo");

    expect(await orientador.search("specialist", w.specialist.id)).toEqual([]);
    const kept = await admin.assignment(appt.id);
    expect(kept).toMatchObject({ status: "confirmed", code: appt.code, specialistId: w.specialist.id });
    // The specialist still sees it in their schedule.
    const specialistPage = await uiAs(w.specialistCreds);
    await specialistPage.goto("/agenda");
    await expect(row(specialistPage, appt.code!)).toBeVisible();
  });

  test("department and area deactivation warn about specialists and appointments", async ({
    admin,
    orientador,
    uiAs,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const appt = await orientador.confirm((await orientador.book(w.slots[0]!.id)).id);
    const page = await uiAs(ADMIN);
    await page.goto("/admin/catalogos");

    // Department with an associated specialist (and one appointment).
    await row(page.getByRole("tabpanel"), w.department.code).getByRole("button", { name: "Editar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await expect(dialog.getByRole("alert")).toContainText("Hay 1 especialista(s) asociados y 1 cita(s) pendientes.");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(row(page.getByRole("tabpanel"), w.department.code)).toContainText("Inactivo");

    // Area with a related appointment.
    await page.getByRole("tab", { name: "Áreas de intervención" }).click();
    await row(page.getByRole("tabpanel"), w.area.code).getByRole("button", { name: "Editar" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await expect(dialog.getByRole("alert")).toContainText("1 cita(s) pendientes");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(row(page.getByRole("tabpanel"), w.area.code)).toContainText("Inactivo");

    // Inactive categories give no results and aren't offered.
    expect(await orientador.search("department", w.department.id)).toEqual([]);
    expect(await orientador.search("area", w.area.id)).toEqual([]);
    const counselor = await uiAs(ORIENTADOR);
    await counselor.goto("/buscar");
    await counselor.getByRole("combobox").click();
    await expect(counselor.getByRole("option", { name: w.department.name })).toHaveCount(0);

    // Historical data keeps its associations.
    const spec = (await (await admin.get("/specialists")).json()).find((s: { id: string }) => s.id === w.specialist.id);
    expect(spec.departmentIds).toEqual([w.department.id]);
    expect(spec.areaIds).toEqual([w.area.id]);
    expect(await admin.assignment(appt.id)).toMatchObject({ status: "confirmed", code: appt.code, specialistId: w.specialist.id });
    // The specialist itself is still searchable directly.
    expect((await orientador.search("specialist", w.specialist.id)).length).toBeGreaterThan(0);
  });

  test("changing a department or area code keeps the relationships", async ({ admin, orientador, makeWorld }) => {
    const w = await makeWorld();
    const appt = await orientador.confirm((await orientador.book(w.slots[0]!.id)).id);
    const dept = await admin.updateCategory("department", { ...w.department, code: `NEW-${uid()}` });
    const area = await admin.updateCategory("area", { ...w.area, code: `NEW-${uid()}` });
    expect(dept.id).toBe(w.department.id);
    expect(area.id).toBe(w.area.id);

    const spec = (await (await admin.get("/specialists")).json()).find((s: { id: string }) => s.id === w.specialist.id);
    expect(spec.departmentIds).toEqual([w.department.id]);
    expect(spec.areaIds).toEqual([w.area.id]);
    expect((await orientador.search("department", dept.id)).length).toBe(w.slots.length - 1);
    expect((await orientador.search("area", area.id)).length).toBe(w.slots.length - 1);
    expect(await admin.assignment(appt.id)).toMatchObject({ code: appt.code, specialistId: w.specialist.id });

    // A code already used by another department is refused.
    const other = await admin.createCategory("department", `Otro ${uid()}`);
    const clash = await admin.put(`/categories/department/${other.id}`, { ...other, code: dept.code });
    expect(clash.status()).toBe(400);
  });
});

test.describe("Scenario 9 – appointment codes", () => {
  const number = (code: string) => Number(code.slice(2));

  test("codes use the year's letters, numbering is global, cancelled codes are never reused", async ({
    admin,
    orientador,
    makeWorld,
  }) => {
    const year = colombiaYear();
    const nextYear = String(Number(year) + 1);
    const before = await admin.settings();
    try {
      await admin.setYearLetters(year, "AK");
      await admin.setYearLetters(nextYear, "BL");
      const w = await makeWorld({ slotCount: 6 });
      const confirm = async (i: number) => orientador.confirm((await orientador.book(w.slots[i]!.id)).id);

      // Several confirmations this year.
      const first = [await confirm(0), await confirm(1), await confirm(2)];
      const codes = first.map((a) => a.code!);
      for (const c of codes) expect(c).toMatch(/^AK\d{5}$/);
      expect(new Set(codes).size).toBe(3);
      expect(number(codes[1]!)).toBeGreaterThan(number(codes[0]!));
      expect(number(codes[2]!)).toBeGreaterThan(number(codes[1]!));

      // An appointment that takes place next year is coded by the year it was confirmed in.
      const [nextYearSlot] = await admin.addSlots(w.specialist.id, [at(daysUntilNextYear() + 10, 9)]);
      const nextYearAppt = await orientador.confirm((await orientador.book(nextYearSlot!.id)).id);
      expect(nextYearAppt.code).toMatch(/^AK\d{5}$/);

      // Cancel one; the next confirmation gets a new number and the old code stays put.
      const cancelled = await admin.cancel(first[1]!.id, "Prueba de códigos");
      expect(cancelled.code).toBe(codes[1]);
      const afterCancel = await confirm(3);
      expect(afterCancel.code).not.toBe(codes[1]);
      expect(number(afterCancel.code!)).toBeGreaterThan(number(nextYearAppt.code!));
      // Re-booking the freed slot also gets a fresh code.
      const rebooked = await orientador.confirm((await orientador.book(first[1]!.slotId)).id);
      expect(number(rebooked.code!)).toBeGreaterThan(number(afterCancel.code!));

      // Changing this year's letters affects new codes only.
      await admin.setYearLetters(year, "ZQ");
      const afterChange = await confirm(4);
      expect(afterChange.code).toMatch(/^ZQ\d{5}$/);
      expect(number(afterChange.code!)).toBeGreaterThan(number(rebooked.code!));
      const all = await admin.assignments({ specialistId: w.specialist.id });
      const byId = new Map(all.map((a) => [a.id, a.code]));
      for (const a of [...first, nextYearAppt, afterCancel, rebooked]) expect(byId.get(a.id)).toBe(a.code);

      // Database-wide: no code and no running number appears twice.
      expect(sql("SELECT code FROM assignments WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1")).toEqual([]);
      expect(
        sql("SELECT substr(code, 3) FROM assignments WHERE code IS NOT NULL GROUP BY substr(code, 3) HAVING count(*) > 1"),
      ).toEqual([]);
    } finally {
      for (const [y, l] of Object.entries(before.yearLetters)) await admin.setYearLetters(y, l);
    }
  });

  test.fixme("a confirmation made in the next year uses the next year's letters", async () => {
    // Needs control over the server clock: the year comes from the time of
    // confirmation (server now), which the docker-compose stack can't fake.
  });

  test("confirming is refused when the current year has no letters", async ({ admin, orientador, makeWorld }) => {
    const year = colombiaYear();
    const before = (await admin.settings()).yearLetters[year];
    const w = await makeWorld({ slotCount: 1 });
    const a = await orientador.book(w.slots[0]!.id);
    try {
      sql(`DELETE FROM year_letters WHERE year = ${lit(year)}`);
      const r = await orientador.post(`/assignments/${a.id}/confirm`);
      expect(r.status()).toBe(400);
      expect(await messageOf(r)).toBe(`No hay letras configuradas para el año ${year}. Pide al administrador que las configure.`);
      expect((await admin.assignment(a.id)).status).toBe("pending");
    } finally {
      await admin.setYearLetters(year, before ?? "AK");
    }
  });
});

function daysUntilNextYear(): number {
  const now = new Date(Date.now() - 5 * 3600_000);
  const jan1 = Date.UTC(now.getUTCFullYear() + 1, 0, 1);
  return Math.ceil((jan1 - now.getTime()) / 86_400_000);
}

test.describe("Scenario 10 – statuses and dates", () => {
  /** Moves a booked slot and its assignment to another time (naive UTC, as the app stores it). */
  function moveTo(a: Assignment, when: string) {
    const ts = lit(new Date(when).toISOString().replace("T", " ").replace("Z", ""));
    sql(`UPDATE slots SET start = ${ts} WHERE id = ${lit(a.slotId)}; UPDATE assignments SET start = ${ts} WHERE id = ${lit(a.id)};`);
  }

  test("future, today, just-passed and earlier appointments", async ({ admin, orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 4 });
    const names = ["Futura", "Hoy más tarde", "Recién pasada", "Ayer"].map((n) => `${n} ${uid()}`);
    const [future, later, justPassed, yesterday] = await Promise.all(
      w.slots.map(async (s, i) => orientador.confirm((await orientador.book(s.id, names[i])).id)),
    ) as [Assignment, Assignment, Assignment, Assignment];

    const now = Date.now();
    const laterToday = new Date(now + 30 * 60_000).toISOString();
    const hasLaterToday = dayKey(laterToday) === dayKey(new Date(now));
    moveTo(later, laterToday);
    moveTo(justPassed, new Date(now - 2 * 60_000).toISOString());
    moveTo(yesterday, at(-1, 10));

    // Status: past ones show as "past"; the stored status stays "confirmed" (never "completed").
    const past = (await admin.assignments({ specialistId: w.specialist.id, status: "past" })).map((a) => a.id).sort();
    expect(past).toEqual([justPassed.id, yesterday.id].sort());
    const upcoming = (await admin.assignments({ specialistId: w.specialist.id, status: "confirmed" })).map((a) => a.id).sort();
    expect(upcoming).toEqual([future.id, later.id].sort());
    const stored = sql(`SELECT DISTINCT status FROM assignments WHERE specialist_id = ${lit(w.specialist.id)}`).flat();
    expect(stored).toEqual(["confirmed"]);

    // Past appointments can't be cancelled.
    for (const a of [justPassed, yesterday]) {
      const r = await admin.post(`/assignments/${a.id}/cancel`, { reason: "tarde" });
      expect(r.status()).toBe(400);
      expect(await messageOf(r)).toBe("No se puede cancelar una cita cuya fecha y hora ya pasaron.");
    }

    // Specialist schedule: today, upcoming and history.
    const page = await uiAs(w.specialistCreds);
    await page.goto("/agenda");
    const section = (title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
    if (hasLaterToday) await expect(row(section("Hoy"), names[1]!)).toContainText("Confirmada");
    else test.info().annotations.push({ type: "note", description: "Too close to midnight to place an appointment later today." });
    if (dayKey(new Date(now - 2 * 60_000)) === dayKey(new Date(now)))
      await expect(row(section("Hoy"), names[2]!)).toContainText("Fecha pasada");
    await expect(row(section("Próximas"), names[0]!)).toContainText("Confirmada");
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(row(page.getByRole("tabpanel"), names[3]!)).toContainText("Fecha pasada");

    // Admin view: past rows show "Fecha pasada", have no Cancel button, and nothing is "Completada".
    const adminPage = await uiAs(ADMIN);
    await adminPage.goto("/asignaciones");
    await adminPage.getByRole("tab", { name: "Todas" }).click();
    const panel = adminPage.getByRole("tabpanel");
    for (const n of [names[2]!, names[3]!]) {
      await expect(row(panel, n)).toContainText("Fecha pasada");
      await expect(row(panel, n).getByRole("button", { name: "Cancelar" })).toHaveCount(0);
    }
    await expect(row(panel, names[0]!).getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect(panel.getByText(/Completad/)).toHaveCount(0);
    expect(future.code).toMatch(CODE_RE);
  });
});
