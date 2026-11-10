// HTTP implementation of AppServices against the FastAPI backend (see /openapi.yaml).
// The backend identifies the actor from the bearer token, so the `actorId`
// arguments required by the AppServices contract are ignored here.
import {
  ServiceError,
  type AppServices,
  type Assignment,
  type AvailabilityResult,
  type Category,
  type CorrectionRequest,
  type Settings,
  type Slot,
  type Specialist,
  type UsageWarning,
  type User,
} from "./types";

export interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export interface HttpServicesOptions {
  /** e.g. "http://127.0.0.1:8000/api" */
  baseUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
}

type Query = Record<string, string | undefined>;

export function createHttpServices({
  baseUrl,
  tokens,
  fetch: fetchImpl,
}: HttpServicesOptions): AppServices {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Query | undefined } = {},
  ): Promise<T> {
    let url = root + path;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query))
        if (v !== undefined && v !== "") params.set(k, v);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const token = tokens.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let res: Response;
    try {
      const init: RequestInit = { method, headers };
      if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
      res = await doFetch(url, init);
    } catch {
      throw new ServiceError("No se pudo conectar con el servidor");
    }

    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      if (res.status === 401 && path !== "/auth/login") tokens.set(null);
      throw new HttpError(res.status, errorMessage(res.status, data));
    }
    return data as T;
  }

  const get = <T>(path: string, query?: Query) => request<T>("GET", path, { query });
  const post = <T>(path: string, body?: unknown) => request<T>("POST", path, { body });
  const put = <T>(path: string, body: unknown) => request<T>("PUT", path, { body });
  const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, { body });
  const e = encodeURIComponent;

  return {
    auth: {
      async login(username, password) {
        const r = await post<{ user: User; token: string }>("/auth/login", { username, password });
        tokens.set(r.token);
        return r.user;
      },
      logout() {
        tokens.set(null);
      },
      requestPasswordReset: (email) =>
        post<{ demoToken?: string }>("/auth/password-reset/request", { email }),
      resetPassword: (token, newPassword) =>
        post<void>("/auth/password-reset/confirm", { token, newPassword }),
    },
    users: {
      list: () => get<User[]>("/users"),
      async get(id) {
        try {
          return await get<User>(`/users/${e(id)}`);
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) return undefined;
          throw err;
        }
      },
      names: () => get<Record<string, string>>("/users/names"),
      create: (_actorId, input) => post<User>("/users", input),
      update: (_actorId, id, input) => put<User>(`/users/${e(id)}`, input),
    },
    categories: {
      list: (kind) => get<Category[]>(`/categories/${e(kind)}`),
      create: (_actorId, kind, input) => post<Category>(`/categories/${e(kind)}`, input),
      update: (_actorId, kind, id, input) =>
        put<Category>(`/categories/${e(kind)}/${e(id)}`, input),
      usage: (kind, id) => get<UsageWarning>(`/categories/${e(kind)}/${e(id)}/usage`),
    },
    specialists: {
      list: () => get<Specialist[]>("/specialists"),
      create: (_actorId, input) => post<Specialist>("/specialists", input),
      update: (_actorId, id, input) => put<Specialist>(`/specialists/${e(id)}`, input),
      async pendingAppointments(id) {
        const r = await get<{ count: number }>(`/specialists/${e(id)}/pending-appointments`);
        return r.count;
      },
    },
    slots: {
      list: (specialistId) =>
        get<(Slot & { booked: boolean })[]>(`/specialists/${e(specialistId)}/slots`),
      add: (_actorId, specialistId, starts) =>
        post<Slot[]>(`/specialists/${e(specialistId)}/slots`, { starts }),
      setActive: (_actorId, id, active) => patch<Slot>(`/slots/${e(id)}`, { active }),
    },
    settings: {
      get: () => get<Settings>("/settings"),
      setDuration: (_actorId, minutes) =>
        put<{ needsReview: Slot[] }>("/settings/duration", { minutes }),
      setYearLetters: (_actorId, year, letters) =>
        put<Settings>(`/settings/year-letters/${e(year)}`, { letters }),
    },
    availability: {
      search: (q) =>
        get<AvailabilityResult[]>("/availability/search", { by: q.by, id: q.id, date: q.date }),
    },
    assignments: {
      list: (_actorId, filter = {}) =>
        get<Assignment[]>("/assignments", {
          specialistId: filter.specialistId,
          status: filter.status,
          createdBy: filter.createdBy,
        }),
      create: (_actorId, input) => post<Assignment>("/assignments", input),
      confirm: (_actorId, id) => post<Assignment>(`/assignments/${e(id)}/confirm`),
      discard: (_actorId, id, reason) =>
        post<Assignment>(`/assignments/${e(id)}/discard`, { reason }),
      cancel: (_actorId, id, reason) =>
        post<Assignment>(`/assignments/${e(id)}/cancel`, { reason }),
      requestCorrection: (_actorId, id, message) =>
        post<CorrectionRequest>(`/assignments/${e(id)}/correction-requests`, { message }),
      corrections: () => get<CorrectionRequest[]>("/correction-requests"),
    },
  };
}

export class HttpError extends ServiceError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; detail?: unknown };
    if (typeof d.message === "string") return d.message;
    if (typeof d.detail === "string") return d.detail;
    // FastAPI request-validation errors: {"detail": [{"msg": ...}, ...]}
    if (Array.isArray(d.detail)) return "Datos inválidos";
  }
  if (status === 401) return "Sesión expirada, inicia sesión de nuevo";
  if (status === 403) return "No tienes permiso para esta acción";
  if (status === 404) return "No encontrado";
  return "Error del servidor";
}
