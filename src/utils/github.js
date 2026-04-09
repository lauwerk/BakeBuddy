import { GH_CONFIG_KEY, GH_FILE } from "../constants.js";

export const loadGHConfig = () => {
  try {
    return JSON.parse(localStorage.getItem(GH_CONFIG_KEY)) || null;
  } catch {
    return null;
  }
};

export const saveGHConfig = (cfg) => {
  try {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn("GitHub-Konfiguration konnte nicht gespeichert werden:", e);
  }
};

export const clearGHConfig = () => {
  try {
    localStorage.removeItem(GH_CONFIG_KEY);
  } catch {}
};

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export const ghApi = async (cfg, method, body) => {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_FILE}`;
  const opts = { method, headers: ghHeaders(cfg.token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 404) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  if (res.status === 404) return null;
  return res.json();
};

export const ghPush = async (cfg, data) => {
  const existing = await ghApi(cfg, "GET");
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = {
    message: `sync: ${new Date().toISOString().slice(0, 16).replace("T", " ")} — ${data.recipes.length} Rezepte`,
    content,
    ...(existing?.sha ? { sha: existing.sha } : {}),
  };
  return ghApi(cfg, "PUT", body);
};

export const ghPull = async (cfg) => {
  const res = await ghApi(cfg, "GET");
  if (!res?.content) return null;
  const decoded = decodeURIComponent(escape(atob(res.content.replace(/\n/g, ""))));
  return JSON.parse(decoded);
};

// Prüft Token und Repo-Zugriff.
// - 200/404 auf die Datei = OK (Datei existiert noch nicht → erster Push)
// - 401 = Token ungültig
// - 403 = Keine Schreibrechte
// - sonstiges 404 = Repo nicht gefunden
export const ghTest = async (cfg) => {
  const headers = ghHeaders(cfg.token);
  const fileUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_FILE}`;

  const res = await fetch(fileUrl, { headers });

  if (res.ok) return true; // Datei existiert, Zugriff klappt

  if (res.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");
  if (res.status === 403) throw new Error("Keine Berechtigung — setze Contents auf Read & Write");

  if (res.status === 404) {
    // Entweder: Datei existiert noch nicht (OK) oder Repo existiert nicht (Fehler)
    // Token-Gültigkeit prüfen
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (userRes.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");

    // Repo-Existenz prüfen
    const repoRes = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`,
      { headers }
    );
    if (!repoRes.ok) {
      throw new Error(
        `Repo ${cfg.owner}/${cfg.repo} nicht gefunden. Bitte erstelle es zuerst auf GitHub (privates Repo).`
      );
    }

    // Repo existiert, Datei noch nicht → erster Push wird sie anlegen
    return true;
  }

  throw new Error(`GitHub API Fehler ${res.status}: ${res.statusText}`);
};
