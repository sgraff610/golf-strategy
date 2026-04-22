// app/plan/PlanHoleCard.tsx
"use client";
import { useRef } from "react";
import type { HoleData } from "@/lib/types";
import type { HoleStrategy, PlanEnrichedHole } from "@/lib/planTypes";
import type { HoleClubStat } from "./page";

type Props = {
  hole: HoleData;
  strategy: HoleStrategy;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
  clubStats?: HoleClubStat[];
  enriched?: PlanEnrichedHole[]; // undefined = still loading, [] = loaded/no data
  onClubChange?: (club: string) => void;
  onAimChange?: (aim: HoleStrategy["aim"]) => void;
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

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "clay" | "warn" | "ghost" }) {
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

// ─── Aim dial ─────────────────────────────────────────────────────────────────

const AIM_OPTS = ["L", "LF", "CF", "RF", "R"] as const;
type AimPos = typeof AIM_OPTS[number];

function AimDial({ value, onChange, hole }: {
  value: AimPos;
  onChange: (v: AimPos) => void;
  hole: HoleData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const currentIdx = AIM_OPTS.indexOf(value);

  const leftHazard = hole.tee_water_out_left || hole.tee_tree_hazard_left || hole.tee_bunkers_left;
  const rightHazard = hole.tee_water_out_right || hole.tee_tree_hazard_right || hole.tee_bunkers_right;
  const acrossHazard = hole.tee_water_out_across;

  const getIdx = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return currentIdx;
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 4);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    onChange(AIM_OPTS[getIdx(e.clientX)]);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onChange(AIM_OPTS[getIdx(e.clientX)]);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    onChange(AIM_OPTS[getIdx(e.clientX)]);
  };

  const hazardForPos = (i: number) => {
    if (acrossHazard) return true;
    if (i <= 1 && leftHazard) return true;
    if (i >= 3 && rightHazard) return true;
    return false;
  };

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Aim
      </div>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "relative", display: "flex",
          border: "1px solid var(--line)", borderRadius: 999,
          background: "var(--paper-alt)", cursor: "ew-resize",
          userSelect: "none", touchAction: "none",
        }}
      >
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          width: "20%",
          left: `${currentIdx * 20}%`,
          background: "var(--ink)",
          borderRadius: 999,
          transition: "left 0.15s ease",
          pointerEvents: "none",
        }} />
        {AIM_OPTS.map((pos, i) => (
          <button
            key={pos}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(pos)}
            style={{
              flex: 1, position: "relative", zIndex: 1,
              padding: "9px 0", border: "none", background: "transparent",
              fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
              color: i === currentIdx ? "var(--paper)" : hazardForPos(i) ? "var(--bad)" : "var(--muted)",
              cursor: "pointer", transition: "color 0.15s ease",
            }}
          >
            {pos}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 5 }}>
        {AIM_OPTS.map((_, i) => {
          const danger = hazardForPos(i);
          const isLeft = i <= 1;
          const label =
            !danger ? null
            : acrossHazard ? "water"
            : isLeft
              ? (hole.tee_water_out_left ? "water" : hole.tee_tree_hazard_left ? "trees" : "bunker")
              : (hole.tee_water_out_right ? "water" : hole.tee_tree_hazard_right ? "trees" : "bunker");
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              {label && (
                <span style={{ fontSize: 8, color: "var(--bad)", letterSpacing: 0.5, fontWeight: 600 }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tee strategy grid ────────────────────────────────────────────────────────

const IRONS_LIST = ["4i","5i","6i","7i","8i","9i","PW","SW","LW","GW"];
function clubGroupForGrid(club: string): string {
  if (!club) return "Unknown";
  if (club === "Driver") return "Driver";
  if (club === "3W") return "3W";
  if (club === "5W") return "5W";
  if (club === "7W") return "7W";
  if (IRONS_LIST.includes(club)) return "Irons";
  return "Unknown";
}

type GridCol = { count: number; impact: number; likelihood: number };
type GridRowData = { club: string; count: number; overallPct: number; rowImpact: number; cols: GridCol[] };
type DirOverall = { dir: string; pct: number; impact: number; count: number };
type PlanGridData = {
  rows: GridRowData[];
  dirOveralls: DirOverall[];
  totalCount: number;
  baseline: number;
};

function wAvgE(holes: PlanEnrichedHole[], fn: (e: PlanEnrichedHole) => number): number {
  let n = 0, d = 0;
  for (const e of holes) { const v = fn(e); if (!isNaN(v)) { n += v * e.simScore; d += e.simScore; } }
  return d > 0 ? n / d : NaN;
}

function computePlanGrid(enriched: PlanEnrichedHole[]): PlanGridData {
  const CLUBS = ["Driver","3W","5W","7W","Irons"] as const;
  const DIRS = ["Left","Hit","Right"] as const;
  const total = enriched.length;
  const baseline = wAvgE(enriched, e => e.stp);

  const rows: GridRowData[] = CLUBS.map(club => {
    const clubHoles = enriched.filter(e => clubGroupForGrid(e.club) === club);
    const count = clubHoles.length;
    const overallPct = total > 0 ? count / total : 0;
    const rowAvg = wAvgE(clubHoles, e => e.stp);
    const rowImpact = isNaN(rowAvg) ? NaN : rowAvg - baseline;
    const cols: GridCol[] = DIRS.map(dir => {
      const dirHoles = clubHoles.filter(e => e.teeAccuracy === dir);
      const avg = wAvgE(dirHoles, e => e.stp);
      return {
        count: dirHoles.length,
        impact: isNaN(avg) ? NaN : avg - baseline,
        likelihood: count > 0 ? dirHoles.length / count : 0,
      };
    });
    return { club, count, overallPct, rowImpact, cols };
  });

  const dirOveralls: DirOverall[] = DIRS.map(dir => {
    const dirHoles = enriched.filter(e => e.teeAccuracy === dir);
    const dirAvg = wAvgE(dirHoles, e => e.stp);
    return {
      dir,
      pct: total > 0 ? dirHoles.length / total : 0,
      impact: isNaN(dirAvg) ? NaN : dirAvg - baseline,
      count: dirHoles.length,
    };
  });

  return { rows, dirOveralls, totalCount: total, baseline };
}

function impactBg(impact: number, count: number): { bg: string; fg: string } {
  if (isNaN(impact) || count === 0) return { bg: "transparent", fg: "var(--muted-2)" };
  const low = count <= 2;
  if (low) {
    if (impact > 0.1)  return { bg: "#f9e0e0", fg: "var(--ink-soft)" };
    if (impact < -0.1) return { bg: "#dff0e4", fg: "var(--ink-soft)" };
    return { bg: "var(--paper-alt)", fg: "var(--ink-soft)" };
  }
  if (impact >= 0.3)  return { bg: "var(--bad)", fg: "white" };
  if (impact >= 0.1)  return { bg: "#f1948a", fg: "var(--ink)" };
  if (impact > -0.1)  return { bg: "var(--paper-alt)", fg: "var(--ink)" };
  if (impact > -0.3)  return { bg: "var(--green-soft)", fg: "var(--green-deep)" };
  return { bg: "var(--green)", fg: "white" };
}

function fmt(n: number): string { return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2); }
function pct(n: number): string { return `${Math.round(n * 100)}%`; }

const DIR_TO_AIM: Record<string, HoleStrategy["aim"]> = {
  Left: "LF",
  Hit: "CF",
  Right: "RF",
};

function TeeStratGrid({ enriched, selected, hole, onChange, onAimChange }: {
  enriched: PlanEnrichedHole[];
  selected: string;
  hole: HoleData;
  onChange?: (club: string) => void;
  onAimChange?: (aim: HoleStrategy["aim"]) => void;
}) {
  const DIRS = ["Left", "Hit", "Right"] as const;
  const leftHazard = hole.tee_water_out_left || hole.tee_tree_hazard_left || hole.tee_bunkers_left;
  const rightHazard = hole.tee_water_out_right || hole.tee_tree_hazard_right || hole.tee_bunkers_right;

  if (enriched.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12, fontStyle: "italic", padding: "12px 0" }}>
        No similar holes found — not enough history yet.
      </div>
    );
  }

  const grid = computePlanGrid(enriched);

  // Normalize selected to a grid row key
  const selRow = clubGroupForGrid(selected) !== "Unknown" ? clubGroupForGrid(selected) : selected;

  const COL_TEMPLATE = "72px 1fr 1fr 1fr 52px";

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Tee club · {grid.totalCount} similar holes
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: COL_TEMPLATE, gap: 3, marginBottom: 3 }}>
        {["Club", "Left", "Hit", "Right", "Overall"].map((h, i) => (
          <div key={h} style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", textAlign: i === 0 ? "left" : "center", paddingLeft: i === 0 ? 6 : 0 }}>
            {h}
          </div>
        ))}
      </div>

      {/* Data rows */}
      {grid.rows.map(row => {
        const isSelected = selRow === row.club;
        const clubVal = row.club === "Irons" ? "6i" : row.club;
        return (
          <div
            key={row.club}
            style={{
              display: "grid", gridTemplateColumns: COL_TEMPLATE,
              gap: 3, marginBottom: 3,
              border: isSelected ? "1px solid var(--ink)" : "1px solid transparent",
              borderRadius: 6,
            }}
          >
            {/* Club name cell — click to select club only */}
            <div
              onClick={() => onChange?.(clubVal)}
              style={{
                background: isSelected ? "var(--ink)" : "var(--paper)",
                borderRadius: 6, padding: "4px 6px", cursor: "pointer",
                display: "flex", flexDirection: "column", justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "var(--paper)" : "var(--ink)" }}>{row.club}</div>
              <div style={{ fontSize: 9, color: isSelected ? "rgba(255,255,255,0.6)" : "var(--muted-2)" }}>{row.count}</div>
            </div>

            {/* Direction cells — click to select club + aim */}
            {row.cols.map((col, ci) => {
              const dir = DIRS[ci];
              const greyed = (dir === "Left" && !leftHazard) || (dir === "Right" && !rightHazard);
              if (greyed) {
                return (
                  <div key={ci} style={{ background: "var(--paper-alt)", borderRadius: 4, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--muted-2)" }}>N/A</span>
                  </div>
                );
              }
              const colors = isSelected
                ? { bg: "var(--green-soft)", fg: "var(--green-deep)" }
                : impactBg(col.impact, col.count);
              return (
                <div
                  key={ci}
                  onClick={() => { onChange?.(clubVal); onAimChange?.(DIR_TO_AIM[dir]); }}
                  style={{ background: colors.bg, borderRadius: 4, minHeight: 36, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
                >
                  {col.count > 0 ? (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: colors.fg }}>{isNaN(col.impact) ? "—" : fmt(col.impact)}</div>
                      <div style={{ fontSize: 9, color: colors.fg, opacity: 0.75 }}>{col.count}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 9, color: "var(--muted-2)" }}>—</div>
                  )}
                </div>
              );
            })}

            {/* Overall column — shows avg impact + usage % */}
            {(() => {
              const oColors = impactBg(row.rowImpact, row.count);
              return (
                <div style={{
                  background: isSelected ? "var(--ink)" : oColors.bg,
                  borderRadius: 4, minHeight: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  {row.count > 0 && !isNaN(row.rowImpact) ? (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isSelected ? "var(--paper)" : oColors.fg }}>{fmt(row.rowImpact)}</div>
                      <div style={{ fontSize: 9, color: isSelected ? "rgba(255,255,255,0.6)" : oColors.fg, opacity: 0.75 }}>{pct(row.overallPct)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "var(--paper)" : "var(--muted)" }}>{pct(row.overallPct)}</div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Overall row */}
      <div style={{ display: "grid", gridTemplateColumns: COL_TEMPLATE, gap: 3, marginTop: 4, borderTop: "1px dashed var(--line)", paddingTop: 4 }}>
        <div style={{ background: "var(--paper-alt)", borderRadius: 6, padding: "4px 6px", display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5 }}>Overall</div>
        </div>
        {grid.dirOveralls.map(({ dir, pct: p, impact, count }, i) => {
          const greyed = (dir === "Left" && !leftHazard) || (dir === "Right" && !rightHazard);
          if (greyed) {
            return (
              <div key={i} style={{ background: "var(--paper-alt)", borderRadius: 4, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 9, color: "var(--muted-2)" }}>N/A</span>
              </div>
            );
          }
          const dColors = impactBg(impact, count);
          return (
            <div key={i} style={{ background: dColors.bg, borderRadius: 4, minHeight: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {count > 0 && !isNaN(impact) ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: dColors.fg }}>{fmt(impact)}</div>
                  <div style={{ fontSize: 9, color: dColors.fg, opacity: 0.75 }}>{pct(p)}</div>
                </>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{pct(p)}</div>
              )}
            </div>
          );
        })}
        {/* Overall × Overall cell — blank */}
        <div />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function PlanHoleCard({ hole, strategy, expanded, onToggle, highlight, clubStats, enriched, onClubChange, onAimChange }: Props) {
  const parColor = hole.par === 3 ? "var(--accent)" : hole.par === 5 ? "var(--green)" : "var(--ink-soft)";
  const hazards = hazardList(hole);
  const risk = hazards.length >= 2 ? "high" : hazards.length === 1 ? "med" : "low";

  const riskChip =
    risk === "high" ? <Chip tone="warn">⚠ heads up</Chip> :
    risk === "med"  ? <Chip tone="clay">watch {hazards[0]?.split(" ")[0].toLowerCase()}</Chip> :
                      <Chip tone="ghost">clean look</Chip>;

  // History avg from clubStats (weighted by round count)
  const histTotal = clubStats?.reduce((s, c) => s + c.count, 0) ?? 0;
  const histAvg = histTotal > 0
    ? (clubStats!.reduce((s, c) => s + c.avgOverPar * c.count, 0) / histTotal)
    : NaN;

  // Similar holes avg from enriched
  const simAvg = enriched && enriched.length > 0 ? wAvgE(enriched, e => e.stp) : NaN;

  function fmtAvg(n: number) { return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1); }

  return (
    <div style={{
      background: highlight ? "var(--paper-alt)" : "var(--paper)",
      border: highlight ? "1px solid var(--accent)" : "1px solid var(--line)",
      borderRadius: 10, overflow: "hidden", transition: "all .2s ease",
    }}>
      {/* Summary row */}
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
            {!isNaN(histAvg) && (
              <Chip tone="ghost">{fmtAvg(histAvg)} avg</Chip>
            )}
            {!isNaN(simAvg) && (
              <Chip tone="ghost">sim holes {fmtAvg(simAvg)}</Chip>
            )}
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

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px dashed var(--line)", padding: "18px 16px", background: "var(--paper-alt)" }}>

          {/* Tee strategy — par 4 and 5 only */}
          {hole.par >= 4 && (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px dashed var(--line)" }}>
              {enriched === undefined ? (
                /* Still loading */
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--muted)", fontSize: 12, fontStyle: "italic" }}>
                  <div style={{ width: 14, height: 14, border: "2px solid var(--line)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading similar holes…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "start" }}>
                  <TeeStratGrid
                    enriched={enriched}
                    selected={strategy.pref}
                    hole={hole}
                    onChange={onClubChange}
                    onAimChange={onAimChange}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 160 }}>
                    <AimDial
                      value={strategy.aim as AimPos}
                      onChange={(aim) => onAimChange?.(aim)}
                      hole={hole}
                    />
                    {strategy.remaining > 0 && (
                      <div style={{ padding: "10px 14px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8 }}>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Leaves to green</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, fontStyle: "italic", color: "var(--ink)", lineHeight: 1 }}>
                          {strategy.remaining} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>yds</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hazards + Why */}
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
