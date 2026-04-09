import { SLOT_MS } from "../constants.js";

export const scheduleSteps = (steps, targetEnd, blocked) => {
  const isBlocked = (start, end) => {
    for (let t = start; t < end; t += SLOT_MS) {
      if (blocked.has(Math.floor(t / SLOT_MS) * SLOT_MS)) return true;
    }
    return false;
  };

  const result = [];
  let cursor = new Date(targetEnd).getTime();

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
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
