// Section 1: end-to-end tests of the main workflow (scenarios 1–4).
import { expectStatus, uid, type Assignment } from "../support/api";
import { ADMIN, ORIENTADOR } from "../support/env";
import { choose, CODE_RE, expect, row, searchBySpecialist, test, toast } from "../support/fixtures";
import { formatDate, formatTime, local, toIso } from "../support/time";

test.describe("Scenario 1 – create an appointment from scratch", () => {
  test("admin sets up a specialist, counselor books, admin confirms, specialist sees it @critical", async ({
    uiAs,
    admin,
  }) => {
    const tag = uid();
    const deptName = `Depto S1 ${tag}`;
    const areaName = `Área S1 ${tag}`;
    const specName = `Dra. Escenario Uno ${tag}`;
    const specCode = `S1-${tag}`;
    const person = `Juana Pérez ${tag}`;
    const phone = "3104567890";
    const slotTimes = [local(12, 9), local(12, 10), local(12, 11)];

    const adminPage = await uiAs(ADMIN);

    // Step 2 (done first, so it can be picked): department and area of intervention.
    await test.step("admin creates a department and an area", async () => {
      await adminPage.goto("/admin/catalogos");
      await adminPage.getByRole("button", { name: "Nuevo departamento" }).click();
      let dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("textbox").nth(0).fill(`D${tag}`);
      await dialog.getByRole("textbox").nth(1).fill(deptName);
      await dialog.getByRole("button", { name: "Guardar" }).click();
      await expect(row(adminPage, deptName)).toContainText("Activo");

      await adminPage.getByRole("tab", { name: "Áreas de intervención" }).click();
      await adminPage.getByRole("button", { name: "Nueva área" }).click();
      dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("textbox").nth(0).fill(`A${tag}`);
      await dialog.getByRole("textbox").nth(1).fill(areaName);
      await dialog.getByRole("button", { name: "Guardar" }).click();
      await expect(row(adminPage, areaName)).toContainText("Activo");
    });

    // Steps 1–2: specialist with its department and area.
    await test.step("admin creates the specialist with department and area", async () => {
      await adminPage.goto("/admin/especialistas");
      await adminPage.getByRole("button", { name: "Nuevo especialista" }).click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("textbox").nth(0).fill(specCode);
      await dialog.getByRole("textbox").nth(1).fill(specName);
      await dialog.getByRole("checkbox", { name: deptName }).click();
      await dialog.getByRole("checkbox", { name: areaName }).click();
      await dialog.getByRole("button", { name: "Guardar" }).click();
      await expect(toast(adminPage, "Especialista creado")).toBeVisible();
      const r = row(adminPage, specName);
      await expect(r).toContainText(specCode);
      await expect(r).toContainText(deptName);
      await expect(r).toContainText(areaName);
      await expect(r).toContainText("Activo");
    });

    const specialist = (await expectStatus<{ id: string; code: string; fullName: string; departmentIds: string[]; areaIds: string[]; active: boolean }[]>(
      await admin.get("/specialists"),
      200,
    )).find((s) => s.code === specCode)!;
    expect(specialist.active).toBe(true);
    expect(specialist.departmentIds).toHaveLength(1);
    expect(specialist.areaIds).toHaveLength(1);

    // Step 3: several slots.
    await test.step("admin registers several slots", async () => {
      await adminPage.goto("/admin/disponibilidad");
      await choose(adminPage.getByRole("combobox"), specName);
      for (let i = 0; i < slotTimes.length; i++) {
        if (i > 0) await adminPage.getByRole("button", { name: "Otra fila" }).click();
        await adminPage.locator('input[type="datetime-local"]').nth(i).fill(slotTimes[i]!);
      }
      await adminPage.getByRole("button", { name: "Guardar espacios" }).click();
      await expect(toast(adminPage, "3 espacio(s) agregados")).toBeVisible();
      await expect(adminPage.getByRole("row").filter({ hasText: "Disponible" })).toHaveCount(3);
    });

    // A login for the specialist, to check their schedule at the end.
    const { creds: specialistCreds } = await admin.createUser("especialista", { specialistId: specialist.id, fullName: specName });

    // Step 4: counselor logs in and sees their menu.
    const counselorPage = await uiAs(ORIENTADOR);
    await test.step("counselor sees only their menu", async () => {
      const main = counselorPage.getByRole("main");
      await expect(main.getByRole("link", { name: /Buscar disponibilidad/ })).toBeVisible();
      await expect(main.getByRole("link", { name: /Asignaciones y citas/ })).toBeVisible();
      await expect(main.getByRole("link", { name: /Usuarios/ })).toHaveCount(0);
      await expect(main.getByRole("link", { name: /Disponibilidad$/ })).toHaveCount(0);
    });

    // Step 5: search by specialist.
    const firstStart = toIso(slotTimes[0]!);
    await test.step("counselor searches by specialist and sees the slots", async () => {
      await searchBySpecialist(counselorPage, specialist);
      const day = counselorPage.locator("div").filter({ has: counselorPage.getByText(formatDate(firstStart), { exact: true }) });
      for (const t of ["09:00", "10:00", "11:00"]) await expect(day.getByRole("button", { name: t }).first()).toBeVisible();
    });

    // Steps 6–7: pick a slot, enter name and phone, review and save.
    await test.step("counselor picks a slot, enters the person and saves a pending assignment", async () => {
      await counselorPage.getByRole("button", { name: "09:00" }).click();
      await counselorPage.locator("#name").fill(person);
      await counselorPage.locator("#phone").fill(phone);
      await counselorPage.getByRole("button", { name: "Continuar" }).click();
      await expect(counselorPage.getByRole("heading", { name: "Revisa antes de guardar" })).toBeVisible();
      const summary = counselorPage.locator("dl");
      await expect(summary).toContainText(person);
      await expect(summary).toContainText(phone);
      await expect(summary).toContainText(specName);
      await expect(summary).toContainText(formatDate(firstStart));
      await expect(summary).toContainText("09:00");
      await counselorPage.getByRole("button", { name: "Guardar asignación" }).click();
      await expect(counselorPage.getByRole("heading", { name: "Asignación guardada" })).toBeVisible();
      await expect(counselorPage.getByText("Pendiente de confirmación", { exact: true })).toBeVisible();
    });

    // Step 8: admin sees the pending assignment and the blocked slot.
    await test.step("admin finds the pending assignment and the blocked slot", async () => {
      await adminPage.goto("/asignaciones");
      const pendingRow = row(adminPage.getByRole("tabpanel"), person);
      await expect(pendingRow).toContainText("Pendiente de confirmación");
      await expect(pendingRow).toContainText(specName);
      await expect(pendingRow).toContainText("09:00");

      await adminPage.goto("/admin/disponibilidad");
      await choose(adminPage.getByRole("combobox"), specName);
      await expect(row(adminPage, "09:00")).toContainText("Reservado");
      await expect(adminPage.getByRole("row").filter({ hasText: "Disponible" })).toHaveCount(2);
    });

    // Step 9: admin confirms; status Confirmed and a code.
    let code = "";
    await test.step("admin confirms and a code is generated", async () => {
      await adminPage.goto("/asignaciones");
      await row(adminPage.getByRole("tabpanel"), person).getByRole("button", { name: "Confirmar" }).click();
      await expect(toast(adminPage, "Cita confirmada")).toBeVisible();
      await adminPage.getByRole("tab", { name: "Todas" }).click();
      const confirmedRow = row(adminPage.getByRole("tabpanel"), person);
      await expect(confirmedRow).toContainText("Confirmada");
      code = (await confirmedRow.getByRole("cell").first().innerText()).trim();
      expect(code).toMatch(CODE_RE);
    });

    // Step 10: specialist sees the appointment.
    await test.step("specialist sees the confirmed appointment in their schedule", async () => {
      const specialistPage = await uiAs(specialistCreds);
      await expect(specialistPage.getByRole("main").getByRole("link", { name: /Mi agenda/ })).toBeVisible();
      await specialistPage.goto("/agenda");
      const r = row(specialistPage, code);
      await expect(r).toContainText(person);
      await expect(r).toContainText("Confirmada");
      await expect(r).toContainText(formatDate(firstStart));
      await expect(r).toContainText(formatTime(firstStart));
    });

    // Acceptance: all three roles see it, with one unique code.
    await test.step("all three roles see it and the code is unique", async () => {
      const all = await admin.assignments();
      expect(all.filter((a) => a.code === code)).toHaveLength(1);
      await counselorPage.goto("/asignaciones");
      await counselorPage.getByRole("tab", { name: "Citas confirmadas" }).click();
      await expect(row(counselorPage.getByRole("tabpanel"), code)).toContainText(person);
    });
  });
});

test.describe("Scenario 2 – confirmation by the counselor", () => {
  test("counselor confirms their own pending assignment from the list @critical", async ({
    uiAs,
    admin,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const person = `Carlos S2 ${uid()}`;
    const page = await uiAs(ORIENTADOR);

    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill(person);
    await page.locator("#phone").fill("3001112233");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(page.getByRole("heading", { name: "Asignación guardada" })).toBeVisible();

    await page.goto("/asignaciones");
    const mine = row(page.getByRole("tabpanel"), person);
    await expect(mine).toContainText("Pendiente de confirmación");
    await mine.getByRole("button", { name: "Confirmar" }).click();
    await expect(toast(page, "Cita confirmada")).toBeVisible();
    await expect(mine).toContainText("Confirmada");
    const code = (await mine.getByRole("cell").first().innerText()).trim();
    expect(code).toMatch(CODE_RE);

    // Admin sees the confirmed appointment.
    const adminPage = await uiAs(ADMIN);
    await adminPage.goto("/asignaciones");
    await adminPage.getByRole("tab", { name: "Todas" }).click();
    await expect(row(adminPage.getByRole("tabpanel"), code)).toContainText("Confirmada");

    // Specialist sees it.
    const specialistPage = await uiAs(w.specialistCreds);
    await specialistPage.goto("/agenda");
    await expect(row(specialistPage, code)).toContainText(person);

    // No second record: exactly one assignment exists for that slot.
    const forSpecialist = await admin.assignments({ specialistId: w.specialist.id });
    expect(forSpecialist).toHaveLength(1);
    expect(forSpecialist[0]).toMatchObject({ status: "confirmed", code, personName: person });
  });
});

test.describe("Scenario 3 – discarding a pending assignment", () => {
  for (const by of ["counselor", "admin"] as const) {
    test(`${by} discards with a reason; history keeps it and the slot is free again`, async ({
      uiAs,
      admin,
      orientador,
      makeWorld,
    }) => {
      const w = await makeWorld();
      const slot = w.slots[0]!;
      const person = `Discard ${by} ${uid()}`;
      const reason = `La persona no puede asistir (${by})`;
      const created = await orientador.book(slot.id, person);

      // The held slot is out of every search.
      expect((await orientador.search("specialist", w.specialist.id)).map((r) => r.slot.id)).not.toContain(slot.id);

      const page = await uiAs(by === "admin" ? ADMIN : ORIENTADOR);
      await page.goto("/asignaciones");
      await row(page.getByRole("tabpanel"), person).getByRole("button", { name: "Descartar" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "Descartar" })).toBeDisabled(); // reason is required
      await dialog.locator("#reason").fill(reason);
      await dialog.getByRole("button", { name: "Descartar" }).click();
      await expect(toast(page, "Asignación descartada; el horario quedó libre")).toBeVisible();

      // Admin history shows it with the reason and who closed it.
      const adminPage = by === "admin" ? page : await uiAs(ADMIN);
      await adminPage.goto("/asignaciones");
      await adminPage.getByRole("tab", { name: "Historial" }).click();
      const hist = row(adminPage.getByRole("tabpanel"), person);
      await expect(hist).toContainText("Descartada");
      await expect(hist).toContainText(`Motivo: ${reason}`);
      await expect(hist).toContainText(by === "admin" ? "Ana Administradora" : "Óscar Orientador");

      const after = await admin.assignment(created.id);
      expect(after.status).toBe("discarded");
      expect(after.code ?? null).toBeNull();
      expect(after.closeReason).toBe(reason);
      expect(after.closedBy).toBe(by === "admin" ? admin.user.id : orientador.user.id);
      expect(Date.now() - new Date(after.closedAt!).getTime()).toBeLessThan(5 * 60_000);

      // The slot is bookable again.
      expect((await orientador.search("specialist", w.specialist.id)).map((r) => r.slot.id)).toContain(slot.id);
    });
  }
});

test.describe("Scenario 4 – cancelling a confirmed appointment", () => {
  test("correction request, admin cancellation and a new assignment with pre-filled person", async ({
    uiAs,
    admin,
    orientador,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const slot = w.slots[0]!;
    const person = `Cancel ${uid()}`;
    const phone = "3209876543";
    const original = await orientador.confirm((await orientador.book(slot.id, person, phone)).id);
    expect(original.code).toMatch(CODE_RE);

    // Counselor asks for a correction.
    const counselorPage = await uiAs(ORIENTADOR);
    await counselorPage.goto("/asignaciones");
    await counselorPage.getByRole("tab", { name: "Citas confirmadas" }).click();
    await row(counselorPage.getByRole("tabpanel"), original.code!).getByRole("button", { name: "Solicitar corrección" }).click();
    await counselorPage.getByRole("dialog").locator("#reason").fill("El apellido está mal escrito");
    await counselorPage.getByRole("dialog").getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(toast(counselorPage, "Solicitud enviada al administrador")).toBeVisible();
    // Counselors cannot cancel.
    await expect(row(counselorPage.getByRole("tabpanel"), original.code!).getByRole("button", { name: "Cancelar" })).toHaveCount(0);

    // Admin sees the request and cancels the appointment with a reason.
    const adminPage = await uiAs(ADMIN);
    await adminPage.goto("/asignaciones");
    await adminPage.getByRole("tab", { name: /Correcciones/ }).click();
    await expect(adminPage.getByRole("tabpanel")).toContainText(original.code!);
    await expect(adminPage.getByRole("tabpanel")).toContainText("El apellido está mal escrito");

    await adminPage.getByRole("tab", { name: "Todas" }).click();
    await row(adminPage.getByRole("tabpanel"), original.code!).getByRole("button", { name: "Cancelar" }).click();
    await adminPage.getByRole("dialog").locator("#reason").fill("Datos incorrectos, se reprograma");
    await adminPage.getByRole("dialog").getByRole("button", { name: "Cancelar cita" }).click();

    // The system offers a new assignment.
    const offer = toast(adminPage, "Cita cancelada");
    await expect(offer).toContainText("¿Quieres iniciar una nueva asignación para la misma persona?");

    const cancelled = await admin.assignment(original.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.code).toBe(original.code); // historical code kept
    expect(cancelled.closeReason).toBe("Datos incorrectos, se reprograma");
    // The slot is free again.
    expect((await orientador.search("specialist", w.specialist.id)).map((r) => r.slot.id)).toContain(slot.id);

    await offer.getByRole("button", { name: "Nueva asignación" }).click();
    await expect(adminPage).toHaveURL(/\/buscar\?/);
    // Specialist and slot must be chosen again.
    await expect(adminPage.getByText("Selecciona un criterio para ver los próximos horarios disponibles.")).toBeVisible();
    await adminPage.getByRole("tab", { name: "Especialista" }).click();
    await choose(adminPage.getByRole("combobox"), `${w.specialist.fullName} (${w.specialist.code})`);
    await adminPage.getByRole("button", { name: "09:00" }).click();
    // Name and phone are pre-filled.
    await expect(adminPage.locator("#name")).toHaveValue(person);
    await expect(adminPage.locator("#phone")).toHaveValue(phone);
    await adminPage.getByRole("button", { name: "Continuar" }).click();
    await adminPage.getByRole("button", { name: "Guardar asignación" }).click();
    await adminPage.getByRole("button", { name: "Confirmar definitivamente" }).click();
    const newCode = (await adminPage.locator(".font-mono").innerText()).trim();
    expect(newCode).toMatch(CODE_RE);
    expect(newCode).not.toBe(original.code);

    // The cancelled record keeps its code; the new one is separate.
    const records: Assignment[] = await admin.assignments({ specialistId: w.specialist.id });
    expect(records.map((a) => [a.status, a.code]).sort()).toEqual(
      [
        ["cancelled", original.code],
        ["confirmed", newCode],
      ].sort(),
    );
  });
});
