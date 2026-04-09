export const getTotalFlour = (ings) =>
  ings.filter(i => i.type === "mehl").reduce((s, i) => s + (i.grams || 0), 0);

export const calcGrams = (ing, totalFlour) => {
  if (ing.type === "mehl") return ing.grams || 0;
  return totalFlour > 0 ? Math.round(((ing.percent || 0) / 100) * totalFlour * 10) / 10 : 0;
};

// Baker's % hydration including water from starter
export const calcHydration = (ings) => {
  const totalFlour = getTotalFlour(ings);
  if (totalFlour === 0) return 0;

  let water = 0;
  ings.forEach(i => {
    if (i.type === "wasser") water += calcGrams(i, totalFlour);
    if (i.type === "starter") {
      const g = calcGrams(i, totalFlour);
      const h = (i.hydration || 100) / 100;
      water += (g * h) / (1 + h);
    }
  });

  let effectiveFlour = totalFlour;
  ings.filter(i => i.type === "starter").forEach(i => {
    const g = calcGrams(i, totalFlour);
    const h = (i.hydration || 100) / 100;
    effectiveFlour += g / (1 + h);
  });

  return effectiveFlour > 0 ? Math.round((water / effectiveFlour) * 100) : 0;
};

export const calcTotalWeight = (ings) => {
  const tf = getTotalFlour(ings);
  return ings.reduce((s, i) => s + calcGrams(i, tf), 0);
};

// Gesamtdauer inkl. aller Wiederholungen (aktive Sub-Schritte)
export const totalDur = (steps) => steps.reduce((s, st) => {
  const repeatTime = st.repeat ? st.repeat.count * st.repeat.duration : 0;
  return s + st.duration + repeatTime;
}, 0);
