export const STORAGE_KEY = "bakebuddy-data";
export const GH_CONFIG_KEY = "bakebuddy-gh-config";
export const GH_FILE = "bakebuddy-data.json";

export const categories = ["Brot", "Brötchen", "Gebäck", "Pizza", "Kuchen", "Sonstiges"];

export const stepTypes = {
  fermentation: "🫧",
  aktiv: "🤲",
  ruhe: "😴",
  backen: "🔥",
  kühlen: "❄️",
};

export const ingredientTypeOrder = [
  "mehl", "wasser", "starter", "hefe", "salz", "fett", "zucker", "sonstiges",
];

export const typeLabels = {
  mehl: "🌾 Mehle",
  wasser: "💧 Flüssigkeiten",
  starter: "🫧 Sauerteig",
  hefe: "🍞 Hefe",
  salz: "🧂 Salz",
  fett: "🧈 Fette",
  zucker: "🍯 Süße",
  sonstiges: "📦 Sonstiges",
};

export const SLOT_MS = 30 * 60 * 1000;

export const uid = () => crypto.randomUUID();

export const defaultRecipe = () => ({
  id: uid(),
  name: "",
  category: "Brot",
  ingredients: [
    { id: uid(), name: "Weizenmehl 550", grams: 400, type: "mehl" },
    { id: uid(), name: "Roggenmehl 1150", grams: 100, type: "mehl" },
    { id: uid(), name: "Wasser", percent: 68, type: "wasser" },
    { id: uid(), name: "Sauerteig Starter", percent: 20, type: "starter", hydration: 100 },
    { id: uid(), name: "Salz", percent: 2, type: "salz" },
  ],
  steps: [
    { id: uid(), name: "Starter füttern", duration: 480, tempMin: 24, tempMax: 28, type: "fermentation", notes: "Starter 1:1:1 auffrischen" },
    { id: uid(), name: "Autolyse", duration: 60, tempMin: 22, tempMax: 26, type: "ruhe", notes: "Mehl + Wasser vermengen, abgedeckt ruhen" },
    { id: uid(), name: "Hauptteig kneten", duration: 15, tempMin: null, tempMax: null, type: "aktiv", notes: "Starter + Salz einarbeiten" },
    { id: uid(), name: "Dehnen & Falten", duration: 10, tempMin: null, tempMax: null, type: "aktiv", notes: "4x im Abstand von 30 Min" },
    { id: uid(), name: "Stockgare", duration: 300, tempMin: 22, tempMax: 28, type: "fermentation", notes: "Teig auf doppeltes Volumen", flexMin: 240, flexMax: 480 },
    { id: uid(), name: "Formen", duration: 15, tempMin: null, tempMax: null, type: "aktiv", notes: "Rundwirken, in Gärkorb" },
    { id: uid(), name: "Stückgare", duration: 720, tempMin: 4, tempMax: 6, type: "fermentation", notes: "Kühlschrank, abgedeckt", flexMin: 600, flexMax: 960 },
    { id: uid(), name: "Backen", duration: 50, tempMin: 240, tempMax: 250, type: "backen", notes: "20 Min mit Dampf, dann ohne" },
  ],
  pieces: 1,
  journal: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
