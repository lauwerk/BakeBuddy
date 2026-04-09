import { S } from "../styles.js";

export const TabBar = ({ active, onChange }) => (
  <div style={S.tabBar}>
    {[["recipes", "Rezepte", "🍞"], ["planner", "Planer", "📅"], ["settings", "Daten", "💾"]].map(
      ([id, l, ic]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{ ...S.tab, ...(active === id ? S.tabAct : {}) }}
        >
          <span style={{ fontSize: 20 }}>{ic}</span>
          <span style={{ fontSize: 10 }}>{l}</span>
        </button>
      )
    )}
  </div>
);
