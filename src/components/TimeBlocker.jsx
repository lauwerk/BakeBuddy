import { useRef, useEffect, useCallback } from "react";

const SLOTS_PER_DAY = 48; // 24h × 2

const getSlotTs = (dayTs, slotIdx) => {
  const d = new Date(dayTs);
  d.setHours(Math.floor(slotIdx / 2), (slotIdx % 2) * 30, 0, 0);
  return d.getTime();
};

export const createDefaultBlocks = (days) => {
  const set = new Set();
  days.forEach(dayTs => {
    // 00:00–08:59 (slots 0–17)
    for (let si = 0; si < 18; si++) set.add(getSlotTs(dayTs, si));
    // 22:00–23:59 (slots 44–47)
    for (let si = 44; si < 48; si++) set.add(getSlotTs(dayTs, si));
  });
  return set;
};

export const TimeBlocker = ({ days, blockedSlots, onToggle }) => {
  const ref = useRef(null);
  const dragging = useRef(false);
  const mode = useRef(null);
  const last = useRef(null);

  const getSlotFromEvent = useCallback((e, dayIdx) => {
    const touch = e.touches ? e.touches[0] : e;
    const col = ref.current?.querySelectorAll("[data-dc]")[dayIdx];
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const y = touch.clientY - rect.top;
    const idx = Math.floor(y / (rect.height / SLOTS_PER_DAY));
    if (idx < 0 || idx >= SLOTS_PER_DAY) return null;
    return getSlotTs(days[dayIdx], idx);
  }, [days]);

  const down = useCallback((ts) => {
    dragging.current = true;
    mode.current = blockedSlots.has(ts) ? "unblock" : "block";
    last.current = ts;
    onToggle(ts, mode.current);
  }, [blockedSlots, onToggle]);

  const move = useCallback((e, di) => {
    if (!dragging.current) return;
    e.preventDefault();
    const ts = getSlotFromEvent(e, di);
    if (ts != null && ts !== last.current) {
      last.current = ts;
      onToggle(ts, mode.current);
    }
  }, [getSlotFromEvent, onToggle]);

  const up = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, [up]);

  const labels = days.map(d => {
    const dd = new Date(d);
    return {
      wd: dd.toLocaleDateString("de-DE", { weekday: "short" }),
      day: dd.getDate(),
    };
  });

  return (
    <div style={{ marginTop: 8, userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={{ display: "flex", fontSize: 10, color: "var(--muted)", marginBottom: 2, paddingLeft: 26 }}>
        {labels.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontWeight: 600 }}>
            <div>{d.wd}</div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>{d.day}</div>
          </div>
        ))}
      </div>
      <div ref={ref} style={{ display: "flex" }}>
        {/* Hour labels */}
        <div style={{ width: 26, flexShrink: 0 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              style={{
                height: 16, fontSize: 9,
                color: h % 2 === 0 ? "var(--muted)" : "transparent",
                display: "flex", alignItems: "flex-start",
                justifyContent: "flex-end", paddingRight: 4,
                fontFamily: "var(--font-mono)",
              }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((day, di) => (
          <div
            key={di}
            data-dc
            style={{ flex: 1, borderLeft: "1px solid var(--border)" }}
            onMouseMove={e => move(e, di)}
            onTouchMove={e => move(e, di)}
          >
            {Array.from({ length: SLOTS_PER_DAY }, (_, si) => {
              const ts = getSlotTs(day, si);
              const blocked = blockedSlots.has(ts);
              const isHour = si % 2 === 0;
              return (
                <div
                  key={si}
                  onMouseDown={() => down(ts)}
                  onTouchStart={e => { e.preventDefault(); down(ts); }}
                  style={{
                    height: 8,
                    background: blocked ? "rgba(196,91,74,0.55)" : "transparent",
                    borderTop: isHour ? "1px solid rgba(255,255,255,0.06)" : "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(196,91,74,0.55)", display: "inline-block" }} />
          Nicht verfügbar
        </span>
        <span>Wische zum Markieren / Entfernen</span>
      </div>
    </div>
  );
};
