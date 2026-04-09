import { STORAGE_KEY } from "../constants.js";

export const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { recipes: [] };
  } catch {
    return { recipes: [] };
  }
};

export const save = (d) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch (e) {
    console.warn("localStorage speichern fehlgeschlagen:", e);
  }
};

export const exportJSON = (d) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })
  );
  a.download = `bakebuddy-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
