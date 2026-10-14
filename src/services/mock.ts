// In-memory mock of AppServices. Implements every business rule of the MVP so
// the whole app runs without a backend. Persists to localStorage in the browser.
import { colombiaDayKey, colombiaYear } from "@/lib/datetime";
import {
  type AppServices,
  type Assignment,
  type AssignmentFilter,
  type Category,
  type CategoryKind,
  type CorrectionRequest,
  type DisplayStatus,
  type Settings,
  type Slot,
  type Specialist,
  type User,
  ServiceError,
} from "./types";

export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_MS = 5 * 60 * 1000;

interface StoredUser extends User {
  password: string;
}

export interface MockState {
  users: StoredUser[];
  departments: Category[];
  areas: Category[];
  specialists: Specialist[];
  slots: Slot[];
  assignments: Assignment[];
  corrections: CorrectionRequest[];
  settings: Settings;
  counter: number;
  failed: Record<string, { count: number; lockedUntil?: number | undefined }>;
  resetTokens: Record<string, string>;
  seq: number;
}

export interface MockOptions {
  now?: () => Date;
  initial?: MockState | undefined;
  persist?: (state: MockState) => void;
  latencyMs?: number;
}

const HOUR = 3600_000;

export function createSeedState(now: Date = new Date()): MockState {
  const departments: Category[] = [
    { id: "d1", code: "PSI", name: "Psicología", active: true },
    { id: "d2", code: "JUR", name: "Orientación jurídica", active: true },
    { id: "d3", code: "TSO", name: "Trabajo social", active: true },
  ];
  const areas: Category[] = [
    { id: "a1", code: "DUE", name: "Duelo", active: true },
    { id: "a2", code: "ANS", name: "Ansiedad", active: true },
    { id: "a3", code: "FAM", name: "Familia y pareja", active: true },
    { id: "a4", code: "VIO", name: "Violencia", active: true },
  ];
  const specialists: Specialist[] = [
    { id: "s1", code: "ESP-001", fullName: "Dra. Marta Restrepo", departmentIds: ["d1"], areaIds: ["a1", "a2"], active: true },
    { id: "s2", code: "ESP-002", fullName: "Dr. Andrés Cárdenas", departmentIds: ["d1", "d3"], areaIds: ["a3"], active: true },
    { id: "s3", code: "ESP-003", fullName: "Dra. Lucía Henao", departmentIds: ["d2"], areaIds: ["a4"], active: true },
    { id: "s4", code: "ESP-004", fullName: "Lic. Camilo Ríos", departmentIds: ["d3"], areaIds: ["a2", "a3"], active: true },
  ];
  // Slots on the next 6 days at 9:00, 11:00, 15:00 Colombia (14, 16, 20 UTC)
  const slots: Slot[] = [];
  let n = 0;
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let day = 1; day <= 6; day++) {
    for (const s of specialists) {
      for (const h of [14, 16, 20]) {
        if ((day + h + Number(s.id.slice(1))) % 3 === 0) continue;
        slots.push({
          id: `sl${++n}`,
          specialistId: s.id,
          start: new Date(base.getTime() + day * 24 * HOUR + h * HOUR).toISOString(),
          durationMin: 45,
          active: true,
        });
      }
    }
  }
  const year = colombiaYear(now);
  return {
    users: [
      { id: "u1", username: "admin", password: "admin123", fullName: "Ana Administradora", email: "admin@telefono.org", role: "admin", active: true },
      { id: "u2", username: "orientador", password: "orientador123", fullName: "Óscar Orientador", email: "orientador@telefono.org", role: "orientador", active: true },
      { id: "u3", username: "especialista", password: "especialista123", fullName: "Dra. Marta Restrepo", email: "marta@telefono.org", role: "especialista", active: true, specialistId: "s1" },
    ],
    departments,
    areas,
    specialists,
    slots,
    assignments: [],
    corrections: [],
    settings: { durationMin: 45, yearLetters: { [year]: "AK" } },
    counter: 0,
    failed: {},
    resetTokens: {},
    seq: 1000,
  };
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const fail = (msg: string): never => {
  throw new ServiceError(msg);
};

export function displayStatus(a: Assignment, now: Date): DisplayStatus {
  if (a.status === "confirmed" && new Date(a.start).getTime() < now.getTime()) return "past";
  return a.status;
}

export function createMockServices(options: MockOptions = {}): AppServices {
  const now = options.now ?? (() => new Date());
  const state: MockState = options.initial ? clone(options.initial) : createSeedState(now());
  const latency = options.latencyMs ?? 0;

  const nextId = (p: string) => `${p}${++state.seq}`;

  async function run<T>(fn: () => T): Promise<T> {
    if (latency) await new Promise((r) => setTimeout(r, latency));
    const result = fn();
    options.persist?.(state);
    return clone(result);
  }

  const publicUser = ({ password: _p, ...u }: StoredUser): User => u;

  function actor(id: string, roles?: User["role"][]): StoredUser {
    const u = state.users.find((x) => x.id === id);
    if (!u || !u.active) fail("Tu sesión no es válida. Vuelve a iniciar sesión.");
    if (roles && !roles.includes(u!.role)) fail("No tienes permiso para realizar esta acción.");
    return u!;
  }

  const catList = (k: CategoryKind) => (k === "department" ? state.departments : state.areas);
  const catLabel = (k: CategoryKind) => (k === "department" ? "departamento" : "área de intervención");

  const isBooked = (slotId: string) =>
    state.assignments.some((a) => a.slotId === slotId && (a.status === "pending" || a.status === "confirmed"));

  const endOf = (s: { start: string; durationMin: number }) =>
    new Date(s.start).getTime() + s.durationMin * 60_000;

  function conflicts(specialistId: string, start: string, durationMin: number, ignoreId?: string) {
    const a0 = new Date(start).getTime();
    const a1 = a0 + durationMin * 60_000;
    return state.slots.filter(
      (s) =>
        s.id !== ignoreId &&
        s.specialistId === specialistId &&
        (s.active || isBooked(s.id)) &&
        new Date(s.start).getTime() < a1 &&
        endOf(s) > a0,
    );
  }

  const pendingFor = (pred: (a: Assignment) => boolean) =>
    state.assignments.filter(
      (a) =>
        pred(a) &&
        (a.status === "pending" || (a.status === "confirmed" && new Date(a.start) > now())),
    ).length;

  function findAssignment(id: string) {
    const a = state.assignments.find((x) => x.id === id);
    if (!a) fail("No encontramos la asignación. Actualiza la lista e inténtalo de nuevo.");
    return a!;
  }

  function sortByUpcoming(list: Assignment[]) {
    const t = now().getTime();
    return list.sort((a, b) => {
      const ap = new Date(a.start).getTime() < t;
      const bp = new Date(b.start).getTime() < t;
      if (ap !== bp) return ap ? 1 : -1;
      const diff = new Date(a.start).getTime() - new Date(b.start).getTime();
      return ap ? -diff : diff;
    });
  }

  return {
    auth: {
      login: (username, password) =>
        run(() => {
          const key = username.trim().toLowerCase();
          const f = state.failed[key];
          if (f?.lockedUntil && f.lockedUntil > now().getTime()) {
            const mins = Math.ceil((f.lockedUntil - now().getTime()) / 60_000);
            fail(`Acceso bloqueado temporalmente por varios intentos fallidos. Intenta de nuevo en ${mins} minuto(s).`);
          }
          const u = state.users.find((x) => x.username.toLowerCase() === key);
          if (!u || u.password !== password) {
            const rec = f && !(f.lockedUntil && f.lockedUntil <= now().getTime()) ? f : { count: 0 };
            rec.count += 1;
            rec.lockedUntil = undefined;
            if (rec.count >= MAX_FAILED_ATTEMPTS) {
              rec.lockedUntil = now().getTime() + LOCK_MS;
              rec.count = 0;
            }
            state.failed[key] = rec;
            fail(
              rec.lockedUntil
                ? "Demasiados intentos fallidos. El acceso quedó bloqueado durante 5 minutos."
                : "Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.",
            );
          }
          if (!u!.active) fail("Esta cuenta está desactivada. Comunícate con el administrador.");
          delete state.failed[key];
          return publicUser(u!);
        }),
      requestPasswordReset: (email) =>
        run(() => {
          const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
          if (!u) return {};
          const token = `rt-${u.id}-${++state.seq}`;
          state.resetTokens[token] = u.id;
          return { demoToken: token };
        }),
      resetPassword: (token, newPassword) =>
        run(() => {
          const uid = state.resetTokens[token];
          if (!uid) fail("El enlace de recuperación no es válido o ya fue usado. Solicita uno nuevo.");
          if (newPassword.length < 6) fail("La contraseña debe tener al menos 6 caracteres.");
          state.users.find((u) => u.id === uid)!.password = newPassword;
          delete state.resetTokens[token];
        }),
    },

    users: {
      list: (actorId) =>
        run(() => {
          actor(actorId, ["admin"]);
          return state.users.map(publicUser);
        }),
      get: (id) =>
        run(() => {
          const u = state.users.find((x) => x.id === id);
          return u ? publicUser(u) : undefined;
        }),
      names: () => run(() => Object.fromEntries(state.users.map((u) => [u.id, u.fullName]))),
      create: (actorId, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          if (!input.username.trim()) fail("El nombre de usuario es obligatorio.");
          if (state.users.some((u) => u.username.toLowerCase() === input.username.trim().toLowerCase()))
            fail("Ya existe un usuario con ese nombre de usuario.");
          if (!input.password || input.password.length < 6)
            fail("La contraseña inicial debe tener al menos 6 caracteres.");
          if (input.role === "especialista" && !input.specialistId)
            fail("Selecciona el especialista asociado a esta cuenta.");
          const u: StoredUser = { ...input, username: input.username.trim(), id: nextId("u"), password: input.password! };
          state.users.push(u);
          return publicUser(u);
        }),
      update: (actorId, id, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          const u = state.users.find((x) => x.id === id) ?? fail("Usuario no encontrado.");
          if (state.users.some((x) => x.id !== id && x.username.toLowerCase() === input.username.trim().toLowerCase()))
            fail("Ya existe un usuario con ese nombre de usuario.");
          if (id === actorId && !input.active) fail("No puedes desactivar tu propia cuenta.");
          if (input.password && input.password.length < 6) fail("La contraseña debe tener al menos 6 caracteres.");
          const { password, ...rest } = input;
          Object.assign(u, rest, password ? { password } : {});
          return publicUser(u);
        }),
    },

    categories: {
      list: (kind) => run(() => catList(kind)),
      create: (actorId, kind, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          const list = catList(kind);
          if (!input.code.trim() || !input.name.trim()) fail("El código y el nombre son obligatorios.");
          if (list.some((c) => c.code.toLowerCase() === input.code.trim().toLowerCase()))
            fail(`Ya existe un ${catLabel(kind)} con el código ${input.code}.`);
          const c = { ...input, code: input.code.trim(), id: nextId(kind === "department" ? "d" : "a") };
          list.push(c);
          return c;
        }),
      update: (actorId, kind, id, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          const list = catList(kind);
          const c = list.find((x) => x.id === id) ?? fail("Elemento no encontrado.");
          if (list.some((x) => x.id !== id && x.code.toLowerCase() === input.code.trim().toLowerCase()))
            fail(`Ya existe un ${catLabel(kind)} con el código ${input.code}.`);
          Object.assign(c, input);
          return c;
        }),
      usage: (kind, id) =>
        run(() => {
          const key = kind === "department" ? "departmentIds" : "areaIds";
          const ids = state.specialists.filter((s) => s[key].includes(id)).map((s) => s.id);
          return {
            specialists: ids.length,
            pendingAppointments: pendingFor((a) => ids.includes(a.specialistId as string)),
          };
        }),
    },

    specialists: {
      list: () => run(() => state.specialists),
      create: (actorId, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          if (!input.code.trim() || !input.fullName.trim()) fail("El código y el nombre son obligatorios.");
          if (state.specialists.some((s) => s.code.toLowerCase() === input.code.trim().toLowerCase()))
            fail(`Ya existe un especialista con el código ${input.code}.`);
          const s = { ...input, code: input.code.trim(), id: nextId("s") };
          state.specialists.push(s);
          return s;
        }),
      update: (actorId, id, input) =>
        run(() => {
          actor(actorId, ["admin"]);
          const s = state.specialists.find((x) => x.id === id) ?? fail("Especialista no encontrado.");
          if (state.specialists.some((x) => x.id !== id && x.code.toLowerCase() === input.code.trim().toLowerCase()))
            fail(`Ya existe un especialista con el código ${input.code}.`);
          Object.assign(s, input);
          return s;
        }),
      pendingAppointments: (id) => run(() => pendingFor((a) => a.specialistId === id)),
    },

    slots: {
      list: (specialistId) =>
        run(() =>
          state.slots
            .filter((s) => s.specialistId === specialistId)
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((s) => ({ ...s, booked: isBooked(s.id) })),
        ),
      add: (actorId, specialistId, starts) =>
        run(() => {
          actor(actorId, ["admin"]);
          if (!state.specialists.some((s) => s.id === specialistId)) fail("Selecciona un especialista válido.");
          if (!starts.length) fail("Agrega al menos una fecha y hora.");
          const dur = state.settings.durationMin;
          const created: Slot[] = [];
          for (const start of starts) {
            if (new Date(start) <= now()) fail("No se pueden crear espacios en fechas u horas pasadas.");
            const all = [...state.slots, ...created];
            const clash = all.some(
              (s) =>
                s.specialistId === specialistId &&
                (s.active || isBooked(s.id)) &&
                new Date(s.start).getTime() < new Date(start).getTime() + dur * 60_000 &&
                endOf(s) > new Date(start).getTime(),
            );
            if (clash) fail("Uno de los espacios está duplicado o se cruza con otro horario del especialista.");
            created.push({ id: nextId("sl"), specialistId, start, durationMin: dur, active: true });
          }
          state.slots.push(...created);
          return created;
        }),
      setActive: (actorId, id, active) =>
        run(() => {
          actor(actorId, ["admin"]);
          const s = state.slots.find((x) => x.id === id) ?? fail("Espacio no encontrado.");
          if (isBooked(id)) fail("Este espacio tiene una asignación o cita; no se puede modificar.");
          if (active && conflicts(s.specialistId, s.start, s.durationMin, id).length)
            fail("No se puede reactivar: se cruza con otro horario del especialista.");
          s.active = active;
          return s;
        }),
    },

    settings: {
      get: () => run(() => state.settings),
      setDuration: (actorId, minutes) =>
        run(() => {
          actor(actorId, ["admin"]);
          if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480)
            fail("La duración debe ser un número entero entre 5 y 480 minutos.");
          state.settings.durationMin = minutes;
          const needsReview: Slot[] = [];
          for (const s of state.slots) {
            if (!s.active || isBooked(s.id) || new Date(s.start) <= now()) continue;
            if (conflicts(s.specialistId, s.start, minutes, s.id).length) needsReview.push(s);
            else s.durationMin = minutes;
          }
          return { needsReview };
        }),
      setYearLetters: (actorId, year, letters) =>
        run(() => {
          actor(actorId, ["admin"]);
          if (!/^\d{4}$/.test(year)) fail("El año debe tener cuatro dígitos.");
          if (!/^[A-Za-z]{2}$/.test(letters)) fail("Debes indicar exactamente dos letras.");
          state.settings.yearLetters[year] = letters.toUpperCase();
          return state.settings;
        }),
    },

    availability: {
      search: (q) =>
        run(() => {
          const specs = state.specialists.filter((s) => {
            if (!s.active) return false;
            if (q.by === "specialist") return s.id === q.id;
            const list = q.by === "department" ? state.departments : state.areas;
            const ids = q.by === "department" ? s.departmentIds : s.areaIds;
            return ids.includes(q.id) && list.some((c) => c.id === q.id && c.active);
          });
          const t = now();
          return state.slots
            .filter(
              (sl) =>
                sl.active &&
                !isBooked(sl.id) &&
                new Date(sl.start) > t &&
                specs.some((s) => s.id === sl.specialistId) &&
                (!q.date || colombiaDayKey(sl.start) === q.date),
            )
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((slot) => ({ slot, specialist: specs.find((s) => s.id === slot.specialistId)! }));
        }),
    },

    assignments: {
      list: (actorId, filter: AssignmentFilter = {}) =>
        run(() => {
          const u = actor(actorId);
          let list = state.assignments.slice();
          if (u.role === "especialista") {
            list = list.filter((a) => a.specialistId === u.specialistId && a.status === "confirmed");
          } else if (u.role === "orientador" && filter.createdBy !== u.id) {
            list = list.filter((a) => a.status === "confirmed");
          }
          if (filter.createdBy) list = list.filter((a) => a.createdBy === filter.createdBy);
          if (filter.specialistId) list = list.filter((a) => a.specialistId === filter.specialistId);
          if (filter.status) list = list.filter((a) => displayStatus(a, now()) === filter.status);
          if (filter.createdBy && u.role === "orientador")
            return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          if (filter.status === "pending") return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return sortByUpcoming(list);
        }),
      create: (actorId, input) =>
        run(() => {
          const u = actor(actorId, ["admin", "orientador"]);
          const name = input.personName?.trim() || undefined;
          const phone = input.personPhone?.trim() || undefined;
          if (!name && !phone) fail("Ingresa al menos el nombre o el número de celular de la persona.");
          if (phone && !/^[0-9+\s-]{7,15}$/.test(phone)) fail("El número de celular no es válido.");
          const slot = state.slots.find((s) => s.id === input.slotId) ?? fail("El horario seleccionado no existe.");
          const spec = state.specialists.find((s) => s.id === slot.specialistId);
          if (!slot.active || !spec?.active || isBooked(slot.id) || new Date(slot.start) <= now())
            fail("Este horario ya no está disponible. Busca y selecciona otro espacio.");
          const a: Assignment = {
            id: nextId("as"),
            slotId: slot.id,
            specialistId: slot.specialistId,
            start: slot.start,
            durationMin: slot.durationMin,
            personName: name,
            personPhone: phone,
            status: "pending",
            createdAt: now().toISOString(),
            createdBy: u.id,
          };
          state.assignments.push(a);
          return a;
        }),
      confirm: (actorId, id) =>
        run(() => {
          const u = actor(actorId, ["admin", "orientador"]);
          const a = findAssignment(id);
          if (a.status !== "pending") fail("Solo se pueden confirmar asignaciones pendientes.");
          if (u.role !== "admin" && a.createdBy !== u.id)
            fail("Solo el orientador que inició la asignación o un administrador puede confirmarla.");
          const year = colombiaYear(now());
          const letters = state.settings.yearLetters[year];
          if (!letters)
            fail(`No hay letras configuradas para el año ${year}. Pide al administrador que las configure.`);
          state.counter += 1;
          a.code = `${letters}${String(state.counter).padStart(5, "0")}`;
          a.status = "confirmed";
          a.confirmedAt = now().toISOString();
          a.confirmedBy = u.id;
          return a;
        }),
      discard: (actorId, id, reason) =>
        run(() => {
          const u = actor(actorId, ["admin", "orientador"]);
          const a = findAssignment(id);
          if (a.status !== "pending") fail("Solo se pueden descartar asignaciones pendientes.");
          if (u.role !== "admin" && a.createdBy !== u.id)
            fail("Solo el orientador que inició la asignación o un administrador puede descartarla.");
          if (!reason.trim()) fail("Indica el motivo del descarte.");
          Object.assign(a, { status: "discarded", closedAt: now().toISOString(), closedBy: u.id, closeReason: reason.trim() });
          return a;
        }),
      cancel: (actorId, id, reason) =>
        run(() => {
          const u = actor(actorId, ["admin"]);
          const a = findAssignment(id);
          if (a.status !== "confirmed") fail("Solo se pueden cancelar citas confirmadas.");
          if (new Date(a.start) <= now()) fail("No se puede cancelar una cita cuya fecha y hora ya pasaron.");
          if (!reason.trim()) fail("Indica el motivo de la cancelación.");
          Object.assign(a, { status: "cancelled", closedAt: now().toISOString(), closedBy: u.id, closeReason: reason.trim() });
          return a;
        }),
      requestCorrection: (actorId, id, message) =>
        run(() => {
          const u = actor(actorId, ["orientador"]);
          const a = findAssignment(id);
          if (a.status !== "confirmed") fail("Solo se puede solicitar corrección de citas confirmadas.");
          if (!message.trim()) fail("Describe qué se debe corregir.");
          const c: CorrectionRequest = {
            id: nextId("cr"),
            assignmentId: id,
            message: message.trim(),
            createdBy: u.id,
            createdAt: now().toISOString(),
          };
          state.corrections.push(c);
          return c;
        }),
      corrections: (actorId) =>
        run(() => {
          actor(actorId, ["admin"]);
          return state.corrections.slice().reverse();
        }),
    },
  };
}
