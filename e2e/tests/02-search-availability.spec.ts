// Section 2: search and availability (scenarios 5–7).
import { messageOf, uid, type Api, type AvailabilityResult } from "../support/api";
import { lit, sql } from "../support/compose";
import { ADMIN, ORIENTADOR } from "../support/env";
import { choose, expect, searchBySpecialist, test, toast } from "../support/fixtures";
import { at, dayKey } from "../support/time";

const slotIds = (rs: AvailabilityResult[]) => rs.map((r) => r.slot.id);
const specialistIds = (rs: AvailabilityResult[]) => [...new Set(rs.map((r) => r.specialist.id))].sort();
const isSortedByStart = (rs: AvailabilityResult[]) =>
  rs.every((r, i) => i === 0 || new Date(rs[i - 1]!.slot.start) <= new Date(r.slot.start));

test.describe("Scenario 5 – search by department and area @critical", () => {
  test("only matching specialists, nearest first, same-time slots both shown, booked slots disappear", async ({
    admin,
    orientador,
    uiAs,
  }) => {
    const tag = uid();
    const d1 = await admin.createCategory("department", `Depto 1 ${tag}`);
    const d2 = await admin.createCategory("department", `Depto 2 ${tag}`);
    const a1 = await admin.createCategory("area", `Área 1 ${tag}`);
    const a2 = await admin.createCategory("area", `Área 2 ${tag}`);
    const A = await admin.createSpecialist(`Especialista A ${tag}`, [d1.id], [a1.id]);
    const B = await admin.createSpecialist(`Especialista B ${tag}`, [d1.id], [a2.id]);
    const C = await admin.createSpecialist(`Especialista C ${tag}`, [d2.id], [a1.id]);
    // Created out of order on purpose, to check the results are sorted.
    const [a11, a09] = await admin.addSlots(A.id, [at(10, 11), at(10, 9)]);
    const [b10, b09] = await admin.addSlots(B.id, [at(10, 10), at(10, 9)]);
    const [c08] = await admin.addSlots(C.id, [at(10, 8)]);

    const byD1 = await orientador.search("department", d1.id);
    expect(specialistIds(byD1)).toEqual([A.id, B.id].sort());
    expect(isSortedByStart(byD1)).toBe(true);
    expect(slotIds(byD1).slice(0, 2).sort()).toEqual([a09!.id, b09!.id].sort()); // same time: both appear
    expect(slotIds(byD1).slice(2)).toEqual([b10!.id, a11!.id]);

    const byD2 = await orientador.search("department", d2.id);
    expect(slotIds(byD2)).toEqual([c08!.id]);

    const byA1 = await orientador.search("area", a1.id);
    expect(specialistIds(byA1)).toEqual([A.id, C.id].sort());
    expect(slotIds(byA1)).toEqual([c08!.id, a09!.id, a11!.id]);

    const byA2 = await orientador.search("area", a2.id);
    expect(slotIds(byA2)).toEqual([b09!.id, b10!.id]);

    // Date filter (Colombia day).
    expect(slotIds(await orientador.search("area", a1.id, dayKey(a09!.start)))).toEqual([c08!.id, a09!.id, a11!.id]);
    expect(await orientador.search("area", a1.id, dayKey(at(11, 9)))).toEqual([]);

    // UI: department search lists only A and B, earliest first.
    const page = await uiAs(ORIENTADOR);
    await page.goto("/buscar");
    await choose(page.getByRole("combobox"), d1.name);
    const buttons = page.getByRole("main").getByRole("button").filter({ hasText: /^\d\d:\d\d/ });
    await expect(buttons).toHaveCount(4);
    const labels = await buttons.allInnerTexts();
    expect(labels.map((l) => l.split("\n")[0])).toEqual(["09:00", "09:00", "10:00", "11:00"]);
    expect(labels.join(" ")).toContain(A.fullName);
    expect(labels.join(" ")).toContain(B.fullName);
    expect(labels.join(" ")).not.toContain(C.fullName);

    // Booking A 09:00 removes it from every related search.
    await orientador.book(a09!.id);
    for (const [by, id] of [
      ["department", d1.id],
      ["area", a1.id],
      ["specialist", A.id],
    ] as const) {
      expect(slotIds(await orientador.search(by, id)), `${by} search`).not.toContain(a09!.id);
    }
    // B's slot at the same time is still there.
    expect(slotIds(await orientador.search("department", d1.id))).toContain(b09!.id);
  });
});

test.describe("Scenario 6 – preventing duplicate bookings @critical", () => {
  async function secondCounselor(admin: Api, apiAs: (c: { username: string; password: string }) => Promise<Api>) {
    const { creds } = await admin.createUser("orientador");
    return { creds, api: await apiAs(creds) };
  }

  const openAssignmentsForSlot = (slotId: string) =>
    Number(sql(`SELECT count(*) FROM assignments WHERE slot_id = ${lit(slotId)} AND status IN ('pending','confirmed')`)[0]![0]);

  test("server and database allow only one booking per slot under simultaneous requests", async ({
    admin,
    orientador,
    apiAs,
    makeWorld,
  }) => {
    const w = await makeWorld({ slotCount: 5 });
    const other = (await secondCounselor(admin, apiAs)).api;

    for (const slot of w.slots) {
      // 10 requests at the same moment, from two counselors.
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) => (i % 2 ? orientador : other).createAssignment(slot.id, `Carrera ${i}`)),
      );
      const statuses = responses.map((r) => r.status());
      expect(statuses.filter((s) => s === 201), `slot ${slot.id}: ${statuses}`).toHaveLength(1);
      for (const r of responses.filter((r) => r.status() !== 201)) {
        expect(r.status()).toBe(400);
        expect(await messageOf(r)).toBe("Este horario ya no está disponible. Busca y selecciona otro espacio.");
      }
      expect(openAssignmentsForSlot(slot.id)).toBe(1);
    }
  });

  test("two counselors saving the same slot in the UI: the second gets a clear message", async ({
    admin,
    apiAs,
    uiAs,
    makeWorld,
  }) => {
    const w = await makeWorld({ slotCount: 1 });
    const { creds } = await secondCounselor(admin, apiAs);
    const pages = [await uiAs(ORIENTADOR), await uiAs(creds)];

    // Both reach the review step for the same slot.
    for (const [i, page] of pages.entries()) {
      await searchBySpecialist(page, w.specialist);
      await page.getByRole("button", { name: "08:00" }).click();
      await page.locator("#name").fill(`Persona ${i}`);
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByRole("button", { name: "Guardar asignación" })).toBeVisible();
    }
    // Both save at nearly the same time.
    await Promise.all(pages.map((p) => p.getByRole("button", { name: "Guardar asignación" }).click()));

    const saved = pages.map((p) => p.getByRole("heading", { name: "Asignación guardada" }));
    const rejected = pages.map((p) => toast(p, "Este horario ya no está disponible. Busca y selecciona otro espacio."));
    await expect.poll(async () => {
      const s = await Promise.all(saved.map((l) => l.isVisible()));
      const r = await Promise.all(rejected.map((l) => l.isVisible()));
      return [s.filter(Boolean).length, r.filter(Boolean).length];
    }).toEqual([1, 1]);
    expect(openAssignmentsForSlot(w.slots[0]!.id)).toBe(1);
  });
});

test.describe("Scenario 7 – availability and duration rules", () => {
  test("duplicate and overlapping slots are rejected", async ({ admin, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    const { durationMin } = await admin.settings();
    const start = w.slots[0]!.start;
    const plus = (min: number) => new Date(new Date(start).getTime() + min * 60_000).toISOString();
    const clash = "Uno de los espacios está duplicado o se cruza con otro horario del especialista.";

    let r = await admin.post(`/specialists/${w.specialist.id}/slots`, { starts: [start] });
    expect(r.status()).toBe(400);
    expect(await messageOf(r)).toBe(clash);

    r = await admin.post(`/specialists/${w.specialist.id}/slots`, { starts: [plus(Math.floor(durationMin / 2))] });
    expect(r.status()).toBe(400);
    expect(await messageOf(r)).toBe(clash);

    // Duplicates inside one batch.
    r = await admin.post(`/specialists/${w.specialist.id}/slots`, { starts: [at(11, 9), at(11, 9)] });
    expect(r.status()).toBe(400);

    // Back-to-back is fine.
    await admin.addSlots(w.specialist.id, [plus(durationMin)]);
    expect(await admin.slots(w.specialist.id)).toHaveLength(2);
  });

  test("deactivate, reactivate, and refuse to reactivate an occupied time", async ({ admin, orientador, uiAs, makeWorld }) => {
    const w = await makeWorld({ slotCount: 2 });
    const [s8, s9] = w.slots as [typeof w.slots[0], typeof w.slots[0]];

    // Deactivate through the UI: it leaves the search.
    const page = await uiAs(ADMIN);
    await page.goto("/admin/disponibilidad");
    await choose(page.getByRole("combobox"), w.specialist.fullName);
    const r8 = page.getByRole("row").filter({ hasText: "08:00" });
    await r8.getByRole("button", { name: "Desactivar" }).click();
    await expect(r8).toContainText("Inactivo");
    expect(slotIds(await orientador.search("specialist", w.specialist.id))).not.toContain(s8!.id);

    // Reactivate with no conflict: back in the search.
    await r8.getByRole("button", { name: "Reactivar" }).click();
    await expect(r8).toContainText("Disponible");
    expect(slotIds(await orientador.search("specialist", w.specialist.id))).toContain(s8!.id);

    // Deactivate 08:00, add 07:30 (overlaps 08:00 only), then reactivating 08:00 must fail.
    expect((await admin.setSlotActive(s8!.id, false)).status()).toBe(200);
    await admin.addSlots(w.specialist.id, [at(10, 7, 30)]);
    let res = await admin.setSlotActive(s8!.id, true);
    expect(res.status()).toBe(400);
    expect(await messageOf(res)).toBe("No se puede reactivar: se cruza con otro horario del especialista.");

    // A booked slot can't be deactivated or reactivated.
    await orientador.book(s9!.id);
    res = await admin.setSlotActive(s9!.id, false);
    expect(res.status()).toBe(400);
    expect(await messageOf(res)).toBe("Este espacio tiene una asignación o cita; no se puede modificar.");
  });

  test("changing the global duration updates free slots only; existing appointments keep theirs", async ({
    admin,
    orientador,
    makeWorld,
  }) => {
    const original = (await admin.settings()).durationMin;
    const longer = original + 15;
    try {
      const w = await makeWorld({ slotCount: 4 }); // 08:00, 09:00, 10:00, 11:00
      const [s8, s9, s10, s11] = w.slots as [typeof w.slots[0], typeof w.slots[0], typeof w.slots[0], typeof w.slots[0]];
      // A slot right after 11:00 so that 11:00 can't grow without overlapping.
      const [tight] = await admin.addSlots(w.specialist.id, [at(10, 11, original)]);
      const pending = await orientador.book(s8!.id);
      const confirmed = await orientador.confirm((await orientador.book(s9!.id)).id);

      const { needsReview } = await admin.setDuration(longer);
      expect(needsReview.map((s) => s.id)).toContain(s11!.id);

      const after = new Map((await admin.slots(w.specialist.id)).map((s) => [s.id, s]));
      expect(after.get(s10!.id)!.durationMin).toBe(longer); // free, no conflict
      expect(after.get(tight!.id)!.durationMin).toBe(longer); // free, nothing after it
      expect(after.get(s11!.id)!.durationMin).toBe(original); // would overlap: left for review
      expect(after.get(s8!.id)!.durationMin).toBe(original); // pending
      expect(after.get(s9!.id)!.durationMin).toBe(original); // confirmed
      expect((await admin.assignment(pending.id)).durationMin).toBe(original);
      expect((await admin.assignment(confirmed.id)).durationMin).toBe(original);

      // New slots use the new duration.
      const [fresh] = await admin.addSlots(w.specialist.id, [at(10, 14)]);
      expect(fresh!.durationMin).toBe(longer);
    } finally {
      await admin.setDuration(original);
    }
  });
});
