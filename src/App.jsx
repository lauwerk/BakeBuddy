import { useState, useEffect, useRef } from "react";
import { S } from "./styles.js";
import { TabBar } from "./components/TabBar.jsx";
import { RecipeList } from "./components/RecipeList.jsx";
import { RecipeEditor } from "./components/RecipeEditor.jsx";
import { Planner } from "./components/Planner.jsx";
import { BakeSession } from "./components/BakeSession.jsx";
import { Settings } from "./components/Settings.jsx";
import { uid, defaultRecipe } from "./constants.js";
import { load, save, exportJSON } from "./utils/persistence.js";
import { loadGHConfig, ghPush } from "./utils/github.js";

const SyncBadge = ({ status }) => {
  if (!status) return null;
  return (
    <div style={{
      position: "fixed", top: 12, right: 12, zIndex: 200,
      padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: status === "syncing" ? "var(--surface2)" : status === "done" ? "rgba(91,140,90,0.9)" : "rgba(196,91,74,0.9)",
      color: "#fff", display: "flex", alignItems: "center", gap: 6,
      backdropFilter: "blur(10px)", fontFamily: "var(--font)",
    }}>
      {status === "syncing" && "⏳ Sync..."}
      {status === "done" && "✓ Gespeichert"}
      {status === "error" && "✗ Sync-Fehler"}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState(load);
  const [tab, setTab] = useState("recipes");
  const [editing, setEditing] = useState(null);
  const [bake, setBake] = useState(null);
  const [syncIndicator, setSyncIndicator] = useState(null);
  const syncTimer = useRef(null);

  // Persist to localStorage on every data change
  useEffect(() => { save(data); }, [data]);

  // Auto-push to GitHub (debounced 2 s) whenever data changes
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

  const upD = fn => setData(p => { const n = structuredClone(p); fn(n); return n; });

  const create = () => {
    const r = defaultRecipe();
    upD(d => d.recipes.push(r));
    setEditing(r.id);
  };

  const saveR = r => {
    upD(d => {
      const i = d.recipes.findIndex(x => x.id === r.id);
      if (i >= 0) d.recipes[i] = r;
    });
    setEditing(null);
  };

  const delR = id => {
    if (!confirm("Rezept wirklich löschen?")) return;
    upD(d => { d.recipes = d.recipes.filter(r => r.id !== id); });
    setEditing(null);
  };

  const dupR = r => {
    const n = { ...structuredClone(r), id: uid(), name: `${r.name} (Kopie)`, journal: [], createdAt: Date.now() };
    upD(d => d.recipes.push(n));
    setEditing(n.id);
  };

  const plan = r => { saveR(r); setTab("planner"); };

  if (bake) {
    return (
      <div style={S.app}>
        <SyncBadge status={syncIndicator} />
        <BakeSession recipe={bake.r} schedule={bake.s} onDone={() => setBake(null)} />
      </div>
    );
  }

  if (editing) {
    const r = data.recipes.find(x => x.id === editing);
    if (!r) { setEditing(null); return null; }
    return (
      <div style={S.app}>
        <SyncBadge status={syncIndicator} />
        <RecipeEditor
          recipe={r}
          onSave={saveR}
          onDelete={() => delR(editing)}
          onBack={() => setEditing(null)}
          onDuplicate={dupR}
          onPlan={plan}
        />
      </div>
    );
  }

  return (
    <div style={S.app}>
      <SyncBadge status={syncIndicator} />
      {tab === "recipes" && (
        <RecipeList recipes={data.recipes} onSelect={id => setEditing(id)} onCreate={create} />
      )}
      {tab === "planner" && (
        <Planner recipes={data.recipes} onBake={(r, s) => setBake({ r, s })} />
      )}
      {tab === "settings" && (
        <Settings
          data={data}
          onImport={d => d.recipes && setData(d)}
          onExport={() => exportJSON(data)}
        />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
