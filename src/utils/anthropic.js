const KEY_APIKEY  = "bakebuddy-anthropic-key";
const KEY_USAGE   = "bakebuddy-anthropic-usage";
const KEY_BUDGET  = "bakebuddy-anthropic-budget";

const DEFAULT_BUDGET = 50_000; // tokens per month

// ── API key ──────────────────────────────────────────────────────────
export const loadAnthropicKey = () => {
  try { const s = localStorage.getItem(KEY_APIKEY); if (s) return s; } catch {}
  return import.meta.env.VITE_ANTHROPIC_KEY || null;
};
export const saveAnthropicKey = (key) => {
  try { localStorage.setItem(KEY_APIKEY, key); } catch {}
};
export const clearAnthropicKey = () => {
  try { localStorage.removeItem(KEY_APIKEY); } catch {}
};

// ── Monthly budget ────────────────────────────────────────────────────
export const loadBudget = () => {
  try { return Number(localStorage.getItem(KEY_BUDGET)) || DEFAULT_BUDGET; } catch {}
  return DEFAULT_BUDGET;
};
export const saveBudget = (tokens) => {
  try { localStorage.setItem(KEY_BUDGET, String(tokens)); } catch {}
};

// ── Monthly usage tracking ────────────────────────────────────────────
const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}`;
};

export const getMonthlyUsage = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY_USAGE) || "{}");
    return stored[monthKey()] || 0;
  } catch { return 0; }
};

const recordUsage = (tokens) => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY_USAGE) || "{}");
    const mk = monthKey();
    stored[mk] = (stored[mk] || 0) + tokens;
    // Keep at most 3 months
    const keys = Object.keys(stored).sort();
    if (keys.length > 3) delete stored[keys[0]];
    localStorage.setItem(KEY_USAGE, JSON.stringify(stored));
  } catch {}
};

// Returns { used, budget, pct, warn (≥70%), blocked (≥100%) }
export const usageStatus = () => {
  const used   = getMonthlyUsage();
  const budget = loadBudget();
  const pct    = budget > 0 ? (used / budget) * 100 : 0;
  return { used, budget, pct, warn: pct >= 70, blocked: pct >= 100 };
};

// ── API call ──────────────────────────────────────────────────────────
const PROMPT = `Du bist ein Experte für Brotbacken und Backen. Analysiere das Bild und extrahiere das Rezept als JSON.

Gib NUR das JSON-Objekt zurück — kein Text, keine Erklärung, kein Markdown.

Struktur:
{
  "name": "Rezeptname",
  "category": "Brot",
  "pieces": 1,
  "ingredients": [
    { "name": "Weizenmehl 550", "grams": 400, "type": "mehl" },
    { "name": "Wasser", "percent": 68, "type": "wasser" },
    { "name": "Sauerteig", "percent": 20, "type": "starter", "hydration": 100 },
    { "name": "Salz", "percent": 2, "type": "salz" }
  ],
  "steps": [
    { "name": "Autolyse", "duration": 60, "type": "ruhe", "tempMin": null, "tempMax": null, "notes": "" }
  ]
}

category: "Brot" | "Brötchen" | "Gebäck" | "Pizza" | "Kuchen" | "Sonstiges"

ingredients.type:
  "mehl"     → "grams" (Gramm), kein percent
  "wasser" | "hefe" | "salz" | "fett" | "zucker" | "sonstiges" → "percent" (Bäcker-%), kein grams
  "starter"  → "percent" + "hydration" (Standard 100)

steps.type:
  "fermentation" → Gare, Teigruhe, Fermentation (passiv)
  "ruhe"         → Autolyse, kurze Ruhezeit (passiv)
  "aktiv"        → Kneten, Formen, Einschneiden (aktiv)
  "backen"       → Backen im Ofen
  "kühlen"       → Kühlen, Kühlschrank

Enthält das Bild kein erkennbares Rezept, gib zurück: { "error": "Kein Rezept erkannt" }`;

export const analyzeRecipeImage = async (apiKey, base64, mimeType) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("Ungültiger API-Key. Bitte in den Einstellungen prüfen.");
    if (res.status === 429) throw new Error("Rate limit erreicht. Bitte kurz warten.");
    throw new Error(`API-Fehler: ${msg}`);
  }

  const data = await res.json();

  // Track token usage from response
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  if (tokensUsed > 0) recordUsage(tokensUsed);

  const text = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Keine JSON-Antwort erhalten. Bitte erneut versuchen.");

  const parsed = JSON.parse(match[0]);
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
};
