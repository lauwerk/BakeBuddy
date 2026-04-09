import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { getTotalFlour, calcHydration, calcTotalWeight, totalDur } from "../utils/calculations.js";
import { fmtDur } from "../utils/formatters.js";

export const RecipeList = ({ recipes, onSelect, onCreate }) => (
  <div style={S.page}>
    <div style={S.hdr}>
      <h1 style={S.title}>Meine Rezepte</h1>
      <button onClick={onCreate} style={S.iconBtn}>{ICO.plus(24)}</button>
    </div>
    {recipes.length === 0 && (
      <div style={S.empty}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🍞</div>
        <p style={S.mutedTxt}>Noch keine Rezepte.</p>
        <button onClick={onCreate} style={S.pri}>Erstes Rezept erstellen</button>
      </div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {recipes.map(r => {
        const tf = getTotalFlour(r.ingredients);
        return (
          <button key={r.id} onClick={() => onSelect(r.id)} style={S.rCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>
                {r.category === "Brot" ? "🍞" : r.category === "Brötchen" ? "🥖" : r.category === "Pizza" ? "🍕" : "🥐"}
              </span>
              <span style={S.badge}>{r.category}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>{r.name || "Unbenannt"}</h3>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)" }}>
              <span>💧 {calcHydration(r.ingredients)}%</span>
              <span>⏱ {fmtDur(totalDur(r.steps))}</span>
              <span>🌾 {tf}g</span>
              <span>⚖️ {Math.round(calcTotalWeight(r.ingredients))}g</span>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);
