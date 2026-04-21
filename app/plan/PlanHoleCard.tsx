// app/plan/PlanHoleCard.tsx
"use client";
import type { HoleData } from "@/lib/types";
import type { HoleStrategy } from "@/lib/planTypes";

type Props = {
  hole: HoleData;
  strategy: HoleStrategy;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
};

function hazardList(h: HoleData): string[] {
  const out: string[] = [];
  if (h.tee_water_out_left) out.push("Water left off tee");
  if (h.tee_water_out_right) out.push("Water right off tee");
  if (h.tee_water_out_across) out.push("Water across fairway");
  if (h.tee_tree_hazard_left) out.push("Trees L");
  if (h.tee_tree_hazard_right) out.push("Trees R");
  if (h.tee_bunkers_left) out.push("Fairway bunkers L");
  if (h.tee_bunkers_right) out.push("Fairway bunkers R");
  if (h.approach_water_out_short) out.push("Water short of green");
  if (h.approach_water_out_long) out.push("Water long");
  if (h.approach_bunker_short_middle || h.approach_bunker_short_left || h.approach_bunker_short_right)
    out.push("Greenside bunkers short");
  return out.slice(0, 4);
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default"|"green"|"clay"|"warn"|"ghost" }) {
  const tones: Record<string, { bg: string; bd: string; fg: string }> = {
    default: { bg: "var(--paper-alt)", bd: "var(--line)", fg: "var(--ink-soft)" },
    green:   { bg: "var(--green-soft)", bd: "var(--green)", fg: "var(--green-deep)" },
    clay:    { bg: "var(--accent-soft)", bd: "var(--accent)", fg: "#6a3f1a" },
    warn:    { bg: "#f6e4d6", bd: "var(--bad)", fg: "var(--bad)" },
    ghost:   { bg: "transparent", bd: "var(--line)", fg: "var(--muted)" },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
      padding: "3px 9px", borderRadius: 999,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
    }}>{children}</span>
  );
}

export function PlanHoleCard({ hole, strategy, expanded, onToggle, highlight }: Props) {
  const parColor = hole.par === 3 ? "var(--accent)" : hole.par === 5 ? "var(--green)" : "var(--ink-soft)";
  const hazards = hazardList(hole);
  const risk = hazards.length >= 2 ? "high" : hazards.length === 1 ? "med" : "low";

  const riskChip =
    risk === "high" ? <Chip tone="warn">⚠ heads up</Chip> :
    risk === "med"  ? <Chip tone="clay">watch {hazards[0]?.split(" ")[0].toLowerCase()}</Chip> :
                      <Chip tone="ghost">clean look</Chip>;

  return (
    <div style={{
      background: highlight ? "var(--paper-alt)" : "var(--paper)",
      border: highlight ? "1px solid var(--accent)" : "1px solid var(--line)",
      borderRadius: 10, overflow: "hidden", transition: "all .2s ease",
    }}>
      <div onClick={onToggle} style={{
        display: "grid",
        gridTemplateColumns: "42px 1fr auto auto auto auto",
        alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer",
      }}>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, fontStyle: "italic",
          color: parColor, textAlign: "center", lineHeight: 1,
        }}>
          {hole.hole}
          <div style={{
            fontFamily: "var(--font-ui)", fontSize: 9, letterSpacing: 2, color: "var(--muted-2)",
            fontStyle: "normal", fontWeight: 600, marginTop: 3,
          }}>P{hole.par}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{hole.yards} yds</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>SI {hole.stroke_index}</span>
            {strategy.note && (
              <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>· {strategy.note}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {riskChip}
            {strategy.insight && <Chip tone="green">📖 {strategy.insight}</Chip>}
          </div>
        </div>
        <div style={{ textAlign: "center", minWidth: 68 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Tee</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--green-deep)", lineHeight: 1 }}>{strategy.pref}</div>
        </div>
        <div style={{ textAlign: "center", minWidth: 48 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Aim</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{strategy.aim}</div>
        </div>
        <div style={{ textAlign: "center", minWidth: 56 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Leaves</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{strategy.remaining ? `${strategy.remaining} yd` : "—"}</div>
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", width: 18, textAlign: "center" }}>{expanded ? "−" : "+"}</div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px dashed var(--line)", padding: "14px 16px", background: "var(--paper-alt)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Hazards</div>
              {hazards.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)", fontStyle: "italic" }}>Clean hole.</div>}
              {hazards.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--bad)" }}>●</span>{h}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Why this plan</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>{strategy.why}</div>
              {strategy.sample && (
                <div style={{ fontSize: 10, letterSpacing: 0.5, color: "var(--muted-2)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
                  based on {strategy.sample}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
