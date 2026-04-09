import { useState, useMemo } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { uid, categories, stepTypes, ingredientTypeOrder, typeLabels } from "../constants.js";
import { getTotalFlour, calcGrams, calcHydration, calcTotalWeight, totalDur } from "../utils/calculations.js";
import { fmtDur } from "../utils/formatters.js";

export const RecipeEditor = ({ recipe, onSave, onDelete, onBack, onDuplicate, onPlan }) => {
  const [r, setR] = useState(() => structuredClone(recipe));
  const [sec, setSec] = useState("info");
  const [scale, setScale] = useState(1);
  const [jText, setJText] = useState("");
  const [jRate, setJRate] = useState(0);

  // Use structuredClone instead of JSON.parse/stringify for ~2× speed improvement
  const up = (fn) => setR(p => {
    const n = structuredClone(p);
    fn(n);
    n.updatedAt = Date.now();
    return n;
  });

  const totalFlour = useMemo(() => getTotalFlour(r.ingredients), [r.ingredients]);
  const scaledFlour = totalFlour * scale;
  const hydration = useMemo(() => calcHydration(r.ingredients), [r.ingredients]);
  const totalWt = useMemo(() => {
    const tf = totalFlour * scale;
    return r.ingredients.reduce((s, i) => {
      if (i.type === "mehl") return s + (i.grams || 0) * scale;
      return s + (tf > 0 ? ((i.percent || 0) / 100) * tf : 0);
    }, 0);
  }, [r.ingredients, scale, totalFlour]);

  const grouped = useMemo(() => {
    const g = {};
    ingredientTypeOrder.forEach(t => (g[t] = []));
    r.ingredients.forEach(i => {
      if (g[i.type]) g[i.type].push(i);
      else g.sonstiges.push(i);
    });
    return g;
  }, [r.ingredients]);

  const addIng = (type) =>
    up(r => r.ingredients.push({
      id: uid(), name: "", type,
      ...(type === "mehl" ? { grams: 0 } : { percent: 2 }),
      ...(type === "starter" ? { hydration: 100 } : {}),
    }));
  const rmIng = (id) => up(r => { r.ingredients = r.ingredients.filter(i => i.id !== id); });
  const setIng = (id, field, val) => up(r => {
    const i = r.ingredients.find(x => x.id === id);
    if (i) i[field] = val;
  });

  const addStep = () =>
    up(r => r.steps.push({ id: uid(), name: "", duration: 30, tempMin: null, tempMax: null, type: "aktiv", notes: "" }));
  const rmStep = (id) => up(r => { r.steps = r.steps.filter(s => s.id !== id); });
  const setStep = (id, f, v) => up(r => {
    const s = r.steps.find(x => x.id === id);
    if (s) s[f] = ["duration", "tempMin", "tempMax", "flexMin", "flexMax"].includes(f)
      ? (v === "" ? null : Number(v) || 0)
      : v;
  });
  const mvStep = (id, d) => up(r => {
    const i = r.steps.findIndex(s => s.id === id), ni = i + d;
    if (ni >= 0 && ni < r.steps.length) [r.steps[i], r.steps[ni]] = [r.steps[ni], r.steps[i]];
  });

  const addRepeat = (id) => up(r => {
    const s = r.steps.find(x => x.id === id);
    if (s) s.repeat = { id: uid(), name: "Dehnen & Falten", duration: 5, count: 4, type: "aktiv", notes: "" };
  });
  const rmRepeat = (id) => up(r => {
    const s = r.steps.find(x => x.id === id);
    if (s) delete s.repeat;
  });
  const setRepeat = (id, field, val) => up(r => {
    const s = r.steps.find(x => x.id === id);
    if (s?.repeat) s.repeat[field] = ["count", "duration"].includes(field)
      ? (Number(val) || 1)
      : val;
  });

  const addJ = () => {
    if (!jText.trim()) return;
    up(r => r.journal.push({ id: uid(), text: jText, rating: jRate, date: Date.now() }));
    setJText("");
    setJRate(0);
  };

  const secs = [["info", "Info"], ["zutaten", "Zutaten"], ["schritte", "Schritte"], ["tagebuch", "Tagebuch"]];

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.iconBtn}>{ICO.back(24)}</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => onDuplicate(r)} style={S.iconBtn}>{ICO.copy(18)}</button>
        <button onClick={() => onPlan(r)} style={S.iconBtn}>{ICO.play(18)}</button>
        <button onClick={() => onSave({ ...r, updatedAt: Date.now() })} style={S.saveBtn}>
          {ICO.save(15)} Speichern
        </button>
      </div>
      <div style={S.secTabs}>
        {secs.map(([id, l]) => (
          <button key={id} onClick={() => setSec(id)} style={{ ...S.secTab, ...(sec === id ? S.secTabAct : {}) }}>
            {l}
          </button>
        ))}
      </div>

      {/* INFO */}
      {sec === "info" && (
        <div style={S.col}>
          <input
            value={r.name}
            onChange={e => up(r => { r.name = e.target.value; })}
            placeholder="Rezeptname"
            style={S.titleIn}
          />
          <div style={S.row}>
            <label style={S.lbl}>Kategorie</label>
            <select value={r.category} onChange={e => up(r => { r.category = e.target.value; })} style={S.sel}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={S.row}>
            <label style={S.lbl}>Stücke</label>
            <input
              type="number" value={r.pieces} min={1}
              onChange={e => up(r => { r.pieces = Number(e.target.value) || 1; })}
              style={S.numIn}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <div style={S.stat}><span style={S.statV}>🌾 {totalFlour}g</span><span style={S.statL}>Mehl gesamt</span></div>
            <div style={S.stat}><span style={S.statV}>💧 {hydration}%</span><span style={S.statL}>Hydration</span></div>
            <div style={S.stat}><span style={S.statV}>TA {hydration + 100}</span><span style={S.statL}>Teigausbeute</span></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <div style={S.stat}><span style={S.statV}>⚖️ {Math.round(calcTotalWeight(r.ingredients))}g</span><span style={S.statL}>Gesamtgewicht</span></div>
            <div style={S.stat}><span style={S.statV}>⏱ {fmtDur(totalDur(r.steps))}</span><span style={S.statL}>Gesamtdauer</span></div>
          </div>
          <button onClick={onDelete} style={S.danger}>{ICO.trash(15)} Rezept löschen</button>
        </div>
      )}

      {/* ZUTATEN */}
      {sec === "zutaten" && (
        <div style={S.col}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Skalierung:</span>
            {[0.5, 1, 1.5, 2, 3].map(f => (
              <button key={f} onClick={() => setScale(f)} style={{ ...S.scBtn, ...(scale === f ? S.scBtnAct : {}) }}>
                {f}x
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 10px", background: "var(--surface)", borderRadius: 8, marginBottom: 10 }}>
            Mehl: <b style={{ color: "var(--text)" }}>{totalFlour}g</b>
            {scale !== 1 && <> → <b style={{ color: "var(--accent)" }}>{scaledFlour}g</b></>}
            {" · "}Gesamt: <b style={{ color: "var(--text)" }}>{Math.round(totalWt)}g</b>
          </div>

          {ingredientTypeOrder.map(type => {
            const items = grouped[type];
            if (!items.length && type !== "mehl") return null;
            const isFlour = type === "mehl";
            return (
              <div key={type} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{typeLabels[type]}</span>
                  {isFlour && <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>= 100%</span>}
                </div>
                <div style={{ display: "flex", gap: 6, fontSize: 10, color: "var(--muted)", padding: "2px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <span style={{ flex: 1 }}>Zutat</span>
                  <span style={{ width: 70, textAlign: "right" }}>{isFlour ? "Gramm" : "BP %"}</span>
                  <span style={{ width: 60, textAlign: "right" }}>{isFlour ? (scale !== 1 ? "Skaliert" : "") : "Gramm"}</span>
                  <span style={{ width: 20 }} />
                </div>
                {items.map(ing => {
                  const grams = isFlour ? (ing.grams || 0) : calcGrams(ing, totalFlour);
                  const scaledG = isFlour
                    ? Math.round((ing.grams || 0) * scale * 10) / 10
                    : Math.round(grams * scale * 10) / 10;
                  return (
                    <div key={ing.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={ing.name} onChange={e => setIng(ing.id, "name", e.target.value)} placeholder="Name" style={S.inIn} />
                        {ing.type === "starter" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 11 }}>
                            <span style={{ color: "var(--muted)" }}>Hydration:</span>
                            <input
                              type="number" value={ing.hydration || 100}
                              onChange={e => setIng(ing.id, "hydration", Number(e.target.value) || 100)}
                              style={{ ...S.numSm, width: 44 }}
                            />
                            <span style={{ color: "var(--muted)" }}>%</span>
                          </div>
                        )}
                      </div>
                      <div style={{ width: 70, textAlign: "right" }}>
                        {isFlour ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                            <input
                              type="number" value={ing.grams || ""}
                              onChange={e => setIng(ing.id, "grams", Number(e.target.value) || 0)}
                              style={{ ...S.numSm, width: 56, fontWeight: 700 }}
                            />
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>g</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                            <input
                              type="number" value={ing.percent ?? ""}
                              onChange={e => setIng(ing.id, "percent", Number(e.target.value) || 0)}
                              style={{ ...S.numSm, width: 50, fontWeight: 700, color: "var(--accent)" }}
                            />
                            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>%</span>
                          </div>
                        )}
                      </div>
                      <div style={{ width: 60, textAlign: "right", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                        {isFlour ? (scale !== 1 ? `${scaledG}g` : "") : `${scaledG}g`}
                      </div>
                      <button onClick={() => rmIng(ing.id)} style={S.mini}>{ICO.x(13)}</button>
                    </div>
                  );
                })}
                <button onClick={() => addIng(type)} style={S.addSm}>
                  {ICO.plus(13)} {isFlour ? "Mehlsorte" : "hinzufügen"}
                </button>
              </div>
            );
          })}

          {ingredientTypeOrder.filter(t => !grouped[t]?.length && t !== "mehl").length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Weitere hinzufügen:</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ingredientTypeOrder.filter(t => !grouped[t]?.length && t !== "mehl").map(t => (
                  <button key={t} onClick={() => addIng(t)} style={S.addSm}>+ {typeLabels[t]}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCHRITTE */}
      {sec === "schritte" && (
        <div style={S.col}>
          {r.steps.map((st, idx) => (
            <div key={st.id} style={S.stepCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={S.stepN}>{idx + 1}</span>
                <span style={{ fontSize: 16 }}>{stepTypes[st.type] || "📋"}</span>
                <input
                  value={st.name}
                  onChange={e => setStep(st.id, "name", e.target.value)}
                  placeholder="Schrittname"
                  style={{ ...S.inIn, flex: 1, fontWeight: 600 }}
                />
                <button onClick={() => rmStep(st.id)} style={S.mini}>{ICO.x(13)}</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 28, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ color: "var(--muted)", width: 42 }}>Typ</label>
                  <select value={st.type} onChange={e => setStep(st.id, "type", e.target.value)} style={S.inSel}>
                    {Object.keys(stepTypes).map(t => <option key={t} value={t}>{stepTypes[t]} {t}</option>)}
                  </select>
                  <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 2 }}>
                    {["fermentation", "ruhe", "kühlen"].includes(st.type) ? "⏸ passiv" : "▶ aktiv"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ color: "var(--muted)", width: 42 }}>
                    {st.repeat ? "Passiv" : "Dauer"}
                  </label>
                  <input type="number" value={st.duration || ""} onChange={e => setStep(st.id, "duration", e.target.value)} style={{ ...S.numSm, width: 56 }} />
                  <span style={{ color: "var(--muted)" }}>Min{!st.repeat && ` · ${fmtDur(st.duration || 0)}`}</span>
                </div>
                {(st.type === "fermentation" || st.type === "ruhe") && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ color: "var(--muted)", width: 42 }}>Flex</label>
                    <input type="number" value={st.flexMin ?? ""} placeholder="Min" onChange={e => setStep(st.id, "flexMin", e.target.value)} style={{ ...S.numSm, width: 48 }} />
                    <span style={{ color: "var(--muted)" }}>–</span>
                    <input type="number" value={st.flexMax ?? ""} placeholder="Max" onChange={e => setStep(st.id, "flexMax", e.target.value)} style={{ ...S.numSm, width: 48 }} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ color: "var(--muted)", width: 42 }}>Temp</label>
                  <input type="number" value={st.tempMin ?? ""} onChange={e => setStep(st.id, "tempMin", e.target.value)} style={{ ...S.numSm, width: 46 }} />
                  <span style={{ color: "var(--muted)" }}>–</span>
                  <input type="number" value={st.tempMax ?? ""} onChange={e => setStep(st.id, "tempMax", e.target.value)} style={{ ...S.numSm, width: 46 }} />
                  <span style={{ color: "var(--muted)" }}>°C</span>
                </div>
                <textarea value={st.notes} onChange={e => setStep(st.id, "notes", e.target.value)} placeholder="Notizen…" style={S.taSm} rows={2} />

                {/* ── Sub-Schritt ── */}
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {!st.repeat ? (
                    <button onClick={() => addRepeat(st.id)} style={S.addSm}>
                      🔄 Sub-Schritt einplanen
                    </button>
                  ) : (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>🔄 Sub-Schritt</span>
                        <button onClick={() => rmRepeat(st.id)} style={{ ...S.mini, color: "var(--danger)", fontSize: 11 }}>
                          Entfernen
                        </button>
                      </div>
                      <input
                        value={st.repeat.name}
                        onChange={e => setRepeat(st.id, "name", e.target.value)}
                        placeholder="Name (z.B. Dehnen & Falten)"
                        style={S.inIn}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <label style={{ color: "var(--muted)", fontSize: 11 }}>Anzahl</label>
                          <input
                            type="number" min={1} value={st.repeat.count || ""}
                            onChange={e => setRepeat(st.id, "count", e.target.value)}
                            style={{ ...S.numSm, width: 46 }}
                          />
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>×</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number" min={1} value={st.repeat.duration || ""}
                            onChange={e => setRepeat(st.id, "duration", e.target.value)}
                            style={{ ...S.numSm, width: 46 }}
                          />
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>Min</span>
                        </div>
                      </div>
                      {/* Vorschau */}
                      {st.repeat.count > 0 && st.repeat.duration > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", background: "var(--surface2)", borderRadius: 6, padding: "5px 8px", lineHeight: 1.4 }}>
                          {(() => {
                            const isPassive = ["fermentation", "ruhe", "kühlen"].includes(st.type);
                            const total = st.duration + st.repeat.count * st.repeat.duration;
                            if (isPassive) {
                              const seg = Math.floor(st.duration / (st.repeat.count + 1));
                              return `${st.repeat.count + 1} × ${seg} Min + ${st.repeat.count} × ${st.repeat.duration} Min = ${fmtDur(total)}`;
                            }
                            return `${st.duration} Min + ${st.repeat.count} × ${st.repeat.duration} Min = ${fmtDur(total)}`;
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => mvStep(st.id, -1)} disabled={idx === 0} style={S.mini}>↑</button>
                <button onClick={() => mvStep(st.id, 1)} disabled={idx === r.steps.length - 1} style={S.mini}>↓</button>
              </div>
            </div>
          ))}
          <button onClick={addStep} style={S.addBtn}>{ICO.plus(16)} Schritt hinzufügen</button>
        </div>
      )}

      {/* TAGEBUCH */}
      {sec === "tagebuch" && (
        <div style={S.col}>
          <div style={S.card}>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setJRate(n)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 22 }}>
                  {n <= jRate ? "★" : "☆"}
                </button>
              ))}
            </div>
            <textarea value={jText} onChange={e => setJText(e.target.value)} placeholder="Wie war das Ergebnis?" style={S.ta} rows={3} />
            <button onClick={addJ} style={S.pri}>Eintrag speichern</button>
          </div>
          {r.journal.slice().reverse().map(j => (
            <div key={j.id} style={{ ...S.card, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "var(--accent)" }}>{"★".repeat(j.rating)}{"☆".repeat(5 - j.rating)}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {new Date(j.date).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}, {new Date(j.date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{j.text}</p>
            </div>
          ))}
          {!r.journal.length && <p style={S.mutedTxt}>Noch keine Einträge.</p>}
        </div>
      )}
    </div>
  );
};
