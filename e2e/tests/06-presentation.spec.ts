// Section 6: presentation and usability — the parts a browser can check.
// Sessions with real counselors and specialists (do they understand the
// search, can they tell pending from confirmed…) can't be automated.
import { uid } from "../support/api";
import { ADMIN, ORIENTADOR } from "../support/env";
import { CODE_RE, expect, loginUI, row, searchBySpecialist, test } from "../support/fixtures";
import { at, formatDate } from "../support/time";

test("dates are DD/MM/YYYY, times 24 h, in Colombia time whatever the browser's time zone", async ({
  admin,
  uiAs,
  makeWorld,
}) => {
  const w = await makeWorld({ slotCount: 0 });
  // 21:05 in Colombia is already the next day in UTC and in Tokyo.
  const evening = at(10, 21, 5);
  const afternoon = at(10, 15, 30);
  await admin.addSlots(w.specialist.id, [evening, afternoon]);
  const shownDate = formatDate(evening);
  expect(shownDate).toMatch(/^\d\d\/\d\d\/\d{4}$/);

  const page = await uiAs(ORIENTADOR, { timezoneId: "Asia/Tokyo" });
  await searchBySpecialist(page, w.specialist);
  await expect(page.getByText(shownDate, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "15:30" })).toBeVisible();
  await expect(page.getByRole("button", { name: "21:05" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/\b(AM|PM|a\. m\.|p\. m\.)\b/i);

  await page.getByRole("button", { name: "21:05" }).click();
  await page.locator("#name").fill("Formato");
  await page.getByRole("button", { name: "Continuar" }).click();
  const summary = page.locator("dl");
  await expect(summary).toContainText(shownDate);
  await expect(summary).toContainText("21:05");
  await page.getByRole("button", { name: "Guardar asignación" }).click();
  await page.getByRole("button", { name: "Confirmar definitivamente" }).click();
  const code = (await page.locator(".font-mono").innerText()).trim();
  expect(code).toMatch(CODE_RE);

  // Same in the specialist's schedule, from yet another time zone.
  const agenda = await uiAs(w.specialistCreds, { timezoneId: "Europe/Madrid" });
  await agenda.goto("/agenda");
  const r = row(agenda, code);
  await expect(r).toContainText(shownDate);
  await expect(r).toContainText("21:05");
});

test("pending and confirmed look different", async ({ orientador, uiAs, makeWorld }) => {
  const w = await makeWorld({ slotCount: 2 });
  const p = await orientador.book(w.slots[0]!.id, `Pendiente ${uid()}`);
  const c = await orientador.confirm((await orientador.book(w.slots[1]!.id, `Confirmada ${uid()}`)).id);
  const page = await uiAs(ORIENTADOR);
  await page.goto("/asignaciones");
  const badge = (name: string) => row(page.getByRole("tabpanel"), name).getByText(/^(Pendiente de confirmación|Confirmada)$/);
  const pending = badge(p.personName!);
  const confirmed = badge(c.personName!);
  await expect(pending).toHaveText("Pendiente de confirmación");
  await expect(confirmed).toHaveText("Confirmada");
  const bg = async (l: typeof pending) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(pending)).not.toBe(await bg(confirmed));
  // Only confirmed appointments have a code.
  await expect(row(page.getByRole("tabpanel"), p.personName!).getByRole("cell").first()).toHaveText("—");
  await expect(row(page.getByRole("tabpanel"), c.personName!).getByRole("cell").first()).toHaveText(c.code!);
});

test.describe("phone-sized screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a counselor can log in, search and book", async ({ page, makeWorld }) => {
    const w = await makeWorld({ slotCount: 1 });
    await loginUI(page, ORIENTADOR);
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(await noSideScroll()).toBe(true);

    await page.getByRole("main").getByRole("link", { name: /Buscar disponibilidad/ }).tap();
    await page.getByRole("tab", { name: "Especialista" }).tap();
    await page.getByRole("combobox").tap();
    await page.getByRole("option", { name: new RegExp(w.specialist.code) }).tap();
    await page.getByRole("button", { name: "08:00" }).tap();
    await page.locator("#name").fill("Desde el celular");
    await page.getByRole("button", { name: "Continuar" }).tap();
    await page.getByRole("button", { name: "Guardar asignación" }).tap();
    await expect(page.getByRole("heading", { name: "Asignación guardada" })).toBeVisible();
    expect(await noSideScroll()).toBe(true);

    await page.goto("/asignaciones");
    await expect(row(page.getByRole("tabpanel"), "Desde el celular")).toBeVisible();
    expect(await noSideScroll()).toBe(true);
  });
});

test("specialist and category dialogs stay usable on a laptop screen with many categories", async ({ admin, uiAs, makeWorld }) => {
  const w = await makeWorld();
  // A realistic catalog: 15 departments and 20 areas at least.
  const counts = { department: (await (await admin.get("/categories/department")).json()).length, area: (await (await admin.get("/categories/area")).json()).length };
  for (let i = counts.department; i < 15; i++) await admin.createCategory("department", `Depto extra ${uid()}`);
  for (let i = counts.area; i < 20; i++) await admin.createCategory("area", `Área extra ${uid()}`);

  const page = await uiAs(ADMIN, { viewport: { width: 1366, height: 768 } });
  await page.goto("/admin/especialistas");
  await row(page, w.specialist.code).getByRole("button", { name: "Editar" }).click();
  const save = page.getByRole("dialog").getByRole("button", { name: "Guardar" });
  await save.scrollIntoViewIfNeeded().catch(() => {});
  await expect(save, "the Guardar button can be reached").toBeInViewport();
});
