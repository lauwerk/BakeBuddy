import { getTotalFlour, calcGrams, calcHydration, calcTotalWeight, totalDur } from "./calculations.js";
import { fmtDur, fmtDT, fmtTime } from "./formatters.js";
import { ingredientTypeOrder, typeLabels, stepTypes } from "../constants.js";

export const exportPlanPDF = (recipe, schedule) => {
  const tf       = getTotalFlour(recipe.ingredients);
  const hydration = calcHydration(recipe.ingredients);
  const totalWt  = Math.round(calcTotalWeight(recipe.ingredients));
  const duration = totalDur(recipe.steps);

  // ── Ingredients grouped ──────────────────────────────────────────
  const grouped = {};
  ingredientTypeOrder.forEach(t => { grouped[t] = []; });
  recipe.ingredients.forEach(i => (grouped[i.type] ?? (grouped.sonstiges ??= [])).push(i));

  let ingRows = "";
  ingredientTypeOrder.forEach(type => {
    const items = grouped[type] || [];
    if (!items.length) return;
    ingRows += `<tr><td colspan="3" class="grp-head">${typeLabels[type]}</td></tr>`;
    items.forEach(ing => {
      const g     = type === "mehl" ? (ing.grams || 0) : calcGrams(ing, tf);
      const pct   = type === "mehl" ? "100 %" : `${ing.percent ?? "—"} %`;
      const extra = type === "starter" ? ` (TA ${100 + (ing.hydration || 100)})` : "";
      ingRows += `<tr>
        <td>${ing.name}${extra}</td>
        <td class="r muted">${pct}</td>
        <td class="r bold">${Math.round(g * 10) / 10} g</td>
      </tr>`;
    });
  });

  // ── Steps (original, not expanded) ──────────────────────────────
  let stepRows = "";
  recipe.steps.forEach((s, i) => {
    const passive = ["fermentation", "ruhe", "kühlen"].includes(s.type);
    const temp    = s.tempMin != null ? ` · ${s.tempMin}–${s.tempMax} °C` : "";
    const flex    = s.flexMin != null ? ` (${s.flexMin}–${s.flexMax} Min)` : "";
    stepRows += `
      <div class="step ${passive ? "passive" : "active"}">
        <span class="step-n">${i + 1}</span>
        <div class="step-body">
          <div class="step-name">${stepTypes[s.type] || "·"} ${s.name}</div>
          <div class="step-meta">${fmtDur(s.duration)}${flex}${temp}${passive ? " · passiv" : " · aktiv"}</div>
          ${s.notes ? `<div class="step-notes">${s.notes}</div>` : ""}
        </div>
      </div>`;
  });

  // ── Schedule timeline ────────────────────────────────────────────
  let timelineHtml = `
    <div class="sched-start">
      Start: ${fmtDT(schedule[0]?.scheduledStart)}
    </div>`;

  let lastDay = "";
  schedule.forEach(s => {
    const day = new Date(s.scheduledStart).toLocaleDateString("de-DE",
      { weekday: "long", day: "numeric", month: "long" });
    if (day !== lastDay) {
      timelineHtml += `<div class="day-head">${day}</div>`;
      lastDay = day;
    }
    const passive = ["fermentation", "ruhe", "kühlen"].includes(s.type);
    const temp    = s.tempMin != null ? ` · ${s.tempMin}–${s.tempMax} °C` : "";
    const ctx     = s._rest ? ` (${s._rest.parentName})` : s._active ? ` (${s._active.parentName})` : "";
    timelineHtml += `
      <div class="event ${passive ? "ev-passive" : "ev-active"}">
        <div class="ev-dot"></div>
        <div class="ev-body">
          <div class="ev-time">${fmtDT(s.scheduledStart)} – ${fmtTime(s.scheduledEnd)}</div>
          <div class="ev-name">${stepTypes[s.type] || "·"} ${s.name}${ctx}</div>
          <div class="ev-meta">${fmtDur(s.duration)}${temp}${passive ? " · passiv" : ""}</div>
          ${s.notes ? `<div class="ev-notes">${s.notes}</div>` : ""}
        </div>
      </div>`;
  });

  timelineHtml += `
    <div class="sched-end">
      ✓ Fertig: ${fmtDT(schedule[schedule.length - 1]?.scheduledEnd)}
    </div>`;

  // ── Full HTML ────────────────────────────────────────────────────
  const printDate = new Date().toLocaleDateString("de-DE",
    { day: "numeric", month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${recipe.name || "Rezept"} — Backplan</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  html, body { width: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #1a1a1a; background: #fff; }

  /* Layout */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 3mm; border-bottom: 0.7pt solid #1a1a1a; margin-bottom: 5mm; }
  .doc-title   { font-size: 17pt; font-weight: 800; line-height: 1.1; }
  .doc-sub     { font-size: 8pt; color: #666; margin-top: 1mm; }
  .doc-meta    { font-size: 7.5pt; color: #888; text-align: right; }
  .grid        { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .col-head    { font-size: 9pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 1.5mm; border-bottom: 0.5pt solid #ddd; margin-bottom: 3mm; }

  /* Recipe column */
  .stats       { display: flex; flex-wrap: wrap; gap: 2mm 5mm; margin-bottom: 4mm; font-size: 8pt; }
  .stat-item   { color: #555; }
  .stat-item b { color: #1a1a1a; }

  table        { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .grp-head    { font-size: 7.5pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; padding: 2mm 0 0.8mm; }
  td           { padding: 1mm 0; border-bottom: 0.3pt solid #efefef; font-size: 8pt; vertical-align: top; }
  td.r         { text-align: right; }
  td.muted     { color: #888; }
  td.bold      { font-weight: 700; }

  .step        { display: flex; gap: 2.5mm; margin-bottom: 2.5mm; padding-bottom: 2.5mm; border-bottom: 0.3pt solid #efefef; }
  .step-n      { flex-shrink: 0; width: 4.5mm; height: 4.5mm; border-radius: 50%; background: #1a1a1a; color: #fff; font-size: 7pt; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 0.3mm; }
  .step.passive .step-n { background: #bbb; }
  .step-name   { font-size: 8.5pt; font-weight: 600; margin-bottom: 0.5mm; }
  .step-meta   { font-size: 7.5pt; color: #666; }
  .step-notes  { font-size: 7pt; color: #999; font-style: italic; margin-top: 0.5mm; }

  /* Plan column */
  .sched-start { font-size: 8pt; font-weight: 700; color: #c17f50; padding: 1mm 0 3mm 5mm; border-left: 2pt solid #c17f50; margin-bottom: 1mm; }
  .sched-end   { font-size: 8pt; font-weight: 700; color: #5b8c5a; padding: 1.5mm 0 1mm 5mm; border-left: 2pt solid #5b8c5a; margin-top: 1mm; }
  .day-head    { font-size: 7.5pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.05em; padding: 2.5mm 0 1mm 5mm; border-left: 0.5pt solid #ddd; }
  .event       { position: relative; padding-left: 5mm; padding-bottom: 2.5mm; border-left: 0.5pt solid #ddd; }
  .ev-dot      { position: absolute; left: -1.5mm; top: 1.2mm; width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #c17f50; }
  .ev-passive .ev-dot { background: #bbb; }
  .ev-time     { font-size: 7.5pt; color: #c17f50; font-weight: 600; font-family: "Courier New", monospace; }
  .ev-passive .ev-time { color: #999; }
  .ev-name     { font-size: 8.5pt; font-weight: 600; margin: 0.4mm 0; }
  .ev-meta     { font-size: 7.5pt; color: #666; }
  .ev-notes    { font-size: 7pt; color: #999; font-style: italic; margin-top: 0.4mm; }

  .doc-footer  { margin-top: 6mm; padding-top: 2.5mm; border-top: 0.5pt solid #ddd; font-size: 7pt; color: #bbb; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="doc-title">${recipe.name || "Unbenanntes Rezept"}</div>
      <div class="doc-sub">${recipe.category} · ${recipe.pieces} Stück · ${fmtDur(duration)}</div>
    </div>
    <div class="doc-meta">BakeBuddy<br>${printDate}</div>
  </div>

  <div class="grid">
    <!-- LEFT: Recipe -->
    <div>
      <div class="col-head">Rezept</div>
      <div class="stats">
        <div class="stat-item">🌾 Mehl: <b>${tf} g</b></div>
        <div class="stat-item">💧 Hydration: <b>${hydration} %</b></div>
        <div class="stat-item">⚖️ Gesamt: <b>${totalWt} g</b></div>
        <div class="stat-item">TA: <b>${hydration + 100}</b></div>
      </div>

      <div class="col-head" style="margin-top:2mm">Zutaten</div>
      <table><tbody>${ingRows}</tbody></table>

      <div class="col-head" style="margin-top:1mm">Schritte</div>
      ${stepRows}
    </div>

    <!-- RIGHT: Plan -->
    <div>
      <div class="col-head">Backplan</div>
      ${timelineHtml}
    </div>
  </div>

  <div class="doc-footer">
    <span>Erstellt mit BakeBuddy</span>
    <span>${recipe.name || "Rezept"} — ${fmtDT(schedule[0]?.scheduledStart)} bis ${fmtDT(schedule[schedule.length - 1]?.scheduledEnd)}</span>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Popup-Fenster blockiert. Bitte den Popup-Blocker für diese Seite deaktivieren.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Short delay so fonts/layout can settle before print dialog opens
  setTimeout(() => w.print(), 600);
};
