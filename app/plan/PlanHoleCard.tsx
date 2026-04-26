// app/plan/PlanHoleCard.tsx
"use client";
import { useRef, useState } from "react";
import type { HoleData } from "@/lib/types";
import type { HoleStrategy, PlanEnrichedHole } from "@/lib/planTypes";
import type { HoleClubStat, HoleHistEntry } from "./page";

type Props = {
  hole: HoleData;
  strategy: HoleStrategy;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
  clubStats?: HoleClubStat[];
  enriched?: PlanEnrichedHole[]; // undefined = still loading, [] = loaded/no data
  holeHistory?: HoleHistEntry[];
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

function pillStyle(impact: number, count: number): { bg: string; fg: string; bd: string } {
  if (isNaN(impact) || count === 0) return { bg: "var(--paper-alt)", fg: "var(--muted-2)", bd: "var(--line)" };
  const low = count <= 2;
  if (low) {
    if (impact > 0.1)  return { bg: "#f9e0e0", fg: "var(--ink-soft)", bd: "#e0a0a0" };
    if (impact < -0.1) return { bg: "#dff0e4", fg: "var(--ink-soft)", bd: "var(--green)" };
    return { bg: "var(--paper-alt)", fg: "var(--ink-soft)", bd: "var(--line)" };
  }
  if (impact >= 0.3)  return { bg: "var(--bad)",       fg: "white",             bd: "var(--bad)" };
  if (impact >= 0.1)  return { bg: "#f1948a",           fg: "var(--ink)",        bd: "var(--bad)" };
  if (impact > -0.1)  return { bg: "var(--paper-alt)",  fg: "var(--ink)",        bd: "var(--line)" };
  if (impact > -0.3)  return { bg: "var(--green-soft)", fg: "var(--green-deep)", bd: "var(--green)" };
  return               { bg: "var(--green)",             fg: "white",             bd: "var(--green-deep)" };
}

/** Width in px based on count: min 36, max 96 at count ≥ 10 */
// Grid constants — derived so 3 dir pills + 1 overall pill exactly fill 300px total
// Club=42, gap=5×2, overall=60 → dir area=188 → 3×60+2×3=186 ≈ fills it
const GRID_CLUB_W  = 50;  // px (42 × 1.2)
const GRID_TOTAL_W = 420; // px
const PILL_MAX     = 90;  // px — (420-50-10)/4, fills columns when all maxed
const PILL_MIN     = 36;  // px — fits "+0.45" at 11px bold

/** Width scales from PILL_MIN (count 0) to PILL_MAX (count ≥ 10) */
function pillWidth(count: number): number {
  if (count === 0) return PILL_MIN;
  return Math.min(Math.round(PILL_MIN + (count / 10) * (PILL_MAX - PILL_MIN)), PILL_MAX);
}

/** Overall col: same range, driven by usage %, maxes at 25%+ */
function overallPillWidth(p: number): number {
  return Math.round(PILL_MIN + Math.min(p / 0.25, 1) * (PILL_MAX - PILL_MIN));
}

function fmt(n: number): string { return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2); }
function pct(n: number): string { return `${Math.round(n * 100)}%`; }

// ─── Impact pill ───────────────────────────────────────────────────────────────

function ImpactPill({ impact, count, width, hoverText, onClick, ghost }: {
  impact: number;
  count: number;
  width: number;
  hoverText: string;
  onClick?: () => void;
  ghost?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const s = ghost
    ? { bg: "transparent", fg: "var(--muted-2)", bd: "transparent" }
    : pillStyle(impact, count);
  const label = ghost ? "—" : isNaN(impact) ? "—" : fmt(impact);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        width, height: 22, borderRadius: 999,
        background: s.bg, border: `1px solid ${s.bd}`, color: s.fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden", whiteSpace: "nowrap", flexShrink: 0,
        transition: "width 0.15s ease",
        userSelect: "none",
      }}
    >
      {hovered && hoverText ? hoverText : label}
    </div>
  );
}

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
  const selRow = clubGroupForGrid(selected) !== "Unknown" ? clubGroupForGrid(selected) : selected;

  // Directions layout: 1fr auto 1fr keeps Hit anchored at center
  const DIR_COLS = "1fr auto 1fr";
  const LABEL_STYLE: React.CSSProperties = {
    fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)",
    fontWeight: 600, textTransform: "uppercase",
  };

  // Three-pill row centered on Hit
  function DirPills({ cols, clubVal }: {
    cols: GridCol[];
    clubVal: string | null; // null = overall row (no click action)
  }) {
    const [lCol, hCol, rCol] = cols;
    return (
      <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, alignItems: "center", gap: 3 }}>
        {/* Left */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {leftHazard
            ? <ImpactPill impact={lCol.impact} count={lCol.count} width={pillWidth(lCol.count)}
                hoverText={`${lCol.count}x`}
                onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("LF"); } : undefined} />
            : <ImpactPill impact={NaN} count={0} width={PILL_MIN} hoverText="" ghost />}
        </div>
        {/* Hit — always shown */}
        <ImpactPill impact={hCol.impact} count={hCol.count} width={pillWidth(hCol.count)}
          hoverText={`${hCol.count}x`}
          onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("CF"); } : undefined} />
        {/* Right */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {rightHazard
            ? <ImpactPill impact={rCol.impact} count={rCol.count} width={pillWidth(rCol.count)}
                hoverText={`${rCol.count}x`}
                onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("RF"); } : undefined} />
            : <ImpactPill impact={NaN} count={0} width={PILL_MIN} hoverText="" ghost />}
        </div>
      </div>
    );
  }

  const COL_TMPL = `${GRID_CLUB_W}px 1fr ${PILL_MAX}px`;

  return (
    <div style={{ maxWidth: GRID_TOTAL_W }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Tee club · {grid.totalCount} similar holes
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: COL_TMPL, gap: 5, marginBottom: 5, alignItems: "center" }}>
        <div style={{ ...LABEL_STYLE, paddingLeft: 4 }}>Club</div>
        <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, gap: 3, alignItems: "center" }}>
          <div style={{ ...LABEL_STYLE, textAlign: "right", paddingRight: 2 }}>Left</div>
          <div style={{ ...LABEL_STYLE, textAlign: "center" }}>Hit</div>
          <div style={{ ...LABEL_STYLE, textAlign: "left", paddingLeft: 2 }}>Right</div>
        </div>
        <div style={{ ...LABEL_STYLE, textAlign: "center" }}>Ovr</div>
      </div>

      {/* Data rows */}
      {grid.rows.map(row => {
        const isSelected = selRow === row.club;
        const clubVal = row.club === "Irons" ? "6i" : row.club;
        const oWidth = overallPillWidth(row.overallPct);
        const oStyle = pillStyle(row.rowImpact, row.count);

        return (
          <div key={row.club} style={{
            display: "grid", gridTemplateColumns: COL_TMPL,
            gap: 5, marginBottom: 3, alignItems: "center",
            border: isSelected ? "1px solid var(--ink)" : "1px solid transparent",
            borderRadius: 8, padding: "3px 0",
          }}>
            {/* Club name */}
            <div onClick={() => onChange?.(clubVal)} style={{
              background: isSelected ? "var(--ink)" : "var(--paper)",
              borderRadius: 6, padding: "3px 4px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "var(--paper)" : "var(--ink)" }}>
                {row.club}
              </span>
            </div>

            {/* Direction pills */}
            <DirPills cols={row.cols} clubVal={clubVal} />

            {/* Overall pill — center-justified in its fixed column */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ImpactPill
                impact={row.rowImpact} count={row.count}
                width={oWidth}
                hoverText={pct(row.overallPct)}
              />
            </div>
          </div>
        );
      })}

      {/* Overall row */}
      <div style={{
        display: "grid", gridTemplateColumns: COL_TMPL,
        gap: 5, marginTop: 5, paddingTop: 5,
        borderTop: "1px dashed var(--line)", alignItems: "center",
      }}>
        <div style={{ background: "var(--paper-alt)", borderRadius: 6, padding: "5px 4px", display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5 }}>Overall</span>
        </div>

        {/* Direction overalls centered on Hit */}
        <DirPills
          cols={grid.dirOveralls.map(d => ({ count: d.count, impact: d.impact, likelihood: d.pct }))}
          clubVal={null}
        />

        {/* Overall × Overall — blank */}
        <div />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function PlanHoleCard({ hole, strategy, expanded, onToggle, highlight, clubStats, holeHistory, enriched, onClubChange, onAimChange }: Props) {
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
            {holeHistory && holeHistory.length > 0 && (() => {
              const last = holeHistory[0];
              const tp = last.score - last.par;
              const tpStr = tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
              const tone = tp < 0 ? "green" : tp === 0 ? "ghost" : "ghost";
              return <Chip tone={tone}>last {last.score} ({tpStr})</Chip>;
            })()}
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
                <div style={{ display: "flex", gap: 36, alignItems: "flex-start" }}>
                  <TeeStratGrid
                    enriched={enriched}
                    selected={strategy.pref}
                    hole={hole}
                    onChange={onClubChange}
                    onAimChange={onAimChange}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 160, flexShrink: 0 }}>
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

          {/* Recent score history */}
          {holeHistory && holeHistory.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--line)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                Recent scores
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "90px 28px 36px auto auto", gap: "4px 12px", alignItems: "baseline" }}>
                {/* Header */}
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Date</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Score</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>+/-</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Club</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Tee</div>
                {holeHistory.slice(0, 6).map((entry, i) => {
                  const tp = entry.score - entry.par;
                  const tpStr = tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
                  const scoreColor = tp < 0 ? "var(--good)" : tp === 0 ? "var(--ink)" : tp === 1 ? "var(--muted)" : "var(--bad)";
                  const accColor = entry.tee_accuracy === "Hit" ? "var(--good)" : entry.tee_accuracy ? "var(--muted)" : "var(--muted-2)";
                  return (
                    <>
                      <div key={`d${i}`} style={{ fontSize: 11, color: "var(--muted)" }}>{entry.date}</div>
                      <div key={`s${i}`} style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{entry.score}</div>
                      <div key={`tp${i}`} style={{ fontSize: 11, color: scoreColor }}>{tpStr}</div>
                      <div key={`c${i}`} style={{ fontSize: 11, color: "var(--ink-soft)" }}>{entry.club || "—"}</div>
                      <div key={`a${i}`} style={{ fontSize: 11, color: accColor }}>{entry.tee_accuracy || "—"}</div>
                    </>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
