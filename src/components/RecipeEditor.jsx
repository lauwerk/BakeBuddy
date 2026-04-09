import { useState, useMemo } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { uid, categories, stepTypes, ingredientTypeOrder, typeLabels, RATING_CATS, EMPTY_RATINGS } from "../constants.js";
import { getTotalFlour, calcGrams, calcHydration, calcTotalWeight, totalDur, calcEntryRating } from "../utils/calculations.js";
import { fmtDur } from "../utils/formatters.js";

export const RecipeEditor = ({ recipe, onSave, onDelete, onBack, onDuplicate, onPlan }) => {
  const [r, setR] = useState(() => structuredClone(recipe));
  const [sec, setSec] = useState("info");
  const [scale, setScale] = useState(1);
  const [jText, setJText] = useState("");
  const [jRatings, setJRatings] = useState(EMPTY_RATINGS);
  const [editingJId, setEditingJId] = useState(null);

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

  // Normalisiert altes repeat-Format auf repeats-Array
  const getRepeats = (step) => step.repeats || (step.repeat ? [step.repeat] : []);

  const addRepeat = (stepId) => up(r => {
    const s = r.steps.find(x => x.id === stepId);
    if (!s) return;
    if (!s.repeats) s.repeats = getRepeats(s).filter(() => true); // migriere ggf. altes Format
    delete s.repeat;
    s.repeats.push({ id: uid(), name: "", duration: 5, count: 4, type: "aktiv", notes: "", position: "interleave" });
  });
  const rmRepeat = (stepId, repId) => up(r => {
    const s = r.steps.find(x => x.id === stepId);
    if (!s) return;
    if (s.repeats) s.repeats = s.repeats.filter(rep => rep.id !== repId);
    if (s.repeat?.id === repId) delete s.repeat;
  });
  const setRepeat = (stepId, repId, field, val) => up(r => {
    const s = r.steps.find(x => x.id === stepId);
    if (!s) return;
    // Altes Format ggf. migrieren
    if (!s.repeats && s.repeat) { s.repeats = [s.repeat]; delete s.repeat; }
    const rep = s.repeats?.find(x => x.id === repId);
    if (!rep) return;
    rep[field] = ["count", "duration"].includes(field) ? (Number(val) || 1) : val;
    if (field === "position" && val === "prefix") rep.count = 1;
  });

  const resetJForm = () => { setJText(""); setJRatings(EMPTY_RATINGS); setEditingJId(null); };

  const addJ = () => {
    if (!jText.trim()) return;
    if (editingJId) {
      up(r => {
        const j = r.journal.find(x => x.id === editingJId);
        if (j) { j.text = jText; j.ratings = { ...jRatings }; delete j.rating; }
      });
    } else {
      up(r => r.journal.push({ id: uid(), text: jText, ratings: { ...jRatings }, date: Date.now() }));
    }
    resetJForm();
  };

  const editJ = (j) => {
    setEditingJId(j.id);
    setJText(j.text);
    setJRatings(j.ratings ? { ...EMPTY_RATINGS(), ...j.ratings } : EMPTY_RATINGS());
    setSec("tagebuch");
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
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <label style={{ color: "var(--muted)", width: 42, paddingTop: 4 }}>Typ</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 40 }}>▶ aktiv</span>
                      {[["aktiv", "🤲 aktiv"], ["backen", "🔥 backen"]].map(([t, label]) => (
                        <button key={t} onClick={() => setStep(st.id, "type", t)}
                          style={{ ...S.scBtn, ...(st.type === t ? S.scBtnAct : {}), fontSize: 11, padding: "3px 8px" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 40 }}>⏸ passiv</span>
                      {[["fermentation", "🫧 Gare"], ["ruhe", "😴 Ruhe"], ["kühlen", "❄️ Kühlen"]].map(([t, label]) => (
                        <button key={t} onClick={() => setStep(st.id, "type", t)}
                          style={{ ...S.scBtn, ...(st.type === t ? S.scBtnAct : {}), fontSize: 11, padding: "3px 8px" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ color: "var(--muted)", width: 42 }}>
                    {getRepeats(st).length > 0 ? "Passiv" : "Dauer"}
                  </label>
                  <input type="number" value={st.duration || ""} onChange={e => setStep(st.id, "duration", e.target.value)} style={{ ...S.numSm, width: 56 }} />
                  <span style={{ color: "var(--muted)" }}>Min{!getRepeats(st).length && ` · ${fmtDur(st.duration || 0)}`}</span>
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

                {/* ── Sub-Schritte ── */}
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {getRepeats(st).map((rep, repIdx) => (
                    <div key={rep.id} style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Sub-Schritt {repIdx + 1}</span>
                        <button onClick={() => rmRepeat(st.id, rep.id)} style={{ ...S.mini, color: "var(--danger)", fontSize: 11 }}>
                          Entfernen
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        {[["prefix", "▶ Vorab"], ["interleave", "🔄 Verteilt"]].map(([val, label]) => (
                          <button key={val}
                            onClick={() => setRepeat(st.id, rep.id, "position", val)}
                            style={{ ...S.scBtn, ...((rep.position || "interleave") === val ? S.scBtnAct : {}), fontSize: 11, padding: "3px 8px" }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        {[["aktiv", "▶ aktiv"], ["passiv", "⏸ passiv"]].map(([mode, label]) => {
                          const repIsPassive = ["fermentation", "ruhe", "kühlen"].includes(rep.type || "aktiv");
                          const isSelected = mode === "passiv" ? repIsPassive : !repIsPassive;
                          return (
                            <button key={mode}
                              onClick={() => setRepeat(st.id, rep.id, "type", mode === "passiv" ? "ruhe" : "aktiv")}
                              style={{ ...S.scBtn, ...(isSelected ? S.scBtnAct : {}), fontSize: 11, padding: "3px 8px" }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={rep.name}
                        onChange={e => setRepeat(st.id, rep.id, "name", e.target.value)}
                        placeholder="Name (z.B. Vorheizen)"
                        style={S.inIn}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                        {(rep.position || "interleave") === "interleave" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ color: "var(--muted)", fontSize: 11 }}>Anzahl</label>
                            <input
                              type="number" min={1} value={rep.count || ""}
                              onChange={e => setRepeat(st.id, rep.id, "count", e.target.value)}
                              style={{ ...S.numSm, width: 46 }}
                            />
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>×</span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number" min={1} value={rep.duration || ""}
                            onChange={e => setRepeat(st.id, rep.id, "duration", e.target.value)}
                            style={{ ...S.numSm, width: 46 }}
                          />
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>Min</span>
                        </div>
                      </div>
                      {rep.duration > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", background: "var(--surface)", borderRadius: 6, padding: "5px 8px", lineHeight: 1.4 }}>
                          {(rep.position || "interleave") === "prefix"
                            ? `▶ ${rep.duration} Min aktiv → ${st.duration} Min passiv`
                            : `🔄 ${rep.count}× ${rep.duration} Min verteilt · Pause ${Math.floor(st.duration / (rep.count + 1))} Min`
                          }
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addRepeat(st.id)} style={S.addSm}>
                    {ICO.plus(13)} Sub-Schritt hinzufügen
                  </button>
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
            {/* Durchschnitt */}
            {(() => {
              const vals = Object.values(jRatings).filter(v => v > 0);
              const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
              const stars = Math.round(avg);
              return (
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <span style={{ color: "var(--accent)", fontSize: 22 }}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
                  {avg > 0 && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>∅ {avg.toFixed(1)}</span>}
                </div>
              );
            })()}
            {/* Kategorie-Bewertungen */}
            {RATING_CATS.map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                <span style={{ width: 90, fontSize: 12, color: "var(--muted)" }}>{label}</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n}
                    onClick={() => setJRatings(p => ({ ...p, [key]: n === p[key] ? 0 : n }))}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 19, padding: 0, lineHeight: 1 }}>
                    {n <= jRatings[key] ? "★" : "☆"}
                  </button>
                ))}
              </div>
            ))}
            <textarea value={jText} onChange={e => setJText(e.target.value)} placeholder="Notizen zum Ergebnis…" style={{ ...S.ta, marginTop: 8 }} rows={3} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={addJ} style={S.pri}>{editingJId ? "Änderungen speichern" : "Eintrag speichern"}</button>
              {editingJId && <button onClick={resetJForm} style={S.sec}>Abbrechen</button>}
            </div>
          </div>
          {r.journal.slice().reverse().map(j => {
            const avg = calcEntryRating(j);
            const rats = j.ratings || {};
            return (
              <div key={j.id} style={{ ...S.card, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "var(--accent)", fontSize: 16 }}>{"★".repeat(avg)}{"☆".repeat(5 - avg)}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {new Date(j.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                    </span>
                    <button onClick={() => editJ(j)} style={{ ...S.mini, fontSize: 13 }} title="Bearbeiten">✏️</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", marginBottom: j.text ? 8 : 0 }}>
                  {RATING_CATS.map(([key, label]) => {
                    const val = rats[key] || 0;
                    if (!val) return null;
                    return (
                      <span key={key} style={{ fontSize: 11, color: "var(--muted)" }}>
                        {label}: <span style={{ color: "var(--accent)" }}>{"★".repeat(val)}{"☆".repeat(5 - val)}</span>
                      </span>
                    );
                  })}
                </div>
                {j.text && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{j.text}</p>}
              </div>
            );
          })}
          {!r.journal.length && <p style={S.mutedTxt}>Noch keine Einträge.</p>}
        </div>
      )}
    </div>
  );
};
