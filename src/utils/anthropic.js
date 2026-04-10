const STORAGE_KEY = "bakebuddy-anthropic-key";

export const loadAnthropicKey = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {}
  return import.meta.env.VITE_ANTHROPIC_KEY || null;
};

export const saveAnthropicKey = (key) => {
  try { localStorage.setItem(STORAGE_KEY, key); } catch {}
};

export const clearAnthropicKey = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

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
      max_tokens: 4096,
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
  const text = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Keine JSON-Antwort erhalten. Bitte erneut versuchen.");

  const parsed = JSON.parse(match[0]);
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
};
