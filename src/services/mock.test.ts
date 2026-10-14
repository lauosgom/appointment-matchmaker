import { beforeEach, describe, expect, it } from "vitest";

import { fromColombiaLocal } from "@/lib/datetime";
import { createMockServices, createSeedState, LOCK_MS, MAX_FAILED_ATTEMPTS } from "./mock";
import type { AppServices } from "./types";

const ADMIN = "u1";
const ORIENT = "u2";
const SPEC_USER = "u3";

let clock: Date;
let svc: AppServices;

beforeEach(() => {
  clock = new Date("2026-03-10T15:00:00Z");
  svc = createMockServices({ now: () => clock, initial: createSeedState(clock) });
});

async function firstSlot() {
  const res = await svc.availability.search({ by: "specialist", id: "s1" });
  return res[0]!.slot;
}

describe("auth", () => {
  it("logs in with valid credentials", async () => {
    const u = await svc.auth.login("admin", "admin123");
    expect(u.role).toBe("admin");
    expect(u).not.toHaveProperty("password");
  });

  it("locks the account for 5 minutes after repeated failures", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(svc.auth.login("admin", "bad")).rejects.toThrow();
    }
    await expect(svc.auth.login("admin", "admin123")).rejects.toThrow(/bloqueado/);
    clock = new Date(clock.getTime() + LOCK_MS + 1000);
    await expect(svc.auth.login("admin", "admin123")).resolves.toBeTruthy();
  });

  it("rejects deactivated accounts", async () => {
    const u = await svc.users.get(ORIENT);
    await svc.users.update(ADMIN, ORIENT, { ...u!, active: false });
    await expect(svc.auth.login("orientador", "orientador123")).rejects.toThrow(/desactivada/);
  });

  it("resets the password with a valid token only once", async () => {
    const { demoToken } = await svc.auth.requestPasswordReset("admin@telefono.org");
    await svc.auth.resetPassword(demoToken!, "nueva123");
    await expect(svc.auth.login("admin", "nueva123")).resolves.toBeTruthy();
    await expect(svc.auth.resetPassword(demoToken!, "otra123")).rejects.toThrow();
  });
});

describe("catalogs", () => {
  it("prevents duplicate specialist codes", async () => {
    await expect(
      svc.specialists.create(ADMIN, { code: "esp-001", fullName: "X", departmentIds: [], areaIds: [], active: true }),
    ).rejects.toThrow(/código/);
  });

  it("prevents duplicate category codes and blocks non-admins", async () => {
    await expect(svc.categories.create(ADMIN, "area", { code: "DUE", name: "x", active: true })).rejects.toThrow();
    await expect(svc.categories.create(ORIENT, "area", { code: "NEW", name: "x", active: true })).rejects.toThrow(/permiso/);
  });

  it("hides inactive specialists from search", async () => {
    const s = (await svc.specialists.list()).find((x) => x.id === "s1")!;
    await svc.specialists.update(ADMIN, "s1", { ...s, active: false });
    expect(await svc.availability.search({ by: "specialist", id: "s1" })).toHaveLength(0);
  });
});

describe("availability", () => {
  it("rejects duplicate and overlapping slots", async () => {
    const start = fromColombiaLocal("2026-04-01T10:00");
    await svc.slots.add(ADMIN, "s1", [start]);
    await expect(svc.slots.add(ADMIN, "s1", [start])).rejects.toThrow(/cruza/);
    await expect(svc.slots.add(ADMIN, "s1", [fromColombiaLocal("2026-04-01T10:30")])).rejects.toThrow();
    await expect(svc.slots.add(ADMIN, "s2", [start])).resolves.toHaveLength(1);
  });

  it("search by department returns slots sorted by date", async () => {
    const res = await svc.availability.search({ by: "department", id: "d1" });
    expect(res.length).toBeGreaterThan(0);
    const starts = res.map((r) => r.slot.start);
    expect([...starts].sort()).toEqual(starts);
    expect(new Set(res.map((r) => r.specialist.id))).toEqual(new Set(["s1", "s2"]));
  });

  it("keeps durations of booked slots when global duration changes", async () => {
    const slot = await firstSlot();
    await svc.assignments.create(ORIENT, { slotId: slot.id, personName: "Ana" });
    await svc.settings.setDuration(ADMIN, 60);
    const slots = await svc.slots.list("s1");
    expect(slots.find((s) => s.id === slot.id)!.durationMin).toBe(45);
    expect(slots.filter((s) => !s.booked).every((s) => s.durationMin === 60)).toBe(true);
  });
});

describe("assignment flow", () => {
  it("requires name or phone", async () => {
    const slot = await firstSlot();
    await expect(svc.assignments.create(ORIENT, { slotId: slot.id })).rejects.toThrow(/nombre o el número/);
  });

  it("pending assignment blocks the slot across all categories", async () => {
    const slot = await firstSlot();
    await svc.assignments.create(ORIENT, { slotId: slot.id, personPhone: "3001234567" });
    const byArea = await svc.availability.search({ by: "area", id: "a1" });
    expect(byArea.some((r) => r.slot.id === slot.id)).toBe(false);
    await expect(svc.assignments.create(ADMIN, { slotId: slot.id, personName: "B" })).rejects.toThrow(/disponible/);
  });

  it("confirms with a global sequential code using the year letters", async () => {
    const res = await svc.availability.search({ by: "department", id: "d1" });
    const a1 = await svc.assignments.create(ORIENT, { slotId: res[0]!.slot.id, personName: "A" });
    const a2 = await svc.assignments.create(ORIENT, { slotId: res[1]!.slot.id, personName: "B" });
    expect((await svc.assignments.confirm(ORIENT, a1.id)).code).toBe("AK00001");
    await svc.settings.setYearLetters(ADMIN, "2026", "ZZ");
    expect((await svc.assignments.confirm(ADMIN, a2.id)).code).toBe("ZZ00002");
    const list = await svc.assignments.list(ADMIN);
    expect(list.find((a) => a.id === a1.id)!.code).toBe("AK00001");
  });

  it("only the initiating orientador or an admin can confirm", async () => {
    const other = await svc.users.create(ADMIN, {
      username: "otro", fullName: "Otro", email: "o@x.org", role: "orientador", active: true, password: "123456",
    });
    const a = await svc.assignments.create(ORIENT, { slotId: (await firstSlot()).id, personName: "A" });
    await expect(svc.assignments.confirm(other.id, a.id)).rejects.toThrow(/Solo el orientador/);
    await expect(svc.assignments.discard(other.id, a.id, "x")).rejects.toThrow();
  });

  it("discard requires a reason and frees the slot", async () => {
    const slot = await firstSlot();
    const a = await svc.assignments.create(ORIENT, { slotId: slot.id, personName: "A" });
    await expect(svc.assignments.discard(ORIENT, a.id, " ")).rejects.toThrow(/motivo/);
    const d = await svc.assignments.discard(ORIENT, a.id, "Persona no responde");
    expect(d.status).toBe("discarded");
    expect(d.code).toBeUndefined();
    expect((await firstSlot()).id).toBe(slot.id);
  });

  it("cancel is admin-only, never reuses codes and blocks past appointments", async () => {
    const slot = await firstSlot();
    const a = await svc.assignments.create(ORIENT, { slotId: slot.id, personName: "A" });
    await svc.assignments.confirm(ORIENT, a.id);
    await expect(svc.assignments.cancel(ORIENT, a.id, "x")).rejects.toThrow(/permiso/);
    await svc.assignments.cancel(ADMIN, a.id, "Error en datos");
    const b = await svc.assignments.create(ADMIN, { slotId: slot.id, personName: "A" });
    expect((await svc.assignments.confirm(ADMIN, b.id)).code).toBe("AK00002");

    clock = new Date(new Date(slot.start).getTime() + 3600_000);
    await expect(svc.assignments.cancel(ADMIN, b.id, "tarde")).rejects.toThrow(/pasaron/);
    const past = await svc.assignments.list(ADMIN, { status: "past" });
    expect(past.map((x) => x.id)).toContain(b.id);
  });

  it("specialists only see their own confirmed appointments", async () => {
    const res = await svc.availability.search({ by: "department", id: "d1" });
    const mine = res.find((r) => r.specialist.id === "s1")!;
    const other = res.find((r) => r.specialist.id === "s2")!;
    const a = await svc.assignments.create(ORIENT, { slotId: mine.slot.id, personName: "A" });
    const b = await svc.assignments.create(ORIENT, { slotId: other.slot.id, personName: "B" });
    await svc.assignments.confirm(ORIENT, b.id);
    expect(await svc.assignments.list(SPEC_USER)).toHaveLength(0);
    await svc.assignments.confirm(ORIENT, a.id);
    const list = await svc.assignments.list(SPEC_USER);
    expect(list.map((x) => x.id)).toEqual([a.id]);
  });

  it("orientador sees own assignments newest first", async () => {
    const res = await svc.availability.search({ by: "department", id: "d1" });
    const a = await svc.assignments.create(ORIENT, { slotId: res[0]!.slot.id, personName: "A" });
    clock = new Date(clock.getTime() + 60_000);
    const b = await svc.assignments.create(ORIENT, { slotId: res[1]!.slot.id, personName: "B" });
    const mine = await svc.assignments.list(ORIENT, { createdBy: ORIENT });
    expect(mine.map((x) => x.id)).toEqual([b.id, a.id]);
  });
});
