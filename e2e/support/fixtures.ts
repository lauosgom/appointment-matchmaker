import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";

import { Api, uid, type Category, type Credentials, type Slot, type Specialist, type User } from "./api";
import { ADMIN, ORIENTADOR } from "./env";
import { at } from "./time";

/** A specialist of the test's own: own department, own area, future slots and a login. */
export interface World {
  department: Category;
  area: Category;
  specialist: Specialist;
  slots: Slot[];
  specialistUser: User;
  specialistCreds: Credentials;
}

interface Fixtures {
  /** API client logged in as the seeded admin. */
  admin: Api;
  /** API client logged in as the seeded counselor. */
  orientador: Api;
  /** Logs in another API client; disposed after the test. */
  apiAs: (creds: Credentials) => Promise<Api>;
  /** Opens a fresh browser context and logs in through the UI. */
  uiAs: (creds: Credentials, opts?: { timezoneId?: string; viewport?: { width: number; height: number } }) => Promise<Page>;
  /** Creates a fresh specialist (own categories, slots and user). */
  makeWorld: (opts?: { slotCount?: number; days?: number; name?: string }) => Promise<World>;
}

export const test = base.extend<Fixtures>({
  apiAs: async ({}, use) => {
    const opened: Api[] = [];
    await use(async (creds) => {
      const api = await Api.login(creds);
      opened.push(api);
      return api;
    });
    await Promise.all(opened.map((a) => a.dispose()));
  },
  admin: async ({ apiAs }, use) => use(await apiAs(ADMIN)),
  orientador: async ({ apiAs }, use) => use(await apiAs(ORIENTADOR)),

  uiAs: async ({ browser }, use) => {
    const contexts: Awaited<ReturnType<Browser["newContext"]>>[] = [];
    await use(async (creds, opts = {}) => {
      const context = await browser.newContext(opts);
      contexts.push(context);
      const page = await context.newPage();
      await loginUI(page, creds);
      return page;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },

  makeWorld: async ({ admin }, use) => {
    await use(async ({ slotCount = 3, days = 10, name } = {}) => {
      const tag = uid();
      const department = await admin.createCategory("department", `Depto ${tag}`);
      const area = await admin.createCategory("area", `Área ${tag}`);
      const specialist = await admin.createSpecialist(name ?? `Dr. E2E ${tag}`, [department.id], [area.id]);
      // One slot per hour from 08:00, `days` days ahead.
      const slots = await admin.addSlots(
        specialist.id,
        Array.from({ length: slotCount }, (_, i) => at(days, 8 + i)),
      );
      const { user, creds } = await admin.createUser("especialista", {
        specialistId: specialist.id,
        fullName: specialist.fullName,
      });
      return { department, area, specialist, slots, specialistUser: user, specialistCreds: creds };
    });
  },
});

export { expect };

// ---- UI helpers ------------------------------------------------------------------

export async function loginUI(page: Page, creds: Credentials) {
  await page.goto("/");
  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/menu$/);
}

export async function logoutUI(page: Page) {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Picks an option in a Radix Select (the trigger has role combobox). */
export async function choose(trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await trigger.page().getByRole("option", { name: option }).click();
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}

/** The row of an AssignmentTable (or any table) containing `text`. */
export function row(scope: Page | Locator, text: string | RegExp): Locator {
  return scope.getByRole("row").filter({ hasText: text });
}

/** Opens the search page and lists the slots of one specialist. */
export async function searchBySpecialist(page: Page, specialist: Specialist) {
  await page.goto("/buscar");
  await page.getByRole("tab", { name: "Especialista" }).click();
  await choose(page.getByRole("combobox"), `${specialist.fullName} (${specialist.code})`);
}

export const CODE_RE = /^[A-Z]{2}\d{5}$/;
