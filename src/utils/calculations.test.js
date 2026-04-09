import { describe, test, expect } from "vitest";
import {
  getTotalFlour,
  calcGrams,
  calcHydration,
  calcTotalWeight,
  totalDur,
} from "./calculations.js";

// ─── getTotalFlour ───────────────────────────────────────────────
describe("getTotalFlour", () => {
  test("sums only mehl entries", () => {
    const ings = [
      { type: "mehl", grams: 400 },
      { type: "mehl", grams: 100 },
      { type: "wasser", percent: 70 },
    ];
    expect(getTotalFlour(ings)).toBe(500);
  });

  test("returns 0 when no mehl", () => {
    expect(getTotalFlour([{ type: "wasser", percent: 70 }])).toBe(0);
  });

  test("treats missing grams as 0", () => {
    expect(getTotalFlour([{ type: "mehl" }])).toBe(0);
  });
});

// ─── calcGrams ───────────────────────────────────────────────────
describe("calcGrams", () => {
  test("returns grams directly for mehl", () => {
    expect(calcGrams({ type: "mehl", grams: 300 }, 500)).toBe(300);
  });

  test("calculates grams from percent for non-mehl", () => {
    // 70% of 500g = 350g
    expect(calcGrams({ type: "wasser", percent: 70 }, 500)).toBe(350);
  });

  test("returns 0 when totalFlour is 0", () => {
    expect(calcGrams({ type: "wasser", percent: 70 }, 0)).toBe(0);
  });

  test("handles missing percent as 0", () => {
    expect(calcGrams({ type: "salz" }, 500)).toBe(0);
  });
});

// ─── calcHydration ───────────────────────────────────────────────
describe("calcHydration", () => {
  test("returns 0 when no flour", () => {
    expect(calcHydration([{ type: "wasser", percent: 70 }])).toBe(0);
  });

  test("calculates simple hydration (nur Wasser)", () => {
    const ings = [
      { type: "mehl", grams: 500 },
      { type: "wasser", percent: 70 },
    ];
    // 70% of 500 = 350g water / 500g flour = 70%
    expect(calcHydration(ings)).toBe(70);
  });

  test("accounts for water in starter (100% hydration starter)", () => {
    // 500g flour, 20% starter (100g), 100% hydration → 50g water + 50g flour
    // effective flour = 500 + 50 = 550g
    // water = 50g → 50/550 ≈ 9%
    const ings = [
      { type: "mehl", grams: 500 },
      { type: "starter", percent: 20, hydration: 100 },
    ];
    const result = calcHydration(ings);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(20);
  });

  test("200% hydration gives ~100% result", () => {
    const ings = [
      { type: "mehl", grams: 100 },
      { type: "wasser", percent: 100 },
    ];
    expect(calcHydration(ings)).toBe(100);
  });
});

// ─── calcTotalWeight ─────────────────────────────────────────────
describe("calcTotalWeight", () => {
  test("sums all ingredient weights", () => {
    const ings = [
      { type: "mehl", grams: 400 },
      { type: "mehl", grams: 100 },
      { type: "wasser", percent: 70 },  // 70% of 500 = 350
      { type: "salz", percent: 2 },     // 2% of 500 = 10
    ];
    expect(calcTotalWeight(ings)).toBe(860);
  });

  test("returns 0 for empty list", () => {
    expect(calcTotalWeight([])).toBe(0);
  });
});

// ─── totalDur ────────────────────────────────────────────────────
describe("totalDur", () => {
  test("sums all step durations", () => {
    const steps = [{ duration: 30 }, { duration: 60 }, { duration: 480 }];
    expect(totalDur(steps)).toBe(570);
  });

  test("returns 0 for empty list", () => {
    expect(totalDur([])).toBe(0);
  });
});
