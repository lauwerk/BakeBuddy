import { useState, useRef } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { uid } from "../constants.js";
import { loadAnthropicKey, analyzeRecipeImage } from "../utils/anthropic.js";

export const RecipeImport = ({ onImport, onBack }) => {
  const [imgData, setImgData] = useState(null); // { base64, mimeType, url }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      setImgData({ base64, mimeType, url: dataUrl });
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const analyze = async () => {
    const apiKey = loadAnthropicKey();
    if (!apiKey) {
      setError("Kein Anthropic API-Key hinterlegt. Bitte zuerst in den Einstellungen eintragen.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const recipe = await analyzeRecipeImage(apiKey, imgData.base64, imgData.mimeType);
      // Enrich with IDs and required defaults
      recipe.id = uid();
      recipe.createdAt = Date.now();
      recipe.updatedAt = Date.now();
      recipe.journal = [];
      recipe.pieces = recipe.pieces || 1;
      recipe.ingredients = (recipe.ingredients || []).map(i => ({ ...i, id: uid() }));
      recipe.steps = (recipe.steps || []).map(s => ({
        ...s,
        id: uid(),
        tempMin: s.tempMin ?? null,
        tempMax: s.tempMax ?? null,
        notes: s.notes || "",
      }));
      onImport(recipe);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const reset = () => { setImgData(null); setError(null); };

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.iconBtn}>{ICO.back(24)}</button>
        <h2 style={{ ...S.title, fontSize: 18 }}>Rezept aus Bild</h2>
      </div>

      <div style={S.col}>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

        {!imgData ? (
          <button
            onClick={() => fileRef.current?.click()}
            style={{ ...S.card, cursor: "pointer", border: "2px dashed var(--accent)", textAlign: "center", padding: "36px 20px" }}
          >
            <div style={{ fontSize: 44, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Bild auswählen</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Rezeptkarte, Buchseite, Handschrift, …</div>
          </button>
        ) : (
          <div style={S.card}>
            <img
              src={imgData.url}
              alt="Rezeptbild"
              style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 300, objectFit: "contain", background: "var(--surface2)" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={analyze} disabled={loading} style={{ ...S.pri, flex: 1, opacity: loading ? 0.6 : 1 }}>
                {loading ? "⏳ Claude analysiert…" : "✨ Rezept extrahieren"}
              </button>
              <button onClick={reset} disabled={loading} style={{ ...S.sec, padding: "11px 16px", marginTop: 8 }}>✕</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.4, background: "rgba(196,91,74,0.15)", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div style={{ ...S.card, background: "var(--surface2)", border: "none" }}>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            <b style={{ color: "var(--text)" }}>So funktioniert's:</b><br />
            Lade ein Foto eines Rezepts hoch (Buch, Handschrift, Ausdruck, Screenshot).
            Claude analysiert das Bild und erstellt daraus ein strukturiertes BakeBuddy-Rezept,
            das du direkt bearbeiten und speichern kannst.<br /><br />
            Voraussetzung: Anthropic API-Key in den <b style={{ color: "var(--text)" }}>Einstellungen</b> hinterlegen.
          </p>
        </div>
      </div>
    </div>
  );
};
