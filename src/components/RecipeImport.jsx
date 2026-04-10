import { useState, useRef } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { uid } from "../constants.js";
import { loadAnthropicKey, analyzeRecipeImage, usageStatus } from "../utils/anthropic.js";

export const RecipeImport = ({ onImport, onBack }) => {
  const [imgData, setImgData]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [status, setStatus]     = useState(usageStatus); // refresh after each call
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
      recipe.id          = uid();
      recipe.createdAt   = Date.now();
      recipe.updatedAt   = Date.now();
      recipe.journal     = [];
      recipe.pieces      = recipe.pieces || 1;
      recipe.ingredients = (recipe.ingredients || []).map(i => ({ ...i, id: uid() }));
      recipe.steps       = (recipe.steps || []).map(s => ({
        ...s, id: uid(), tempMin: s.tempMin ?? null, tempMax: s.tempMax ?? null, notes: s.notes || "",
      }));
      setStatus(usageStatus()); // refresh meter
      onImport(recipe);
    } catch (e) {
      setError(e.message);
      setLoading(false);
      setStatus(usageStatus());
    }
  };

  const reset = () => { setImgData(null); setError(null); };

  const barColor = status.blocked ? "var(--danger)" : status.warn ? "#e8a838" : "var(--success)";

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.iconBtn}>{ICO.back(24)}</button>
        <h2 style={{ ...S.title, fontSize: 18 }}>Rezept aus Bild</h2>
      </div>

      <div style={S.col}>
        {/* Budget meter */}
        <div style={{ ...S.card, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Token-Budget (Monat)</span>
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: status.blocked ? "var(--danger)" : status.warn ? "#e8a838" : "var(--text)" }}>
              {status.used.toLocaleString("de")} / {status.budget.toLocaleString("de")}
            </span>
          </div>
          <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(status.pct, 100)}%`, background: barColor, borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          {status.blocked && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--danger)" }}>
              Monatslimit erreicht. Limit in den Einstellungen anpassen oder nächsten Monat abwarten.
            </p>
          )}
          {status.warn && !status.blocked && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#e8a838" }}>
              70 % des Budgets verbraucht — noch ca. {Math.floor((status.budget - status.used) / 2500)} Analysen übrig.
            </p>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

        {!imgData ? (
          <button
            onClick={() => !status.blocked && fileRef.current?.click()}
            disabled={status.blocked}
            style={{ ...S.card, cursor: status.blocked ? "not-allowed" : "pointer", opacity: status.blocked ? 0.5 : 1, border: "2px dashed var(--accent)", textAlign: "center", padding: "36px 20px" }}
          >
            <div style={{ fontSize: 44, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Bild auswählen</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Rezeptkarte, Buchseite, Handschrift, …</div>
          </button>
        ) : (
          <div style={S.card}>
            <img src={imgData.url} alt="Rezeptbild"
              style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 300, objectFit: "contain", background: "var(--surface2)" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={analyze} disabled={loading || status.blocked}
                style={{ ...S.pri, flex: 1, opacity: loading || status.blocked ? 0.6 : 1 }}>
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
            Foto eines Rezepts hochladen (Buch, Handschrift, Ausdruck, Screenshot).
            Claude analysiert das Bild und erstellt ein strukturiertes BakeBuddy-Rezept.<br /><br />
            Das Token-Budget und den API-Key findest du in den <b style={{ color: "var(--text)" }}>Einstellungen</b>.
          </p>
        </div>
      </div>
    </div>
  );
};
