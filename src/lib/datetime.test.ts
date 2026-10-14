import { describe, expect, it } from "vitest";

import { colombiaDayKey, formatDate, formatTime, fromColombiaLocal } from "./datetime";

describe("Colombia datetime", () => {
  it("round-trips local Colombia time", () => {
    const iso = fromColombiaLocal("2026-12-31T21:05");
    expect(iso).toBe("2027-01-01T02:05:00.000Z");
    expect(formatDate(iso)).toBe("31/12/2026");
    expect(formatTime(iso)).toBe("21:05");
    expect(colombiaDayKey(iso)).toBe("2026-12-31");
  });
});
