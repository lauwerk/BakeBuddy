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

// Durchschnittsbewertung eines Tagebucheintrags (unterstützt altes rating-Feld und neues ratings-Objekt)
export const calcEntryRating = (entry) => {
  if (entry.ratings) {
    const vals = Object.values(entry.ratings).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  }
  return entry.rating || 0;
};

// Durchschnittsbewertung über alle Tagebucheinträge eines Rezepts (0 wenn leer)
export const calcRecipeRating = (recipe) => {
  if (!recipe.journal?.length) return 0;
  return recipe.journal.reduce((s, j) => s + calcEntryRating(j), 0) / recipe.journal.length;
};

// Gesamtdauer inkl. aller Sub-Schritte (unterstützt repeat und repeats)
export const totalDur = (steps) => steps.reduce((s, st) => {
  const repeats = st.repeats || (st.repeat ? [st.repeat] : []);
  const repeatTime = repeats.reduce((rt, rep) => {
    const isPrefix = (rep.position || "interleave") === "prefix";
    return rt + (isPrefix ? rep.duration : rep.count * rep.duration);
  }, 0);
  return s + st.duration + repeatTime;
}, 0);
