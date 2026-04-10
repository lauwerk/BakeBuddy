import { useState, useMemo } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { getTotalFlour, calcHydration, calcTotalWeight, totalDur, calcRecipeRating } from "../utils/calculations.js";
import { fmtDur } from "../utils/formatters.js";

export const RecipeList = ({ recipes, onSelect, onCreate, onImportFromImage }) => {
  const [sortBy, setSortBy] = useState("newest");
  const [flourFilter, setFlourFilter] = useState(new Set());

  const allFlours = useMemo(() => {
    const names = new Set();
    recipes.forEach(r =>
      r.ingredients.filter(i => i.type === "mehl").forEach(i => { if (i.name) names.add(i.name); })
    );
    return [...names].sort();
  }, [recipes]);

  const toggleFlour = (name) => setFlourFilter(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const displayed = useMemo(() => {
    let list = [...recipes];
    if (flourFilter.size > 0)
      list = list.filter(r => r.ingredients.some(i => i.type === "mehl" && flourFilter.has(i.name)));
    return sortBy === "stars"
      ? list.sort((a, b) => calcRecipeRating(b) - calcRecipeRating(a))
      : list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [recipes, flourFilter, sortBy]);

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <h1 style={S.title}>Meine Rezepte</h1>
        <button onClick={onImportFromImage} style={S.iconBtn} title="Rezept aus Bild">📷</button>
        <button onClick={onCreate} style={S.iconBtn}>{ICO.plus(24)}</button>
      </div>

      {recipes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {[["newest", "🕐 Neueste"], ["stars", "★ Bewertung"]].map(([val, label]) => (
              <button key={val} onClick={() => setSortBy(val)}
                style={{ ...S.scBtn, ...(sortBy === val ? S.scBtnAct : {}), fontSize: 12 }}>
                {label}
              </button>
            ))}
          </div>
          {allFlours.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {allFlours.map(name => (
                <button key={name} onClick={() => toggleFlour(name)}
                  style={{ ...S.scBtn, ...(flourFilter.has(name) ? S.scBtnAct : {}), fontSize: 11 }}>
                  🌾 {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {recipes.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🍞</div>
          <p style={S.mutedTxt}>Noch keine Rezepte.</p>
          <button onClick={onCreate} style={S.pri}>Erstes Rezept erstellen</button>
        </div>
      )}
      {recipes.length > 0 && displayed.length === 0 && (
        <p style={S.mutedTxt}>Kein Rezept passt zum Filter.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {displayed.map(r => {
          const tf = getTotalFlour(r.ingredients);
          const avg = calcRecipeRating(r);
          const stars = Math.round(avg);
          return (
            <button key={r.id} onClick={() => onSelect(r.id)} style={S.rCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 26 }}>
                  {r.category === "Brot" ? "🍞" : r.category === "Brötchen" ? "🥖" : r.category === "Pizza" ? "🍕" : "🥐"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {stars > 0 && (
                    <span style={{ color: "var(--accent)", fontSize: 13 }}>
                      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
                    </span>
                  )}
                  <span style={S.badge}>{r.category}</span>
                </div>
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
};
