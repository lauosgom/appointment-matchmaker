// Single entry point for every backend call. Screens import `services` only from here.
// Defaults to the real HTTP backend (VITE_API_URL, default http://127.0.0.1:8000/api).
// Set VITE_USE_MOCK=true to run against the in-memory mock instead.
import { createHttpServices, type TokenStore } from "./http";
import { createMockServices, type MockState } from "./mock";
import type { AppServices } from "./types";

const MOCK_STORAGE_KEY = "citas-mock-state-v1";
const TOKEN_KEY = "citas-session-token";

export const usingMock = import.meta.env["VITE_USE_MOCK"] === "true";
const apiUrl: string = (import.meta.env["VITE_API_URL"] || "http://127.0.0.1:8000/api") as string;

function loadMockState(): MockState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockState) : undefined;
  } catch {
    return undefined;
  }
}

const sessionTokens: TokenStore = {
  get() {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    if (typeof window === "undefined") return;
    try {
      if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: token lives only for this request cycle */
    }
  },
};

export const services: AppServices = usingMock
  ? createMockServices({
      initial: loadMockState(),
      latencyMs: 150,
      persist: (state) => {
        if (typeof window !== "undefined")
          window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
      },
    })
  : createHttpServices({ baseUrl: apiUrl, tokens: sessionTokens });

/** Mock mode only: wipe the locally persisted demo data. */
export function resetDemoData() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(MOCK_STORAGE_KEY);
    window.location.reload();
  }
}

export * from "./types";
export { displayStatus } from "./mock";
