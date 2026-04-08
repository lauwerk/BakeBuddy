import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const STORAGE_KEY = "bakebuddy-data";
const categories = ["Brot", "Brötchen", "Gebäck", "Pizza", "Kuchen", "Sonstiges"];
const stepTypes = { fermentation: "🫧", aktiv: "🤲", ruhe: "😴", backen: "🔥", kühlen: "❄️" };
const ingredientTypeOrder = ["mehl", "wasser", "starter", "hefe", "salz", "fett", "zucker", "sonstiges"];
const typeLabels = { mehl: "🌾 Mehle", wasser: "💧 Flüssigkeiten", starter: "🫧 Sauerteig", hefe: "🍞 Hefe", salz: "🧂 Salz", fett: "🧈 Fette", zucker: "🍯 Süße", sonstiges: "📦 Sonstiges" };

// ─── Helpers ────────────────────────────────────────────────────
const fmtDur = (min) => { if (min < 60) return `${min} Min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h}h`; };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (ts) => new Date(ts).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
const fmtDT = (ts) => `${fmtDate(ts)}, ${fmtTime(ts)}`;
const totalDur = (steps) => steps.reduce((s, st) => s + st.duration, 0);
const uid = () => crypto.randomUUID();

// Baker's % math:
// - Flour entries: weight in grams. Sum of all flour = 100% base.
// - Everything else: percent relative to total flour weight → grams calculated.
const getTotalFlour = (ings) => ings.filter(i => i.type === "mehl").reduce((s, i) => s + (i.grams || 0), 0);

const calcGrams = (ing, totalFlour) => {
  if (ing.type === "mehl") return ing.grams || 0;
  return totalFlour > 0 ? Math.round(((ing.percent || 0) / 100) * totalFlour * 10) / 10 : 0;
};

const calcHydration = (ings) => {
  const totalFlour = getTotalFlour(ings);
  if (totalFlour === 0) return 0;
  let water = 0;
  ings.forEach(i => {
    if (i.type === "wasser") water += calcGrams(i, totalFlour);
    if (i.type === "starter") {
      const g = calcGrams(i, totalFlour);
      const h = (i.hydration || 100) / 100;
      water += g * h / (1 + h); // water portion of starter
    }
  });
  // Also account for flour in starter for true hydration
  let effectiveFlour = totalFlour;
  ings.filter(i => i.type === "starter").forEach(i => {
    const g = calcGrams(i, totalFlour);
    const h = (i.hydration || 100) / 100;
    effectiveFlour += g / (1 + h); // flour portion of starter
  });
  return effectiveFlour > 0 ? Math.round((water / effectiveFlour) * 100) : 0;
};

const calcTotalWeight = (ings) => {
  const tf = getTotalFlour(ings);
  return ings.reduce((s, i) => s + calcGrams(i, tf), 0);
};

const defaultRecipe = () => ({
  id: uid(), name: "", category: "Brot",
  ingredients: [
    { id: uid(), name: "Weizenmehl 550", grams: 400, type: "mehl" },
    { id: uid(), name: "Roggenmehl 1150", grams: 100, type: "mehl" },
    { id: uid(), name: "Wasser", percent: 68, type: "wasser" },
    { id: uid(), name: "Sauerteig Starter", percent: 20, type: "starter", hydration: 100 },
    { id: uid(), name: "Salz", percent: 2, type: "salz" },
  ],
  steps: [
    { id: uid(), name: "Starter füttern", duration: 480, tempMin: 24, tempMax: 28, type: "fermentation", notes: "Starter 1:1:1 auffrischen" },
    { id: uid(), name: "Autolyse", duration: 60, tempMin: 22, tempMax: 26, type: "ruhe", notes: "Mehl + Wasser vermengen, abgedeckt ruhen" },
    { id: uid(), name: "Hauptteig kneten", duration: 15, tempMin: null, tempMax: null, type: "aktiv", notes: "Starter + Salz einarbeiten" },
    { id: uid(), name: "Dehnen & Falten", duration: 10, tempMin: null, tempMax: null, type: "aktiv", notes: "4x im Abstand von 30 Min" },
    { id: uid(), name: "Stockgare", duration: 300, tempMin: 22, tempMax: 28, type: "fermentation", notes: "Teig auf doppeltes Volumen", flexMin: 240, flexMax: 480 },
    { id: uid(), name: "Formen", duration: 15, tempMin: null, tempMax: null, type: "aktiv", notes: "Rundwirken, in Gärkorb" },
    { id: uid(), name: "Stückgare", duration: 720, tempMin: 4, tempMax: 6, type: "fermentation", notes: "Kühlschrank, abgedeckt", flexMin: 600, flexMax: 960 },
    { id: uid(), name: "Backen", duration: 50, tempMin: 240, tempMax: 250, type: "backen", notes: "20 Min mit Dampf, dann ohne" },
  ],
  pieces: 1, journal: [], createdAt: Date.now(), updatedAt: Date.now(),
});

// ─── Scheduler ──────────────────────────────────────────────────
const SLOT_MS = 30 * 60 * 1000;
const scheduleSteps = (steps, targetEnd, blocked) => {
  const isBlocked = (start, end) => { for (let t = start; t < end; t += SLOT_MS) if (blocked.has(Math.floor(t / SLOT_MS) * SLOT_MS)) return true; return false; };
  const result = []; let cursor = new Date(targetEnd).getTime();
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i], dur = step.duration * 60000;
    let end = cursor, start = end - dur;
    if (step.type === "aktiv" || step.type === "backen") {
      let n = 0; while (isBlocked(start, end) && n++ < 300) { end -= SLOT_MS; start = end - dur; }
    }
    result.unshift({ ...step, scheduledStart: start, scheduledEnd: end });
    cursor = start;
  }
  return result;
};

// ─── Persistence ────────────────────────────────────────────────
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { recipes: [] }; } catch { return { recipes: [] }; } };
const save = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };
const exportJSON = (d) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })); a.download = `bakebuddy-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };

// ─── GitHub Sync ────────────────────────────────────────────────
const GH_CONFIG_KEY = "bakebuddy-gh-config";
const GH_FILE = "bakebuddy-data.json";

const loadGHConfig = () => {
  try { return JSON.parse(localStorage.getItem(GH_CONFIG_KEY)) || null; } catch { return null; }
};
const saveGHConfig = (cfg) => {
  try { localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
};
const clearGHConfig = () => { try { localStorage.removeItem(GH_CONFIG_KEY); } catch {} };

const ghApi = async (cfg, method, body) => {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_FILE}`;
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 404) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  if (res.status === 404) return null;
  return res.json();
};

const ghPush = async (cfg, data) => {
  // Get current file SHA (needed for update)
  const existing = await ghApi(cfg, "GET");
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = {
    message: `sync: ${new Date().toISOString().slice(0, 16).replace("T", " ")} — ${data.recipes.length} Rezepte`,
    content,
    ...(existing?.sha ? { sha: existing.sha } : {}),
  };
  return ghApi(cfg, "PUT", body);
};

const ghPull = async (cfg) => {
  const res = await ghApi(cfg, "GET");
  if (!res?.content) return null;
  const decoded = decodeURIComponent(escape(atob(res.content.replace(/\n/g, ""))));
  return JSON.parse(decoded);
};

const ghTest = async (cfg) => {
  // First try: list repo (needs metadata:read, which fine-grained tokens may not have)
  // Fallback: try contents API directly (only needs contents:read)
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  
  // Try accessing the contents endpoint — this only needs Contents permission
  const contentsUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/`;
  const res = await fetch(contentsUrl, { headers });
  
  if (res.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");
  if (res.status === 403) throw new Error("Keine Berechtigung — setze Contents auf Read & Write");
  if (res.status === 404) {
    // Could be: repo doesn't exist, or token has no access to it
    // Try a simpler endpoint to distinguish
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (userRes.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");
    // Token works but repo not accessible
    throw new Error(`Repo ${cfg.owner}/${cfg.repo} nicht gefunden oder kein Zugriff. Prüfe Repository Access im Token.`);
  }
  if (!res.ok) throw new Error(`GitHub API Fehler ${res.status}`);
  
  return true;
};

// ─── Icons ──────────────────────────────────────────────────────
const Ic = ({ d, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICO = {
  plus: s => <Ic s={s} d="M12 5v14M5 12h14" />,
  back: s => <Ic s={s} d="M15 18l-6-6 6-6" />,
  x: s => <Ic s={s} d="M18 6L6 18M6 6l12 12" />,
  save: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
  play: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  copy: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>,
  dl: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  ul: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  trash: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  clock: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  cal: s => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
};

// ─── Tab Bar ────────────────────────────────────────────────────
const TabBar = ({ active, onChange }) => (
  <div style={S.tabBar}>
    {[["recipes", "Rezepte", "🍞"], ["planner", "Planer", "📅"], ["settings", "Daten", "💾"]].map(([id, l, ic]) => (
      <button key={id} onClick={() => onChange(id)} style={{ ...S.tab, ...(active === id ? S.tabAct : {}) }}>
        <span style={{ fontSize: 20 }}>{ic}</span><span style={{ fontSize: 10 }}>{l}</span>
      </button>
    ))}
  </div>
);

// ─── TIME BLOCKER (24h, default 22–09 blocked, touch toggle) ───
const TimeBlocker = ({ days, blockedSlots, onToggle }) => {
  const ref = useRef(null);
  const dragging = useRef(false);
  const mode = useRef(null);
  const last = useRef(null);

  const slotsPerDay = 48; // 24h * 2

  const getSlotTs = (dayIdx, slotIdx) => {
    const d = new Date(days[dayIdx]);
    d.setHours(Math.floor(slotIdx / 2), (slotIdx % 2) * 30, 0, 0);
    return d.getTime();
  };

  const getSlotFromEvent = (e, dayIdx) => {
    const touch = e.touches ? e.touches[0] : e;
    const col = ref.current?.querySelectorAll("[data-dc]")[dayIdx];
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const y = touch.clientY - rect.top;
    const idx = Math.floor(y / (rect.height / slotsPerDay));
    if (idx < 0 || idx >= slotsPerDay) return null;
    return getSlotTs(dayIdx, idx);
  };

  const down = (ts) => {
    dragging.current = true;
    mode.current = blockedSlots.has(ts) ? "unblock" : "block";
    last.current = ts;
    onToggle(ts, mode.current);
  };

  const move = (e, di) => {
    if (!dragging.current) return;
    e.preventDefault();
    const ts = getSlotFromEvent(e, di);
    if (ts != null && ts !== last.current) { last.current = ts; onToggle(ts, mode.current); }
  };

  const up = () => { dragging.current = false; };

  useEffect(() => {
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, []);

  const labels = days.map(d => { const dd = new Date(d); return { wd: dd.toLocaleDateString("de-DE", { weekday: "short" }), day: dd.getDate() }; });

  // Show hour labels for every 2 hours
  const hourLabels = Array.from({ length: 12 }, (_, i) => i * 2);

  return (
    <div style={{ marginTop: 8, userSelect: "none", WebkitUserSelect: "none" }}>
      {/* Day headers */}
      <div style={{ display: "flex", fontSize: 10, color: "var(--muted)", marginBottom: 2, paddingLeft: 26 }}>
        {labels.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontWeight: 600 }}>
            <div>{d.wd}</div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>{d.day}</div>
          </div>
        ))}
      </div>
      <div ref={ref} style={{ display: "flex" }}>
        {/* Hour labels */}
        <div style={{ width: 26, flexShrink: 0 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: 16, fontSize: 9, color: h % 2 === 0 ? "var(--muted)" : "transparent", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 4, fontFamily: "var(--font-mono)" }}>
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((day, di) => (
          <div key={di} data-dc style={{ flex: 1, borderLeft: "1px solid var(--border)" }}
            onMouseMove={e => move(e, di)} onTouchMove={e => move(e, di)}>
            {Array.from({ length: slotsPerDay }, (_, si) => {
              const ts = getSlotTs(di, si);
              const blocked = blockedSlots.has(ts);
              const isHour = si % 2 === 0;
              return (
                <div key={si}
                  onMouseDown={() => down(ts)}
                  onTouchStart={e => { e.preventDefault(); down(ts); }}
                  style={{
                    height: 8,
                    background: blocked ? "rgba(196,91,74,0.55)" : "transparent",
                    borderTop: isHour ? "1px solid rgba(255,255,255,0.06)" : "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(196,91,74,0.55)", display: "inline-block" }} /> Nicht verfügbar
        </span>
        <span>Wische zum Markieren / Entfernen</span>
      </div>
    </div>
  );
};

// Helper to create default blocked slots (22:00–09:00 for each day)
const createDefaultBlocks = (days) => {
  const set = new Set();
  days.forEach(dayTs => {
    const d = new Date(dayTs);
    // 00:00–08:59 (slots 0–17)
    for (let si = 0; si < 18; si++) {
      const dd = new Date(d); dd.setHours(Math.floor(si / 2), (si % 2) * 30, 0, 0);
      set.add(dd.getTime());
    }
    // 22:00–23:59 (slots 44–47)
    for (let si = 44; si < 48; si++) {
      const dd = new Date(d); dd.setHours(Math.floor(si / 2), (si % 2) * 30, 0, 0);
      set.add(dd.getTime());
    }
  });
  return set;
};

// ─── Recipe List ────────────────────────────────────────────────
const RecipeList = ({ recipes, onSelect, onCreate }) => (
  <div style={S.page}>
    <div style={S.hdr}><h1 style={S.title}>Meine Rezepte</h1><button onClick={onCreate} style={S.iconBtn}>{ICO.plus(24)}</button></div>
    {recipes.length === 0 && (
      <div style={S.empty}><div style={{ fontSize: 56, marginBottom: 12 }}>🍞</div><p style={S.mutedTxt}>Noch keine Rezepte.</p><button onClick={onCreate} style={S.pri}>Erstes Rezept erstellen</button></div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {recipes.map(r => {
        const tf = getTotalFlour(r.ingredients);
        return (
          <button key={r.id} onClick={() => onSelect(r.id)} style={S.rCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>{r.category === "Brot" ? "🍞" : r.category === "Brötchen" ? "🥖" : r.category === "Pizza" ? "🍕" : "🥐"}</span>
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

// ─── Recipe Editor ──────────────────────────────────────────────
const RecipeEditor = ({ recipe, onSave, onDelete, onBack, onDuplicate, onPlan }) => {
  const [r, setR] = useState(JSON.parse(JSON.stringify(recipe)));
  const [sec, setSec] = useState("info");
  const [scale, setScale] = useState(1);
  const [jText, setJText] = useState("");
  const [jRate, setJRate] = useState(0);

  const up = (fn) => setR(p => { const n = JSON.parse(JSON.stringify(p)); fn(n); n.updatedAt = Date.now(); return n; });

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
    const g = {}; ingredientTypeOrder.forEach(t => g[t] = []);
    r.ingredients.forEach(i => { if (g[i.type]) g[i.type].push(i); else g.sonstiges.push(i); });
    return g;
  }, [r.ingredients]);

  const addIng = (type) => up(r => r.ingredients.push({ id: uid(), name: "", type, ...(type === "mehl" ? { grams: 0 } : { percent: 2 }), ...(type === "starter" ? { hydration: 100 } : {}) }));
  const rmIng = (id) => up(r => r.ingredients = r.ingredients.filter(i => i.id !== id));
  const setIng = (id, field, val) => up(r => { const i = r.ingredients.find(x => x.id === id); if (i) i[field] = val; });

  const addStep = () => up(r => r.steps.push({ id: uid(), name: "", duration: 30, tempMin: null, tempMax: null, type: "aktiv", notes: "" }));
  const rmStep = (id) => up(r => r.steps = r.steps.filter(s => s.id !== id));
  const setStep = (id, f, v) => up(r => { const s = r.steps.find(x => x.id === id); if (s) s[f] = ["duration", "tempMin", "tempMax", "flexMin", "flexMax"].includes(f) ? (v === "" ? null : Number(v) || 0) : v; });
  const mvStep = (id, d) => up(r => { const i = r.steps.findIndex(s => s.id === id), ni = i + d; if (ni >= 0 && ni < r.steps.length) [r.steps[i], r.steps[ni]] = [r.steps[ni], r.steps[i]]; });

  const addJ = () => { if (!jText.trim()) return; up(r => r.journal.push({ id: uid(), text: jText, rating: jRate, date: Date.now() })); setJText(""); setJRate(0); };

  const secs = [["info", "Info"], ["zutaten", "Zutaten"], ["schritte", "Schritte"], ["tagebuch", "Tagebuch"]];

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button onClick={onBack} style={S.iconBtn}>{ICO.back(24)}</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => onDuplicate(r)} style={S.iconBtn}>{ICO.copy(18)}</button>
        <button onClick={() => onPlan(r)} style={S.iconBtn}>{ICO.play(18)}</button>
        <button onClick={() => onSave({ ...r, updatedAt: Date.now() })} style={S.saveBtn}>{ICO.save(15)} Speichern</button>
      </div>
      <div style={S.secTabs}>{secs.map(([id, l]) => <button key={id} onClick={() => setSec(id)} style={{ ...S.secTab, ...(sec === id ? S.secTabAct : {}) }}>{l}</button>)}</div>

      {/* INFO */}
      {sec === "info" && <div style={S.col}>
        <input value={r.name} onChange={e => up(r => r.name = e.target.value)} placeholder="Rezeptname" style={S.titleIn} />
        <div style={S.row}><label style={S.lbl}>Kategorie</label><select value={r.category} onChange={e => up(r => r.category = e.target.value)} style={S.sel}>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div style={S.row}><label style={S.lbl}>Stücke</label><input type="number" value={r.pieces} min={1} onChange={e => up(r => r.pieces = Number(e.target.value) || 1)} style={S.numIn} /></div>
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
      </div>}

      {/* ZUTATEN */}
      {sec === "zutaten" && <div style={S.col}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Skalierung:</span>
          {[0.5, 1, 1.5, 2, 3].map(f => <button key={f} onClick={() => setScale(f)} style={{ ...S.scBtn, ...(scale === f ? S.scBtnAct : {}) }}>{f}x</button>)}
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

              {/* Column header */}
              <div style={{ display: "flex", gap: 6, fontSize: 10, color: "var(--muted)", padding: "2px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <span style={{ flex: 1 }}>Zutat</span>
                <span style={{ width: 70, textAlign: "right" }}>{isFlour ? "Gramm" : "BP %"}</span>
                <span style={{ width: 60, textAlign: "right" }}>{isFlour ? (scale !== 1 ? "Skaliert" : "") : "Gramm"}</span>
                <span style={{ width: 20 }} />
              </div>

              {items.map(ing => {
                const grams = isFlour ? (ing.grams || 0) : calcGrams(ing, totalFlour);
                const scaledG = isFlour ? Math.round((ing.grams || 0) * scale * 10) / 10 : Math.round(grams * scale * 10) / 10;
                return (
                  <div key={ing.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input value={ing.name} onChange={e => setIng(ing.id, "name", e.target.value)} placeholder="Name" style={S.inIn} />
                      {ing.type === "starter" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 11 }}>
                          <span style={{ color: "var(--muted)" }}>Hydration:</span>
                          <input type="number" value={ing.hydration || 100} onChange={e => setIng(ing.id, "hydration", Number(e.target.value) || 100)} style={{ ...S.numSm, width: 44 }} />
                          <span style={{ color: "var(--muted)" }}>%</span>
                        </div>
                      )}
                    </div>
                    {/* Main input: grams for flour, percent for others */}
                    <div style={{ width: 70, textAlign: "right" }}>
                      {isFlour ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                          <input type="number" value={ing.grams || ""} onChange={e => setIng(ing.id, "grams", Number(e.target.value) || 0)}
                            style={{ ...S.numSm, width: 56, fontWeight: 700 }} />
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>g</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                          <input type="number" value={ing.percent ?? ""} onChange={e => setIng(ing.id, "percent", Number(e.target.value) || 0)}
                            style={{ ...S.numSm, width: 50, fontWeight: 700, color: "var(--accent)" }} />
                          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>%</span>
                        </div>
                      )}
                    </div>
                    {/* Calculated result */}
                    <div style={{ width: 60, textAlign: "right", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                      {isFlour ? (scale !== 1 ? `${scaledG}g` : "") : `${scaledG}g`}
                    </div>
                    <button onClick={() => rmIng(ing.id)} style={S.mini}>{ICO.x(13)}</button>
                  </div>
                );
              })}
              <button onClick={() => addIng(type)} style={S.addSm}>{ICO.plus(13)} {isFlour ? "Mehlsorte" : "hinzufügen"}</button>
            </div>
          );
        })}

        {/* Add types that have no entries yet */}
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
      </div>}

      {/* SCHRITTE */}
      {sec === "schritte" && <div style={S.col}>
        {r.steps.map((st, idx) => (
          <div key={st.id} style={S.stepCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={S.stepN}>{idx + 1}</span>
              <span style={{ fontSize: 16 }}>{stepTypes[st.type] || "📋"}</span>
              <input value={st.name} onChange={e => setStep(st.id, "name", e.target.value)} placeholder="Schrittname" style={{ ...S.inIn, flex: 1, fontWeight: 600 }} />
              <button onClick={() => rmStep(st.id)} style={S.mini}>{ICO.x(13)}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 28, fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ color: "var(--muted)", width: 42 }}>Typ</label>
                <select value={st.type} onChange={e => setStep(st.id, "type", e.target.value)} style={S.inSel}>{Object.keys(stepTypes).map(t => <option key={t} value={t}>{stepTypes[t]} {t}</option>)}</select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ color: "var(--muted)", width: 42 }}>Dauer</label>
                <input type="number" value={st.duration || ""} onChange={e => setStep(st.id, "duration", e.target.value)} style={{ ...S.numSm, width: 56 }} />
                <span style={{ color: "var(--muted)" }}>Min · {fmtDur(st.duration || 0)}</span>
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
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => mvStep(st.id, -1)} disabled={idx === 0} style={S.mini}>↑</button>
              <button onClick={() => mvStep(st.id, 1)} disabled={idx === r.steps.length - 1} style={S.mini}>↓</button>
            </div>
          </div>
        ))}
        <button onClick={addStep} style={S.addBtn}>{ICO.plus(16)} Schritt hinzufügen</button>
      </div>}

      {/* TAGEBUCH */}
      {sec === "tagebuch" && <div style={S.col}>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setJRate(n)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 22 }}>{n <= jRate ? "★" : "☆"}</button>)}
          </div>
          <textarea value={jText} onChange={e => setJText(e.target.value)} placeholder="Wie war das Ergebnis?" style={S.ta} rows={3} />
          <button onClick={addJ} style={S.pri}>Eintrag speichern</button>
        </div>
        {r.journal.slice().reverse().map(j => (
          <div key={j.id} style={{ ...S.card, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "var(--accent)" }}>{"★".repeat(j.rating)}{"☆".repeat(5 - j.rating)}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDT(j.date)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{j.text}</p>
          </div>
        ))}
        {!r.journal.length && <p style={S.mutedTxt}>Noch keine Einträge.</p>}
      </div>}
    </div>
  );
};

// ─── Planner ────────────────────────────────────────────────────
const Planner = ({ recipes, onBake }) => {
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
    return Array.from({ length: need }, (_, i) => { const d = new Date(t); d.setDate(d.getDate() - (need - 1 - i)); d.setHours(0, 0, 0, 0); return d.getTime(); });
  }, [recipe, tDate, tTime]);

  // Set default blocks when days change
  useEffect(() => {
    if (days.length > 0) {
      setBlocked(createDefaultBlocks(days));
      setBlocksInit(true);
      setSched(null);
    }
  }, [days.join(",")]);

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
        <select value={selId || ""} onChange={e => { setSelId(e.target.value); setSched(null); setBlocksInit(false); }} style={S.sel}>
          <option value="">— wählen —</option>
          {recipes.map(r => <option key={r.id} value={r.id}>{r.name || "Unbenannt"}</option>)}
        </select>
      </div>
      {recipe && <>
        <div style={S.card}>
          <h3 style={S.cardT}>{ICO.clock(16)} Zielzeitpunkt</h3>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>Wann soll dein {recipe.category} fertig sein?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={tDate} onChange={e => { setTDate(e.target.value); setSched(null); setBlocksInit(false); }} style={S.dateIn} />
            <input type="time" value={tTime} onChange={e => { setTTime(e.target.value); setSched(null); }} style={S.timeIn} />
          </div>
        </div>
        {tDate && days.length > 0 && blocksInit && (
          <div style={S.card}>
            <h3 style={S.cardT}>🚫 Verfügbarkeit</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 2px" }}>22–09 Uhr ist vorbelegt. Passe an, wann du Zeit hast.</p>
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
                  <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{fmtDT(s.scheduledStart)} — {fmtTime(s.scheduledEnd)}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{stepTypes[s.type]} {s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDur(s.duration)}{s.tempMin != null && ` · ${s.tempMin}–${s.tempMax}°C`}{passive && " · passiv"}</div>
                  {s.notes && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 1 }}>{s.notes}</div>}
                </div>
              );
            })}
            <div style={{ fontSize: 14, color: "var(--success)", fontWeight: 600, paddingLeft: 14, marginLeft: 7, paddingTop: 2 }}>Fertig: {fmtDT(sched[sched.length - 1]?.scheduledEnd)}</div>
            <button onClick={() => onBake(recipe, sched)} style={{ ...S.pri, marginTop: 10 }}>{ICO.play(18)} Backprozess starten</button>
          </div>
        )}
      </>}
    </div>
  );
};

// ─── Bake Session ───────────────────────────────────────────────
const BakeSession = ({ recipe, schedule, onDone }) => {
  const [cur, setCur] = useState(0);
  const [timerEnd, setTimerEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(new Set());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  const step = schedule[cur], rem = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : null;
  const complete = () => { setDone(p => new Set([...p, cur])); setTimerEnd(null); if (cur < schedule.length - 1) setCur(cur + 1); };
  return (
    <div style={S.page}>
      <div style={S.hdr}><button onClick={onDone} style={S.iconBtn}>{ICO.back(24)}</button><h2 style={{ ...S.title, fontSize: 18 }}>{recipe.name}</h2></div>
      <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}><div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, width: `${(done.size / schedule.length) * 100}%`, transition: "width 0.3s" }} /></div>
      <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 10 }}>{done.size}/{schedule.length}</p>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
        {schedule.map((s, i) => <button key={s.id} onClick={() => { setCur(i); setTimerEnd(null); }} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0, background: done.has(i) ? "var(--success)" : i === cur ? "var(--accent)" : "var(--surface)", color: done.has(i) || i === cur ? "#fff" : "var(--muted)", fontFamily: "var(--font-mono)" }}>{done.has(i) ? "✓" : i + 1}</button>)}
      </div>
      {step && <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6, textAlign: "center" }}>{stepTypes[step.type]} {step.type}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>{step.name}</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
          <span>⏱ {fmtDur(step.duration)}</span>
          {step.tempMin != null && <span>🌡 {step.tempMin}–{step.tempMax}°C</span>}
        </div>
        {step.notes && <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", fontStyle: "italic", margin: "0 0 14px" }}>{step.notes}</p>}
        {timerEnd && rem > 0 ? (
          <div style={{ padding: 20, background: "var(--accentDim)", borderRadius: 14, marginBottom: 14, textAlign: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{String(Math.floor(rem / 60)).padStart(2, "0")}:{String(rem % 60).padStart(2, "0")}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>verbleibend</div>
          </div>
        ) : timerEnd && rem === 0 ? (
          <div style={{ padding: 20, background: "var(--success)", borderRadius: 14, marginBottom: 14, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>✓ Fertig!</div></div>
        ) : (
          <button onClick={() => setTimerEnd(Date.now() + step.duration * 60000)} style={{ ...S.pri, background: "var(--accentDim)", color: "var(--accent)", border: "2px solid var(--accent)", marginBottom: 10 }}>{ICO.play(18)} Timer starten</button>
        )}
        <button onClick={complete} style={S.pri}>{cur < schedule.length - 1 ? "Weiter →" : "Abschließen"}</button>
      </div>}
    </div>
  );
};

// ─── Settings ───────────────────────────────────────────────────
const Settings = ({ data, onImport, onExport, onGHSync }) => {
  const ref = useRef(null);
  const [ghCfg, setGhCfg] = useState(loadGHConfig);
  const [tokenInput, setTokenInput] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "success" | "error" | "pulling"
  const [syncMsg, setSyncMsg] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);

  const configureGH = async () => {
    if (!tokenInput.trim()) return;
    // Strip any whitespace, newlines, quotes (common copy-paste artifacts on mobile)
    const cleanToken = tokenInput.replace(/[\s"']/g, "");
    const cfg = { owner: "lauwerk", repo: "BakeBuddy-Data", token: cleanToken };
    setTesting(true);
    setSyncMsg("");
    try {
      await ghTest(cfg);
      saveGHConfig(cfg);
      setGhCfg(cfg);
      setTokenInput("");
      setSyncMsg("Verbindung erfolgreich!");
      setSyncStatus("success");
    } catch (e) {
      setSyncMsg(e.message);
      setSyncStatus("error");
    }
    setTesting(false);
  };

  const disconnectGH = () => {
    clearGHConfig();
    setGhCfg(null);
    setSyncStatus(null);
    setSyncMsg("");
  };

  const pushToGH = async () => {
    if (!ghCfg) return;
    setSyncStatus("syncing");
    setSyncMsg("Sende an GitHub...");
    try {
      await ghPush(ghCfg, data);
      setSyncStatus("success");
      setSyncMsg(`Sync erfolgreich — ${new Date().toLocaleTimeString("de-DE")}`);
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg(`Fehler beim Sync: ${e.message}`);
    }
  };

  const pullFromGH = async () => {
    if (!ghCfg) return;
    setSyncStatus("pulling");
    setSyncMsg("Lade von GitHub...");
    try {
      const remote = await ghPull(ghCfg);
      if (remote?.recipes) {
        onImport(remote);
        setSyncStatus("success");
        setSyncMsg(`${remote.recipes.length} Rezepte geladen — ${new Date().toLocaleTimeString("de-DE")}`);
      } else {
        setSyncStatus("success");
        setSyncMsg("Keine Daten im Repo gefunden. Pushe zuerst!");
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg(`Fehler: ${e.message}`);
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.title}>Daten & Sync</h1>

      {/* GitHub Sync */}
      <div style={{ ...S.card, borderColor: ghCfg ? "var(--success)" : "var(--border)" }}>
        <h3 style={S.cardT}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          {" "}GitHub Sync
        </h3>

        {!ghCfg ? (
          <>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.4 }}>
              Verbinde mit <b style={{ color: "var(--text)" }}>lauwerk/BakeBuddy-Data</b> um deine Rezepte automatisch als JSON in ein privates Repo zu sichern. Jede Änderung wird als Commit gespeichert.
            </p>
            <div style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px", padding: "8px 10px", background: "var(--surface2)", borderRadius: 8, lineHeight: 1.5 }}>
              <b style={{ color: "var(--text)" }}>Token-Einstellungen:</b><br/>
              Repository: Only select → BakeBuddy-Data<br/>
              Permissions → <b style={{ color: "var(--accent)" }}>Contents: Read & Write</b><br/>
              <span style={{ color: "var(--muted)" }}>(Metadata: Read wird automatisch aktiviert)</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Personal Access Token (Fine-grained)</label>
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="github_pat_..."
                style={{ ...S.inIn, fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <button onClick={() => setShowToken(!showToken)} style={{ ...S.mini, fontSize: 11, marginTop: 4, color: "var(--accent)" }}>
                {showToken ? "Verbergen" : "Anzeigen"}
              </button>
            </div>
            <button onClick={configureGH} disabled={testing || !tokenInput.trim()} style={{ ...S.pri, opacity: testing ? 0.6 : 1 }}>
              {testing ? "Prüfe Verbindung..." : "Verbinden"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--text)" }}>
                Verbunden mit <b>lauwerk/BakeBuddy-Data</b>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={pushToGH} disabled={syncStatus === "syncing" || syncStatus === "pulling"}
                style={{ ...S.pri, flex: 1, fontSize: 13, padding: "11px 12px", opacity: syncStatus === "syncing" ? 0.6 : 1 }}>
                {syncStatus === "syncing" ? "⏳ Sende..." : "⬆ Push"}
              </button>
              <button onClick={pullFromGH} disabled={syncStatus === "syncing" || syncStatus === "pulling"}
                style={{ ...S.sec, flex: 1, fontSize: 13, padding: "11px 12px", marginTop: 8, opacity: syncStatus === "pulling" ? 0.6 : 1 }}>
                {syncStatus === "pulling" ? "⏳ Lade..." : "⬇ Pull"}
              </button>
            </div>
            <button onClick={disconnectGH} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)", padding: "4px 0" }}>
              Verbindung trennen
            </button>
          </>
        )}

        {syncMsg && (
          <div style={{
            marginTop: 8, padding: "8px 10px", borderRadius: 8, fontSize: 12,
            background: syncStatus === "error" ? "rgba(196,91,74,0.15)" : syncStatus === "success" ? "rgba(91,140,90,0.15)" : "var(--surface2)",
            color: syncStatus === "error" ? "var(--danger)" : syncStatus === "success" ? "var(--success)" : "var(--muted)",
          }}>
            {syncMsg}
          </div>
        )}
      </div>

      {/* Local export/import */}
      <div style={{ ...S.card, marginTop: 10 }}>
        <h3 style={S.cardT}>Lokaler Export</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>JSON-Datei herunterladen (z.B. für iCloud Drive).</p>
        <button onClick={onExport} style={S.pri}>{ICO.dl(18)} JSON exportieren</button>
      </div>
      <div style={{ ...S.card, marginTop: 10 }}>
        <h3 style={S.cardT}>Lokaler Import</h3>
        <input ref={ref} type="file" accept=".json" onChange={async e => { try { onImport(JSON.parse(await e.target.files[0].text())); } catch { alert("Ungültig"); } }} style={{ display: "none" }} />
        <button onClick={() => ref.current?.click()} style={S.sec}>{ICO.ul(18)} JSON importieren</button>
      </div>
      <div style={{ ...S.card, marginTop: 10 }}>
        <h3 style={S.cardT}>Statistik</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={S.stat}><span style={S.statV}>{data.recipes.length}</span><span style={S.statL}>Rezepte</span></div>
          <div style={S.stat}><span style={S.statV}>{data.recipes.reduce((s, r) => s + r.journal.length, 0)}</span><span style={S.statL}>Einträge</span></div>
        </div>
      </div>
    </div>
  );
};

// ─── App ────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(load);
  const [tab, setTab] = useState("recipes");
  const [editing, setEditing] = useState(null);
  const [bake, setBake] = useState(null);
  const [syncIndicator, setSyncIndicator] = useState(null); // null | "syncing" | "done" | "error"
  const syncTimer = useRef(null);

  // Save locally always
  useEffect(() => save(data), [data]);

  // Auto-push to GitHub on data change (debounced 2s)
  useEffect(() => {
    const cfg = loadGHConfig();
    if (!cfg) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncIndicator("syncing");
      try {
        await ghPush(cfg, data);
        setSyncIndicator("done");
        setTimeout(() => setSyncIndicator(null), 2000);
      } catch {
        setSyncIndicator("error");
        setTimeout(() => setSyncIndicator(null), 3000);
      }
    }, 2000);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [data]);

  const upD = fn => setData(p => { const n = JSON.parse(JSON.stringify(p)); fn(n); return n; });
  const create = () => { const r = defaultRecipe(); upD(d => d.recipes.push(r)); setEditing(r.id); };
  const saveR = r => { upD(d => { const i = d.recipes.findIndex(x => x.id === r.id); if (i >= 0) d.recipes[i] = r; }); setEditing(null); };
  const delR = id => { if (confirm("Löschen?")) { upD(d => d.recipes = d.recipes.filter(r => r.id !== id)); setEditing(null); } };
  const dupR = r => { const n = { ...JSON.parse(JSON.stringify(r)), id: uid(), name: r.name + " (Kopie)", journal: [], createdAt: Date.now() }; upD(d => d.recipes.push(n)); setEditing(n.id); };
  const plan = r => { saveR(r); setTab("planner"); };

  // Sync indicator overlay
  const SyncBadge = () => syncIndicator ? (
    <div style={{
      position: "fixed", top: 12, right: 12, zIndex: 200,
      padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: syncIndicator === "syncing" ? "var(--surface2)" : syncIndicator === "done" ? "rgba(91,140,90,0.9)" : "rgba(196,91,74,0.9)",
      color: "#fff", display: "flex", alignItems: "center", gap: 6,
      backdropFilter: "blur(10px)", fontFamily: "var(--font)",
    }}>
      {syncIndicator === "syncing" && "⏳ Sync..."}
      {syncIndicator === "done" && "✓ Gespeichert"}
      {syncIndicator === "error" && "✗ Sync-Fehler"}
    </div>
  ) : null;

  if (bake) return <div style={S.app}><SyncBadge /><BakeSession recipe={bake.r} schedule={bake.s} onDone={() => setBake(null)} /></div>;
  if (editing) { const r = data.recipes.find(x => x.id === editing); if (!r) { setEditing(null); return null; } return <div style={S.app}><SyncBadge /><RecipeEditor recipe={r} onSave={saveR} onDelete={() => delR(editing)} onBack={() => setEditing(null)} onDuplicate={dupR} onPlan={plan} /></div>; }
  return (
    <div style={S.app}>
      <SyncBadge />
      {tab === "recipes" && <RecipeList recipes={data.recipes} onSelect={id => setEditing(id)} onCreate={create} />}
      {tab === "planner" && <Planner recipes={data.recipes} onBake={(r, s) => setBake({ r, s })} />}
      {tab === "settings" && <Settings data={data} onImport={d => d.recipes && setData(d)} onExport={() => exportJSON(data)} />}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const S = {
  app: { "--bg": "#0D0D0D", "--surface": "#1A1A1A", "--surface2": "#242424", "--border": "#2A2A2A", "--text": "#F0EDE6", "--muted": "#8A8680", "--accent": "#D4853E", "--accentDim": "rgba(212,133,62,0.15)", "--success": "#5B8C5A", "--danger": "#C45B4A", "--font": "'DM Sans',-apple-system,system-ui,sans-serif", "--font-mono": "'JetBrains Mono','SF Mono',monospace", fontFamily: "var(--font)", background: "var(--bg)", color: "var(--text)", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80, WebkitFontSmoothing: "antialiased" },
  tabBar: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", background: "rgba(13,13,13,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid var(--border)", zIndex: 100, padding: "6px 0 env(safe-area-inset-bottom,8px)" },
  tab: { flex: 1, maxWidth: 160, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font)" },
  tabAct: { color: "var(--accent)" },
  page: { padding: "16px 16px 24px" },
  hdr: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, flex: 1 },
  iconBtn: { background: "none", border: "none", color: "var(--text)", cursor: "pointer", padding: 8, borderRadius: 10, display: "flex" },
  pri: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 20px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", marginTop: 8 },
  sec: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 20px", background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", marginTop: 8 },
  saveBtn: { display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" },
  danger: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "11px", background: "none", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", marginTop: 24 },
  addBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "var(--accentDim)", color: "var(--accent)", border: "1px dashed rgba(212,133,62,0.4)", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", marginTop: 6, width: "100%" },
  addSm: { display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 9px", background: "var(--accentDim)", color: "var(--accent)", border: "1px dashed rgba(212,133,62,0.4)", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", marginTop: 4 },
  mini: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 3, display: "flex" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", textAlign: "center" },
  mutedTxt: { color: "var(--muted)", fontSize: 14, marginBottom: 14 },
  rCard: { display: "block", width: "100%", textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, cursor: "pointer", fontFamily: "var(--font)", color: "var(--text)" },
  badge: { padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, color: "#fff", background: "var(--accent)" },
  secTabs: { display: "flex", gap: 3, marginBottom: 14, background: "var(--surface)", borderRadius: 10, padding: 3 },
  secTab: { flex: 1, padding: "9px 6px", background: "none", border: "none", color: "var(--muted)", fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: "pointer", fontFamily: "var(--font)" },
  secTabAct: { background: "var(--surface2)", color: "var(--text)" },
  col: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  lbl: { fontSize: 13, color: "var(--muted)", fontWeight: 500 },
  titleIn: { width: "100%", padding: "10px 0", background: "none", border: "none", borderBottom: "2px solid var(--border)", color: "var(--text)", fontSize: 22, fontWeight: 700, fontFamily: "var(--font)", outline: "none" },
  sel: { padding: "9px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "var(--font)", minWidth: 100 },
  numIn: { padding: "9px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "var(--font-mono)", width: 80, textAlign: "right" },
  numSm: { padding: "4px 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right" },
  dateIn: { padding: "9px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "var(--font)", colorScheme: "dark", flex: 1 },
  timeIn: { padding: "9px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "var(--font-mono)", colorScheme: "dark", width: 90 },
  inIn: { display: "block", width: "100%", padding: "5px 7px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", boxSizing: "border-box" },
  inSel: { padding: "3px 5px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 11, fontFamily: "var(--font)" },
  ta: { width: "100%", padding: "10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 14, fontFamily: "var(--font)", resize: "vertical", outline: "none", boxSizing: "border-box" },
  taSm: { width: "100%", padding: "6px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", resize: "vertical", outline: "none", boxSizing: "border-box" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 },
  cardT: { display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, margin: "0 0 6px" },
  stat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 8px", background: "var(--surface2)", borderRadius: 10, gap: 2 },
  statV: { fontSize: 16, fontWeight: 700 },
  statL: { fontSize: 10, color: "var(--muted)", textAlign: "center" },
  scBtn: { padding: "4px 11px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-mono)" },
  scBtnAct: { background: "var(--accentDim)", borderColor: "var(--accent)", color: "var(--accent)" },
  stepCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 11, marginBottom: 3 },
  stepN: { width: 20, height: 20, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--muted)", flexShrink: 0 },
};
