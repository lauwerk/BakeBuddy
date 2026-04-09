import { useState, useEffect } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { stepTypes } from "../constants.js";
import { fmtDur } from "../utils/formatters.js";

export const BakeSession = ({ recipe, schedule, onDone }) => {
  const [cur, setCur] = useState(0);
  const [timerEnd, setTimerEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(new Set());

  // Only tick every second when a timer is actively running — saves battery
  useEffect(() => {
    if (!timerEnd) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timerEnd]);

  const step = schedule[cur];
  const rem = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : null;

  const complete = () => {
    setDone(p => new Set([...p, cur]));
    setTimerEnd(null);
    if (cur < schedule.length - 1) setCur(cur + 1);
  };

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onDone} style={S.iconBtn}>{ICO.back(24)}</button>
        <h2 style={{ ...S.title, fontSize: 18 }}>{recipe.name}</h2>
      </div>
      <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, width: `${(done.size / schedule.length) * 100}%`, transition: "width 0.3s" }} />
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 10 }}>
        {done.size}/{schedule.length}
      </p>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
        {schedule.map((s, i) => (
          <button
            key={s.id}
            onClick={() => { setCur(i); setTimerEnd(null); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 10, fontWeight: 700, border: "none",
              cursor: "pointer", flexShrink: 0,
              background: done.has(i) ? "var(--success)" : i === cur ? "var(--accent)" : "var(--surface)",
              color: done.has(i) || i === cur ? "#fff" : "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {done.has(i) ? "✓" : i + 1}
          </button>
        ))}
      </div>
      {step && (
        <div style={S.card}>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6, textAlign: "center" }}>
            {stepTypes[step.type]} {step.type}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>{step.name}</h2>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            <span>⏱ {fmtDur(step.duration)}</span>
            {step.tempMin != null && <span>🌡 {step.tempMin}–{step.tempMax}°C</span>}
          </div>
          {step.notes && (
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", fontStyle: "italic", margin: "0 0 14px" }}>{step.notes}</p>
          )}
          {timerEnd && rem > 0 ? (
            <div style={{ padding: 20, background: "var(--accentDim)", borderRadius: 14, marginBottom: 14, textAlign: "center" }}>
              <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                {String(Math.floor(rem / 60)).padStart(2, "0")}:{String(rem % 60).padStart(2, "0")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>verbleibend</div>
            </div>
          ) : timerEnd && rem === 0 ? (
            <div style={{ padding: 20, background: "var(--success)", borderRadius: 14, marginBottom: 14, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>✓ Fertig!</div>
            </div>
          ) : (
            <button
              onClick={() => setTimerEnd(Date.now() + step.duration * 60000)}
              style={{ ...S.pri, background: "var(--accentDim)", color: "var(--accent)", border: "2px solid var(--accent)", marginBottom: 10 }}
            >
              {ICO.play(18)} Timer starten
            </button>
          )}
          <button onClick={complete} style={S.pri}>
            {cur < schedule.length - 1 ? "Weiter →" : "Abschließen"}
          </button>
        </div>
      )}
    </div>
  );
};
