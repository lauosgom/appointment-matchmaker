import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";

import { BASE_URL } from "./env";

export type Role = "admin" | "orientador" | "especialista";
export interface Credentials {
  username: string;
  password: string;
}
export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  specialistId: string | null;
}
export interface Category {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
export interface Specialist {
  id: string;
  code: string;
  fullName: string;
  departmentIds: string[];
  areaIds: string[];
  active: boolean;
}
export interface Slot {
  id: string;
  specialistId: string;
  start: string;
  durationMin: number;
  active: boolean;
  booked?: boolean;
}
export type Status = "pending" | "confirmed" | "cancelled" | "discarded";
export interface Assignment {
  id: string;
  slotId: string;
  specialistId: string;
  start: string;
  durationMin: number;
  personName?: string | null;
  personPhone?: string | null;
  status: Status;
  code?: string | null;
  createdAt: string;
  createdBy: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  closeReason?: string | null;
}
export interface AvailabilityResult {
  specialist: Specialist;
  slot: Slot;
}

let counter = 0;
/** Short unique suffix, so every test creates its own specialists, categories and users. */
export function uid(): string {
  counter += 1;
  return `${Date.now().toString(36).slice(-5)}${counter}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

/** Asserts the status and returns the parsed JSON body. */
export async function expectStatus<T = unknown>(res: APIResponse, status: number): Promise<T> {
  const text = await res.text();
  expect(res.status(), `${res.url()} → ${text}`).toBe(status);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function messageOf(res: APIResponse): Promise<string> {
  return ((await res.json()) as { message: string }).message;
}

/** A logged-in API client (bearer token), plus helpers for the calls tests make most. */
export class Api {
  private constructor(
    readonly ctx: APIRequestContext,
    readonly user: User,
    readonly token: string,
  ) {}

  static async login(creds: Credentials): Promise<Api> {
    const anon = await request.newContext({ baseURL: BASE_URL });
    const body = await expectStatus<{ user: User; token: string }>(
      await anon.post("/api/auth/login", { data: creds }),
      200,
    );
    await anon.dispose();
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${body.token}` },
    });
    return new Api(ctx, body.user, body.token);
  }

  dispose() {
    return this.ctx.dispose();
  }

  get(path: string, params?: Record<string, string>) {
    return this.ctx.get(`/api${path}`, { params });
  }
  post(path: string, data?: unknown) {
    return this.ctx.post(`/api${path}`, { data: data ?? {} });
  }
  put(path: string, data: unknown) {
    return this.ctx.put(`/api${path}`, { data });
  }
  patch(path: string, data: unknown) {
    return this.ctx.patch(`/api${path}`, { data });
  }

  // ---- admin set-up helpers -------------------------------------------------
  async createCategory(kind: "department" | "area", name: string, code = `${kind[0]!.toUpperCase()}${uid()}`) {
    return expectStatus<Category>(await this.post(`/categories/${kind}`, { code, name, active: true }), 201);
  }

  async updateCategory(kind: "department" | "area", c: Category) {
    return expectStatus<Category>(await this.put(`/categories/${kind}/${c.id}`, c), 200);
  }

  async createSpecialist(fullName: string, departmentIds: string[], areaIds: string[]) {
    return expectStatus<Specialist>(
      await this.post("/specialists", { code: `E2E-${uid()}`, fullName, departmentIds, areaIds, active: true }),
      201,
    );
  }

  async updateSpecialist(s: Specialist) {
    return expectStatus<Specialist>(await this.put(`/specialists/${s.id}`, s), 200);
  }

  async addSlots(specialistId: string, starts: string[]) {
    return expectStatus<Slot[]>(await this.post(`/specialists/${specialistId}/slots`, { starts }), 201);
  }

  async slots(specialistId: string) {
    return expectStatus<Slot[]>(await this.get(`/specialists/${specialistId}/slots`), 200);
  }

  async setSlotActive(slotId: string, active: boolean) {
    return this.patch(`/slots/${slotId}`, { active });
  }

  async createUser(role: Role, extra: { specialistId?: string; fullName?: string } = {}) {
    const username = `e2e_${role.slice(0, 4)}_${uid()}`.toLowerCase();
    const password = `pw-${uid()}`;
    const user = await expectStatus<User>(
      await this.post("/users", {
        username,
        fullName: extra.fullName ?? `E2E ${role} ${username}`,
        email: `${username}@example.org`,
        role,
        active: true,
        password,
        specialistId: extra.specialistId,
      }),
      201,
    );
    return { user, creds: { username, password } };
  }

  async setUserActive(user: User, active: boolean) {
    return expectStatus<User>(await this.put(`/users/${user.id}`, { ...user, active, password: "" }), 200);
  }

  async settings() {
    return expectStatus<{ durationMin: number; yearLetters: Record<string, string> }>(await this.get("/settings"), 200);
  }

  async setDuration(minutes: number) {
    return expectStatus<{ needsReview: Slot[] }>(await this.put("/settings/duration", { minutes }), 200);
  }

  async setYearLetters(year: string, letters: string) {
    return expectStatus(await this.put(`/settings/year-letters/${year}`, { letters }), 200);
  }

  // ---- booking helpers ------------------------------------------------------
  async search(by: "specialist" | "department" | "area", id: string, date?: string) {
    return expectStatus<AvailabilityResult[]>(
      await this.get("/availability/search", { by, id, ...(date ? { date } : {}) }),
      200,
    );
  }

  createAssignment(slotId: string, personName?: string, personPhone?: string) {
    return this.post("/assignments", { slotId, personName, personPhone });
  }

  async book(slotId: string, personName = `Persona ${uid()}`, personPhone = "3001234567") {
    return expectStatus<Assignment>(await this.createAssignment(slotId, personName, personPhone), 201);
  }

  async confirm(id: string) {
    return expectStatus<Assignment>(await this.post(`/assignments/${id}/confirm`), 200);
  }

  async discard(id: string, reason: string) {
    return expectStatus<Assignment>(await this.post(`/assignments/${id}/discard`, { reason }), 200);
  }

  async cancel(id: string, reason: string) {
    return expectStatus<Assignment>(await this.post(`/assignments/${id}/cancel`, { reason }), 200);
  }

  async assignments(filter: { specialistId?: string; status?: string; createdBy?: string } = {}) {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined)) as Record<string, string>;
    return expectStatus<Assignment[]>(await this.get("/assignments", params), 200);
  }

  async assignment(id: string) {
    const all = await this.assignments();
    const found = all.find((a) => a.id === id);
    expect(found, `assignment ${id} visible to ${this.user.username}`).toBeTruthy();
    return found!;
  }
}
