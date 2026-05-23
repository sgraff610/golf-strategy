"use client";
type Bar = { x: string; v: number; hi?: boolean };

export function ImpactBars({
  data, width = 240, height = 80,
}: { data: Bar[]; width?: number; height?: number }) {
  const max = Math.max(...data.map(d => Math.abs(d.v))) * 1.1 || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, padding: "0 4px" }}>
      {data.map((d, i) => {
        const h = (Math.abs(d.v) / max) * (height - 28);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              className="tnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11, fontWeight: 700,
                color: d.hi ? "var(--accent-deep)" : "var(--ink-mute)",
              }}
            >{d.v > 0 ? "+" : ""}{d.v.toFixed(2)}</div>
            <div style={{
              width: "100%",
              height: Math.max(h, 4),
              borderRadius: 4,
              background: d.hi
                ? "linear-gradient(180deg,var(--accent) 0%,var(--accent-deep) 100%)"
                : "linear-gradient(180deg,#cdd4da 0%,#9eaab5 100%)",
            }} />
            <div style={{
              fontSize: 10, fontWeight: 500, color: "var(--ink-mute)",
              fontFamily: "var(--font-ui)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: "100%",
            }}>{d.x}</div>
          </div>
        );
      })}
    </div>
  );
}
