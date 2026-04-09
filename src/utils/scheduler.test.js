import { describe, test, expect } from "vitest";
import { scheduleSteps, expandSteps } from "./scheduler.js";

const TARGET = new Date("2024-06-01T08:00:00").getTime();

const makeStep = (name, duration, type = "aktiv") => ({
  id: name,
  name,
  duration,
  type,
});

// ─── expandSteps ─────────────────────────────────────────────────
describe("expandSteps", () => {
  test("steps without repeat pass through unchanged", () => {
    const steps = [makeStep("Backen", 50, "backen")];
    expect(expandSteps(steps)).toEqual(steps);
  });

  // ── prefix mode ──────────────────────────────────────────────
  test("prefix: expands to [active, passive]", () => {
    const step = {
      ...makeStep("Starter füttern", 480, "fermentation"),
      repeat: { id: "r1", name: "Starter ansetzen", duration: 10, count: 1, type: "aktiv", notes: "", position: "prefix" },
    };
    const result = expandSteps([step]);
    expect(result).toHaveLength(2);
    expect(result[0]._active).toBeDefined();
    expect(result[0].duration).toBe(10);
    expect(result[1]._rest).toBeDefined();
    expect(result[1].duration).toBe(480);
  });

  test("prefix: active segment has correct _active metadata", () => {
    const step = {
      ...makeStep("Starter füttern", 480, "fermentation"),
      repeat: { id: "r1", name: "Ansetzen", duration: 10, count: 1, type: "aktiv", notes: "", position: "prefix" },
    };
    const result = expandSteps([step]);
    expect(result[0]._active).toMatchObject({ parentName: "Starter füttern" });
  });

  test("prefix: totalDur counts active duration once", () => {
    const steps = [{
      ...makeStep("Starter füttern", 480, "fermentation"),
      repeat: { id: "r1", name: "Ansetzen", duration: 10, count: 99, type: "aktiv", notes: "", position: "prefix" },
    }];
    // count is ignored for prefix — only 1 active occurrence
    const expanded = expandSteps(steps);
    const total = expanded.reduce((s, seg) => s + seg.duration, 0);
    expect(total).toBe(490); // 10 + 480
  });

  test("expands repeat into (count*2 + 1) segments", () => {
    const step = {
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "Dehnen & Falten", duration: 5, count: 4, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    // 4 rest + 4 active + 1 final rest = 9
    expect(result).toHaveLength(9);
  });

  test("rest segments use floor(duration / (count+1))", () => {
    const step = {
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "D&F", duration: 5, count: 4, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const restSegments = result.filter(s => s._rest);
    // 300 / 5 = 60 min each
    restSegments.slice(0, 4).forEach(s => expect(s.duration).toBe(60));
  });

  test("last rest segment absorbs rounding remainder", () => {
    // 100 min / 3 segments = floor(100/3)=33, last = 100 - 33*2 = 34
    const step = {
      ...makeStep("Gare", 100, "fermentation"),
      repeat: { id: "r1", name: "Falten", duration: 3, count: 2, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const restSegments = result.filter(s => s._rest);
    expect(restSegments[0].duration).toBe(33);
    expect(restSegments[1].duration).toBe(33);
    expect(restSegments[2].duration).toBe(34); // remainder
  });

  test("active segments have correct name with counter", () => {
    const step = {
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "Dehnen & Falten", duration: 5, count: 4, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const active = result.filter(s => s._active);
    expect(active[0].name).toBe("Dehnen & Falten (1/4)");
    expect(active[3].name).toBe("Dehnen & Falten (4/4)");
  });

  test("active segments carry _active metadata", () => {
    const step = {
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "D&F", duration: 5, count: 2, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const active = result.filter(s => s._active);
    expect(active[0]._active).toMatchObject({ repIdx: 1, repTotal: 2, parentName: "Stockgare" });
  });

  test("rest segments carry _rest metadata", () => {
    const step = {
      ...makeStep("Stockgare", 60, "fermentation"),
      repeat: { id: "r1", name: "D&F", duration: 2, count: 2, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const rests = result.filter(s => s._rest);
    rests.forEach(s => expect(s._rest).toMatchObject({ parentName: "Stockgare" }));
  });

  test("total expanded duration equals original duration + all repeat times", () => {
    const step = {
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "D&F", duration: 5, count: 4, type: "aktiv", notes: "" },
    };
    const result = expandSteps([step]);
    const totalMin = result.reduce((s, seg) => s + seg.duration, 0);
    expect(totalMin).toBe(300 + 4 * 5); // 320
  });

  // ── multiple sub-steps ───────────────────────────────────────────
  test("multiple sub-steps: prefix + interleave produces correct segment order", () => {
    // Backen (50 min) with 1) prefix Vorheizen (30 min), 2) interleave Dampf (2 min, count=1)
    const step = {
      ...makeStep("Backen", 50, "backen"),
      repeats: [
        { id: "pre1", name: "Vorheizen", duration: 30, count: 1, type: "aktiv", notes: "", position: "prefix" },
        { id: "int1", name: "Dampf ablassen", duration: 2, count: 1, type: "aktiv", notes: "", position: "interleave" },
      ],
    };
    const result = expandSteps([step]);
    // prefix(30) + rest(25) + interleave(2) + rest(25) = 4 segments
    expect(result).toHaveLength(4);
    expect(result[0]._active).toBeDefined();
    expect(result[0].duration).toBe(30); // Vorheizen
    expect(result[1]._rest).toBeDefined();
    expect(result[1].duration).toBe(25); // 50 / (1+1) = 25
    expect(result[2]._active).toBeDefined();
    expect(result[2].duration).toBe(2);  // Dampf
    expect(result[3]._rest).toBeDefined();
    expect(result[3].duration).toBe(25);
  });

  test("multiple sub-steps: total duration is correct", () => {
    const step = {
      ...makeStep("Backen", 50, "backen"),
      repeats: [
        { id: "pre1", name: "Vorheizen", duration: 30, count: 1, type: "aktiv", notes: "", position: "prefix" },
        { id: "int1", name: "Dampf", duration: 2, count: 1, type: "aktiv", notes: "", position: "interleave" },
      ],
    };
    const result = expandSteps([step]);
    const total = result.reduce((s, seg) => s + seg.duration, 0);
    expect(total).toBe(50 + 30 + 2); // 82
  });

  test("multiple sub-steps: two interleave splits accumulate correctly", () => {
    // Step 60 min, interleave Falten (count=1, dur=5), then interleave Lüften (count=1, dur=3)
    // After Falten: [30, Falten(5), 30]
    // Lüften splits each 30-min rest block independently (active Falten passes through):
    // → [15, Lüften(3), 15, Falten(5), 15, Lüften(3), 15]  total = 71
    const step = {
      ...makeStep("Gare", 60, "fermentation"),
      repeats: [
        { id: "a1", name: "Falten", duration: 5, count: 1, type: "aktiv", notes: "", position: "interleave" },
        { id: "b1", name: "Lüften", duration: 3, count: 1, type: "aktiv", notes: "", position: "interleave" },
      ],
    };
    const result = expandSteps([step]);
    expect(result).toHaveLength(7); // 4 rest + Falten + 2 Lüften
    const total = result.reduce((s, seg) => s + seg.duration, 0);
    expect(total).toBe(60 + 5 + 3 * 2); // 71 — Lüften once per rest block
    // All passive segments have _rest
    result.filter(s => s._rest).forEach(s => expect(s._rest.parentName).toBe("Gare"));
    // Active segments must not carry _rest
    result.filter(s => s._active).forEach(s => expect(s._rest).toBeUndefined());
  });
});

// ─── scheduleSteps ───────────────────────────────────────────────
describe("scheduleSteps", () => {
  test("last step ends exactly at targetEnd", () => {
    const steps = [makeStep("Backen", 50, "backen")];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[result.length - 1].scheduledEnd).toBe(TARGET);
  });

  test("schedules steps in chronological order", () => {
    const steps = [
      makeStep("Schritt 1", 60, "fermentation"),
      makeStep("Schritt 2", 30, "aktiv"),
    ];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[0].scheduledStart).toBeLessThan(result[1].scheduledStart);
  });

  test("each step starts where the previous one ended", () => {
    const steps = [makeStep("A", 120, "ruhe"), makeStep("B", 60, "aktiv")];
    const result = scheduleSteps(steps, TARGET, new Set());
    expect(result[0].scheduledEnd).toBe(result[1].scheduledStart);
  });

  test("aktiv steps shift away from blocked slots", () => {
    const blocked = new Set();
    const slotStart = TARGET - 30 * 60 * 1000;
    blocked.add(slotStart);
    const steps = [makeStep("Backen", 30, "backen")];
    const result = scheduleSteps(steps, TARGET, blocked);
    expect(result[0].scheduledEnd).toBeLessThanOrEqual(slotStart);
  });

  test("passive steps are not shifted by blocked slots", () => {
    const blocked = new Set();
    blocked.add(TARGET - 60 * 60 * 1000);
    const steps = [makeStep("Stockgare", 60, "fermentation")];
    const result = scheduleSteps(steps, TARGET, blocked);
    expect(result[0].scheduledEnd).toBe(TARGET);
  });

  test("repeat steps are correctly expanded and scheduled", () => {
    const steps = [{
      ...makeStep("Stockgare", 300, "fermentation"),
      repeat: { id: "r1", name: "Dehnen & Falten", duration: 5, count: 4, type: "aktiv", notes: "" },
    }];
    const result = scheduleSteps(steps, TARGET, new Set());
    // 4 rest + 4 active + 1 rest = 9 expanded segments
    expect(result).toHaveLength(9);
    expect(result[result.length - 1].scheduledEnd).toBe(TARGET);
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
