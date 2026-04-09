import { SLOT_MS } from "../constants.js";

// Expandiert Schritte mit Sub-Schritten in einzelne Segmente.
//
// position "interleave" (Standard):
//   Stockgare(300) + 4× D&F(5) → Rest(60) → D&F → Rest(60) → D&F → … → Rest(60)
//
// position "prefix":
//   Starter füttern(480) + einmalig Starter ansetzen(10) → Aktiv(10) → Passiv(480)
export const expandSteps = (steps) => {
  const result = [];
  for (const step of steps) {
    if (!step.repeat || step.repeat.count < 1) {
      result.push(step);
      continue;
    }
    const { repeat } = step;
    const isPrefix = (repeat.position || "interleave") === "prefix";

    if (isPrefix) {
      // Aktiver Sub-Schritt zuerst, danach der volle Passivschritt
      result.push({
        id: `${step.id}_a0`,
        name: repeat.name,
        duration: repeat.duration,
        type: repeat.type || "aktiv",
        notes: repeat.notes || "",
        tempMin: null,
        tempMax: null,
        _active: { repIdx: 1, repTotal: 1, parentName: step.name },
      });
      result.push({
        ...step,
        id: `${step.id}_p0`,
        repeat: undefined,
        _rest: { segIdx: 1, segTotal: 1, parentName: step.name },
      });
    } else {
      // Interleaved: Passiv → Aktiv → Passiv → … → Passiv
      const count = repeat.count;
      const segDur = Math.floor(step.duration / (count + 1));
      const lastSegDur = step.duration - segDur * count;

      for (let i = 0; i < count; i++) {
        result.push({
          ...step,
          id: `${step.id}_p${i}`,
          duration: segDur,
          repeat: undefined,
          flexMin: undefined,
          flexMax: undefined,
          _rest: { segIdx: i + 1, segTotal: count + 1, parentName: step.name },
        });
        result.push({
          id: `${step.id}_a${i}`,
          name: count > 1 ? `${repeat.name} (${i + 1}/${count})` : repeat.name,
          duration: repeat.duration,
          type: repeat.type || "aktiv",
          notes: repeat.notes || "",
          tempMin: null,
          tempMax: null,
          _active: { repIdx: i + 1, repTotal: count, parentName: step.name },
        });
      }
      result.push({
        ...step,
        id: `${step.id}_p${count}`,
        duration: lastSegDur,
        repeat: undefined,
        flexMin: undefined,
        flexMax: undefined,
        _rest: { segIdx: count + 1, segTotal: count + 1, parentName: step.name },
      });
    }
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
