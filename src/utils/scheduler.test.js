import { describe, test, expect } from "vitest";
import { scheduleSteps } from "./scheduler.js";

const TARGET = new Date("2024-06-01T08:00:00").getTime();

const makeStep = (name, duration, type = "aktiv") => ({
  id: name,
  name,
  duration,
  type,
});

describe("scheduleSteps", () => {
  test("last step ends exactly at targetEnd", () => {
    const steps = [makeStep("Backen", 50, "backen")];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[result.length - 1].scheduledEnd).toBe(TARGET);
  });

  test("schedules steps in backwards order", () => {
    const steps = [
      makeStep("Schritt 1", 60, "fermentation"),
      makeStep("Schritt 2", 30, "aktiv"),
    ];
    const result = scheduleSteps(steps, TARGET, new Set());
    // Step 1 must start before step 2
    expect(result[0].scheduledStart).toBeLessThan(result[1].scheduledStart);
  });

  test("each step starts where the previous one ended", () => {
    const steps = [
      makeStep("A", 120, "ruhe"),
      makeStep("B", 60, "aktiv"),
    ];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[0].scheduledEnd).toBe(result[1].scheduledStart);
  });

  test("aktiv steps shift away from blocked slots", () => {
    // Block the exact 30-min slot where "Backen" would land
    const blocked = new Set();
    // TARGET is 08:00; 30-min slot = 07:30–08:00 (ts of slot start = 07:30)
    const slotStart = TARGET - 30 * 60 * 1000;
    blocked.add(slotStart);

    const steps = [makeStep("Backen", 30, "backen")];
    const result = scheduleSteps(steps, TARGET, blocked);
    // The step should have shifted earlier
    expect(result[0].scheduledEnd).toBeLessThanOrEqual(slotStart);
  });

  test("passive steps (fermentation) are not shifted by blocked slots", () => {
    const blocked = new Set();
    // Block the slot the passive step would land in
    const slotStart = TARGET - 60 * 60 * 1000;
    blocked.add(slotStart);

    const steps = [makeStep("Stockgare", 60, "fermentation")];
    const result = scheduleSteps(steps, TARGET, blocked);
    // Passive steps ignore blocked slots — end stays at TARGET
    expect(result[0].scheduledEnd).toBe(TARGET);
  });

  test("preserves step properties", () => {
    const steps = [{ id: "x", name: "Test", duration: 30, type: "aktiv", notes: "hello", tempMin: 20, tempMax: 25 }];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[0].notes).toBe("hello");
    expect(result[0].tempMin).toBe(20);
  });

  test("handles empty steps array", () => {
    expect(scheduleSteps([], TARGET, new Set())).toEqual([]);
  });
});
