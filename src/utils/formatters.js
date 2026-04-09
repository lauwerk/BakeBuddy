export const fmtDur = (min) => {
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });

export const fmtDT = (ts) => `${fmtDate(ts)}, ${fmtTime(ts)}`;
