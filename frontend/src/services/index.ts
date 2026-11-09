// Single entry point for every backend call. Screens import `services` only from here.
// To connect a real backend, implement AppServices and return it instead of the mock.
import { createMockServices, type MockState } from "./mock";
import type { AppServices } from "./types";

const STORAGE_KEY = "citas-mock-state-v1";

function loadState(): MockState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockState) : undefined;
  } catch {
    return undefined;
  }
}

export const services: AppServices = createMockServices({
  initial: loadState(),
  latencyMs: 150,
  persist: (state) => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },
});

export function resetDemoData() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
}

export * from "./types";
export { displayStatus } from "./mock";
