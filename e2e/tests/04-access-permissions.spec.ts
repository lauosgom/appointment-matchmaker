// Section 4: access and permissions, through the UI and by direct requests.
import { request } from "@playwright/test";

import { lit, sql } from "../support/compose";
import { ADMIN, BASE_URL, ESPECIALISTA, ORIENTADOR } from "../support/env";
import { expect, loginUI, searchBySpecialist, test, toast } from "../support/fixtures";

test.describe("Access and permissions", () => {
  test("counselor cannot cancel an appointment, nor confirm another counselor's assignment", async ({
    admin,
    orientador,
    apiAs,
    makeWorld,
  }) => {
    const w = await makeWorld();
    const confirmed = await orientador.confirm((await orientador.book(w.slots[0]!.id)).id);
    let r = await orientador.post(`/assignments/${confirmed.id}/cancel`, { reason: "intento" });
    expect(r.status()).toBe(403);
    expect((await admin.assignment(confirmed.id)).status).toBe("confirmed");

    const { creds } = await admin.createUser("orientador");
    const other = await apiAs(creds);
    const pending = await orientador.book(w.slots[1]!.id);
    for (const action of ["confirm", "discard"]) {
      r = await other.post(`/assignments/${pending.id}/${action}`, { reason: "no es mía" });
      expect(r.status(), action).toBe(403);
    }
    expect((await admin.assignment(pending.id)).status).toBe("pending");
  });

  test("specialist cannot modify appointments or availability", async ({ admin, orientador, apiAs, makeWorld }) => {
    const w = await makeWorld();
    const specialist = await apiAs(w.specialistCreds);
    const pending = await orientador.book(w.slots[0]!.id);
    const confirmed = await orientador.confirm((await orientador.book(w.slots[1]!.id)).id);

    const attempts = [
      specialist.post(`/assignments/${pending.id}/confirm`),
      specialist.post(`/assignments/${pending.id}/discard`, { reason: "x" }),
      specialist.post(`/assignments/${confirmed.id}/cancel`, { reason: "x" }),
      specialist.post(`/assignments/${confirmed.id}/correction-requests`, { message: "x" }),
      specialist.createAssignment(w.slots[2]!.id, "Intruso"),
      specialist.patch(`/slots/${w.slots[2]!.id}`, { active: false }),
      specialist.post(`/specialists/${w.specialist.id}/slots`, { starts: [new Date(Date.now() + 864e6).toISOString()] }),
      specialist.put(`/specialists/${w.specialist.id}`, { ...w.specialist, fullName: "Cambiado" }),
    ];
    for (const r of await Promise.all(attempts)) expect(r.status(), r.url()).toBe(403);

    expect((await admin.assignment(pending.id)).status).toBe("pending");
    expect((await admin.assignment(confirmed.id)).status).toBe("confirmed");
    expect((await admin.slots(w.specialist.id)).every((s) => s.active)).toBe(true);
  });

  test("specialist cannot see another specialist's appointments", async ({ orientador, apiAs, uiAs, makeWorld }) => {
    const mine = await makeWorld();
    const theirs = await makeWorld();
    const own = await orientador.confirm((await orientador.book(mine.slots[0]!.id)).id);
    const foreign = await orientador.confirm((await orientador.book(theirs.slots[0]!.id)).id);
    await orientador.book(mine.slots[1]!.id); // pending: not shown to specialists either

    const specialist = await apiAs(mine.specialistCreds);
    const all = await specialist.assignments();
    expect(all.map((a) => a.id)).toEqual([own.id]);
    // Asking for the other specialist explicitly returns nothing of theirs.
    const tampered = await specialist.assignments({ specialistId: theirs.specialist.id });
    expect(tampered.filter((a) => a.specialistId === theirs.specialist.id)).toEqual([]);
    expect(await specialist.assignments({ createdBy: orientador.user.id })).toEqual([own].map((a) => expect.objectContaining({ id: a.id })));

    const page = await uiAs(mine.specialistCreds);
    await page.goto("/agenda");
    await expect(page.getByRole("row").filter({ hasText: own.code! })).toBeVisible();
    await expect(page.getByText(foreign.code!)).toHaveCount(0);
  });

  test("a deactivated user can't log in and their open sessions stop working", async ({ admin, apiAs, page }) => {
    const { user, creds } = await admin.createUser("orientador");
    const session = await apiAs(creds);
    await admin.setUserActive(user, false);

    expect((await session.get("/assignments")).status()).toBe(401);
    await page.goto("/");
    await page.locator("#username").fill(creds.username);
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("alert")).toContainText("Esta cuenta está desactivada. Comunícate con el administrador.");
    await expect(page).toHaveURL(/\/$/);
  });

  test("repeated wrong passwords lock the account for 5 minutes", async ({ admin, page }) => {
    const { creds } = await admin.createUser("orientador");
    const attempt = async (password: string) => {
      await page.locator("#username").fill(creds.username);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Ingresar" }).click();
    };
    await page.goto("/");
    for (let i = 0; i < 2; i++) {
      await attempt("incorrecta");
      await expect(page.getByRole("alert")).toContainText("Usuario o contraseña incorrectos.");
    }
    await attempt("incorrecta");
    await expect(page.getByRole("alert")).toContainText("Demasiados intentos fallidos. El acceso quedó bloqueado durante 5 minutos.");

    // Even the right password is refused while locked.
    await attempt(creds.password);
    await expect(page.getByRole("alert")).toContainText("Acceso bloqueado temporalmente");
    await expect(page).toHaveURL(/\/$/);

    const [[lockedFor]] = sql(
      `SELECT extract(epoch FROM locked_until - (now() AT TIME ZONE 'utc')) FROM login_attempts WHERE username_key = ${lit(creds.username)}`,
    ) as [[string]];
    expect(Number(lockedFor)).toBeGreaterThan(4 * 60);
    expect(Number(lockedFor)).toBeLessThanOrEqual(5 * 60);

    // Once the 5 minutes are over (simulated), the right password works.
    sql(`UPDATE login_attempts SET locked_until = (now() AT TIME ZONE 'utc') - interval '1 second' WHERE username_key = ${lit(creds.username)}`);
    await attempt(creds.password);
    await expect(page).toHaveURL(/\/menu$/);
  });

  test("password reset through the recovery link", async ({ admin, page }) => {
    const { user, creds } = await admin.createUser("orientador");
    await page.goto("/");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await page.locator("#email").fill(user.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.")).toBeVisible();

    // No email is sent yet: in demo mode the link is shown on screen.
    await page.getByRole("link", { name: "abrir el enlace de recuperación" }).click();
    await expect(page).toHaveURL(/\/restablecer\?token=/);
    const resetUrl = page.url();
    await page.locator("#pw").fill("nueva-clave-123");
    await page.locator("#pw2").fill("nueva-clave-123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("Tu contraseña fue actualizada. Ya puedes iniciar sesión.")).toBeVisible();

    const anon = await request.newContext({ baseURL: BASE_URL });
    expect((await anon.post("/api/auth/login", { data: creds })).status()).toBe(401);
    expect((await anon.post("/api/auth/login", { data: { username: creds.username, password: "nueva-clave-123" } })).status()).toBe(200);

    // Unknown emails get the same answer (no account enumeration) and no link.
    const unknown = await anon.post("/api/auth/password-reset/request", { data: { email: "nadie@example.org" } });
    expect(await unknown.json()).toEqual({ demoToken: null });
    await anon.dispose();

    // A used link is rejected.
    await page.goto(resetUrl);
    await page.locator("#pw").fill("otra-clave-123");
    await page.locator("#pw2").fill("otra-clave-123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("El enlace de recuperación no es válido o ya fue usado. Solicita uno nuevo.")).toBeVisible();

    // So is a made-up one.
    await page.goto("/restablecer?token=inventado-123");
    await page.locator("#pw").fill("otra-clave-123");
    await page.locator("#pw2").fill("otra-clave-123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("El enlace de recuperación no es válido o ya fue usado. Solicita uno nuevo.")).toBeVisible();
  });

  test.fixme("the recovery link is sent by email", async () => {
    // Expected by the test plan; the app does not send email yet (the link is shown on screen).
  });

  test.fixme("an expired recovery link is rejected", async () => {
    // Recovery tokens have no expiry time yet (password_reset_tokens has no timestamp).
  });

  test("other roles' pages are blocked when the URL is typed directly", async ({ browser, makeWorld }) => {
    const w = await makeWorld();
    for (const creds of [ORIENTADOR, ESPECIALISTA]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginUI(page, creds);
      for (const path of ["/admin/usuarios", "/admin/especialistas", "/admin/disponibilidad", "/admin/catalogos", "/admin/configuracion"]) {
        await page.goto(path);
        await expect(page.getByText("Esta sección es solo para administradores."), `${creds.username} ${path}`).toBeVisible();
        await expect(page.getByRole("table")).toHaveCount(0);
      }
      await context.close();
    }

    // A specialist who opens the search page still can't book.
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginUI(page, w.specialistCreds);
    await searchBySpecialist(page, w.specialist);
    await page.getByRole("button", { name: "08:00" }).click();
    await page.locator("#name").fill("Intento");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Guardar asignación" }).click();
    await expect(toast(page, /No tienes permiso para (realizar )?esta acción/)).toBeVisible();
    await context.close();
  });

  test("other roles' API calls are refused", async ({ orientador, apiAs, makeWorld }) => {
    const w = await makeWorld();
    const specialist = await apiAs(w.specialistCreds);
    // Admin-only calls, made as a counselor and as a specialist.
        const forbidden = [
      orientador.get("/users"),
      orientador.post("/users", { username: "x", fullName: "x", email: "x@example.org", role: "admin", active: true, password: "secreto1" }),
      orientador.put(`/users/${orientador.user.id}`, { ...orientador.user, role: "admin", password: "" }),
      orientador.post("/specialists", { code: "X", fullName: "X", departmentIds: [], areaIds: [], active: true }),
      orientador.post("/categories/department", { code: "X", name: "X", active: true }),
      orientador.patch(`/slots/${w.slots[0]!.id}`, { active: false }),
      orientador.put("/settings/duration", { minutes: 30 }),
      orientador.put("/settings/year-letters/2030", { letters: "XX" }),
      orientador.get("/correction-requests"),
      specialist.get("/users"),
      specialist.get("/correction-requests"),
    ];
    for (const r of await Promise.all(forbidden)) expect(r.status(), `${r.url()} ${await r.text()}`).toBe(403);
    // The counselor did not become an admin.
    expect((await orientador.get("/users")).status()).toBe(403);
  });

  test("anonymous access is refused and redirected to login", async ({ page }) => {
    const anon = await request.newContext({ baseURL: BASE_URL });
    for (const path of ["/api/assignments", "/api/users", "/api/specialists", "/api/settings"]) {
      expect((await anon.get(path)).status(), path).toBe(401);
    }
    const bogus = await anon.get("/api/assignments", { headers: { Authorization: "Bearer inventado" } });
    expect(bogus.status()).toBe(401);
    await anon.dispose();

    await page.goto("/asignaciones");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#username")).toBeVisible();
  });

  test("an admin can do everything the menu offers", async ({ uiAs }) => {
    const page = await uiAs(ADMIN);
    const main = page.getByRole("main");
    for (const label of ["Buscar disponibilidad", "Asignaciones y citas", "Disponibilidad", "Especialistas", "Departamentos y áreas", "Usuarios", "Configuración"]) {
      await expect(main.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(main.getByRole("link", { name: /^Mi agenda/ })).toHaveCount(0);
  });
});

test("wrong login shows a clear message", async ({ page }) => {
  await page.goto("/");
  // A non-existent user, so no real account gets locked.
  await page.locator("#username").fill("no-existe");
  await page.locator("#password").fill("x");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toContainText("Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.");
});
