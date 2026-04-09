import { SLOT_MS } from "../constants.js";

// Backward-compat: unterstützt sowohl altes step.repeat als auch neues step.repeats
const getRepeats = (step) => step.repeats || (step.repeat ? [step.repeat] : []);

// Expandiert Schritte mit Sub-Schritten in einzelne Segmente.
//
// Sub-Schritte werden in Reihenfolge verarbeitet:
//  "prefix"     → aktiver Segment wird VOR dem passiven Block eingefügt
//  "interleave" → passiver Block wird in (count+1) Teile gesplittet
//
// Beispiel "Backen" (50 Min) mit:
//  1. prefix    "Vorheizen"       (30 Min)
//  2. interleave "Dampf ablassen" (2 Min, count=1)
//
//  → Vorheizen(30) | Backen(25) | Dampf(2) | Backen(25)
export const expandSteps = (steps) => {
  const result = [];

  for (const step of steps) {
    const repeats = getRepeats(step);
    if (!repeats.length) {
      result.push(step);
      continue;
    }

    const baseStep = { ...step, repeats: undefined, repeat: undefined };
    const prefixSegs = [];
    // Startwert: ein einziger passiver Block (der Hauptschritt)
    let passiveSegs = [baseStep];

    for (const rep of repeats) {
      const isPrefix = (rep.position || "interleave") === "prefix";

      if (isPrefix) {
        prefixSegs.push({
          id: `${step.id}_${rep.id}_pre`,
          name: rep.name,
          duration: rep.duration,
          type: rep.type || "aktiv",
          notes: rep.notes || "",
          tempMin: null,
          tempMax: null,
          _active: { parentName: step.name },
        });
      } else {
        // Nur passive Segmente (ohne _active) werden gesplittet; aktive Segmente aus
        // früheren Sub-Schritten werden unverändert übernommen.
        const count = rep.count;
        const expanded = [];
        for (const seg of passiveSegs) {
          if (seg._active) {
            expanded.push(seg);
            continue;
          }
          const segDur = Math.floor(seg.duration / (count + 1));
          const lastSegDur = seg.duration - segDur * count;
          for (let i = 0; i < count; i++) {
            expanded.push({
              ...seg,
              id: `${seg.id}_${rep.id}_${i}`,
              duration: segDur,
              _rest: { parentName: step.name },
            });
            expanded.push({
              id: `${step.id}_${rep.id}_a${i}`,
              name: count > 1 ? `${rep.name} (${i + 1}/${count})` : rep.name,
              duration: rep.duration,
              type: rep.type || "aktiv",
              notes: rep.notes || "",
              tempMin: null,
              tempMax: null,
              _active: { repIdx: i + 1, repTotal: count, parentName: step.name },
            });
          }
          expanded.push({
            ...seg,
            id: `${seg.id}_${rep.id}_${count}`,
            duration: lastSegDur,
            _rest: { parentName: step.name },
          });
        }
        passiveSegs = expanded;
      }
    }

    result.push(
      ...prefixSegs,
      ...passiveSegs.map(seg =>
        seg._active ? seg : { ...seg, _rest: seg._rest || { parentName: step.name } }
      )
    );
  }

  return result;
};

export const scheduleSteps = (steps, targetEnd, blocked) => {
  const expanded = expandSteps(steps);

  const isBlocked = (start, end) => {
    for (let t = start; t < end; t += SLOT_MS) {
      if (blocked.has(Math.floor(t / SLOT_MS) * SLOT_MS)) return true;
    }
    return false;
  };

  const result = [];
  let cursor = new Date(targetEnd).getTime();

  for (let i = expanded.length - 1; i >= 0; i--) {
    const step = expanded[i];
    const dur = step.duration * 60000;
    let end = cursor;
    let start = end - dur;

    if (step.type === "aktiv" || step.type === "backen") {
      let n = 0;
      while (isBlocked(start, end) && n++ < 300) {
        end -= SLOT_MS;
        start = end - dur;
      }
    }

    result.unshift({ ...step, scheduledStart: start, scheduledEnd: end });
    cursor = start;
  }

  return result;
};
