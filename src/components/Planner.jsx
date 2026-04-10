import { useState, useEffect, useCallback, useMemo } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { TimeBlocker, createDefaultBlocks } from "./TimeBlocker.jsx";
import { totalDur } from "../utils/calculations.js";
import { fmtDur, fmtDT, fmtTime } from "../utils/formatters.js";
import { scheduleSteps } from "../utils/scheduler.js";
import { stepTypes } from "../constants.js";
import { exportPlanPDF } from "../utils/pdf.js";

export const Planner = ({ recipes, onBake }) => {
  const [selId, setSelId] = useState(null);
  const [tDate, setTDate] = useState("");
  const [tTime, setTTime] = useState("08:00");
  const [blocked, setBlocked] = useState(new Set());
  const [sched, setSched] = useState(null);
  const [blocksInit, setBlocksInit] = useState(false);

  const recipe = recipes.find(r => r.id === selId);

  const days = useMemo(() => {
    if (!recipe || !tDate) return [];
    const need = Math.max(3, Math.ceil(totalDur(recipe.steps) / 1440) + 2);
    const t = new Date(`${tDate}T${tTime}`);
    return Array.from({ length: need }, (_, i) => {
      const d = new Date(t);
      d.setDate(d.getDate() - (need - 1 - i));
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });
  }, [recipe, tDate, tTime]);

  const daysKey = days.join(",");
  useEffect(() => {
    if (days.length > 0) {
      setBlocked(createDefaultBlocks(days));
      setBlocksInit(true);
      setSched(null);
    }
  }, [daysKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((ts, mode) => {
    setBlocked(p => { const n = new Set(p); mode === "block" ? n.add(ts) : n.delete(ts); return n; });
    setSched(null);
  }, []);

  const calc = () => {
    if (!recipe || !tDate) return;
    setSched(scheduleSteps(recipe.steps, new Date(`${tDate}T${tTime}`).getTime(), blocked));
  };

  return (
    <div style={S.page}>
      <h1 style={S.title}>Backplan</h1>
      <div style={S.row}>
        <label style={S.lbl}>Rezept</label>
        <select
          value={selId || ""}
          onChange={e => { setSelId(e.target.value); setSched(null); setBlocksInit(false); }}
          style={S.sel}
        >
          <option value="">— wählen —</option>
          {recipes.map(r => <option key={r.id} value={r.id}>{r.name || "Unbenannt"}</option>)}
        </select>
      </div>
      {recipe && (
        <>
          <div style={S.card}>
            <h3 style={S.cardT}>{ICO.clock(16)} Zielzeitpunkt</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
              Wann soll dein {recipe.category} fertig sein?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date" value={tDate}
                onChange={e => { setTDate(e.target.value); setSched(null); setBlocksInit(false); }}
                style={S.dateIn}
              />
              <input
                type="time" value={tTime}
                onChange={e => { setTTime(e.target.value); setSched(null); }}
                style={S.timeIn}
              />
            </div>
          </div>
          {tDate && days.length > 0 && blocksInit && (
            <div style={S.card}>
              <h3 style={S.cardT}>🚫 Verfügbarkeit</h3>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 2px" }}>
                22–09 Uhr ist vorbelegt. Passe an, wann du Zeit hast.
              </p>
              <TimeBlocker days={days} blockedSlots={blocked} onToggle={toggle} />
            </div>
          )}
          {tDate && <button onClick={calc} style={S.pri}>{ICO.cal(18)} Zeitplan berechnen</button>}
          {sched && (
            <div style={{ ...S.card, marginTop: 10 }}>
              <h3 style={S.cardT}>Dein Backplan</h3>
              <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600, padding: "6px 0 10px", borderLeft: "2px solid var(--accent)", paddingLeft: 14, marginLeft: 7 }}>
                Start: {fmtDT(sched[0]?.scheduledStart)}
              </div>
              {sched.map(s => {
                const passive = ["fermentation", "ruhe", "kühlen"].includes(s.type);
                return (
                  <div key={s.id} style={{ position: "relative", paddingLeft: 24, paddingBottom: 12, marginLeft: 7, borderLeft: `2px solid ${passive ? "var(--border)" : "var(--accent)"}` }}>
                    <div style={{ position: "absolute", left: -5, top: 4, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                    <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {fmtDT(s.scheduledStart)} — {fmtTime(s.scheduledEnd)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{stepTypes[s.type]} {s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {fmtDur(s.duration)}{s.tempMin != null && ` · ${s.tempMin}–${s.tempMax}°C`}{passive && " · passiv"}
                    </div>
                    {s.notes && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 1 }}>{s.notes}</div>}
                  </div>
                );
              })}
              <div style={{ fontSize: 14, color: "var(--success)", fontWeight: 600, paddingLeft: 14, marginLeft: 7, paddingTop: 2 }}>
                Fertig: {fmtDT(sched[sched.length - 1]?.scheduledEnd)}
              </div>
              <button onClick={() => onBake(recipe, sched)} style={{ ...S.pri, marginTop: 10 }}>
                {ICO.play(18)} Backprozess starten
              </button>
              <button onClick={() => exportPlanPDF(recipe, sched)} style={{ ...S.sec, marginTop: 8 }}>
                📄 Als PDF exportieren
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
