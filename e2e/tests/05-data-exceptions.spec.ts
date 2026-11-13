// Section 5: data and exceptional situations.
import { messageOf, uid } from "../support/api";
import { lit, sql } from "../support/compose";
import { ADMIN, ORIENTADOR } from "../support/env";
import { choose, CODE_RE, expect, loginUI, logoutUI, row, searchBySpecialist, test, toast } from "../support/fixtures";

const openForSlot = (slotId: string) =>
  Number(sql(`SELECT count(*) FROM assignments WHERE slot_id = ${lit(slotId)}`)[0]![0]);

test.describe("Person data validation", () => {
  test("neither name nor mobile: the form won't continue and the server refuses", async ({ orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const page = await uiAs(ORIENTADOR);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await expect(page.getByText("Ingresa al menos el nombre o el celular; puedes ingresar ambos.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await page.locator("#name").fill("   ");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();

    const r = await orientador.createAssignment(w.slots[0]!.id, "  ", "");
    expect(r.status()).toBe(400);
    expect(await messageOf(r)).toBe("Ingresa al menos el nombre o el número de celular de la persona.");
    expect(openForSlot(w.slots[0]!.id)).toBe(0);
  });

  test("only a name is enough", async ({ admin, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const person = `Solo Nombre ${uid()}`;
    const page = await uiAs(ORIENTADOR);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill(person);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(page.getByRole("heading", { name: "Asignación guardada" })).toBeVisible();
    const [a] = await admin.assignments({ specialistId: w.specialist.id });
    expect(a).toMatchObject({ personName: person, status: "pending" });
    expect(a!.personPhone ?? null).toBeNull();
  });

  test("only a mobile number is enough", async ({ admin, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const page = await uiAs(ORIENTADOR);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#phone").fill("310-555-1234");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(page.getByRole("heading", { name: "Asignación guardada" })).toBeVisible();
    const [a] = await admin.assignments({ specialistId: w.specialist.id });
    expect(a).toMatchObject({ personPhone: "310-555-1234", status: "pending" });
    expect(a!.personName ?? null).toBeNull();
  });

  test("an invalid mobile number gets a clear message", async ({ orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const page = await uiAs(ORIENTADOR);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill("Persona");
    await page.locator("#phone").fill("abc123");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(toast(page, "El número de celular no es válido.")).toBeVisible();
    expect(openForSlot(w.slots[0]!.id)).toBe(0);

    for (const bad of ["123", "1234567890123456", "300 abc 4567"]) {
      const r = await orientador.createAssignment(w.slots[0]!.id, "Persona", bad);
      expect(r.status(), bad).toBe(400);
      expect(await messageOf(r)).toBe("El número de celular no es válido.");
    }
  });
});

test.describe("Repeated and interrupted operations", () => {
  test("confirming the same assignment twice never yields two codes", async ({ admin, orientador, makeWorld }) => {
    const w = await makeWorld({ slotCount: 2 });

    // One after the other.
    const a = await orientador.book(w.slots[0]!.id);
    const first = await orientador.confirm(a.id);
    const again = await orientador.post(`/assignments/${a.id}/confirm`);
    expect(again.status()).toBe(400);
    expect(await messageOf(again)).toBe("Solo se pueden confirmar asignaciones pendientes.");
    expect((await admin.assignment(a.id)).code).toBe(first.code);

    // At the same moment (double click, two admins).
    const b = await orientador.book(w.slots[1]!.id);
    const responses = await Promise.all([
      ...Array.from({ length: 3 }, () => orientador.post(`/assignments/${b.id}/confirm`)),
      ...Array.from({ length: 3 }, () => admin.post(`/assignments/${b.id}/confirm`)),
    ]);
    const ok = responses.filter((r) => r.status() === 200);
    const codes = await Promise.all(ok.map(async (r) => (await r.json()).code as string));
    expect(ok.length, `statuses ${responses.map((r) => r.status())}, codes returned ${codes}`).toBe(1);
    expect((await admin.assignment(b.id)).code).toBe(codes[0]);
  });

  test("a session closed mid-operation leaves no partial record", async ({ admin, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const { user, creds } = await admin.createUser("orientador");
    const page = await uiAs(creds);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill("Sesión cerrada");
    await page.getByRole("button", { name: "Continuar" }).click();

    // The session ends on the server (e.g. closed from elsewhere) before saving.
    sql(`DELETE FROM sessions WHERE user_id = ${lit(user.id)}`);
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(toast(page, "Tu sesión no es válida. Vuelve a iniciar sesión.")).toBeVisible();
    expect(openForSlot(w.slots[0]!.id)).toBe(0);
    // The slot is still bookable.
    expect((await admin.search("specialist", w.specialist.id)).map((r) => r.slot.id)).toContain(w.slots[0]!.id);
  });

  test("losing the connection while confirming: retrying doesn't confirm twice", async ({ admin, orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const person = `Sin conexión ${uid()}`;
    const a = await orientador.book(w.slots[0]!.id, person);
    const page = await uiAs(ADMIN);
    await page.goto("/asignaciones");
    const r = row(page.getByRole("tabpanel"), person);

    // The request reaches the server, but the answer never gets back.
    await page.route("**/api/assignments/*/confirm", async (route) => {
      await route.fetch();
      await route.abort("internetdisconnected");
    }, { times: 1 });
    await r.getByRole("button", { name: "Confirmar" }).click();
    await expect(toast(page, "No se pudo conectar con el servidor")).toBeVisible();

    // The user retries.
    await r.getByRole("button", { name: "Confirmar" }).click();
    await expect(toast(page, "Solo se pueden confirmar asignaciones pendientes.")).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Todas" }).click();
    const rows = row(page.getByRole("tabpanel"), person);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Confirmada");
    const confirmed = await admin.assignment(a.id);
    expect(confirmed.code).toMatch(CODE_RE);
    expect(await admin.assignments({ specialistId: w.specialist.id })).toHaveLength(1);
  });

  test("two admins changing the same slot: stale screens are handled", async ({ admin, orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 2 });
    const [one, two] = [await uiAs(ADMIN), await uiAs(ADMIN)];
    for (const p of [one, two]) {
      await p.goto("/admin/disponibilidad");
      await choose(p.getByRole("combobox"), w.specialist.fullName);
      await expect(p.getByRole("row").filter({ hasText: "Disponible" })).toHaveCount(2);
    }

    // Both deactivate 08:00; the second one acts on a stale screen.
    await one.getByRole("row").filter({ hasText: "08:00" }).getByRole("button", { name: "Desactivar" }).click();
    await expect(one.getByRole("row").filter({ hasText: "08:00" })).toContainText("Inactivo");
    await two.getByRole("row").filter({ hasText: "08:00" }).getByRole("button", { name: "Desactivar" }).click();
    await expect(two.getByRole("row").filter({ hasText: "08:00" })).toContainText("Inactivo");
    expect((await admin.slots(w.specialist.id)).find((s) => s.id === w.slots[0]!.id)!.active).toBe(false);

    // 09:00 gets booked while the second admin's screen still shows it free.
    await orientador.book(w.slots[1]!.id);
    await two.getByRole("row").filter({ hasText: "09:00" }).getByRole("button", { name: "Desactivar" }).click();
    await expect(toast(two, "Este espacio tiene una asignación o cita; no se puede modificar.")).toBeVisible();
    const s9 = (await admin.slots(w.specialist.id)).find((s) => s.id === w.slots[1]!.id)!;
    expect(s9).toMatchObject({ active: true, booked: true });
  });

  test("two admins reactivating overlapping slots at once: at most one wins", async ({ admin, apiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 }); // 08:00
    const { durationMin } = await admin.settings();
    const s8 = w.slots[0]!;
    // An overlapping slot can only be added while 08:00 is inactive.
    expect((await admin.setSlotActive(s8.id, false)).status()).toBe(200);
    const half = new Date(new Date(s8.start).getTime() + (durationMin / 2) * 60_000).toISOString();
    const [overlap] = await admin.addSlots(w.specialist.id, [half]);
    expect((await admin.setSlotActive(overlap!.id, false)).status()).toBe(200);

    const { creds } = await admin.createUser("admin");
    const otherAdmin = await apiAs(creds);
    const results = await Promise.all([admin.setSlotActive(s8.id, true), otherAdmin.setSlotActive(overlap!.id, true)]);
    const active = (await admin.slots(w.specialist.id)).filter((s) => s.active);
    expect(active.length, `statuses ${results.map((r) => r.status())}; both overlapping slots active`).toBe(1);
  });

  test("data is still there after logging out and back in", async ({ uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const person = `Persistente ${uid()}`;
    const page = await uiAs(ORIENTADOR);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill(person);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await page.getByRole("button", { name: "Confirmar definitivamente" }).click();
    const code = (await page.locator(".font-mono").innerText()).trim();

    await logoutUI(page);
    await page.goto("/asignaciones");
    await expect(page).toHaveURL(/\/$/); // logged out for real in the browser
    await loginUI(page, ORIENTADOR);
    await page.goto("/asignaciones");
    const r = row(page.getByRole("tabpanel"), person);
    await expect(r).toContainText(code);
    await expect(r).toContainText("Confirmada");
  });
});
