import { GH_CONFIG_KEY, GH_FILE } from "../constants.js";

export const loadGHConfig = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(GH_CONFIG_KEY));
    if (stored) return stored;
  } catch {}
  const envToken = import.meta.env.VITE_GH_TOKEN;
  if (envToken) {
    const cfg = { owner: "lauwerk", repo: "BakeBuddy-Data", token: envToken };
    try { localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
    return cfg;
  }
  return null;
};

export const saveGHConfig = (cfg) => {
  try { localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
};

export const clearGHConfig = () => {
  try { localStorage.removeItem(GH_CONFIG_KEY); } catch {}
};

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

const GH_DIR = "recipes";

// Sanitize recipe name for use as a filename
const sanitizeName = (name) =>
  (name || "Rezept")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    || "Rezept";

const recipeFilepath = (recipe) =>
  `${GH_DIR}/${sanitizeName(recipe.name)}_${recipe.createdAt}.json`;

const fromBase64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));

// ── Push: write each recipe to its own file, one clean commit ─────────
export const ghPush = async (cfg, data) => {
  const headers = ghHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const n = data.recipes.length;

  // 1. Get default branch + latest commit
  const branchRes = await fetch(`${baseUrl}/branches/main`, { headers });
  if (!branchRes.ok) throw new Error(`Branch nicht gefunden (${branchRes.status})`);
  const branchData = await branchRes.json();
  const baseCommitSha = branchData.commit.sha;
  const baseTreeSha   = branchData.commit.commit.tree.sha;

  // 2. List existing recipe files (to detect orphans / renames)
  const treeRes  = await fetch(`${baseUrl}/git/trees/${baseTreeSha}?recursive=1`, { headers });
  const treeData = treeRes.ok ? await treeRes.json() : { tree: [] };
  const existingPaths = new Set(
    (treeData.tree || [])
      .filter(f => f.path.startsWith(GH_DIR + "/") && f.path.endsWith(".json") && f.type === "blob")
      .map(f => f.path)
  );

  // 3. Build tree entries: new/updated + deletions (null sha = delete)
  const newPaths = new Map(data.recipes.map(r => [recipeFilepath(r), r]));

  const treeEntries = [
    ...[...newPaths.entries()].map(([path, recipe]) => ({
      path,
      mode: "100644",
      type: "blob",
      content: JSON.stringify(recipe, null, 2),
    })),
    ...[...existingPaths]
      .filter(path => !newPaths.has(path))
      .map(path => ({ path, mode: "100644", type: "blob", sha: null })),
  ];

  if (!treeEntries.length) return;

  // 4. Create tree → commit → update ref (single atomic commit)
  const newTreeRes = await fetch(`${baseUrl}/git/trees`, {
    method: "POST", headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!newTreeRes.ok) {
    const e = await newTreeRes.json().catch(() => ({}));
    throw new Error(`Tree-Erstellung fehlgeschlagen: ${e.message || newTreeRes.status}`);
  }
  const newTree = await newTreeRes.json();

  const commitRes = await fetch(`${baseUrl}/git/commits`, {
    method: "POST", headers,
    body: JSON.stringify({
      message: `sync: ${timestamp} — ${n} Rezept${n !== 1 ? "e" : ""}`,
      tree: newTree.sha,
      parents: [baseCommitSha],
    }),
  });
  if (!commitRes.ok) throw new Error("Commit fehlgeschlagen");
  const commit = await commitRes.json();

  const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: "PATCH", headers,
    body: JSON.stringify({ sha: commit.sha }),
  });
  if (!refRes.ok) throw new Error("Ref-Update fehlgeschlagen");
};

// ── Pull: read all recipe files; fall back to legacy single-file ───────
export const ghPull = async (cfg) => {
  const headers = ghHeaders(cfg.token);
  const baseUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;

  const dirRes = await fetch(`${baseUrl}/contents/${GH_DIR}`, { headers });

  if (dirRes.ok) {
    const files = await dirRes.json();
    if (!Array.isArray(files)) return null;

    // Fetch all recipe files in parallel via download_url
    // (GitHub includes a signed auth token in download_url for private repos)
    const recipes = await Promise.all(
      files
        .filter(f => f.name.endsWith(".json") && f.download_url)
        .map(async f => {
          const res = await fetch(f.download_url);
          return res.ok ? res.json() : null;
        })
    );
    return { recipes: recipes.filter(Boolean) };
  }

  if (dirRes.status !== 404) throw new Error(`GitHub API ${dirRes.status}`);

  // ── Migration fallback: read legacy bakebuddy-data.json ──
  const fileRes = await fetch(`${baseUrl}/contents/${GH_FILE}`, { headers });
  if (!fileRes.ok) return null;
  const file = await fileRes.json();
  if (!file?.content) return null;
  return JSON.parse(fromBase64(file.content));
};

// ── Connection test ────────────────────────────────────────────────────
export const ghTest = async (cfg) => {
  const headers = ghHeaders(cfg.token);

  // Try to read recipes/ dir (new format) or legacy file
  const dirRes = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_DIR}`,
    { headers }
  );
  if (dirRes.ok || dirRes.status === 404) return true; // 404 = dir doesn't exist yet → fine

  if (dirRes.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");
  if (dirRes.status === 403) throw new Error("Keine Berechtigung — setze Contents auf Read & Write");

  // Verify repo + token exist
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (userRes.status === 401) throw new Error("Token ungültig — prüfe ob er korrekt kopiert wurde");

  const repoRes = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, { headers });
  if (!repoRes.ok) throw new Error(`Repo ${cfg.owner}/${cfg.repo} nicht gefunden.`);

  return true;
};
