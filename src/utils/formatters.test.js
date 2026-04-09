import { describe, test, expect } from "vitest";
import { fmtDur, fmtTime, fmtDate, fmtDT } from "./formatters.js";

describe("fmtDur", () => {
  test("shows minutes only when < 60", () => {
    expect(fmtDur(45)).toBe("45 Min");
  });

  test("shows only hours when no remainder", () => {
    expect(fmtDur(120)).toBe("2h");
  });

  test("shows hours and minutes", () => {
    expect(fmtDur(90)).toBe("1h 30m");
  });

  test("handles 0 minutes", () => {
    expect(fmtDur(0)).toBe("0 Min");
  });
});

describe("fmtTime", () => {
  test("formats timestamp as HH:MM", () => {
    // 2024-01-15 14:30 UTC+1 (DE locale)
    const ts = new Date("2024-01-15T13:30:00.000Z").getTime();
    const result = fmtTime(ts);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("fmtDate", () => {
  test("returns a non-empty string", () => {
    expect(fmtDate(Date.now()).length).toBeGreaterThan(0);
  });
});

describe("fmtDT", () => {
  test("combines date and time with comma", () => {
    const result = fmtDT(Date.now());
    expect(result).toContain(",");
  });
});
