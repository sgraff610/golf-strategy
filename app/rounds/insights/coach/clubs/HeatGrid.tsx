import type { Disp } from "./clubData";

export function HeatGrid({ disp, size = 96 }: { disp: Disp; size?: number }) {
  const cell = (val: number, kind: "on" | "miss") => {
    const isOn = kind === "on";
    const alpha = isOn ? Math.min(1, val / 68) : Math.min(1, val / 28);
    const bg = isOn
      ? `rgba(8,70,52,${0.18 + alpha * 0.82})`
      : val === 0 ? "transparent" : `rgba(180,95,34,${0.12 + alpha * 0.78})`;
    const strong = isOn ? alpha > 0.4 : alpha > 0.5;
    return (
      <div style={{ background: bg, borderRadius: 6, display: "grid", placeItems: "center" }}>
        {val > 0 && (
          <span className="tnum" style={{
            fontFamily: "var(--font-mono)", fontSize: size > 80 ? 12 : 10, fontWeight: 700,
            color: strong ? "#fff" : isOn ? "var(--green-deep)" : "var(--accent-deep)",
          }}>{val}</span>
        )}
      </div>
    );
  };
  const empty = <div style={{ background: "var(--paper-alt)", borderRadius: 6, opacity: 0.4 }} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr 1fr", gap: 4, width: size, height: size }}>
      {empty}{cell(disp.long, "miss")}{empty}
      {cell(disp.left, "miss")}{cell(disp.on, "on")}{cell(disp.right, "miss")}
      {empty}{cell(disp.short, "miss")}{empty}
    </div>
  );
}
