import { useState, useRef } from "react";
import { S } from "../styles.js";
import { ICO } from "./icons.jsx";
import { loadGHConfig, saveGHConfig, clearGHConfig, ghPush, ghPull, ghTest } from "../utils/github.js";

export const Settings = ({ data, onImport, onExport }) => {
  const ref = useRef(null);
  const [ghCfg, setGhCfg] = useState(loadGHConfig);
  const [tokenInput, setTokenInput] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);

  const configureGH = async () => {
    if (!tokenInput.trim()) return;
    const cleanToken = tokenInput.replace(/[\s"']/g, "");
    const cfg = { owner: "lauwerk", repo: "BakeBuddy-Data", token: cleanToken };
    setTesting(true);
    setSyncMsg("");
    try {
      await ghTest(cfg);
      saveGHConfig(cfg);
      setGhCfg(cfg);
      setTokenInput("");
      setSyncMsg("Verbindung erfolgreich! Token dauerhaft gespeichert.");
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

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.recipes) throw new Error("Kein gültiges BakeBuddy-Format");
      onImport(parsed);
    } catch (err) {
      alert(`Import fehlgeschlagen: ${err.message}`);
    }
    e.target.value = "";
  };

  return (
    <div style={S.page}>
      <h1 style={S.title}>Daten & Sync</h1>

      {/* GitHub Sync */}
      <div style={{ ...S.card, borderColor: ghCfg ? "var(--success)" : "var(--border)" }}>
        <h3 style={S.cardT}>
          {ICO.github}{" "}GitHub Sync
        </h3>

        {!ghCfg ? (
          <>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.4 }}>
              Verbinde mit <b style={{ color: "var(--text)" }}>lauwerk/BakeBuddy-Data</b> um deine Rezepte
              automatisch als JSON zu sichern. Der Token wird dauerhaft gespeichert.
            </p>
            <div style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px", padding: "8px 10px", background: "var(--surface2)", borderRadius: 8, lineHeight: 1.5 }}>
              <b style={{ color: "var(--text)" }}>Token-Einstellungen:</b><br />
              Repository: Only select → BakeBuddy-Data<br />
              Permissions → <b style={{ color: "var(--accent)" }}>Contents: Read & Write</b><br />
              <span style={{ color: "var(--muted)" }}>(Metadata: Read wird automatisch aktiviert)</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                Personal Access Token (Fine-grained)
              </label>
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && configureGH()}
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
              <button
                onClick={pushToGH}
                disabled={syncStatus === "syncing" || syncStatus === "pulling"}
                style={{ ...S.pri, flex: 1, fontSize: 13, padding: "11px 12px", opacity: syncStatus === "syncing" ? 0.6 : 1 }}
              >
                {syncStatus === "syncing" ? "⏳ Sende..." : "⬆ Push"}
              </button>
              <button
                onClick={pullFromGH}
                disabled={syncStatus === "syncing" || syncStatus === "pulling"}
                style={{ ...S.sec, flex: 1, fontSize: 13, padding: "11px 12px", marginTop: 8, opacity: syncStatus === "pulling" ? 0.6 : 1 }}
              >
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
        <input ref={ref} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
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
