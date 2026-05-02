// app/plan/PlanHoleCard.tsx
"use client";
import React, { useRef, useState } from "react";
import type { HoleData } from "@/lib/types";
import type { HoleStrategy, PlanEnrichedHole, ClubDistances } from "@/lib/planTypes";
import { DEFAULT_CLUB_DISTANCES } from "@/lib/planTypes";
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
  clubDistances?: ClubDistances;
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

export function AimDial({ value, onChange, hole }: {
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

export function wAvgE(holes: PlanEnrichedHole[], fn: (e: PlanEnrichedHole) => number): number {
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

const GRID_CLUB_W  = 64;  // px
const GRID_TOTAL_W = 420; // px
const PILL_MAX     = 58;  // px
const PILL_MIN     = 36;  // px

/** All pills use equal fixed width */
function pillWidth(_count: number): number { return PILL_MAX; }
function overallPillWidth(_p: number): number { return PILL_MAX; }

function fmt(n: number): string { return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1); }
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

export function TeeStratGrid({ enriched, selected, hole, onChange, onAimChange }: {
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
      <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, alignItems: "center", gap: 8 }}>
        {/* Left */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {leftHazard && lCol.count > 0
            ? <ImpactPill impact={lCol.impact} count={lCol.count} width={pillWidth(lCol.count)}
                hoverText={`${lCol.count}x`}
                onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("LF"); } : undefined} />
            : <div style={{ width: PILL_MAX }} />}
        </div>
        {/* Hit */}
        {hCol.count > 0
          ? <ImpactPill impact={hCol.impact} count={hCol.count} width={pillWidth(hCol.count)}
              hoverText={`${hCol.count}x`}
              onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("CF"); } : undefined} />
          : <div style={{ width: PILL_MAX }} />}
        {/* Right */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {rightHazard && rCol.count > 0
            ? <ImpactPill impact={rCol.impact} count={rCol.count} width={pillWidth(rCol.count)}
                hoverText={`${rCol.count}x`}
                onClick={clubVal ? () => { onChange?.(clubVal); onAimChange?.("RF"); } : undefined} />
            : <div style={{ width: PILL_MAX }} />}
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
        <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, gap: 8, alignItems: "center" }}>
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
            border: isSelected ? "2px solid var(--ink)" : "1px solid transparent",
            borderRadius: 999, padding: isSelected ? "3px 6px" : "3px 0",
          }}>
            {/* Club name */}
            <div onClick={() => onChange?.(clubVal)} style={{
              background: isSelected ? "var(--ink)" : "var(--paper)",
              borderRadius: 999, padding: "4px 8px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: isSelected ? "none" : "1px solid var(--line)",
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
        <div style={{ background: "var(--paper-alt)", borderRadius: 999, padding: "5px 8px", display: "flex", justifyContent: "center", border: "1px solid var(--line)" }}>
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

// ─── Approach strategy grid (par 3) ──────────────────────────────────────────

function sortedClubOrder(clubDistances: ClubDistances): string[] {
  return Object.entries(clubDistances)
    .sort((a, b) => ((b[1].max + b[1].min) / 2) - ((a[1].max + a[1].min) / 2))
    .map(([k]) => k);
}

type ApproachRow = {
  label: string;
  isCenter?: boolean;
  isEdge?: boolean;
  count: number;
  overallPct: number;
  rowImpact: number;
  cols: GridCol[];
};

function computeApproachGrid(
  enriched: PlanEnrichedHole[],
  clubDistances: ClubDistances,
  anchorClub?: string
): { rows: ApproachRow[]; totalCount: number; baseline: number; longerClubs: string[]; shorterClubs: string[] } {
  const DIRS = ["Left", "Hit", "Right"] as const;
  const withClub = enriched.filter(e => e.approachClub);
  const total = withClub.length;
  const baseline = wAvgE(withClub, e => e.stp);

  const clubCounts: Record<string, number> = {};
  for (const e of withClub) {
    const c = e.approachClub!;
    clubCounts[c] = (clubCounts[c] ?? 0) + 1;
  }
  const mostCommon = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const ordered = sortedClubOrder(clubDistances);
  // Anchor: use the provided club if it's in the player's bag, otherwise fall back to most common
  const anchor = (anchorClub && ordered.includes(anchorClub)) ? anchorClub : mostCommon;
  if (!anchor) return { rows: [], totalCount: total, baseline, longerClubs: [], shorterClubs: [] };

  const idx = ordered.indexOf(anchor);
  const effectiveIdx = idx >= 0 ? idx : ordered.length;

  const row2Club = effectiveIdx > 0 ? ordered[effectiveIdx - 1] : null;
  const row4Club = effectiveIdx < ordered.length - 1 ? ordered[effectiveIdx + 1] : null;

  const row2Idx = row2Club ? ordered.indexOf(row2Club) : -1;
  const row4Idx = row4Club ? ordered.indexOf(row4Club) : ordered.length;
  const longerClubs = ordered.slice(0, Math.max(0, row2Idx)); // clubs longer than row 2
  const shorterClubs = ordered.slice(row4Idx + 1);            // clubs shorter than row 4
  const longerSet = new Set(longerClubs);
  const shorterSet = new Set(shorterClubs);

  function makeRow(label: string, filter: (e: PlanEnrichedHole) => boolean, opts?: { isCenter?: boolean; isEdge?: boolean }): ApproachRow {
    const holes = withClub.filter(filter);
    const count = holes.length;
    const overallPct = total > 0 ? count / total : 0;
    const rowAvg = wAvgE(holes, e => e.stp);
    const rowImpact = isNaN(rowAvg) ? NaN : rowAvg - baseline;
    const cols: GridCol[] = DIRS.map(dir => {
      const dh = holes.filter(e => e.approachAccuracy === dir);
      const avg = wAvgE(dh, e => e.stp);
      return { count: dh.length, impact: isNaN(avg) ? NaN : avg - baseline, likelihood: count > 0 ? dh.length / count : 0 };
    });
    return { label, count, overallPct, rowImpact, cols, ...opts };
  }

  const rows: ApproachRow[] = [
    makeRow("Longer", e => longerSet.has(e.approachClub!), { isEdge: true }),
    ...(row2Club ? [makeRow(row2Club, e => e.approachClub === row2Club)] : []),
    makeRow(anchor, e => e.approachClub === anchor, { isCenter: true }),
    ...(row4Club ? [makeRow(row4Club, e => e.approachClub === row4Club)] : []),
    makeRow("Shorter", e => shorterSet.has(e.approachClub!), { isEdge: true }),
  ];

  return { rows, totalCount: total, baseline, longerClubs, shorterClubs };
}

export function ApproachStratGrid({ enriched, clubDistances, selected, onChange }: {
  enriched: PlanEnrichedHole[];
  clubDistances: ClubDistances;
  selected?: string;
  onChange?: (club: string) => void;
}) {
  const [subpick, setSubpick] = useState<"longer" | "shorter" | null>(null);
  const withClub = enriched.filter(e => e.approachClub);

  if (enriched.length === 0 || withClub.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12, fontStyle: "italic", padding: "12px 0" }}>
        {enriched.length === 0
          ? "No similar holes found — not enough history yet."
          : "No approach club data recorded yet."}
      </div>
    );
  }

  // anchor = selected club so the plan's recommended club is always row 3
  const grid = computeApproachGrid(enriched, clubDistances, selected);
  if (grid.rows.length === 0) {
    return <div style={{ color: "var(--muted)", fontSize: 12, fontStyle: "italic", padding: "12px 0" }}>Not enough approach data yet.</div>;
  }

  const DIR_COLS = "1fr auto 1fr";
  const COL_TMPL = `${GRID_CLUB_W}px 1fr ${PILL_MAX}px`;
  const LABEL_STYLE: React.CSSProperties = {
    fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase",
  };

  function DirPills({ cols, onPick }: { cols: GridCol[]; onPick?: () => void }) {
    const [lCol, hCol, rCol] = cols;
    return (
      <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {lCol.count > 0
            ? <ImpactPill impact={lCol.impact} count={lCol.count} width={PILL_MAX} hoverText={`${lCol.count}×`} onClick={onPick} />
            : <div style={{ width: PILL_MAX }} />}
        </div>
        {hCol.count > 0
          ? <ImpactPill impact={hCol.impact} count={hCol.count} width={PILL_MAX} hoverText={`${hCol.count}×`} onClick={onPick} />
          : <div style={{ width: PILL_MAX }} />}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {rCol.count > 0
            ? <ImpactPill impact={rCol.impact} count={rCol.count} width={PILL_MAX} hoverText={`${rCol.count}×`} onClick={onPick} />
            : <div style={{ width: PILL_MAX }} />}
        </div>
      </div>
    );
  }

  function SubpickPanel({ clubs }: { clubs: string[] }) {
    return (
      <div style={{ padding: "8px 10px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
          Pick a club:
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {clubs.map(club => (
            <button
              key={club}
              onClick={() => { onChange?.(club); setSubpick(null); }}
              style={{
                background: club === selected ? "var(--ink)" : "var(--paper-alt)",
                color: club === selected ? "var(--paper)" : "var(--ink)",
                border: "1px solid var(--line)", borderRadius: 999,
                padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >{club}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: GRID_TOTAL_W }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Approach club · {grid.totalCount} similar holes
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: COL_TMPL, gap: 5, marginBottom: 5, alignItems: "center" }}>
        <div style={{ ...LABEL_STYLE, paddingLeft: 4 }}>Club</div>
        <div style={{ display: "grid", gridTemplateColumns: DIR_COLS, gap: 8, alignItems: "center" }}>
          <div style={{ ...LABEL_STYLE, textAlign: "right", paddingRight: 2 }}>Left</div>
          <div style={{ ...LABEL_STYLE, textAlign: "center" }}>Hit</div>
          <div style={{ ...LABEL_STYLE, textAlign: "left", paddingLeft: 2 }}>Right</div>
        </div>
        <div style={{ ...LABEL_STYLE, textAlign: "center" }}>Ovr</div>
      </div>

      {/* Rows */}
      {grid.rows.map(row => {
        const handleClick = row.isEdge
          ? (e: React.MouseEvent) => { e.stopPropagation(); setSubpick(prev => { const t = row.label === "Longer" ? "longer" : "shorter"; return prev === t ? null : t; }); }
          : (e: React.MouseEvent) => { e.stopPropagation(); onChange?.(row.label); };

        return (
          <React.Fragment key={row.label}>
            <div
              onClick={handleClick}
              style={{
                display: "grid", gridTemplateColumns: COL_TMPL,
                gap: 5, marginBottom: 3, alignItems: "center",
                border: row.isCenter ? "2px solid var(--ink)" : "1px solid transparent",
                borderRadius: 999, padding: row.isCenter ? "3px 6px" : "3px 0",
                cursor: "pointer",
              }}
            >
              <div style={{
                background: row.isCenter ? "var(--ink)" : row.isEdge ? "var(--paper-alt)" : "var(--paper)",
                borderRadius: 999, padding: "4px 8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: row.isCenter ? "none" : "1px solid var(--line)",
              }}>
                <span style={{
                  fontSize: row.isEdge ? 9 : 11, fontWeight: 700,
                  color: row.isCenter ? "var(--paper)" : "var(--ink)",
                  fontStyle: row.isEdge ? "italic" : "normal",
                }}>
                  {row.label}{row.isEdge ? " ▾" : ""}
                </span>
              </div>
              <DirPills
                cols={row.cols}
                onPick={row.isEdge ? undefined : () => onChange?.(row.label)}
              />
              <div style={{ display: "flex", justifyContent: "center" }}>
                <ImpactPill impact={row.rowImpact} count={row.count} width={PILL_MAX} hoverText={pct(row.overallPct)} />
              </div>
            </div>

            {row.label === "Longer" && subpick === "longer" && grid.longerClubs.length > 0 && (
              <SubpickPanel clubs={grid.longerClubs} />
            )}
            {row.label === "Shorter" && subpick === "shorter" && grid.shorterClubs.length > 0 && (
              <SubpickPanel clubs={grid.shorterClubs} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Approach accuracy radial (par 3) ────────────────────────────────────────

const ACC_DIRS = ["Hit", "Long", "Short", "Left", "Right"] as const;
type AccDir = typeof ACC_DIRS[number];

function AccPill({ label, impact, count }: { label: string; impact: number; count: number }) {
  const [hovered, setHovered] = useState(false);
  const s = count === 0
    ? { bg: "var(--paper-alt)", fg: "var(--muted-2)", bd: "var(--line)" }
    : pillStyle(impact, count);
  const display = hovered ? `${count}×` : count === 0 ? "—" : isNaN(impact) ? "—" : fmt(impact);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: s.bg, border: `1px solid ${s.bd}`, color: s.fg,
        borderRadius: 999, padding: "5px 10px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
        minWidth: 52, cursor: "default", userSelect: "none",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.65 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{display}</span>
    </div>
  );
}

function ApproachAccuracyRadial({ enriched, selectedClub }: {
  enriched: PlanEnrichedHole[];
  selectedClub: string;
}) {
  const clubHoles = enriched.filter(e => e.approachClub === selectedClub);
  if (clubHoles.length === 0) return null;

  const baseline = wAvgE(clubHoles, e => e.stp);
  const stats = Object.fromEntries(ACC_DIRS.map(dir => {
    const holes = clubHoles.filter(e => e.approachAccuracy === dir);
    const avg = wAvgE(holes, e => e.stp);
    return [dir, { count: holes.length, impact: isNaN(avg) ? NaN : avg - baseline }] as [AccDir, { count: number; impact: number }];
  }));

  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>
        {selectedClub} · miss distribution
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", gridTemplateRows: "auto auto auto", gap: 6, placeItems: "center" }}>
        {/* Row 0 */}
        <div />
        <AccPill label="Far" impact={stats.Long.impact} count={stats.Long.count} />
        <div />
        {/* Row 1 */}
        <AccPill label="Left" impact={stats.Left.impact} count={stats.Left.count} />
        <AccPill label="Hit" impact={stats.Hit.impact} count={stats.Hit.count} />
        <AccPill label="Right" impact={stats.Right.impact} count={stats.Right.count} />
        {/* Row 2 */}
        <div />
        <AccPill label="Short" impact={stats.Short.impact} count={stats.Short.count} />
        <div />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function PlanHoleCard({ hole, strategy, expanded, onToggle, highlight, clubStats, holeHistory, enriched, clubDistances, onClubChange, onAimChange }: Props) {
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
              return <Chip tone={tone}>last ({tpStr})</Chip>;
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

          {/* Strategy grid — approach club for par 3, tee club for par 4/5 */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px dashed var(--line)" }}>
              {enriched === undefined ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--muted)", fontSize: 12, fontStyle: "italic" }}>
                  <div style={{ width: 14, height: 14, border: "2px solid var(--line)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading similar holes…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : hole.par === 3 ? (
                <div style={{ display: "flex", gap: 36, alignItems: "flex-start" }}>
                  <ApproachStratGrid
                    enriched={enriched}
                    clubDistances={clubDistances ?? DEFAULT_CLUB_DISTANCES}
                    selected={strategy.pref}
                    onChange={onClubChange}
                  />
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexShrink: 0 }}>
                    <div style={{ minWidth: 160 }}>
                      <AimDial
                        value={strategy.aim as AimPos}
                        onChange={(aim) => onAimChange?.(aim)}
                        hole={hole}
                      />
                    </div>
                    <ApproachAccuracyRadial
                      enriched={enriched}
                      selectedClub={strategy.pref}
                    />
                  </div>
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
              <div style={{ display: "grid", gridTemplateColumns: "90px 28px 36px auto", gap: "4px 12px", alignItems: "baseline" }}>
                {/* Header */}
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Date</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>Score</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>+/-</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>{hole.par === 3 ? "Appr · Acc" : "Club · Tee"}</div>
                {holeHistory.slice(0, 6).map((entry, i) => {
                  const tp = entry.score - entry.par;
                  const tpStr = tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
                  const scoreColor = tp < 0 ? "var(--good)" : tp === 0 ? "var(--ink)" : tp === 1 ? "var(--muted)" : "var(--bad)";
                  const clubVal = hole.par === 3 ? (entry.appr_distance || "—") : (entry.club || "—");
                  const accVal  = hole.par === 3 ? (entry.appr_accuracy || "") : (entry.tee_accuracy || "");
                  const accColor = accVal === "Hit" ? "var(--good)" : accVal ? "var(--muted)" : "var(--muted-2)";
                  return (
                    <React.Fragment key={i}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{entry.date}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{entry.score}</div>
                      <div style={{ fontSize: 11, color: scoreColor }}>{tpStr}</div>
                      <div style={{ fontSize: 11, display: "flex", gap: 5, alignItems: "baseline" }}>
                        <span style={{ color: "var(--ink-soft)" }}>{clubVal}</span>
                        {accVal && <span style={{ color: accColor, fontSize: 10 }}>· {accVal}</span>}
                      </div>
                    </React.Fragment>
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
