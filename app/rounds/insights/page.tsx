"use client";
import React, { useState, useEffect, useMemo } from "react";
import FocusBoard from "./coach/FocusBoard";
import IronsWedges from "./coach/clubs/IronsWedges";
import type { Leak as FBLeak, Strength as FBStrength } from "./coach/leaks";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";
import { useIsMobile } from "@/app/hooks/useIsMobile";
import { HoleData } from "@/lib/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
  ComposedChart, ScatterChart, Scatter,
  BarChart, Bar, Cell,
} from "recharts";

// ── Performance grade helpers ────────────────────────────────────────────────
const INS_DIST_ORDER = ["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"];
const INS_PUTT_FB: Record<string,number> = {
  "Gimme":1.00,"3ft":1.07,"5ft":1.28,"7ft":1.52,"10ft":1.75,
  "15ft":1.90,"20ft":1.97,"30ft":2.05,"40ft":2.12,"50ft":2.18,"50+":2.23,
};
const INS_IRON_CLUBS = ["4i","5i","6i","7i","8i","9i","PW","GW","SW","LW"];
const INS_DIST_FT: Record<string,number> = {
  "Gimme":1,"3ft":3,"5ft":5,"7ft":7,"10ft":10,
  "15ft":15,"20ft":20,"30ft":30,"40ft":40,"50ft":50,"50+":60,
};

type PerfGrade = { letter: string; color: string; bg: string; detail: string };
type RoundGrades = { driver: PerfGrade | null; iron: PerfGrade | null; chipping: PerfGrade | null; putter: PerfGrade | null };

function insSG(sg: number)       { return sg>=3?"A+":sg>=1.5?"A":sg>=0?"B":sg>=-1.5?"C":sg>=-3?"D":"F"; }
function insDriver(d: number)    { return d>=15?"A+":d>=8?"A":d>=-5?"B":d>=-15?"C":d>=-25?"D":"F"; }
function insChip(ccs: number)    { return ccs>=2?"A+":ccs>=1?"A":ccs>=0?"B":ccs>=-1?"C":ccs>=-2?"D":"F"; }
function insIron(delta: number)  { return delta>=2?"A+":delta>=1?"A":delta>=0?"B":delta>=-1?"C":delta>=-2?"D":"F"; }

const GRADE_BG: Record<string,{bg:string;color:string}> = {
  "A+": {bg:"#0f6e56",color:"#fff"}, "A": {bg:"#27ae60",color:"#fff"},
  "B":  {bg:"#2980b9",color:"#fff"}, "C": {bg:"#f5c842",color:"#333"},
  "D":  {bg:"#e67e22",color:"#fff"}, "F": {bg:"#c0392b",color:"#fff"},
};

function computeInsightGrades(allRounds: any[], ri: number): RoundGrades {
  const round = allRounds[ri];
  const allHoles = allRounds.flatMap((r: any) => r.holes ?? []);
  const rh: any[] = round.holes ?? [];

  // Putter
  const puttBase: Record<string,number> = { ...INS_PUTT_FB };
  for (const dist of INS_DIST_ORDER) {
    const hs = allHoles.filter((h: any) => h.first_putt_distance === dist && Number(h.putts) > 0);
    if (hs.length >= 5) puttBase[dist] = hs.reduce((s: number, h: any) => s + Number(h.putts), 0) / hs.length;
  }
  const putterH = rh.filter(h => h.first_putt_distance && puttBase[h.first_putt_distance] != null && Number(h.putts) > 0);
  let putter: PerfGrade | null = null;
  if (putterH.length >= 3) {
    const exp = putterH.reduce((s: number, h: any) => s + puttBase[h.first_putt_distance], 0);
    const act = putterH.reduce((s: number, h: any) => s + Number(h.putts), 0);
    const sg = Math.round((exp - act) * 10) / 10;
    const letter = insSG(sg);
    putter = { ...GRADE_BG[letter], letter, detail: `${sg>=0?"+":""}${sg} strokes vs avg (${putterH.length} holes)` };
  }

  // Iron
  const ironBase: Record<string,number> = {};
  for (const club of INS_IRON_CLUBS) {
    const shots = allHoles.filter((h: any) => h.appr_distance === club && h.appr_accuracy && h.appr_accuracy !== "");
    if (shots.length >= 3) ironBase[club] = shots.filter((h: any) => h.appr_accuracy === "Hit").length / shots.length;
  }
  const ironShots = rh.filter((h: any) => INS_IRON_CLUBS.includes(h.appr_distance) && h.appr_accuracy && h.appr_accuracy !== "" && ironBase[h.appr_distance] != null);
  let iron: PerfGrade | null = null;
  if (ironShots.length >= 3) {
    const exp = ironShots.reduce((s: number, h: any) => s + (ironBase[h.appr_distance] ?? 0), 0);
    const act = ironShots.filter((h: any) => h.appr_accuracy === "Hit").length;
    const delta = Math.round((act - exp) * 10) / 10;
    const letter = insIron(delta);
    iron = { ...GRADE_BG[letter], letter, detail: `${delta>=0?"+":""}${delta} greens vs avg (${ironShots.length} shots)` };
  }

  // Chipping
  const apr26 = allRounds.filter((r: any) => r.date >= "2026-04-01");
  let totalExtra = 0, chipRounds = 0, totalProxFt = 0, totalProxHoles = 0;
  for (const r of apr26) {
    const hs: any[] = r.holes ?? [];
    const norm = (r.holes_played ?? hs.length) <= 9 ? 2 : 1;
    const extra = hs.filter((h: any) => (Number(h.chips)||0)+(Number(h.greenside_bunker)||0)>=2).length * norm;
    const proxH = hs.filter((h: any) => (Number(h.chips)||0)+(Number(h.greenside_bunker)||0)>=1 && INS_DIST_FT[h.first_putt_distance] != null);
    if (proxH.length >= 1) {
      totalExtra += extra; chipRounds++;
      totalProxFt += proxH.reduce((s: number, h: any) => s + INS_DIST_FT[h.first_putt_distance], 0);
      totalProxHoles += proxH.length;
    }
  }
  let chipping: PerfGrade | null = null;
  if (chipRounds >= 2 && round.date >= "2026-04-01") {
    const baseExtra = totalExtra / chipRounds;
    const baseProx = totalProxHoles > 0 ? totalProxFt / totalProxHoles : null;
    const norm = (round.holes_played ?? rh.length) <= 9 ? 2 : 1;
    const roundExtra = rh.filter((h: any) => (Number(h.chips)||0)+(Number(h.greenside_bunker)||0)>=2).length * norm;
    const roundProxH = rh.filter((h: any) => (Number(h.chips)||0)+(Number(h.greenside_bunker)||0)>=1 && INS_DIST_FT[h.first_putt_distance] != null);
    if (roundProxH.length >= 2) {
      const roundProx = roundProxH.reduce((s: number, h: any) => s + INS_DIST_FT[h.first_putt_distance], 0) / roundProxH.length;
      const ccs = Math.round((baseExtra - roundExtra + (baseProx != null ? (baseProx - roundProx) * 0.08 : 0)) * 10) / 10;
      const letter = insChip(ccs);
      chipping = { ...GRADE_BG[letter], letter, detail: `${ccs>=0?"+":""}${ccs} composite · ${Math.round(roundProx*10)/10}ft avg` };
    }
  }

  // Driver
  const last50 = [...allRounds].sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 50);
  const base = last50.reduce((acc: {hit:number;total:number}, r: any) => {
    const dh = (r.holes ?? []).filter((h: any) => h.par === 4 || h.par === 5);
    acc.hit += dh.filter((h: any) => h.tee_accuracy === "Hit").length;
    acc.total += dh.length;
    return acc;
  }, { hit: 0, total: 0 });
  let driver: PerfGrade | null = null;
  if (base.total >= 20) {
    const baseFIR = (base.hit / base.total) * 100;
    const dh = rh.filter((h: any) => h.par === 4 || h.par === 5);
    if (dh.length >= 2) {
      const hit = dh.filter((h: any) => h.tee_accuracy === "Hit").length;
      const fir = (hit / dh.length) * 100;
      const delta = Math.round((fir - baseFIR) * 10) / 10;
      const letter = insDriver(delta);
      driver = { ...GRADE_BG[letter], letter, detail: `${hit}/${dh.length} FIR (${Math.round(fir)}%) · ${delta>=0?"+":""}${delta}pp vs avg` };
    }
  }

  return { driver, iron, chipping, putter };
}

// Grade letter → approximate per-hole stroke impact (negative = costs strokes)
const GRADE_LEAK_IMPACT: Record<string, number> = { "C": 0.08, "D": 0.22, "F": 0.40 };

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";
type CellValue = 0 | 1 | 2;

type GreensideFilter = {
  long_left: CellValue; long_middle: CellValue; long_right: CellValue;
  middle_left: CellValue; middle_right: CellValue;
  short_left: CellValue; short_middle: CellValue; short_right: CellValue;
};

const defaultGreensideFilter = (): GreensideFilter => ({
  long_left: 0, long_middle: 0, long_right: 0,
  middle_left: 0, middle_right: 0,
  short_left: 0, short_middle: 0, short_right: 0,
});

type EnrichedHole = {
  hole: number; par: number; score: number;
  tee_accuracy: TeeAccuracy; appr_accuracy: TeeAccuracy;
  appr_distance: string; club: string;
  chips: number | null;
  putts: number; first_putt_distance: string;
  greenside_bunker: number;
  green_depth: number;
  approach_bunker: GreensideFilter;
  approach_green: GreensideFilter;
  water_penalty: number; drop_or_out: number; tree_haz: number; fairway_bunker: number;
  drive_water_ob_pct: number; drive_tree_pct: number; drive_bunker_pct: number;
  courseId: string; courseName: string;
  tee_tree_left: boolean; tee_tree_right: boolean; tee_tree_across: boolean;
  tee_bunker_left: boolean; tee_bunker_right: boolean;
  tee_water_left: boolean; tee_water_right: boolean; tee_water_across: boolean;
  appr_tree_left: boolean; appr_tree_right: boolean; appr_tree_long: boolean; appr_tree_across: boolean;
  appr_water_left: boolean; appr_water_right: boolean; appr_water_short: boolean; appr_water_long: boolean;
  stroke_index: number; rating: number | null; slope: number | null;
  roundIndex: number; year: number;
  gir: boolean; grints: boolean;
  yards: number;
  dogleg: string;
  appr_dist_num: number;
  roundDiff: number | null;
};

type RoundSummary = {
  idx: number;
  date: string;
  courseId: string;
  courseName: string;
  score: number;
  par: number;
  toPar: number;
  diff: number | null;
  girPct: number;
  fwPct: number;
  avgPutts: number;
  totalHoles: number;
};

type TrendMetric = "toPar" | "score" | "diff" | "girPct" | "fwPct" | "avgPutts";
const TREND_METRICS: { val: TrendMetric; label: string }[] = [
  { val: "toPar",    label: "Score vs Par" },
  { val: "score",    label: "Gross Score" },
  { val: "diff",     label: "Differential" },
  { val: "girPct",   label: "GIR %" },
  { val: "fwPct",    label: "Fairway %" },
  { val: "avgPutts", label: "Avg Putts" },
];

type Filters = {
  driveAcc: Set<string>; apprAcc: Set<string>;
  drivingClubs: Set<string>; apprClubs: Set<string>;
  highWater: boolean; highTree: boolean; highBunker: boolean;
  courseId: string; pars: Set<string>;
  teeTreeLeft: boolean; teeTreeRight: boolean; teeTreeAcross: boolean;
  teeBunkerLeft: boolean; teeBunkerRight: boolean;
  teeWaterLeft: boolean; teeWaterRight: boolean; teeWaterAcross: boolean;
  apprTreeLeft: boolean; apprTreeRight: boolean; apprTreeLong: boolean; apprTreeAcross: boolean;
  apprWaterLeft: boolean; apprWaterRight: boolean; apprWaterShort: boolean; apprWaterLong: boolean;
  siMin: string; siMax: string;
  ratingMin: string; ratingMax: string;
  slopeMin: string; slopeMax: string;
  years: Set<string>;
  gsBunker: boolean; girOnly: boolean; nonGirOnly: boolean;
  puttsMin: string; puttsMax: string;
  chipsMin: string; chipsMax: string;
  firstPutt: string;
  greenDepth: string;
  gsPositionFilter: GreensideFilter;
  gsSurface: "any" | "rough" | "green" | "bunker";
  yardsBucket: string;
  siTierFilter: string;
  doglegFilter: string;
  apprDistBucket: string;
  holeCluster: string;
  impactDir: "all" | "positive" | "negative";
  diffBucket: Set<string>;
};

const DEFAULT_FILTERS: Filters = {
  driveAcc: new Set(), apprAcc: new Set(),
  drivingClubs: new Set(), apprClubs: new Set(),
  highWater: false, highTree: false, highBunker: false,
  courseId: "", pars: new Set(),
  teeTreeLeft: false, teeTreeRight: false, teeTreeAcross: false,
  teeBunkerLeft: false, teeBunkerRight: false,
  teeWaterLeft: false, teeWaterRight: false, teeWaterAcross: false,
  apprTreeLeft: false, apprTreeRight: false, apprTreeLong: false, apprTreeAcross: false,
  apprWaterLeft: false, apprWaterRight: false, apprWaterShort: false, apprWaterLong: false,
  siMin: "", siMax: "", ratingMin: "", ratingMax: "", slopeMin: "", slopeMax: "",
  years: new Set(), gsBunker: false, girOnly: false, nonGirOnly: false,
  puttsMin: "", puttsMax: "", chipsMin: "", chipsMax: "", firstPutt: "",
  greenDepth: "", gsPositionFilter: defaultGreensideFilter(), gsSurface: "any" as const,
  yardsBucket: "", siTierFilter: "", doglegFilter: "", apprDistBucket: "", holeCluster: "",
  impactDir: "all",
  diffBucket: new Set(),
};

const DIFF_BUCKETS = [
  { label: "< 7",     val: "lt7",    test: (d: number) => d < 7 },
  { label: "7–9.9",   val: "7-9.9",  test: (d: number) => d >= 7 && d < 10 },
  { label: "10–12.9", val: "10-12.9",test: (d: number) => d >= 10 && d < 13 },
  { label: "13–15.9", val: "13-15.9",test: (d: number) => d >= 13 && d < 16 },
  { label: "16–18.9", val: "16-18.9",test: (d: number) => d >= 16 && d < 19 },
  { label: "19–21.9", val: "19-21.9",test: (d: number) => d >= 19 && d < 22 },
  { label: "22+",     val: "22plus", test: (d: number) => d >= 22 },
];

const DRIVE_CLUBS    = ["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const APPROACH_CLUBS = ["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const PUTT_DISTANCES = ["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"];

const GS_SEGMENTS = [
  { key: "long_left" as keyof GreensideFilter,    abbr: "FL", angle: 315 },
  { key: "long_middle" as keyof GreensideFilter,  abbr: "F",  angle: 0   },
  { key: "long_right" as keyof GreensideFilter,   abbr: "FR", angle: 45  },
  { key: "middle_right" as keyof GreensideFilter, abbr: "R",  angle: 90  },
  { key: "short_right" as keyof GreensideFilter,  abbr: "SR", angle: 135 },
  { key: "short_middle" as keyof GreensideFilter, abbr: "S",  angle: 180 },
  { key: "short_left" as keyof GreensideFilter,   abbr: "SL", angle: 225 },
  { key: "middle_left" as keyof GreensideFilter,  abbr: "L",  angle: 270 },
];

const CX = 80, CY = 80, R_INNER = 38, R_OUTER = 67, GAP = 3.5, SPAN = 45;
function toRad(d: number) { return d * Math.PI / 180; }
function polar(angleDeg: number, r: number) {
  const rad = toRad(90 - angleDeg);
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}
function arcPath(ca: number, ri: number, ro: number) {
  const h = SPAN / 2 - GAP / 2;
  const s1 = polar(ca - h, ro), e1 = polar(ca + h, ro);
  const s2 = polar(ca + h, ri), e2 = polar(ca - h, ri);
  return `M ${s1.x} ${s1.y} A ${ro} ${ro} 0 0 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${ri} ${ri} 0 0 0 ${e2.x} ${e2.y} Z`;
}
function labelPos(ca: number) {
  const r = R_INNER + (R_OUTER - R_INNER) * 0.5;
  return polar(ca, r);
}
const GS_COLORS: Record<CellValue, { fill: string; text: string }> = {
  0: { fill: "#e8e8e8", text: "#666" },
  1: { fill: "#0f6e56", text: "#fff" },
  2: { fill: "#c8a84b", text: "#fff" },
};

function GreensideDial({ value, onChange }: { value: GreensideFilter; onChange: (v: GreensideFilter) => void }) {
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 10, color: "#999", margin: "0 0 4px", fontStyle: "italic" }}>
        Tap to select greenside position
      </p>
      <svg viewBox="0 0 200 190" style={{ width: "100%", maxWidth: 200, height: "auto", display: "block" }}>
        <text x={CX} y={CY - R_OUTER - 6} textAnchor="middle" fontSize={8} fontStyle="italic" fill="#999">↑ Far</text>
        <text x={CX - R_OUTER - 6} y={CY + 3} textAnchor="end" fontSize={8} fontStyle="italic" fill="#999">← L</text>
        <text x={CX + R_OUTER + 6} y={CY + 3} textAnchor="start" fontSize={8} fontStyle="italic" fill="#999">R →</text>
        {GS_SEGMENTS.map(seg => {
          const v = value[seg.key];
          const active = v === 1;
          const fill = active ? "#0f6e56" : "#e8e8e8";
          const textFill = active ? "#fff" : "#666";
          const lp = labelPos(seg.angle);
          const d = arcPath(seg.angle, R_INNER + 2, R_OUTER);
          return (
            <g key={seg.key} onClick={() => onChange({ ...value, [seg.key]: (active ? 0 : 1) as CellValue })} style={{ cursor: "pointer" }}>
              <path d={d} fill={fill} stroke="#fff" strokeWidth={1.5} style={{ transition: "fill 0.15s" }} />
              <text x={lp.x} y={lp.y + 3} textAnchor="middle" fontSize={8} fontWeight={500} fill={textFill} style={{ pointerEvents: "none" }}>{seg.abbr}</text>
              <path d={d} fill="transparent" stroke="none" style={{ pointerEvents: "all" }} />
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={R_INNER} fill="#0f6e56" style={{ pointerEvents: "none" }} />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={13} style={{ pointerEvents: "none" }}>🚩</text>
        <text x={CX} y={CY + 11} textAnchor="middle" fontSize={7} fontWeight={500} fill="#fff" style={{ pointerEvents: "none" }}>GREEN</text>
      </svg>
      <div style={{ textAlign: "center", fontSize: 9, color: "#999", fontStyle: "italic" }}>↓ Short</div>
    </div>
  );
}

const SURFACE_OPTIONS: { val: "rough" | "green" | "bunker"; label: string; color: string }[] = [
  { val: "rough",  label: "Rough",       color: "#7a5c3a" },
  { val: "green",  label: "Extra Green", color: "#0f6e56" },
  { val: "bunker", label: "Bunker",      color: "#c8a84b" },
];

function SurfacePicker({ value, onChange }: { value: "any" | "rough" | "green" | "bunker"; onChange: (v: "any" | "rough" | "green" | "bunker") => void }) {
  const active = SURFACE_OPTIONS.find(o => o.val === value);
  const centerColor = active?.color ?? "#e8e8e8";
  const centerLabel = active?.label ?? "Any";
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 10, color: "#999", margin: "0 0 8px", fontStyle: "italic" }}>
        Select surface type
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: centerColor,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "background 0.2s",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.2 }}>{centerLabel}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SURFACE_OPTIONS.map(opt => {
            const isActive = value === opt.val;
            return (
              <button
                key={opt.val}
                onClick={() => onChange(isActive ? "any" : opt.val)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "2px 0",
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: opt.color,
                  textDecoration: isActive ? "underline" : "none",
                  textAlign: "left",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function resolveChips(hole: any): number | null {
  if (hole.appr_accuracy === "Hit") return 0;
  if (hole.chips !== "" && hole.chips !== undefined && hole.chips !== null) return Number(hole.chips);
  return null;
}

function getGreensideFromHole(hole: any, prefix: string): GreensideFilter {
  const pos = ["long_left","long_middle","long_right","middle_left","middle_right","short_left","short_middle","short_right"] as const;
  const result = defaultGreensideFilter();
  for (const p of pos) {
    if (hole[`${prefix}_${p}`]) (result as any)[p] = prefix === "approach_bunker" ? 2 : 1;
  }
  return result;
}

function getDriveWaterPct(hole: any, ch: HoleData | undefined): number {
  if (!ch) return 0;
  const water = (Number(hole.water_penalty)||0) + (Number(hole.drop_or_out)||0);
  if (water === 0 || hole.tee_accuracy === "Hit") return 0;
  const chips = resolveChips(hole) ?? 0;
  const other = (Number(hole.score)||0) - (Number(hole.putts)||0) - chips - 1;
  const match = (hole.tee_accuracy==="Left" && ch.tee_water_out_left) || (hole.tee_accuracy==="Right" && ch.tee_water_out_right);
  if (!match) return 0;
  return other===1 ? 100 : other>1 ? 50 : 0;
}
function getDriveTreePct(hole: any, ch: HoleData | undefined): number {
  if (!ch || hole.tee_accuracy==="Hit" || hole.tee_accuracy==="") return 0;
  const t = (Number(hole.tree_haz)||0) > 0;
  if (hole.tee_accuracy==="Left"  && ch.tee_tree_hazard_left)  return t ? 75 : 25;
  if (hole.tee_accuracy==="Right" && ch.tee_tree_hazard_right) return t ? 75 : 25;
  return 0;
}
function getDriveBunkerPct(hole: any, ch: HoleData | undefined): number {
  if (!ch || hole.tee_accuracy==="Hit" || hole.tee_accuracy==="") return 0;
  const b = (Number(hole.fairway_bunker)||0) > 0;
  if (hole.tee_accuracy==="Left"  && ch.tee_bunkers_left)  return b ? 100 : 0;
  if (hole.tee_accuracy==="Right" && ch.tee_bunkers_right) return b ? 100 : 0;
  return 0;
}

function yardsBucket(yards: number): string {
  if (yards <= 0) return "Unknown";
  const low = Math.floor(yards / 25) * 25;
  return `${low}-${low+24}`;
}
function holeCluster(hole: number): string {
  const start = Math.floor((hole - 1) / 3) * 3 + 1;
  return `${start}–${start + 2}`;
}
function apprDistBucket(dist: number): string {
  if (dist <= 0) return "Unknown";
  const low = Math.floor(dist / 10) * 10;
  return `${low}-${low+9}`;
}
function siTier(si: number): string {
  if (si <= 4)  return "SI 1-4";
  if (si <= 9)  return "SI 5-9";
  if (si <= 14) return "SI 10-14";
  return "SI 15-18";
}

function computeRoundDiff(round: any, course: any): number | null {
  if (!course?.rating || !course?.slope) return null;
  const scoredHoles = (round.holes ?? []).filter((h: any) => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (scoredHoles.length === 0) return null;
  const ags = scoredHoles.reduce((s: number, h: any) => s + Math.min(Number(h.score), h.par + 2), 0);
  const holesPlayed = round.holes_played ?? scoredHoles.length;
  const is9Round = holesPlayed <= 9;
  const is9Course = (course.holes?.length ?? 18) <= 9;
  let rating = course.rating;
  if (is9Round && !is9Course) rating = rating / 2;
  else if (!is9Round && is9Course) rating = rating * 2;
  let diff: number;
  if (is9Round) {
    diff = ((113 / course.slope) * (ags - rating)) * 2;
  } else {
    diff = (ags - rating) * 113 / course.slope;
  }
  return diff;
}

function calcAvg(holes: EnrichedHole[]): number {
  if (!holes.length) return 0;
  return holes.reduce((s,h) => s+(h.score-h.par), 0) / holes.length;
}

function greensideMatches(holeGS: GreensideFilter, filterGS: GreensideFilter): boolean {
  const keys = Object.keys(filterGS) as (keyof GreensideFilter)[];
  for (const k of keys) {
    if (filterGS[k] === 0) continue;
    if (holeGS[k] !== filterGS[k]) return false;
  }
  return true;
}

function filterHoles(holes: EnrichedHole[], f: Filters): EnrichedHole[] {
  return holes.filter(h => {
    if (f.driveAcc.size > 0 && !f.driveAcc.has(h.tee_accuracy)) return false;
    if (f.apprAcc.size  > 0 && !f.apprAcc.has(h.appr_accuracy))  return false;
    if (f.drivingClubs.size > 0 && !f.drivingClubs.has(h.club))       return false;
    if (f.apprClubs.size    > 0 && !f.apprClubs.has(h.appr_distance)) return false;
    if (f.highWater  && h.drive_water_ob_pct <= 0) return false;
    if (f.highTree   && h.drive_tree_pct    <= 0) return false;
    if (f.highBunker && h.drive_bunker_pct  <= 0) return false;
    if (f.courseId && h.courseId !== f.courseId) return false;
    if (f.pars.size > 0 && !f.pars.has(String(h.par))) return false;
    if (f.teeTreeLeft    && !h.tee_tree_left)    return false;
    if (f.teeTreeRight   && !h.tee_tree_right)   return false;
    if (f.teeTreeAcross  && !h.tee_tree_across)  return false;
    if (f.teeBunkerLeft  && !h.tee_bunker_left)  return false;
    if (f.teeBunkerRight && !h.tee_bunker_right) return false;
    if (f.teeWaterLeft   && !h.tee_water_left)   return false;
    if (f.teeWaterRight  && !h.tee_water_right)  return false;
    if (f.teeWaterAcross && !h.tee_water_across) return false;
    if (f.apprTreeLeft   && !h.appr_tree_left)   return false;
    if (f.apprTreeRight  && !h.appr_tree_right)  return false;
    if (f.apprTreeLong   && !h.appr_tree_long)   return false;
    if (f.apprTreeAcross && !h.appr_tree_across) return false;
    if (f.apprWaterLeft  && !h.appr_water_left)  return false;
    if (f.apprWaterRight && !h.appr_water_right) return false;
    if (f.apprWaterShort && !h.appr_water_short) return false;
    if (f.apprWaterLong  && !h.appr_water_long)  return false;
    if (f.yardsBucket && yardsBucket(h.yards) !== f.yardsBucket) return false;
    if (f.siTierFilter && siTier(h.stroke_index) !== f.siTierFilter) return false;
    if (f.doglegFilter && (h.dogleg || "None") !== f.doglegFilter) return false;
    if (f.holeCluster && holeCluster(h.hole) !== f.holeCluster) return false;
    if (f.apprDistBucket) {
      if (h.appr_dist_num <= 0) return false;
      if (apprDistBucket(h.appr_dist_num) !== f.apprDistBucket) return false;
    }
    if (f.siMin && h.stroke_index < Number(f.siMin)) return false;
    if (f.siMax && h.stroke_index > Number(f.siMax)) return false;
    if (f.ratingMin && (h.rating??0)   < Number(f.ratingMin)) return false;
    if (f.ratingMax && (h.rating??999) > Number(f.ratingMax)) return false;
    if (f.slopeMin  && (h.slope??0)    < Number(f.slopeMin))  return false;
    if (f.slopeMax  && (h.slope??999)  > Number(f.slopeMax))  return false;
    if (f.years.size > 0 && !f.years.has(String(h.year))) return false;
    if (f.gsBunker   && h.greenside_bunker <= 0) return false;
    if (f.girOnly    && !h.gir)  return false;
    if (f.nonGirOnly &&  h.gir)  return false;
    if (f.puttsMin && h.putts < Number(f.puttsMin)) return false;
    if (f.puttsMax && h.putts > Number(f.puttsMax)) return false;
    if ((f.chipsMin || f.chipsMax) && h.chips === null) return false;
    if (f.chipsMin && h.chips !== null && h.chips < Number(f.chipsMin)) return false;
    if (f.chipsMax && h.chips !== null && h.chips > Number(f.chipsMax)) return false;
    if (f.firstPutt && h.first_putt_distance !== f.firstPutt) return false;
    if (f.greenDepth === "lt20"  && h.green_depth >= 20) return false;
    if (f.greenDepth === "20-24" && (h.green_depth < 20 || h.green_depth > 24)) return false;
    if (f.greenDepth === "25-29" && (h.green_depth < 25 || h.green_depth > 29)) return false;
    if (f.greenDepth === "30-34" && (h.green_depth < 30 || h.green_depth > 34)) return false;
    if (f.greenDepth === "35-39" && (h.green_depth < 35 || h.green_depth > 39)) return false;
    if (f.greenDepth === "gt40"  && h.green_depth < 40) return false;
    // Diff bucket filter
    if (f.diffBucket.size > 0) {
      if (h.roundDiff === null) return false;
      const matchesAny = DIFF_BUCKETS.filter(b => f.diffBucket.has(b.val)).some(b => b.test(h.roundDiff!));
      if (!matchesAny) return false;
    }
    const posAny = Object.values(f.gsPositionFilter).some(v => v !== 0);
    if (posAny) {
      const keys = Object.keys(f.gsPositionFilter) as (keyof GreensideFilter)[];
      for (const k of keys) {
        if (f.gsPositionFilter[k] === 1) {
          if (h.approach_green[k] !== 1 && h.approach_bunker[k] !== 2) return false;
        }
      }
    }
    if (f.gsSurface === "green"  && !Object.values(h.approach_green).some(v => v === 1))  return false;
    if (f.gsSurface === "bunker" && !Object.values(h.approach_bunker).some(v => v === 2)) return false;
    if (f.gsSurface === "rough"  && (Object.values(h.approach_green).some(v => v === 1) || Object.values(h.approach_bunker).some(v => v === 2))) return false;
    return true;
  });
}

function fmt(n: number): string { return isNaN(n) ? "—" : `${n>=0?"+":""}${n.toFixed(2)}`; }
function clr(n: number): string { return isNaN(n)||n===0 ? "#666" : n>0 ? "#c0392b" : "#27ae60"; }

function CollapsibleSection({ title, activeCount, children }: { title: string; activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1 }}>{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {activeCount > 0 && <span style={{ fontSize: 10, background: "#0f6e56", color: "#fff", borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>{activeCount}</span>}
          <span style={{ fontSize: 14, color: "#999" }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function toggleSet(s: Set<string>, val: string): Set<string> {
  const n = new Set(s); n.has(val) ? n.delete(val) : n.add(val); return n;
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return den === 0 ? NaN : num / den;
}

function TrendsView({ summaries }: { summaries: RoundSummary[] }) {
  const [courseFilter, setCourseFilter] = useState("");
  const [primaryMetric, setPrimaryMetric] = useState<"toPar" | "score" | "diff">("toPar");
  const [overlayMetric, setOverlayMetric] = useState<"none" | "girPct" | "fwPct" | "avgPutts">("none");
  const [scatterX, setScatterX] = useState<TrendMetric>("girPct");
  const [scatterY, setScatterY] = useState<TrendMetric>("toPar");
  const [scatterHoles, setScatterHoles] = useState<"both" | "9" | "18">("both");

  const courses = Array.from(new Map(summaries.map(s => [s.courseId, s.courseName])).entries());
  const filtered = (courseFilter ? summaries.filter(s => s.courseId === courseFilter) : summaries)
    .slice().sort((a, b) => a.date.localeCompare(b.date));

  const getVal = (s: RoundSummary): number =>
    primaryMetric === "diff" ? (s.diff ?? NaN) : primaryMetric === "score" ? s.score : s.toPar;

  const rolling5 = filtered.map((_, i) => {
    if (i < 4) return null;
    const vals = filtered.slice(i - 4, i + 1).map(getVal).filter(v => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  const rolling5overlay = filtered.map((_, i) => {
    if (overlayMetric === "none" || i < 4) return null;
    const vals = filtered.slice(i - 4, i + 1)
      .map(r => r[overlayMetric] as number)
      .filter(v => v != null && !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  const avgOf = (arr: RoundSummary[]) => {
    const vals = arr.map(getVal).filter(v => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  };
  const last5 = filtered.slice(-5);
  const last10 = filtered.slice(-10);

  const chartData = filtered.map((s, i) => ({
    name: s.date,          // full date as categorical key — prevents MM-DD collisions across years
    date: s.date,
    courseName: s.courseName,
    score: s.score,
    par: s.par,
    totalHoles: s.totalHoles,
    primary: getVal(s),
    overlay: overlayMetric !== "none" ? (s[overlayMetric] as number) : undefined,
    rolling: rolling5[i],
    overlayRolling: overlayMetric !== "none" ? rolling5overlay[i] : undefined,
  }));

  // Year-boundary markers: first data point of each new year (skip the very first)
  const yearStarts = chartData.reduce<{ name: string; year: string }[]>((acc, d, i) => {
    if (i === 0) return acc;
    if (d.date.slice(0, 4) !== chartData[i - 1].date.slice(0, 4))
      acc.push({ name: d.name, year: d.date.slice(0, 4) });
    return acc;
  }, []);

  const scatterBase = scatterHoles === "9" ? filtered.filter(s => s.totalHoles <= 9)
    : scatterHoles === "18" ? filtered.filter(s => s.totalHoles >= 18)
    : filtered;

  const scatterData = scatterBase
    .filter(s => {
      const x = s[scatterX as keyof RoundSummary];
      const y = s[scatterY as keyof RoundSummary];
      return x !== null && y !== null && !isNaN(Number(x)) && !isNaN(Number(y));
    })
    .map(s => ({
      x: Number(s[scatterX as keyof RoundSummary]),
      y: Number(s[scatterY as keyof RoundSummary]),
      label: `${s.courseName} · ${new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${s.totalHoles}H`,
    }));

  const r = pearsonR(scatterData.map(d => d.x), scatterData.map(d => d.y));

  const metricLabel = (m: string) => TREND_METRICS.find(t => t.val === m)?.label ?? m;

  const primaryColor = "#0f6e56";
  const overlayColor = "#c8a84b";

  const btnStyle = (active: boolean, color = primaryColor): React.CSSProperties => ({
    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
    cursor: "pointer", border: `1px solid ${color}`,
    background: active ? color : "white", color: active ? "white" : color,
  });
  const selStyle: React.CSSProperties = {
    padding: "5px 8px", borderRadius: 8, border: "1px solid #0f6e56",
    fontSize: 12, color: "#0f6e56", background: "white",
  };

  // Scatter axis domains — fit to data with 10% padding, never starts at 0
  const xVals = scatterData.map(d => d.x);
  const yVals = scatterData.map(d => d.y);
  const xPad = (Math.max(...xVals) - Math.min(...xVals)) * 0.1 || 1;
  const yPad = (Math.max(...yVals) - Math.min(...yVals)) * 0.1 || 1;
  const xDomain: [number, number] = xVals.length >= 3
    ? [Math.floor(Math.min(...xVals) - xPad), Math.ceil(Math.max(...xVals) + xPad)]
    : [0, 100];
  const yDomain: [number, number] = yVals.length >= 3
    ? [Math.floor(Math.min(...yVals) - yPad), Math.ceil(Math.max(...yVals) + yPad)]
    : [0, 100];

  // Custom tooltips
  const TrendTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const primVal = d?.primary;
    const toParStr = typeof primVal === "number" && !isNaN(primVal)
      ? (primVal >= 0 ? "+" : "") + primVal.toFixed(0) : "—";
    const fullDate = d?.date
      ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : d?.name;
    return (
      <div style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
        <p style={{ fontWeight: 700, margin: "0 0 2px", color: "#1a1a1a" }}>{d?.courseName}</p>
        <p style={{ margin: "0 0 5px", color: "#999", fontSize: 10 }}>{fullDate} · {d?.totalHoles}H</p>
        <p style={{ margin: "1px 0", color: "#1a1a1a" }}>Score: <strong>{d?.score}</strong> (par {d?.par}) <strong>{toParStr}</strong></p>
        {payload.find((p: any) => p.dataKey === "overlay") && (
          <p style={{ margin: "1px 0", color: overlayColor }}>
            {metricLabel(overlayMetric)}: {(payload.find((p: any) => p.dataKey === "overlay")?.value ?? 0).toFixed(1)}
          </p>
        )}
        {payload.find((p: any) => p.dataKey === "rolling")?.value != null && (
          <p style={{ margin: "1px 0", color: primaryColor }}>
            5-rnd avg: {payload.find((p: any) => p.dataKey === "rolling")?.value.toFixed(1)}
          </p>
        )}
        {payload.find((p: any) => p.dataKey === "overlayRolling")?.value != null && (
          <p style={{ margin: "1px 0", color: overlayColor }}>
            5-rnd avg ({metricLabel(overlayMetric)}): {payload.find((p: any) => p.dataKey === "overlayRolling")?.value.toFixed(1)}
          </p>
        )}
      </div>
    );
  };

  const ScatterTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
        <p style={{ fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>{d?.label}</p>
        <p style={{ margin: "1px 0" }}>{metricLabel(scatterX)}: <strong>{typeof d?.x === "number" ? d.x.toFixed(1) : d?.x}</strong></p>
        <p style={{ margin: "1px 0" }}>{metricLabel(scatterY)}: <strong>{typeof d?.y === "number" ? d.y.toFixed(1) : d?.y}</strong></p>
      </div>
    );
  };

  if (filtered.length < 2) {
    return <p style={{ color: "white", fontSize: 13 }}>Need at least 2 rounds to show trends.</p>;
  }

  return (
    <div>
      {courses.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
            style={{ ...selStyle, width: "100%" }}>
            <option value="">All courses</option>
            {courses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Last 5 avg", val: avgOf(last5) },
          { label: "Last 10 avg", val: avgOf(last10) },
          { label: "All-time avg", val: avgOf(filtered) },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: 10, textAlign: "center" }}>
            <p style={{ fontSize: 10, color: "#0f6e56", margin: "0 0 3px" }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: isNaN(val) ? "#666" : val > 0 ? "#c0392b" : val < 0 ? "#27ae60" : "#666" }}>
              {isNaN(val) ? "—" : `${val >= 0 ? "+" : ""}${val.toFixed(1)}`}
            </p>
          </div>
        ))}
      </div>

      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>Performance Trend</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {(["toPar", "score", "diff"] as const).map(m => (
            <button key={m} style={btnStyle(primaryMetric === m)} onClick={() => setPrimaryMetric(m)}>
              {metricLabel(m)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#bbb" }}>Overlay:</span>
          {(["none", "girPct", "fwPct", "avgPutts"] as const).map(m => (
            <button key={m} style={btnStyle(overlayMetric === m, overlayColor)} onClick={() => setOverlayMetric(m)}>
              {m === "none" ? "None" : metricLabel(m)}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart data={chartData} margin={{ top: 4, right: overlayMetric !== "none" ? 40 : 8, bottom: 8, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis dataKey="name" height={36} tick={(props: any) => {
              const { x, y, payload } = props;
              const idx = chartData.findIndex(d => d.name === payload.value);
              const isYearStart = idx === 0 ||
                (idx > 0 && chartData[idx].date.slice(0, 4) !== chartData[idx - 1].date.slice(0, 4));
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={0} y={0} dy={11} textAnchor="middle" fill="#999" fontSize={9}>
                    {payload.value.slice(5)}
                  </text>
                  {isYearStart && (
                    <text x={0} y={0} dy={22} textAnchor="middle" fill="#555" fontSize={8} fontWeight={700}>
                      {payload.value.slice(0, 4)}
                    </text>
                  )}
                </g>
              );
            }} />
            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: primaryColor }} />
            {overlayMetric !== "none" && (
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: overlayColor }}
                domain={overlayMetric === "avgPutts" ? [1.0, 2.5] : ["auto", "auto"]} />
            )}
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine yAxisId="left" y={0} stroke="#ddd" strokeDasharray="4 2" />
            {yearStarts.map(({ name, year }) => (
              <ReferenceLine key={year} yAxisId="left" x={name} stroke="#ccc" />
            ))}
            {/* Dots only — no connecting line */}
            <Line yAxisId="left" type="monotone" dataKey="primary" name={metricLabel(primaryMetric)}
              stroke={primaryColor} strokeWidth={0} dot={{ r: 2, fill: primaryColor, stroke: primaryColor }}
              activeDot={{ r: 4 }} connectNulls legendType="none" />
            {/* 5-round rolling average — solid line, same color as dots */}
            <Line yAxisId="left" type="monotone" dataKey="rolling" name="5-rnd avg"
              stroke={primaryColor} dot={false} strokeWidth={2} connectNulls />
            {overlayMetric !== "none" && (
              <Line yAxisId="right" type="monotone" dataKey="overlay" name={metricLabel(overlayMetric)}
                stroke={overlayColor} strokeWidth={0} dot={{ r: 2, fill: overlayColor, stroke: overlayColor }}
                activeDot={{ r: 4 }} connectNulls legendType="none" />
            )}
            {overlayMetric !== "none" && (
              <Line yAxisId="right" type="monotone" dataKey="overlayRolling" name={`5-rnd avg (${metricLabel(overlayMetric)})`}
                stroke={overlayColor} dot={false} strokeWidth={2} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Relationship Explorer</p>
          {!isNaN(r) && scatterData.length >= 3 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: Math.abs(r) > 0.5 ? "#c0392b" : Math.abs(r) > 0.3 ? "#c8a84b" : "#27ae60" }}>
              r = {r.toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "#0f6e56", fontWeight: 600 }}>X axis</span>
            <select value={scatterX} onChange={e => setScatterX(e.target.value as TrendMetric)} style={selStyle}>
              {TREND_METRICS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "#0f6e56", fontWeight: 600 }}>Y axis</span>
            <select value={scatterY} onChange={e => setScatterY(e.target.value as TrendMetric)} style={selStyle}>
              {TREND_METRICS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "#0f6e56", fontWeight: 600 }}>Holes</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["both", "9", "18"] as const).map(h => (
                <button key={h} style={btnStyle(scatterHoles === h)} onClick={() => setScatterHoles(h)}>
                  {h === "both" ? "All" : h + "H"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {scatterData.length < 3 ? (
          <p style={{ fontSize: 12, color: "#999" }}>Need at least 3 rounds for comparison.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 4, right: 8, bottom: 20, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
              <XAxis type="number" dataKey="x" name={metricLabel(scatterX)} domain={xDomain}
                tick={{ fontSize: 9, fill: "#999" }}
                label={{ value: metricLabel(scatterX), position: "insideBottom", offset: -12, fontSize: 9, fill: "#999" }} />
              <YAxis type="number" dataKey="y" name={metricLabel(scatterY)} domain={yDomain}
                tick={{ fontSize: 9, fill: "#0f6e56" }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
              <Scatter data={scatterData} fill="#0f6e56" opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
        {!isNaN(r) && scatterData.length >= 3 && (
          <p style={{ fontSize: 10, color: "#999", margin: "6px 0 0", fontStyle: "italic" }}>
            {Math.abs(r) > 0.6 ? "Strong" : Math.abs(r) > 0.4 ? "Moderate" : Math.abs(r) > 0.2 ? "Weak" : "No meaningful"} correlation between {metricLabel(scatterX).toLowerCase()} and {metricLabel(scatterY).toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}

const COACH_ROOT: React.CSSProperties = {
  "--bg": "#eef1f4", "--paper": "#f7f9fb", "--paper-alt": "#e6ebf0",
  "--ink": "#131821", "--ink-soft": "#253041", "--muted": "#5d6b7a", "--muted-2": "#8995a3",
  "--line": "#d7dde3", "--line-soft": "#e5eaef",
  "--green": "#0f6e56", "--green-deep": "#084634", "--green-soft": "#d2e8df",
  "--accent": "#f29450", "--accent-soft": "#fde0c8",
  "--sand": "#c8a84b", "--sand-soft": "#f5ecd0", "--sand-deep": "#8c6a26",
  background: "#eef1f4", color: "#131821",
  fontFamily: "system-ui, -apple-system, sans-serif",
  minHeight: "100vh",
} as React.CSSProperties;

type CachedLeak = {
  id: string;
  label: string;
  impact: number;
  count: number;
  detail: string;
  tactic: string;
};

type CoachingInsights = {
  leaks: CachedLeak[];
  strengths: CachedLeak[];
  computedAt: string;
  totalHoles: number;
  avg5: number | null;
  avg20: number | null;
  summaries: RoundSummary[];
};

function CoachBriefing({
  insights,
  totalRounds,
  heavyReady,
  allHoles,
  onNavigate,
  roundGrades,
  roundSummaries,
}: {
  insights: CoachingInsights | null;
  totalRounds: number;
  heavyReady: boolean;
  allHoles: EnrichedHole[];
  onNavigate: (tab: "trends" | "factors") => void;
  roundGrades: Record<number, RoundGrades>;
  roundSummaries: RoundSummary[];
}) {
  const [expandedLeak, setExpandedLeak] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Compute grade-based leaks from last 5 rounds that have at least one grade
  const gradeLeaks = useMemo(() => {
    const recent = [...roundSummaries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const cats = [
      { key: "driver" as const, label: "Driver accuracy", tactic: "Your tee accuracy has been grading below your baseline — try a fairway wood on tight holes or tee up on the trouble side of the box." },
      { key: "iron" as const,   label: "Iron approach",   tactic: "Your approach accuracy is below your baseline — club up one and aim center-green rather than chasing the flag." },
      { key: "chipping" as const, label: "Chipping / GS", tactic: "Your chipping is leaving the ball too far from the hole — pick a precise landing spot and commit to a bump-and-run when the path allows." },
      { key: "putter" as const, label: "Putting",         tactic: "Your putting is costing extra strokes vs your baseline — focus on speed control to a 3-foot circle on first putts over 15 feet." },
    ];
    return cats.flatMap(cat => {
      const graded = recent.map(s => roundGrades[s.idx]?.[cat.key]).filter((g): g is PerfGrade => g != null);
      if (graded.length < 3) return [];
      const badGrades = graded.filter(g => ["C","D","F"].includes(g.letter));
      if (badGrades.length < Math.ceil(graded.length * 0.6)) return [];
      // Use worst grade's impact
      const worst = badGrades.reduce((w, g) => (GRADE_LEAK_IMPACT[g.letter] ?? 0) > (GRADE_LEAK_IMPACT[w.letter] ?? 0) ? g : w);
      const impact = GRADE_LEAK_IMPACT[worst.letter] ?? 0.08;
      return [{ id: `grade-${cat.key}`, label: cat.label, impact, count: graded.length, tactic: cat.tactic, gradeLetter: worst.letter, gradeBg: worst.bg, gradeColor: worst.color }];
    });
  }, [roundGrades, roundSummaries]);

  const allLeaks = useMemo(() => {
    const base = insights?.leaks ?? [];
    const merged = [...base, ...gradeLeaks.filter(gl => !base.some(l => l.id === gl.id))];
    return merged.sort((a, b) => b.impact - a.impact);
  }, [insights, gradeLeaks]);

  const topLeak = allLeaks[0] ?? null;

  // ── Frequency trends: last 5 rounds vs all-time ────────────────────────────
  const freqTrends = React.useMemo(() => {
    if (allHoles.length < 20) return [];
    const maxIdx = Math.max(...allHoles.map(h => h.roundIndex));
    const last5 = allHoles.filter(h => h.roundIndex >= maxIdx - 4);
    if (last5.length < 9) return [];

    type Pat = { id: string; label: string; goodWhenHigh: boolean; pool: (hs: EnrichedHole[]) => EnrichedHole[]; match: (h: EnrichedHole) => boolean };
    const patterns: Pat[] = [
      { id: "drv-hit",  label: "Driving fairway",     goodWhenHigh: true,  pool: hs => hs.filter(h => h.par >= 4 && h.tee_accuracy !== ""), match: h => h.tee_accuracy === "Hit" },
      { id: "drv-lft",  label: "Drive left",           goodWhenHigh: false, pool: hs => hs.filter(h => h.par >= 4 && h.tee_accuracy !== ""), match: h => h.tee_accuracy === "Left" },
      { id: "drv-rgt",  label: "Drive right",          goodWhenHigh: false, pool: hs => hs.filter(h => h.par >= 4 && h.tee_accuracy !== ""), match: h => h.tee_accuracy === "Right" },
      { id: "drv-sht",  label: "Drive short",          goodWhenHigh: false, pool: hs => hs.filter(h => h.par >= 4 && h.tee_accuracy !== ""), match: h => h.tee_accuracy === "Short" },
      { id: "apr-hit",  label: "Approach on target",   goodWhenHigh: true,  pool: hs => hs.filter(h => h.appr_accuracy !== ""),             match: h => h.appr_accuracy === "Hit" },
      { id: "apr-sht",  label: "Approach short",       goodWhenHigh: false, pool: hs => hs.filter(h => h.appr_accuracy !== ""),             match: h => h.appr_accuracy === "Short" },
      { id: "apr-lng",  label: "Approach long",        goodWhenHigh: false, pool: hs => hs.filter(h => h.appr_accuracy !== ""),             match: h => h.appr_accuracy === "Long" },
      { id: "gir",      label: "GIR",                  goodWhenHigh: true,  pool: hs => hs,                                                  match: h => h.gir },
      { id: "3putt",    label: "3+ putt",              goodWhenHigh: false, pool: hs => hs,                                                  match: h => h.putts >= 3 },
      { id: "1putt",    label: "1-putt",               goodWhenHigh: true,  pool: hs => hs,                                                  match: h => h.putts === 1 },
      { id: "gs-bunk",  label: "GS bunker",            goodWhenHigh: false, pool: hs => hs,                                                  match: h => h.greenside_bunker > 0 },
      { id: "two-chip", label: "2+ chip (chip+GS)",   goodWhenHigh: false, pool: hs => hs,                                                  match: h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 2 },
    ];

    return patterns.map(p => {
      const allPool = p.pool(allHoles);
      const l5Pool  = p.pool(last5);
      if (allPool.length < 10 || l5Pool.length < 3) return null;
      const allRate  = allPool.filter(p.match).length / allPool.length;
      const last5Rate = l5Pool.filter(p.match).length / l5Pool.length;
      const delta = last5Rate - allRate;
      if (Math.abs(delta) < 0.05) return null;
      return { id: p.id, label: p.label, goodWhenHigh: p.goodWhenHigh, allRate, last5Rate, delta };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);
  }, [allHoles]);

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase" as const, fontWeight: 700 }}>Coach</div>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, color: "var(--ink)", lineHeight: 1.1, marginTop: 4 }}>
            The Briefing
          </div>
        </div>
        {insights && (
          <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right" as const, marginTop: 6 }}>
            <div>{totalRounds} rounds tracked</div>
            {insights.avg5 !== null && (
              <div style={{ marginTop: 3, fontWeight: 700 }}>
                Last 5: <span style={{ color: insights.avg5 <= 0 ? "var(--green)" : "var(--accent)", fontFeatureSettings: '"tnum" 1' }}>
                  {insights.avg5 >= 0 ? "+" : ""}{insights.avg5.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coach card */}
      <div style={{ background: "var(--paper)", borderRadius: 16, padding: 14, border: "1px solid var(--line)", display: "flex", gap: 12, marginBottom: 14 }}>
        <svg width={52} height={52} viewBox="0 0 60 60" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="cb-skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d8b896"/>
              <stop offset="100%" stopColor="#b8946d"/>
            </linearGradient>
          </defs>
          <circle cx="30" cy="30" r="29" fill="var(--green-soft)" />
          <ellipse cx="30" cy="46" rx="22" ry="14" fill="var(--green)" />
          <circle cx="30" cy="28" r="13" fill="url(#cb-skin)" />
          <path d="M 14 24 Q 30 18 46 24 L 46 28 Q 30 25 14 28 Z" fill="var(--sand)" />
          <rect x="14" y="22" width="32" height="3" fill="var(--sand-deep)" />
          <rect x="19" y="27" width="9" height="5" rx="1.5" fill="var(--ink)" />
          <rect x="32" y="27" width="9" height="5" rx="1.5" fill="var(--ink)" />
          <rect x="28" y="29" width="4" height="1" fill="var(--ink)" />
          <path d="M 22 35 Q 30 42 38 35" stroke="var(--ink)" strokeWidth="0.6" fill="none" opacity="0.4"/>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green-deep)" }}>Coach</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>Your personal caddie, no guessing</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 14, lineHeight: 1.4, color: "var(--ink-soft)", fontStyle: "italic" }}>
            "The data doesn't lie — here's where you're bleeding strokes."
          </div>
        </div>
      </div>

      {/* Biggest leak hero — dark green gradient matching clubhouse */}
      {topLeak ? (
        <div style={{
          background: "linear-gradient(135deg,#1a4f3e 0%,var(--green-deep) 65%,#051f14 100%)",
          borderRadius: 18, padding: "18px 20px", marginBottom: 16,
          position: "relative", overflow: "hidden",
          boxShadow: "0 4px 24px rgba(8,70,52,.25)",
        }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: "radial-gradient(circle,rgba(242,148,80,.1) 0%,transparent 70%)", pointerEvents: "none" }} />
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--accent)", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 8 }}>Your biggest leak</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 22, lineHeight: 1.2, fontWeight: 600, marginBottom: 8, color: "white" }}>
            {topLeak.label} is{" "}
            <span style={{ color: "var(--accent)" }}>costing you +{topLeak.impact.toFixed(2)} strokes</span>{" "}
            per hole.
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>{topLeak.tactic}</div>
        </div>
      ) : (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: "20px 16px", marginBottom: 16, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: 13, fontStyle: "italic" }}>
            {insights === null ? "Analysing your rounds…" : "Not enough data yet — keep logging rounds!"}
          </span>
        </div>
      )}

      {/* Nav buttons */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 8, marginBottom: 24 }}>
        {([
          { label: "Performance Trend", sub: heavyReady ? "Score over time" : "Loading…", action: () => onNavigate("trends") },
          { label: "Ask Coach", sub: "AI-powered Q&A", href: "/rounds/chat" },
          { label: "Factor Correlations", sub: heavyReady ? "What moves your score" : "Loading…", action: () => onNavigate("factors") },
        ] as const).map(nav => (
          "href" in nav ? (
            <a key={nav.label} href={nav.href} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", textDecoration: "none", display: "block" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green-deep)" }}>{nav.label}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{nav.sub}</div>
            </a>
          ) : (
            <button key={nav.label} onClick={nav.action} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", textAlign: "left" as const }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green-deep)" }}>{nav.label}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{nav.sub}</div>
            </button>
          )
        ))}
      </div>

      {/* Leaks list — merged with grade-based leaks */}
      {(insights && insights.leaks.length > 0) || gradeLeaks.length > 0 ? (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, color: "var(--ink)", marginBottom: 12 }}>
            Top leaks
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {allLeaks.map((leak: any, i) => {
              const open = expandedLeak === leak.id;
              const isGradeLeak = leak.id?.startsWith("grade-");
              return (
                <div key={leak.id} style={{ background: "var(--paper)", border: `1px solid ${open ? "var(--accent)" : "var(--line)"}`, borderRadius: 14, overflow: "hidden" }}>
                  <button onClick={() => setExpandedLeak(open ? null : leak.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", background: "none", border: "none", textAlign: "left" as const, cursor: "pointer" }}>
                    <div style={{ fontSize: 13, color: "var(--muted-2)", width: 20, fontWeight: 700, fontFeatureSettings: '"tnum" 1' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{leak.label}</span>
                        {isGradeLeak && leak.gradeLetter && (
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: leak.gradeBg, color: leak.gradeColor, fontFamily: "monospace" }}>
                            {leak.gradeLetter}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                        {isGradeLeak ? `${leak.count} recent rounds graded C or worse` : `${leak.count} holes`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontFamily: "Georgia,serif", fontSize: 16, fontWeight: 600, color: "var(--accent)", fontFeatureSettings: '"tnum" 1' }}>+{leak.impact.toFixed(2)}</div>
                      <div style={{ fontSize: 14, color: "var(--muted-2)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>›</div>
                    </div>
                  </button>
                  {open && (
                    <div style={{ padding: "4px 14px 14px", borderTop: "1px solid var(--line-soft)" }}>
                      <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: 10, borderLeft: "3px solid var(--accent)" }}>
                        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 }}>The fix</div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>{leak.tactic}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Strengths */}
      {insights && insights.strengths.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, color: "var(--ink)", marginBottom: 12 }}>
            What's working
          </div>
          <div style={{ display: "grid", gridTemplateColumns: insights.strengths.length === 1 ? "1fr" : isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {insights.strengths.map(s => (
              <div key={s.id} style={{ background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 600, color: "var(--green-deep)", fontFeatureSettings: '"tnum" 1' }}>{s.impact.toFixed(2)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green-deep)", marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, lineHeight: 1.3 }}>{s.count} holes tracked</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequency trends — last 5 rounds vs all-time */}
      {freqTrends.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, color: "var(--ink)", marginBottom: 4 }}>
            Last 5 rounds — what's shifting
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>Frequency vs. your all-time baseline</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {freqTrends.map(t => {
              const up = t.delta > 0;
              const isGood = up === t.goodWhenHigh;
              const accentColor = isGood ? "var(--good)" : "var(--accent)";
              const bgColor = isGood ? "var(--green-soft)" : "var(--accent-soft)";
              const borderColor = isGood ? "var(--green)" : "var(--accent)";
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: bgColor, border: `1px solid ${borderColor}`,
                  borderRadius: 12, padding: "10px 14px",
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1, color: accentColor, fontWeight: 700, width: 16, textAlign: "center" as const }}>
                    {up ? "↑" : "↓"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)", fontFeatureSettings: '"tnum" 1' }}>
                      {Math.round(t.allRate * 100)}%
                    </span>
                    <span style={{ fontSize: 10, color: "var(--muted-2)" }}>→</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, fontFeatureSettings: '"tnum" 1' }}>
                      {Math.round(t.last5Rate * 100)}%
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: accentColor,
                      background: `${accentColor}1a`, borderRadius: 6, padding: "2px 6px",
                      fontFeatureSettings: '"tnum" 1',
                    }}>
                      {up ? "+" : ""}{Math.round(t.delta * 100)}pp
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const LOCAL_CACHE_KEY = "golf-coach-v3";
interface LocalCache {
  roundCount: number;
  latestDate: string | null;
  scoreChecksum: number;
  allHoles: EnrichedHole[];
  summaries: RoundSummary[];
  availableYears: number[];
  coachingInsights: CoachingInsights | null;
  handicapIndex?: number | null;
}
function readLocalCache(): LocalCache | null {
  try { const r = localStorage.getItem(LOCAL_CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function writeLocalCache(c: LocalCache) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(c)); } catch {}
}

// ─── Chipping Insights tab ────────────────────────────────────────────────────

const DIST_FT: Record<string, number> = {
  "Gimme":1,"3ft":3,"5ft":5,"7ft":7,"10ft":10,
  "15ft":15,"20ft":20,"30ft":30,"40ft":40,"50ft":50,"50+":60,
};

function chipGrade(ccs: number): { letter: string; color: string; bg: string } {
  if (ccs >= 2.0)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (ccs >= 1.0)  return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (ccs >= 0)    return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (ccs >= -1.0) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (ccs >= -2.0) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return                   { letter:"F",  color:"#fff", bg:"#c0392b" };
}

function ChippingInsights({ allHoles, roundSummaries }: {
  allHoles: EnrichedHole[];
  roundSummaries: RoundSummary[];
}) {
  // April 2026+ only — chip tracking not reliable before then
  const apr2026Idx = React.useMemo(
    () => new Set(roundSummaries.filter(s => s.date >= "2026-04-01").map(s => s.idx)),
    [roundSummaries]
  );

  const trackingHoles = React.useMemo(
    () => allHoles.filter(h => apr2026Idx.has(h.roundIndex)),
    [allHoles, apr2026Idx]
  );

  // Baseline: per-round averages across all April 2026+ rounds
  const baseline = React.useMemo(() => {
    const byRound: Record<number, EnrichedHole[]> = {};
    for (const h of trackingHoles) {
      if (!byRound[h.roundIndex]) byRound[h.roundIndex] = [];
      byRound[h.roundIndex].push(h);
    }
    const roundEntries = Object.entries(byRound);
    if (!roundEntries.length) return null;

    // Normalize extra SG shots to 18H equivalent
    // "Extra" = (chips + GS bunker) >= 2 on a hole (expectation: 1 shot to get on)
    let totalDC18 = 0;
    let roundsWithChipData = 0;
    let totalProxFt = 0;
    let totalProxHoles = 0;

    for (const [, hs] of roundEntries) {
      const s = roundSummaries.find(r => r.idx === hs[0].roundIndex);
      const norm = (s?.totalHoles ?? 18) <= 9 ? 2 : 1;
      const dc = hs.filter(h => (h.chips ?? 0) + (h.greenside_bunker ?? 0) >= 2).length * norm;
      const chipHoles = hs.filter(h => (h.chips ?? 0) + (h.greenside_bunker ?? 0) >= 1 && DIST_FT[h.first_putt_distance] != null);
      if (chipHoles.length >= 1) {
        totalDC18 += dc;
        roundsWithChipData++;
        totalProxFt += chipHoles.reduce((s2, h) => s2 + DIST_FT[h.first_putt_distance], 0);
        totalProxHoles += chipHoles.length;
      }
    }
    if (!roundsWithChipData) return null;
    return {
      avgDC: totalDC18 / roundsWithChipData,
      avgProx: totalProxHoles > 0 ? totalProxFt / totalProxHoles : null,
      totalRounds: roundsWithChipData,
    };
  }, [trackingHoles, roundSummaries]);

  // Per-round grades
  const roundChipData = React.useMemo(() => {
    if (!baseline) return [];
    const byRound: Record<number, EnrichedHole[]> = {};
    for (const h of trackingHoles) {
      if (!byRound[h.roundIndex]) byRound[h.roundIndex] = [];
      byRound[h.roundIndex].push(h);
    }
    const rows = Object.entries(byRound).map(([, hs]) => {
      const idx = hs[0].roundIndex;
      const s = roundSummaries.find(r => r.idx === idx);
      const norm = (s?.totalHoles ?? 18) <= 9 ? 2 : 1;
      const chipHoles = hs.filter(h => (h.chips ?? 0) + (h.greenside_bunker ?? 0) >= 1 && DIST_FT[h.first_putt_distance] != null);
      if (chipHoles.length < 2) return null;

      const dc18 = hs.filter(h => (h.chips ?? 0) + (h.greenside_bunker ?? 0) >= 2).length * norm;
      const avgProx = chipHoles.reduce((s2, h) => s2 + DIST_FT[h.first_putt_distance], 0) / chipHoles.length;

      // CCS: extra-SG-shot delta weighted 1 stroke each; prox delta weighted 0.08/ft
      const dcSG   = baseline.avgDC - dc18;
      const proxSG = baseline.avgProx != null ? (baseline.avgProx - avgProx) * 0.08 : 0;
      const ccs    = Math.round((dcSG + proxSG) * 10) / 10;

      return {
        idx, date: s?.date ?? "", name: s?.date ?? "", courseName: s?.courseName ?? "",
        ccs, dc18, avgProx: Math.round(avgProx * 10) / 10, chipHoles: chipHoles.length,
        ...chipGrade(ccs),
      };
    }).filter(Boolean).sort((a: any, b: any) => a.date > b.date ? 1 : -1) as any[];

    return rows.map((r, i) => {
      const w = rows.slice(Math.max(0, i - 4), i + 1);
      const roll = w.length ? Math.round(w.reduce((s2: number, x: any) => s2 + x.ccs, 0) / w.length * 10) / 10 : null;
      return { ...r, rollingAvg: roll };
    });
  }, [trackingHoles, roundSummaries, baseline]);

  const gradeRows = [
    { letter:"A+", desc:"2+ composite strokes above your avg", bg:"#0f6e56", color:"#fff" },
    { letter:"A",  desc:"1–2 strokes above your avg",          bg:"#27ae60", color:"#fff" },
    { letter:"B",  desc:"0–1 strokes above your avg",          bg:"#2980b9", color:"#fff" },
    { letter:"C",  desc:"Around your average",                 bg:"#f5c842", color:"#333" },
    { letter:"D",  desc:"1–2 strokes below your avg",          bg:"#e67e22", color:"#fff" },
    { letter:"F",  desc:"2+ strokes below your avg",           bg:"#c0392b", color:"#fff" },
  ];

  if (!trackingHoles.length) return (
    <p style={{ color:"var(--muted)", fontStyle:"italic" }}>No chip data from April 2026+ yet.</p>
  );

  return (
    <div style={{ maxWidth:900 }}>

      {/* Summary strip */}
      {baseline && (
        <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
          {[
            { label:"Avg extra SG shots / 18 holes", val: baseline.avgDC.toFixed(1) },
            { label:"Avg 1st putt after chip",  val: baseline.avgProx != null ? `${baseline.avgProx.toFixed(1)} ft` : "—" },
            { label:"Rounds tracked",            val: String(baseline.totalRounds) },
          ].map(s => (
            <div key={s.label} style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"12px 18px", flex:"1 1 120px" }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:1.2, textTransform:"uppercase", color:"var(--ink-mute)", fontWeight:700 }}>{s.label}</div>
              <div className="tnum" style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:600, marginTop:4 }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Grade chart */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"20px 22px", marginBottom:24 }}>
        <span style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>Chipping Grade by Round</span>
        <p style={{ fontSize:12, color:"var(--muted)", margin:"4px 0 18px" }}>
          Composite of extra short-game shots and proximity vs your own averages. An extra SG shot is any hole where chips + GS bunker ≥ 2 (expectation: 1 shot to get on). Each extra shot = 1 stroke; each foot of proximity ≈ 0.08 strokes. C = at your norm. Line = 5-round average.
        </p>

        {roundChipData.length < 2 ? (
          <p style={{ color:"var(--muted)", fontStyle:"italic", fontSize:13 }}>Need more rounds with chip data logged (need first-putt distance on chip holes).</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={roundChipData as any} margin={{ top:8, right:8, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" height={36} tick={(props: any) => {
                const { x, y, payload } = props;
                const d: string = payload.value ?? "";
                const i2 = (roundChipData as any[]).findIndex((r: any) => r.name === d);
                const isYearStart = i2 === 0 || (i2 > 0 && d.slice(0,4) !== ((roundChipData as any[])[i2-1]?.name ?? "").slice(0,4));
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                      {d ? `${d.slice(5,7)}/${d.slice(8)}` : ""}
                    </text>
                    {isYearStart && (
                      <text x={0} y={0} dy={22} textAnchor="middle" fill="#555" fontSize={8} fontWeight={700}>{d.slice(0,4)}</text>
                    )}
                  </g>
                );
              }} />
              <YAxis tickFormatter={(v: number) => v >= 0 ? `+${v}` : `${v}`} tick={{ fontSize:10, fill:"var(--muted)" }} />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 2" />
              <Tooltip content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const g = chipGrade(d.ccs);
                return (
                  <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                    <div style={{ fontWeight:700, marginBottom:4 }}>{d.date} · {d.courseName}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:13 }}>{g.letter}</span>
                      <span style={{ color: d.ccs >= 0 ? "var(--green)" : "var(--bad)", fontWeight:700 }}>
                        {d.ccs >= 0 ? "+" : ""}{d.ccs} composite
                      </span>
                    </div>
                    <div style={{ color:"var(--muted)" }}>
                      {d.dc18} extra SG shots · avg 1st putt {d.avgProx} ft · {d.chipHoles} chip/bunker holes
                    </div>
                  </div>
                );
              }} />
              <Bar dataKey="ccs" name="Chip Grade" radius={[4,4,0,0]}>
                {(roundChipData as any[]).map((r: any, i: number) => (
                  <Cell key={i} fill={r.bg} fillOpacity={0.9} />
                ))}
              </Bar>
              <Line dataKey="rollingAvg" type="monotone" stroke="#f29450" strokeWidth={2.5} dot={false} name="5-rnd avg" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:16 }}>
          {gradeRows.map(g => (
            <div key={g.letter} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 7px", fontSize:11, fontWeight:700 }}>{g.letter}</span>
              <span style={{ fontSize:10, color:"var(--muted-2)" }}>{g.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Round log */}
      {roundChipData.length > 0 && (
        <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"20px 22px" }}>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--ink)", display:"block", marginBottom:14 }}>Round Log</span>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid var(--line)" }}>
                  {["Date","Course","Grade","Score","Extra SG Shots","Avg Prox","SG Holes"].map(h => (
                    <th key={h} style={{ padding:"6px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:1, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([...(roundChipData as any[])].reverse()).map((r: any, i: number) => {
                  const g = chipGrade(r.ccs);
                  return (
                    <tr key={i} style={{ borderBottom:"1px solid var(--line-soft)" }}>
                      <td style={{ padding:"7px 10px", color:"var(--muted)", whiteSpace:"nowrap" }}>{r.date}</td>
                      <td style={{ padding:"7px 10px", color:"var(--ink-soft)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.courseName}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:12 }}>{g.letter}</span>
                      </td>
                      <td style={{ padding:"7px 10px", fontWeight:700, color: r.ccs >= 0 ? "var(--green)" : "var(--bad)" }}>
                        {r.ccs >= 0 ? "+" : ""}{r.ccs}
                      </td>
                      <td style={{ padding:"7px 10px", color:"var(--ink-soft)" }}>{r.dc18}</td>
                      <td style={{ padding:"7px 10px", color:"var(--muted)" }}>{r.avgProx} ft</td>
                      <td style={{ padding:"7px 10px", color:"var(--muted)" }}>{r.chipHoles}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Putting Insights tab ─────────────────────────────────────────────────────

const DIST_ORDER = ["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"];
// Fallback expected putts used only for distances where the player has fewer than 5 samples.
// Based on mid-amateur (~12 HCP) research (Dave Pelz amateur putting data).
const FALLBACK_EXPECTED: Record<string,number> = {
  "Gimme":1.00,"3ft":1.07,"5ft":1.28,"7ft":1.52,"10ft":1.75,
  "15ft":1.90,"20ft":1.97,"30ft":2.05,"40ft":2.12,"50ft":2.18,"50+":2.23,
};

// Grade based on total strokes gained for the round vs amateur-level expectations.
// A+ = finished 2+ strokes better than expected; F = 2+ strokes worse.
function puttGrade(sg: number): { letter: string; color: string; bg: string } {
  if (sg >= 3.0)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (sg >= 1.5)  return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (sg >= 0)    return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (sg >= -1.5) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (sg >= -3.0) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return                  { letter:"F",  color:"#fff", bg:"#c0392b" };
}

function PuttingInsights({ allHoles, roundSummaries }: {
  allHoles: EnrichedHole[];
  roundSummaries: RoundSummary[];
}) {
  const isMobile = useIsMobile();

  // ── Personal baseline: avg putts per distance from player's own history ──────
  const personalBaseline = React.useMemo(() => {
    const MIN_SAMPLES = 5;
    const result: Record<string, number> = { ...FALLBACK_EXPECTED };
    for (const dist of DIST_ORDER) {
      const hs = allHoles.filter(h => h.first_putt_distance === dist && h.putts > 0);
      if (hs.length >= MIN_SAMPLES) {
        result[dist] = Math.round(hs.reduce((s, h) => s + h.putts, 0) / hs.length * 100) / 100;
      }
    }
    return result;
  }, [allHoles]);

  // ── Distance distribution ────────────────────────────────────────────────────
  const distData = React.useMemo(() => {
    return DIST_ORDER.map(dist => {
      const hs = allHoles.filter(h => h.first_putt_distance === dist && h.putts > 0);
      if (hs.length < 2) return null;
      const n1 = hs.filter(h => h.putts === 1).length;
      const n2 = hs.filter(h => h.putts === 2).length;
      const n3 = hs.filter(h => h.putts >= 3).length;
      const avg = hs.reduce((s,h) => s + h.putts, 0) / hs.length;
      return {
        dist,
        count: hs.length,
        "1 Putt": Math.round(n1 / hs.length * 100),
        "2 Putt": Math.round(n2 / hs.length * 100),
        "3+ Putt": Math.round(n3 / hs.length * 100),
        avg: Math.round(avg * 100) / 100,
        expected: personalBaseline[dist] ?? 2,
      };
    }).filter(Boolean) as any[];
  }, [allHoles]);

  // ── Round-by-round SG putting ────────────────────────────────────────────────
  const roundPuttData = React.useMemo(() => {
    const byRound: Record<number, EnrichedHole[]> = {};
    for (const h of allHoles) {
      if (!byRound[h.roundIndex]) byRound[h.roundIndex] = [];
      byRound[h.roundIndex].push(h);
    }
    const rows = Object.entries(byRound).map(([idxStr, hs]) => {
      const idx = Number(idxStr);
      const summary = roundSummaries.find(s => s.idx === idx);
      const withDist = hs.filter(h => h.first_putt_distance && personalBaseline[h.first_putt_distance] != null && h.putts > 0);
      if (withDist.length < 3) return null;
      const exp = withDist.reduce((s,h) => s + personalBaseline[h.first_putt_distance], 0);
      const act = withDist.reduce((s,h) => s + h.putts, 0);
      const sg = Math.round((exp - act) * 10) / 10;
      const sgPerHole = withDist.length > 0 ? sg / withDist.length : 0;
      const totalPutts = hs.reduce((s,h) => s + (h.putts || 0), 0);
      return {
        idx, date: summary?.date ?? "", name: summary?.date ?? "",
        courseName: summary?.courseName ?? "",
        sg, sgPerHole: Math.round(sgPerHole * 100) / 100,
        withDist: withDist.length, totalHoles: hs.length,
        avgPutts: hs.length > 0 ? Math.round(totalPutts / hs.length * 100) / 100 : 0,
        ...puttGrade(sg),
      };
    }).filter(Boolean).sort((a: any, b: any) => (a.date > b.date ? 1 : -1)) as any[];

    // Rolling 5-round average
    return (rows as any[]).map((r,i) => {
      const window = (rows as any[]).slice(Math.max(0, i-4), i+1).filter((x: any) => x.sg != null);
      const roll = window.length ? Math.round(window.reduce((s: number, x: any) => s + x.sg, 0) / window.length * 10) / 10 : null;
      return { ...r, rollingAvg: roll };
    });
  }, [allHoles, roundSummaries, personalBaseline]);

  // ── Trend summary ────────────────────────────────────────────────────────────
  const trendSummary = React.useMemo(() => {
    if (roundPuttData.length < 4) return null;
    const recent = (roundPuttData as any[]).slice(-5);
    const prior  = (roundPuttData as any[]).slice(-10, -5);
    if (!prior.length) return null;
    const avgRecent = recent.reduce((s: number, r: any) => s + r.sg, 0) / recent.length;
    const avgPrior  = prior.reduce((s: number, r: any) => s + r.sg, 0) / prior.length;
    const delta = Math.round((avgRecent - avgPrior) * 10) / 10;
    return { avgRecent: Math.round(avgRecent * 10) / 10, avgPrior: Math.round(avgPrior * 10) / 10, delta };
  }, [roundPuttData]);

  if (allHoles.length === 0) return <p style={{ color:"var(--muted)", fontStyle:"italic" }}>No hole data yet.</p>;

  const gradeRows = [
    { letter:"A+", desc:"3+ strokes better than your avg",    bg:"#0f6e56", color:"#fff" },
    { letter:"A",  desc:"1.5–3 strokes better than your avg", bg:"#27ae60", color:"#fff" },
    { letter:"B",  desc:"0–1.5 strokes better than your avg", bg:"#2980b9", color:"#fff" },
    { letter:"C",  desc:"0–1.5 strokes worse (at your avg)",  bg:"#f5c842", color:"#333" },
    { letter:"D",  desc:"1.5–3 strokes worse than your avg",  bg:"#e67e22", color:"#fff" },
    { letter:"F",  desc:"3+ strokes worse than your avg",     bg:"#c0392b", color:"#fff" },
  ];

  return (
    <div style={{ maxWidth: 900 }}>

      {/* ── Section 1: Make rates by distance ──────────────────────────────── */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"20px 22px", marginBottom:24 }}>
        <div style={{ marginBottom:4 }}>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>Make Rates by First Putt Distance</span>
        </div>
        <p style={{ fontSize:12, color:"var(--muted)", margin:"0 0 18px" }}>
          How often you 1-putt, 2-putt, or 3+-putt from each distance. Avg putts shown above each bar.
        </p>

        {distData.length === 0 ? (
          <p style={{ color:"var(--muted)", fontStyle:"italic", fontSize:13 }}>Need more rounds with first putt distance logged.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distData as any} margin={{ top:20, right:8, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="dist" tick={{ fontSize:11, fill:"var(--muted)" }} />
              <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0,100]} tick={{ fontSize:10, fill:"var(--muted)" }} />
              <Tooltip
                formatter={(value: any, name: any, props: any) => {
                  const d = props?.payload;
                  if (name === "3+ Putt" && d) return [`${value}% · avg ${d.avg} putts (n=${d.count})`, name];
                  return [`${value}%`, name];
                }}
                contentStyle={{ fontSize:12, borderRadius:8, border:"1px solid var(--line)" }}
              />
              <Legend wrapperStyle={{ fontSize:11 }} />
              {/* Custom label: avg putts above bar */}
              <Bar dataKey="1 Putt"  stackId="a" fill="#0f6e56" radius={[0,0,0,0]} />
              <Bar dataKey="2 Putt"  stackId="a" fill="#8995a3" />
              <Bar dataKey="3+ Putt" stackId="a" fill="#c94a2a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Sample sizes + your personal avg */}
        {distData.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:12 }}>
            {(distData as any[]).map((d: any) => (
              <span key={d.dist} style={{ fontSize:10, color:"var(--muted-2)", background:"var(--paper-alt)", borderRadius:999, padding:"2px 8px" }}>
                {d.dist}: avg {d.avg} ({d.count} holes)
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize:11, color:"var(--muted-2)", margin:"8px 0 0", fontStyle:"italic" }}>
          Your personal averages above are used as the baseline for grading. Distances with fewer than 5 samples use a 12-HCP research benchmark instead.
        </p>
      </div>

      {/* ── Section 2: Round-by-round putting grade ────────────────────────── */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"20px 22px", marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4, flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>Putting Grade by Round</span>
          {trendSummary && (
            <span style={{ fontSize:12, fontWeight:600, color: trendSummary.delta >= 0 ? "var(--green)" : "var(--bad)" }}>
              {trendSummary.delta >= 0 ? "▲" : "▼"} {Math.abs(trendSummary.delta)} putts/round vs prior 5
            </span>
          )}
        </div>
        <p style={{ fontSize:12, color:"var(--muted)", margin:"0 0 18px" }}>
          Strokes gained vs your own historical average putts from each distance. C = putted exactly as you normally do. A+ = 2+ strokes better than your norm. Line = 5-round average.
        </p>

        {roundPuttData.length < 2 ? (
          <p style={{ color:"var(--muted)", fontStyle:"italic", fontSize:13 }}>Need more rounds with first putt distance data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={roundPuttData as any} margin={{ top:8, right:8, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" height={36} tick={(props: any) => {
                const { x, y, payload } = props;
                const d: string = payload.value ?? "";
                const idx = (roundPuttData as any[]).findIndex((r: any) => r.name === d);
                const isYearStart = idx === 0 ||
                  (idx > 0 && d.slice(0, 4) !== ((roundPuttData as any[])[idx - 1]?.name ?? "").slice(0, 4));
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                      {d ? `${d.slice(5,7)}/${d.slice(8)}` : ""}
                    </text>
                    {isYearStart && (
                      <text x={0} y={0} dy={22} textAnchor="middle" fill="#555" fontSize={8} fontWeight={700}>
                        {d.slice(0, 4)}
                      </text>
                    )}
                  </g>
                );
              }} />
              <YAxis tickFormatter={(v: number) => (v >= 0 ? `+${v}` : `${v}`)} tick={{ fontSize:10, fill:"var(--muted)" }} />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 2" />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const g = puttGrade(d.sg);
                  return (
                    <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                      <div style={{ fontWeight:700, marginBottom:4 }}>{d.date} · {d.courseName}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:13 }}>{g.letter}</span>
                        <span style={{ color: d.sg >= 0 ? "var(--green)" : "var(--bad)", fontWeight:700 }}>
                          {d.sg >= 0 ? "+" : ""}{d.sg} strokes vs expected
                        </span>
                      </div>
                      <div style={{ color:"var(--muted)" }}>{d.withDist}/{d.totalHoles} holes with distance logged · avg {d.avgPutts} putts/hole</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="sg" name="SG Putts" radius={[4,4,0,0]}>
                {(roundPuttData as any[]).map((r: any, i: number) => (
                  <Cell key={i} fill={r.bg} fillOpacity={0.9} />
                ))}
              </Bar>
              <Line dataKey="rollingAvg" type="monotone" stroke="#f29450" strokeWidth={2.5} dot={false} name="5-rnd avg" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Grade legend */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:16 }}>
          {gradeRows.map(g => (
            <div key={g.letter} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 7px", fontSize:11, fontWeight:700 }}>{g.letter}</span>
              <span style={{ fontSize:10, color:"var(--muted-2)" }}>{g.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: Round table ──────────────────────────────────────────── */}
      {roundPuttData.length > 0 && (
        <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"20px 22px" }}>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--ink)", display:"block", marginBottom:14 }}>Round Log</span>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid var(--line)" }}>
                  {["Date","Course","Grade","SG Putts","Avg Putts","Holes w/ Dist"].map(h => (
                    <th key={h} style={{ padding:"6px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"var(--muted-2)", textTransform:"uppercase", letterSpacing:1, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([...(roundPuttData as any[])].reverse()).map((r: any, i: number) => {
                  const g = puttGrade(r.sg);
                  return (
                    <tr key={i} style={{ borderBottom:"1px solid var(--line-soft)" }}>
                      <td style={{ padding:"7px 10px", color:"var(--muted)", whiteSpace:"nowrap" }}>{r.date}</td>
                      <td style={{ padding:"7px 10px", color:"var(--ink-soft)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.courseName}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ background:g.bg, color:g.color, borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:12 }}>{g.letter}</span>
                      </td>
                      <td style={{ padding:"7px 10px", fontWeight:700, color: r.sg >= 0 ? "var(--green)" : "var(--bad)" }}>
                        {r.sg >= 0 ? "+" : ""}{r.sg}
                      </td>
                      <td style={{ padding:"7px 10px", color:"var(--ink-soft)" }}>{r.avgPutts}</td>
                      <td style={{ padding:"7px 10px", color:"var(--muted)" }}>{r.withDist}/{r.totalHoles}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Same USGA formula as clubhouse/page.tsx
function computeHandicapIndex(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1 : last20.length <= 8 ? 2 : last20.length <= 11 ? 3
    : last20.length <= 14 ? 4 : last20.length <= 16 ? 5 : last20.length <= 18 ? 6
    : last20.length === 19 ? 7 : 8;
  return Math.floor(sorted.slice(0, count).reduce((s, d) => s + d, 0) / count * 10) / 10;
}

export default function RoundsInsights() {
  const isMobile = useIsMobile();
  const [allHoles, setAllHoles] = useState<EnrichedHole[]>([]);
  const [roundSummaries, setRoundSummaries] = useState<RoundSummary[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [factorTypeFilter, setFactorTypeFilter] = useState("");
  const [useLastN, setUseLastN] = useState(false);
  const [lastN, setLastN] = useState(10);
  const [lastNInput, setLastNInput] = useState("10");
  const [tab, setTab] = useState<"coach" | "clubs" | "trends" | "factors" | "chipping" | "putting">("coach");
  const [coachingInsights, setCoachingInsights] = useState<CoachingInsights | null>(null);
  const [heavyReady, setHeavyReady] = useState(false);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [roundGrades, setRoundGrades] = useState<Record<number, RoundGrades>>({});

  useEffect(() => {
    async function init() {
      // 1. Synchronous: restore from localStorage immediately — no network wait
      const local = readLocalCache();
      if (local?.coachingInsights) {
        setCoachingInsights(local.coachingInsights);
      }
      if (local && local.allHoles.length > 0) {
        setAllHoles(local.allHoles);
        setRoundSummaries(local.summaries);
        setAvailableYears(local.availableYears);
        setTotalRounds(local.roundCount);
        if (local.handicapIndex != null) setHandicapIndex(local.handicapIndex);
        setLoading(false);
        setHeavyReady(true);
      }

      // 2. Always fetch fresh data — stale-while-revalidate. Exclude future rounds so
      //    the handicap computation and leak analysis don't include unplayed plan rounds.
      const today = new Date().toISOString().slice(0, 10);
      const { data: rounds } = await supabase.from("rounds").select("*").order("date", { ascending: true }).lte("date", today);
      if (!rounds) { setLoading(false); return; }
      const roundCount = rounds.length;
      const latestDate = rounds.length > 0 ? rounds[rounds.length - 1].date ?? null : null;
      setTotalRounds(roundCount);
      const years = new Set<number>();
      const enriched: EnrichedHole[] = [];
      const summaries_: RoundSummary[] = [];
      for (let ri = 0; ri < rounds.length; ri++) {
        const round = rounds[ri];
        const course = await getCourse(round.course_id);
        const year = round.date ? new Date(round.date).getFullYear() : new Date().getFullYear();
        years.add(year);
        const roundDiff = computeRoundDiff(round, course);
        for (const hole of round.holes ?? []) {
          if (!hole.score || !hole.par) continue;
          const ch = course?.holes.find((h: HoleData) => h.hole === hole.hole);
          const score = Number(hole.score);
          const putts = Number(hole.putts)||0;
          const CLUB_DIST: Record<string,number> = { Driver:230,"3W":210,"5W":195,"7W":180,"4i":185,"5i":175,"6i":165,"7i":155,"8i":145,"9i":130,PW:120,SW:100,LW:80 };
          const apprDistNum = CLUB_DIST[hole.appr_distance ?? ""] ?? 0;
          enriched.push({
            hole: hole.hole, par: hole.par, score,
            yards: ch?.yards ?? hole.yards ?? 0,
            dogleg: ch?.dogleg_direction ?? "",
            tee_accuracy: hole.tee_accuracy ?? "",
            appr_accuracy: hole.appr_accuracy ?? "",
            appr_distance: hole.appr_distance ?? "",
            appr_dist_num: apprDistNum,
            club: hole.club ?? "",
            chips: resolveChips(hole),
            putts,
            first_putt_distance: hole.first_putt_distance ?? "",
            greenside_bunker: Number(hole.greenside_bunker)||0,
            green_depth: ch?.approach_green_depth ?? 0,
            approach_bunker: getGreensideFromHole(ch ?? {}, "approach_bunker"),
            approach_green:  getGreensideFromHole(ch ?? {}, "approach_green"),
            water_penalty: Number(hole.water_penalty)||0,
            drop_or_out: Number(hole.drop_or_out)||0,
            tree_haz: Number(hole.tree_haz)||0,
            fairway_bunker: Number(hole.fairway_bunker)||0,
            drive_water_ob_pct: getDriveWaterPct(hole, ch),
            drive_tree_pct:     getDriveTreePct(hole, ch),
            drive_bunker_pct:   getDriveBunkerPct(hole, ch),
            courseId: round.course_id ?? "", courseName: round.course_name ?? "",
            tee_tree_left:    ch?.tee_tree_hazard_left    ?? false,
            tee_tree_right:   ch?.tee_tree_hazard_right   ?? false,
            tee_tree_across:  ch?.tee_tree_hazard_across  ?? false,
            tee_bunker_left:  ch?.tee_bunkers_left        ?? false,
            tee_bunker_right: ch?.tee_bunkers_right       ?? false,
            tee_water_left:   ch?.tee_water_out_left      ?? false,
            tee_water_right:  ch?.tee_water_out_right     ?? false,
            tee_water_across: ch?.tee_water_out_across    ?? false,
            appr_tree_left:   ch?.approach_tree_hazard_left   ?? false,
            appr_tree_right:  ch?.approach_tree_hazard_right  ?? false,
            appr_tree_long:   ch?.approach_tree_hazard_long   ?? false,
            appr_tree_across: (ch as any)?.approach_tree_hazard_across ?? false,
            appr_water_left:  ch?.approach_water_out_left  ?? false,
            appr_water_right: ch?.approach_water_out_right ?? false,
            appr_water_short: ch?.approach_water_out_short ?? false,
            appr_water_long:  ch?.approach_water_out_long  ?? false,
            stroke_index: hole.stroke_index ?? 0,
            rating: course?.rating ?? null, slope: course?.slope ?? null,
            roundIndex: ri, year,
            gir:    typeof hole.gir    === "boolean" ? hole.gir    : (score - putts) <= (hole.par - 2),
            grints: typeof hole.grints === "boolean" ? hole.grints : score <= hole.par,
            roundDiff,
          });
        }
        // Build round-level summary
        const scoredHoles = (round.holes ?? []).filter((h: any) => h.score && h.par);
        if (scoredHoles.length > 0) {
          const totalScore = scoredHoles.reduce((s: number, h: any) => s + Number(h.score), 0);
          const totalPar   = scoredHoles.reduce((s: number, h: any) => s + Number(h.par), 0);
          const totalPutts = scoredHoles.reduce((s: number, h: any) => s + (Number(h.putts) || 0), 0);
          const girCount   = scoredHoles.filter((h: any) => {
            const sc = Number(h.score), pt = Number(h.putts) || 0;
            return typeof h.gir === "boolean" ? h.gir : (sc - pt) <= (h.par - 2);
          }).length;
          const par4plus  = scoredHoles.filter((h: any) => Number(h.par) >= 4);
          const fwCount   = par4plus.filter((h: any) => h.tee_accuracy === "Hit").length;
          summaries_.push({
            idx: ri,
            date: round.date ?? "",
            courseId: round.course_id ?? "",
            courseName: round.course_name ?? "",
            score: totalScore, par: totalPar,
            toPar: totalScore - totalPar,
            diff: roundDiff,
            girPct: girCount / scoredHoles.length * 100,
            fwPct:  par4plus.length > 0 ? fwCount / par4plus.length * 100 : 0,
            avgPutts: totalPutts / scoredHoles.length,
            totalHoles: scoredHoles.length,
          });
        }
      }
      // Compute handicap using the same USGA formula as the Clubhouse page,
      // preferring the score_differential field already stored on the round.
      // Only count a round if: its date is in the past, OR all hole scores are entered.
      const hcapDiffs = rounds.map(r => {
        const isPast = (r.date ?? "") < today;
        const scoredCount = (r.holes ?? []).filter((h: any) => h.score && Number(h.score) > 0).length;
        const expectedHoles = (r.holes_played > 0) ? r.holes_played : 18;
        const isComplete = scoredCount >= expectedHoles;
        if (!isPast && !isComplete) return null;
        const sd = r.score_differential;
        if (sd != null) return (r.holes_played ?? 18) <= 9 ? sd * 2 : sd;
        const d = summaries_.find(s => s.date === (r.date ?? ""))?.diff;
        return d ?? null;
      }).filter((d): d is number => d !== null);
      setHandicapIndex(computeHandicapIndex(hcapDiffs));

      setAvailableYears(Array.from(years).sort((a,b) => b-a));
      setAllHoles(enriched);
      setRoundSummaries(summaries_);

      // Compute performance grades for every round (uses all rounds as baseline)
      const gradeMap: Record<number, RoundGrades> = {};
      for (let gi = 0; gi < rounds.length; gi++) {
        gradeMap[gi] = computeInsightGrades(rounds, gi);
      }
      setRoundGrades(gradeMap);

      const scoreChecksum = enriched.reduce((s, h) => s + h.score + h.putts, 0);
      const dataChanged = local?.scoreChecksum !== scoreChecksum;
      let freshInsights: CoachingInsights | null = local?.coachingInsights ?? null;

      if (dataChanged) {
        const baseline_ = enriched.length > 0
          ? enriched.reduce((s, h) => s + (h.score - h.par), 0) / enriched.length
          : 0;

        function corrItem(id: string, label: string, holes: EnrichedHole[], tactic: string): CachedLeak | null {
          if (holes.length < 5) return null;
          const avg_ = holes.reduce((s, h) => s + (h.score - h.par), 0) / holes.length;
          return { id, label, impact: avg_ - baseline_, count: holes.length, detail: "", tactic };
        }

        const candidates_: CachedLeak[] = [
          corrItem("drive-hit",   "Driving the fairway",   enriched.filter(h => h.tee_accuracy === "Hit"),    "Keep doing what you're doing off the tee."),
          corrItem("drive-left",  "Drive left misses",     enriched.filter(h => h.tee_accuracy === "Left"),   "Aim center or right — compensate for your miss pattern."),
          corrItem("drive-right", "Drive right misses",    enriched.filter(h => h.tee_accuracy === "Right"),  "Tee up left and aim center when right is trouble."),
          corrItem("drive-short", "Drive short",           enriched.filter(h => h.tee_accuracy === "Short"),  "Club up or tee it higher to get more distance."),
          corrItem("appr-hit",    "Approach on target",    enriched.filter(h => h.appr_accuracy === "Hit"),   "Your approach accuracy is a strength — keep it up."),
          corrItem("appr-short",  "Approach short",        enriched.filter(h => h.appr_accuracy === "Short"), "Take one more club — most amateur misses are short."),
          corrItem("appr-long",   "Approach long",         enriched.filter(h => h.appr_accuracy === "Long"),  "Club down, especially when the pin is back."),
          corrItem("appr-left",   "Approach left misses",  enriched.filter(h => h.appr_accuracy === "Left"),  "Check alignment — you may be set up too far left."),
          corrItem("appr-right",  "Approach right misses", enriched.filter(h => h.appr_accuracy === "Right"), "Stay through the shot — you may be pulling off at impact."),
          corrItem("gir",         "Greens in regulation",  enriched.filter(h => h.gir),                       "GIR holes are your best scoring opportunity."),
          corrItem("non-gir",     "Missing greens",        enriched.filter(h => !h.gir),                      "Improve approach accuracy or short game from off the green."),
          corrItem("putt-1",      "1-putt holes",          enriched.filter(h => h.putts === 1),               "Short putting and lag putting are working — keep it up."),
          corrItem("putt-3",      "3+ putt holes",         enriched.filter(h => h.putts >= 3),                "Work on lag putting — get within 3ft from distance."),
          corrItem("par3",        "Par 3 holes",           enriched.filter(h => h.par === 3),                 "Take one more club — most par 3 misses are short."),
          corrItem("par5",        "Par 5 holes",           enriched.filter(h => h.par === 5),                 "Par 5s are a scoring opportunity — play to your strengths."),
          corrItem("gs-bunker",   "Greenside bunker",      enriched.filter(h => h.greenside_bunker > 0),      "Avoid short-siding yourself — miss on the safe side."),
          corrItem("two-chip",    "2+ chip (chip+GS)",     enriched.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 2), "Scrambling from around the green costs strokes — avoid short-siding."),
        ].filter((c): c is CachedLeak => c !== null);

        const leaks_: CachedLeak[] = candidates_.filter(c => c.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 5);
        const strengths_: CachedLeak[] = candidates_.filter(c => c.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3);

        const last5_ = summaries_.slice(-5);
        const last20_ = summaries_.slice(-20);
        const avg5_: number | null = last5_.length > 0 ? last5_.reduce((s, r) => s + r.toPar, 0) / last5_.length : null;
        const avg20_: number | null = last20_.length > 0 ? last20_.reduce((s, r) => s + r.toPar, 0) / last20_.length : null;

        const ci: CoachingInsights = {
          leaks: leaks_, strengths: strengths_,
          computedAt: new Date().toISOString(),
          totalHoles: enriched.length,
          avg5: avg5_, avg20: avg20_,
          summaries: summaries_,
        };
        freshInsights = ci;
        setCoachingInsights(ci);
        supabase.from("player_data").upsert({ id: "singleton", coaching_insights: ci });
      }

      writeLocalCache({ roundCount, latestDate, scoreChecksum, allHoles: enriched, summaries: summaries_, availableYears: Array.from(years).sort((a,b) => b-a), coachingInsights: freshInsights, handicapIndex: computeHandicapIndex(hcapDiffs) });

      setLoading(false);
      setHeavyReady(true);
    }
    init();
  }, []);

  const roundFiltered = useLastN ? allHoles.filter(h => h.roundIndex >= totalRounds - lastN) : allHoles;
  const filtered = filterHoles(roundFiltered, filters);
  const baseline = calcAvg(roundFiltered);
  const filteredAvg = calcAvg(filtered);
  const impact = filtered.length > 0 ? filteredAvg - baseline : NaN;

  // ── Coach Focus Board: compute real leaks/strengths from hole data ──────────
  const focusBoardData = React.useMemo((): {
    leaks: FBLeak[]; strengths: FBStrength[];
    player: { handicap: number; rounds: number; trend30d: number };
  } | null => {
    if (allHoles.length < 10) return null;
    const base = allHoles.reduce((s,h) => s+(h.score-h.par), 0) / allHoles.length;
    const impOf = (hs: EnrichedHole[]) => hs.length < 3 ? NaN : hs.reduce((s,h) => s+(h.score-h.par),0)/hs.length - base;
    const r2 = (v: number) => Math.round(v*100)/100;
    const safeImp = (hs: EnrichedHole[]) => { const v=impOf(hs); return r2(isNaN(v)?0:v); };
    const freqOf  = (hs: EnrichedHole[], pool: EnrichedHole[]) => pool.length>0 ? Math.round(hs.length/pool.length*100) : 0;

    // Key slices
    const drv  = allHoles.filter(h=>h.par>=4&&h.tee_accuracy!=="");
    const dHit = drv.filter(h=>h.tee_accuracy==="Hit"),  dL=drv.filter(h=>h.tee_accuracy==="Left"),
          dR   = drv.filter(h=>h.tee_accuracy==="Right"), dS=drv.filter(h=>h.tee_accuracy==="Short");
    const apr   = allHoles.filter(h=>h.appr_accuracy!=="");
    const aHit  = apr.filter(h=>h.appr_accuracy==="Hit"),  aS=apr.filter(h=>h.appr_accuracy==="Short"),
          aLng  = apr.filter(h=>h.appr_accuracy==="Long"),  aLft=apr.filter(h=>h.appr_accuracy==="Left"),
          aRt   = apr.filter(h=>h.appr_accuracy==="Right");
    const gY=allHoles.filter(h=>h.gir), gN=allHoles.filter(h=>!h.gir);
    const p1=allHoles.filter(h=>h.putts===1), p2=allHoles.filter(h=>h.putts===2), p3=allHoles.filter(h=>h.putts>=3);
    const gsb=allHoles.filter(h=>h.greenside_bunker>0);
    const tc=allHoles.filter(h=>(Number(h.chips)||0)+(Number(h.greenside_bunker)||0)>=2);
    const par3h=allHoles.filter(h=>h.par===3), par5h=allHoles.filter(h=>h.par===5);
    const par3miss=par3h.filter(h=>!h.gir);

    type Cat = "Tee"|"Approach"|"Short game"|"Putting";
    type PatSpec = {
      id:string; cat:Cat; label:string; freqLabel:string;
      hs:EnrichedHole[]; pool:EnrichedHole[];
      chartSrc:{x:string;hs:EnrichedHole[];hi?:boolean}[];
      fix1:[string,string,string]; fix2:[string,string,string];
    };

    const PATS: PatSpec[] = [
      { id:"drive-right", cat:"Tee", label:"Drive right misses", freqLabel:"par-4/5 drives miss right",
        hs:dR, pool:drv, chartSrc:[{x:"Hit",hs:dHit},{x:"Left",hs:dL},{x:"Right",hs:dR,hi:true}],
        fix1:["Club swap","Try a fairway wood off right-trouble tees","Higher-lofted clubs cut right miss-rate by 15-20pp while losing minimal distance"],
        fix2:["Setup","Tee up on the right side of the box","Angles your swing path left of the trouble — same mechanics, better outcome"] },
      { id:"drive-left", cat:"Tee", label:"Drive left misses", freqLabel:"par-4/5 drives miss left",
        hs:dL, pool:drv, chartSrc:[{x:"Hit",hs:dHit},{x:"Left",hs:dL,hi:true},{x:"Right",hs:dR}],
        fix1:["Aim","Aim center or right — compensate for your miss pattern","Playing the miss is faster than changing your swing shape"],
        fix2:["Ball pos","Move ball back half an inch in your stance","Ball too far forward promotes pull-draws for most right-handed players"] },
      { id:"drive-short", cat:"Tee", label:"Short drives", freqLabel:"par-4/5 drives land short",
        hs:dS, pool:drv, chartSrc:[{x:"Hit",hs:dHit},{x:"Short",hs:dS,hi:true},{x:"Left",hs:dL}],
        fix1:["Launch","Tee it higher and attack the ball on the upswing","An upward angle of attack adds 15-20y without any extra swing speed"],
        fix2:["Speed","Don't ease off at impact — keep accelerating through the ball","Deceleration causes most short drives, not lack of power"] },
      { id:"appr-short", cat:"Approach", label:"Approach shots short", freqLabel:"approaches finish short of green",
        hs:aS, pool:apr, chartSrc:[{x:"On",hs:aHit},{x:"Short",hs:aS,hi:true},{x:"Long",hs:aLng}],
        fix1:["Club up","Take one more club on every approach — no exceptions","The #1 pattern in amateur golf: underclubbing on approach shots"],
        fix2:["Commit","Full swing with the right club beats a hard swing with the wrong one","A tentative 3/4 swing still loses yardage even with the correct club"] },
      { id:"appr-long", cat:"Approach", label:"Approach shots long", freqLabel:"approaches fly the green",
        hs:aLng, pool:apr, chartSrc:[{x:"On",hs:aHit},{x:"Short",hs:aS},{x:"Long",hs:aLng,hi:true}],
        fix1:["Club down","Club down and use the front-of-green yardage on back pins","Back-pin + full swing = long miss; front number eliminates it"],
        fix2:["Gapping","Re-check your carry numbers — they may have crept up 3-5y","Adrenaline and conditions add distance without you feeling it"] },
      { id:"appr-left", cat:"Approach", label:"Approach shots left", freqLabel:"approaches miss left of green",
        hs:aLft, pool:apr, chartSrc:[{x:"On",hs:aHit},{x:"Left",hs:aLft,hi:true},{x:"Right",hs:aRt}],
        fix1:["Alignment","Check alignment before every shot — most left misses are setup, not swing","Feet, hips, and shoulders all parallel to target line"],
        fix2:["Finish","Hold your finish toward the target — don't let the face close early","If your finish stalls left, you stopped rotating through impact"] },
      { id:"appr-right", cat:"Approach", label:"Approach shots right", freqLabel:"approaches miss right of green",
        hs:aRt, pool:apr, chartSrc:[{x:"On",hs:aHit},{x:"Left",hs:aLft},{x:"Right",hs:aRt,hi:true}],
        fix1:["Rotate","Stay through the shot — rotate fully to the target","Right pushes happen when the body stops and the hands flip right"],
        fix2:["Aim","Aim 5-10ft left of the flag to play your miss","Aim correction is the fastest win for a consistent push pattern"] },
      { id:"non-gir", cat:"Approach", label:"Missing greens (GIR)", freqLabel:"holes miss the green in regulation",
        hs:gN, pool:allHoles, chartSrc:[{x:"GIR",hs:gY},{x:"Non-GIR",hs:gN,hi:true}],
        fix1:["Club up","Take more club and aim center — most greens are missed short","GIR percentage is the strongest predictor of scoring improvement"],
        fix2:["Target","Aim for the largest part of the green, not the flag","Center of green rarely three-putts — miss short of pin = easy par chance"] },
      { id:"putt-3", cat:"Putting", label:"Three-putts", freqLabel:"holes result in 3 or more putts",
        hs:p3, pool:allHoles, chartSrc:[{x:"1-putt",hs:p1},{x:"2-putt",hs:p2},{x:"3+-putt",hs:p3,hi:true}],
        fix1:["Speed","Lag to a 3-foot circle — pure speed control drill","3-putts are almost always speed problems, not line problems"],
        fix2:["Past","Roll the first putt past the hole — never leave it short","Putts left short three-putt at 3× the rate of putts past the hole"] },
      { id:"gs-bunker", cat:"Short game", label:"Greenside bunkers", freqLabel:"holes include a greenside bunker shot",
        hs:gsb, pool:allHoles, chartSrc:[{x:"Bunker",hs:gsb,hi:true},{x:"GS rough",hs:tc.filter(h=>h.greenside_bunker===0)},{x:"GIR",hs:gY}],
        fix1:["Strategy","Miss approach to the fat side — avoid short-siding yourself","Short-side misses into bunkers cost ~0.7 more strokes than long-side"],
        fix2:["Technique","Open face, aim 2 inches behind the ball, accelerate through","Deceleration in the sand is the most common cause of thin/fat bunker shots"] },
      { id:"two-chip", cat:"Short game", label:"Multiple chip / scramble shots", freqLabel:"holes need 2+ short-game shots",
        hs:tc, pool:allHoles, chartSrc:[{x:"1 chip",hs:allHoles.filter(h=>(Number(h.chips)||0)+(Number(h.greenside_bunker)||0)===1)},{x:"2+ chips",hs:tc,hi:true},{x:"GIR",hs:gY}],
        fix1:["Landing","Pick an exact landing zone before you chip — not just a target line","Visualizing where the ball lands first cuts chip variability by ~40%"],
        fix2:["Club","Use a less-lofted club for bump-and-run when the path allows","A 7-iron chip is more forgiving than a pitching wedge around the green"] },
      { id:"gir", cat:"Approach", label:"Greens in regulation", freqLabel:"holes hit green in regulation",
        hs:gY, pool:allHoles, chartSrc:[{x:"GIR",hs:gY,hi:true},{x:"Non-GIR",hs:gN}],
        fix1:["Protect","Keep doing what's working — this is a measurable strength","GIR holes produce your best scoring; protect the conditions that create them"],
        fix2:["Extend","Identify which tee shots set up your GIR holes — repeat those patterns","Pattern recognition converts good rounds into great rounds"] },
      { id:"putt-1", cat:"Putting", label:"1-putt holes", freqLabel:"holes end in a 1-putt",
        hs:p1, pool:allHoles, chartSrc:[{x:"1-putt",hs:p1,hi:true},{x:"2-putt",hs:p2},{x:"3+-putt",hs:p3}],
        fix1:["Routine","Keep your short-putt routine dialed in — protect this strength","Consistency on inside 6ft is a top-5 trait of low-handicap players"],
        fix2:["Extend","Work on lag putting from 20-30ft to create more 1-putt looks","Better speed control on long putts is the fastest route to more 1-putts"] },
      { id:"par3", cat:"Tee", label:"Par 3 tee shots", freqLabel:"par-3 tee shots miss the green",
        hs:par3miss, pool:par3h, chartSrc:[{x:"GIR",hs:par3h.filter(h=>h.gir)},{x:"Miss",hs:par3miss,hi:true}],
        fix1:["Club up","Take one more club on every par 3 — no exceptions","Par-3 misses are almost universally short — this one change moves the needle most"],
        fix2:["Aim center","Target center of green on par 3s, not the flag","Pin-hunting on par 3s costs 0.4+ strokes vs center-of-green targets"] },
      { id:"par5", cat:"Approach", label:"Par 5 scoring", freqLabel:"par-5 holes score bogey or worse",
        hs:par5h.filter(h=>h.score>h.par), pool:par5h,
        chartSrc:[{x:"Eagle/Birdie",hs:par5h.filter(h=>h.score<=h.par)},{x:"Par",hs:par5h.filter(h=>h.score===h.par)},{x:"Bogey+",hs:par5h.filter(h=>h.score>h.par),hi:true}],
        fix1:["Layup","Lay up to your favourite approach yardage — don't force the green","A blow-up on a par 5 costs 1-2 strokes and wipes out 3 good holes"],
        fix2:["3rd shot","Leave yourself a full-lofted wedge for shot 3","A full wedge is easier to control than a half or three-quarter wedge"] },
    ];

    type Computed = { p:PatSpec; impact:number; freqPct:number; count:number };
    const computed: Computed[] = PATS.map(p => {
      const imp = impOf(p.hs);
      if (isNaN(imp) || p.hs.length < 3) return null;
      return { p, impact:r2(imp), freqPct:freqOf(p.hs, p.pool), count:p.hs.length };
    }).filter((x): x is Computed => x !== null);

    // Top 5 leaks (positive impact = costs strokes), top strengths (negative)
    const leakCands = computed.filter(c=>c.impact>0.05).sort((a,b)=>b.impact-a.impact).slice(0,5);
    const strCands  = computed.filter(c=>c.impact<-0.05).sort((a,b)=>a.impact-b.impact);

    const leaks: FBLeak[] = leakCands.map((c, idx) => {
      const { p, impact, freqPct, count } = c;
      const freqTarget = Math.max(5, Math.round(freqPct * 0.55));
      const impTarget  = r2(Math.max(0.05, impact * 0.45));
      return {
        id:p.id, rank:idx+1, cat:p.cat, label:p.label, impact, holes:count, freqPct,
        freqLabel:p.freqLabel,
        diagnosis:`${freqPct}% of relevant holes show this pattern — costing ${impact} strokes/round above your baseline (${count} holes tracked).`,
        chart:p.chartSrc.map(cd=>({ x:cd.x, v:safeImp(cd.hs), hi:!!cd.hi })),
        goals:{
          frequency:{ metric:`${p.label} rate`, current:freqPct, target:freqTarget, unit:"%" as const, note:"Reduce how often this pattern occurs." },
          impact:   { metric:"Strokes lost / round", current:impact, target:impTarget, unit:"" as const,  note:"Reduce the damage when it does happen." },
        },
        fixes:[
          { tag:p.fix1[0], title:p.fix1[1], body:p.fix1[2], stat:`Current cost: +${impact}/rd across ${count} holes.`, proj:r2(impact*0.4), recommended:true },
          { tag:p.fix2[0], title:p.fix2[1], body:p.fix2[2], stat:`Frequency target: ${freqTarget}% (from ${freqPct}%).`, proj:r2(impact*0.2) },
        ],
      };
    });

    const seenCats = new Set<string>();
    const strengths: FBStrength[] = [];
    for (const c of strCands) {
      if (seenCats.has(c.p.cat) || c.count < 3) continue;
      seenCats.add(c.p.cat);
      strengths.push({
        cat:c.p.cat, metric:c.p.label,
        value:`−${Math.abs(c.impact).toFixed(2)}`,
        note:`Saves ${Math.abs(c.impact).toFixed(2)} strokes vs your baseline (${c.count} holes).`,
      });
      if (strengths.length >= 4) break;
    }

    // Trend: last 5 rounds vs prior 5
    const rec = roundSummaries.slice(-5), pri = roundSummaries.slice(-10, -5);
    const trend30d = rec.length > 0 && pri.length > 0
      ? r2(rec.reduce((s,r)=>s+r.toPar,0)/rec.length - pri.reduce((s,r)=>s+r.toPar,0)/pri.length)
      : 0;

    // Grade-based leaks: inject if a grade category is trending C or worse
    const GRADE_CATS_FB = [
      { key: "driver" as const, cat: "Tee" as const, label: "Driver grade declining", freqLabel: "recent rounds grade C or worse",
        fix1: ["Club swap","Try a fairway wood on tight holes","Lower-lofted tee clubs reduce miss-rate by 15-20pp while losing minimal distance"] as [string,string,string],
        fix2: ["Aim","Tee up on the trouble side of the box","Angles your swing path away from trouble — same mechanics, better outcome"] as [string,string,string] },
      { key: "iron" as const, cat: "Approach" as const, label: "Iron grade declining", freqLabel: "recent rounds grade C or worse",
        fix1: ["Club up","Take one more club on every approach — no exceptions","The #1 pattern in amateur golf: underclubbing on approach shots"] as [string,string,string],
        fix2: ["Target","Aim center-green instead of flag-hunting","Center-of-green misses cost 0.4 fewer strokes than pin-hunts"] as [string,string,string] },
      { key: "chipping" as const, cat: "Short game" as const, label: "Chipping grade declining", freqLabel: "recent rounds grade C or worse",
        fix1: ["Landing","Pick a precise landing spot before every chip","Visualizing the landing zone cuts chip variability by ~40%"] as [string,string,string],
        fix2: ["Club","Use a bump-and-run (7-iron) when path allows","A less-lofted chip is more forgiving than a pitching wedge around the green"] as [string,string,string] },
      { key: "putter" as const, cat: "Putting" as const, label: "Putting grade declining", freqLabel: "recent rounds grade C or worse",
        fix1: ["Speed","Lag to a 3-foot circle — focus on speed, not line","3-putts are almost always speed problems, not line problems"] as [string,string,string],
        fix2: ["Distance","Practice from 15-30ft until you stop within 3ft","Speed control from medium range eliminates most 3-putt distance problems"] as [string,string,string] },
    ];
    const recent10 = [...roundSummaries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const gradeLeakResults: FBLeak[] = GRADE_CATS_FB.flatMap(gc => {
      const graded = recent10.map(s => roundGrades[s.idx]?.[gc.key]).filter((g): g is PerfGrade => g != null);
      if (graded.length < 3) return [];
      const badGrades = graded.filter(g => ["C","D","F"].includes(g.letter));
      if (badGrades.length < Math.ceil(graded.length * 0.6)) return [];
      const worst = badGrades.reduce((w, g) => (GRADE_LEAK_IMPACT[g.letter]??0) > (GRADE_LEAK_IMPACT[w.letter]??0) ? g : w);
      const impact = r2(GRADE_LEAK_IMPACT[worst.letter] ?? 0.08);
      const freqPct = Math.round(badGrades.length / graded.length * 100);
      // Build chart from holes in rounds where grade was good vs bad
      const goodIdx = new Set(recent10.filter(s => { const g = roundGrades[s.idx]?.[gc.key]; return g != null && !["C","D","F"].includes(g.letter); }).map(s => s.idx));
      const badIdx  = new Set(recent10.filter(s => { const g = roundGrades[s.idx]?.[gc.key]; return g != null && ["C","D","F"].includes(g.letter); }).map(s => s.idx));
      const goodHs = allHoles.filter(h => goodIdx.has(h.roundIndex));
      const badHs  = allHoles.filter(h => badIdx.has(h.roundIndex));
      const chart = [
        { x: "Good grade rounds", v: safeImp(goodHs) },
        { x: "Poor grade rounds", v: safeImp(badHs), hi: true },
      ];
      return [{
        id: `grade-${gc.key}`, rank: 99, cat: gc.cat, label: gc.label,
        impact, holes: badGrades.length, freqPct,
        freqLabel: gc.freqLabel,
        diagnosis: `${freqPct}% of your last ${graded.length} graded rounds scored ${worst.letter} in ${gc.label.replace(" grade declining","").toLowerCase()} — this is a consistent drag on your score.`,
        chart,
        goals: {
          frequency: { metric: `${gc.label} C+ rate`, current: freqPct, target: Math.max(0, freqPct - 40), unit: "%" as const, note: "Reduce rounds grading below B." },
          impact:    { metric: "Strokes lost / round", current: impact, target: r2(impact * 0.4), unit: "" as const, note: "Get back to your baseline performance." },
        },
        fixes: [
          { tag: gc.fix1[0], title: gc.fix1[1], body: gc.fix1[2], stat: `${badGrades.length}/${graded.length} recent rounds graded ${worst.letter}.`, proj: r2(impact * 0.5), recommended: true },
          { tag: gc.fix2[0], title: gc.fix2[1], body: gc.fix2[2], stat: `Target: ≤${Math.max(0,freqPct-40)}% poor-grade rounds.`, proj: r2(impact * 0.3) },
        ],
      }];
    });
    const allLeaksForFB = [...leaks, ...gradeLeakResults]
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 7)
      .map((l, idx) => ({ ...l, rank: idx + 1 }));

    return {
      leaks: allLeaksForFB, strengths,
      player:{ handicap: handicapIndex ?? 0, rounds: roundSummaries.length, trend30d },
    };
  }, [allHoles, roundSummaries, handicapIndex, roundGrades]);

  const anyActive =
    filters.driveAcc.size > 0 || filters.apprAcc.size > 0 ||
    filters.drivingClubs.size > 0 || filters.apprClubs.size > 0 ||
    filters.years.size > 0 || filters.pars.size > 0 ||
    filters.highWater || filters.highTree || filters.highBunker ||
    filters.gsBunker || filters.girOnly || filters.nonGirOnly ||
    filters.teeTreeLeft || filters.teeTreeRight || filters.teeTreeAcross ||
    filters.teeBunkerLeft || filters.teeBunkerRight ||
    filters.teeWaterLeft || filters.teeWaterRight || filters.teeWaterAcross ||
    filters.apprTreeLeft || filters.apprTreeRight || filters.apprTreeLong || filters.apprTreeAcross ||
    filters.apprWaterLeft || filters.apprWaterRight || filters.apprWaterShort || filters.apprWaterLong ||
    !!filters.courseId || !!filters.siMin || !!filters.siMax ||
    !!filters.ratingMin || !!filters.ratingMax ||
    !!filters.slopeMin || !!filters.slopeMax ||
    !!filters.puttsMin || !!filters.puttsMax ||
    !!filters.chipsMin || !!filters.chipsMax || !!filters.firstPutt ||
    !!filters.greenDepth || !!filters.yardsBucket || !!filters.siTierFilter ||
    !!filters.doglegFilter || !!filters.apprDistBucket || filters.diffBucket.size > 0 ||
    Object.values(filters.gsPositionFilter).some(v => v !== 0) || filters.gsSurface !== "any";

  const holesWithKnownChips = filtered.filter(h => h.chips !== null);

  function groupedCorr(label: string, groupFn: (h: EnrichedHole) => string, pool: EnrichedHole[] = filtered) {
    const groups: Record<string, EnrichedHole[]> = {};
    for (const h of pool) {
      const key = groupFn(h);
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }
    return Object.entries(groups).map(([key, holes]) => ({
      label: `${label}: ${key}`, count: holes.length,
      avg: calcAvg(holes),
      impact: calcAvg(holes) - baseline,
    }));
  }

  const MIN_HOLES = 5;

  const correlations = [
    { label: "Drive Hit",        holes: filtered.filter(h => h.tee_accuracy==="Hit") },
    { label: "Drive Left",       holes: filtered.filter(h => h.tee_accuracy==="Left") },
    { label: "Drive Right",      holes: filtered.filter(h => h.tee_accuracy==="Right") },
    { label: "Drive Short",      holes: filtered.filter(h => h.tee_accuracy==="Short") },
    { label: "Drive Long",       holes: filtered.filter(h => h.tee_accuracy==="Long") },
    { label: "Approach Hit",     holes: filtered.filter(h => h.appr_accuracy==="Hit") },
    { label: "Approach Left",    holes: filtered.filter(h => h.appr_accuracy==="Left") },
    { label: "Approach Right",   holes: filtered.filter(h => h.appr_accuracy==="Right") },
    { label: "Approach Short",   holes: filtered.filter(h => h.appr_accuracy==="Short") },
    { label: "Approach Long",    holes: filtered.filter(h => h.appr_accuracy==="Long") },
    { label: "GIR",              holes: filtered.filter(h => h.gir) },
    { label: "Non-GIR",          holes: filtered.filter(h => !h.gir) },
    { label: "GS Bunker",        holes: filtered.filter(h => h.greenside_bunker > 0) },
    { label: "2+ Chip",          holes: filtered.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 2) },
    { label: "1+ Chips",         holes: holesWithKnownChips.filter(h => (h.chips ?? 0) >= 1) },
    { label: "1 Putt",           holes: filtered.filter(h => h.putts === 1) },
    { label: "2 Putts",          holes: filtered.filter(h => h.putts === 2) },
    { label: "3+ Putts",         holes: filtered.filter(h => h.putts >= 3) },
    { label: "Tee: Tree/Haz Left",   holes: filtered.filter(h => h.tee_tree_left) },
    { label: "Tee: Tree/Haz Right",  holes: filtered.filter(h => h.tee_tree_right) },
    { label: "Tee: Tree/Haz Across", holes: filtered.filter(h => h.tee_tree_across) },
    { label: "Tee: Bunker Left",     holes: filtered.filter(h => h.tee_bunker_left) },
    { label: "Tee: Bunker Right",    holes: filtered.filter(h => h.tee_bunker_right) },
    { label: "Tee: OB/Water Left",   holes: filtered.filter(h => h.tee_water_left) },
    { label: "Tee: OB/Water Right",  holes: filtered.filter(h => h.tee_water_right) },
    { label: "Tee: OB/Water Across", holes: filtered.filter(h => h.tee_water_across) },
    { label: "High OB/Water Risk",   holes: filtered.filter(h => h.drive_water_ob_pct > 0) },
    { label: "High Tree Risk",       holes: filtered.filter(h => h.drive_tree_pct > 0) },
    { label: "High Bunker Risk",     holes: filtered.filter(h => h.drive_bunker_pct > 0) },
    { label: "Appr: Tree/Haz Left",   holes: filtered.filter(h => h.appr_tree_left) },
    { label: "Appr: Tree/Haz Right",  holes: filtered.filter(h => h.appr_tree_right) },
    { label: "Appr: Tree/Haz Long",   holes: filtered.filter(h => h.appr_tree_long) },
    { label: "Appr: Tree/Haz Across", holes: filtered.filter(h => h.appr_tree_across) },
    { label: "Appr: OB/Water Left",   holes: filtered.filter(h => h.appr_water_left) },
    { label: "Appr: OB/Water Right",  holes: filtered.filter(h => h.appr_water_right) },
    { label: "Appr: OB/Water Short",  holes: filtered.filter(h => h.appr_water_short) },
    { label: "Appr: OB/Water Long",   holes: filtered.filter(h => h.appr_water_long) },
    ...["short_left","short_middle","short_right","middle_left","middle_right","long_left","long_middle","long_right"].map(pos => ({
      label: `GS Bunker: ${pos.replace("_"," ")}`,
      holes: filtered.filter(h => h.approach_bunker[pos as keyof GreensideFilter] === 2),
    })),
    ...["short_left","short_middle","short_right","middle_left","middle_right","long_left","long_middle","long_right"].map(pos => ({
      label: `GS Green: ${pos.replace("_"," ")}`,
      holes: filtered.filter(h => h.approach_green[pos as keyof GreensideFilter] === 1),
    })),
    { label: "Green Depth <20",   holes: filtered.filter(h => h.green_depth > 0 && h.green_depth < 20) },
    { label: "Green Depth 20-24", holes: filtered.filter(h => h.green_depth >= 20 && h.green_depth <= 24) },
    { label: "Green Depth 25-29", holes: filtered.filter(h => h.green_depth >= 25 && h.green_depth <= 29) },
    { label: "Green Depth 30-34", holes: filtered.filter(h => h.green_depth >= 30 && h.green_depth <= 34) },
    { label: "Green Depth 35-39", holes: filtered.filter(h => h.green_depth >= 35 && h.green_depth <= 39) },
    { label: "Green Depth 40+",   holes: filtered.filter(h => h.green_depth >= 40) },
  ].map(({ label, holes }) => ({
    label, count: holes.length, avg: calcAvg(holes),
    impact: holes.length > 0 ? calcAvg(holes) - baseline : NaN,
  }));

  const yardsBuckets = groupedCorr("Hole Yards", h => yardsBucket(h.yards));
  const holeClusters = groupedCorr("Hole Cluster", h => holeCluster(h.hole));
  const siBuckets    = groupedCorr("Handicap",   h => siTier(h.stroke_index));
  const doglegBuckets= groupedCorr("Dogleg",     h => h.dogleg || "None");
  const apprBuckets  = groupedCorr("Appr Dist",  h => h.appr_dist_num > 0 ? apprDistBucket(h.appr_dist_num) : "");
  const parBuckets   = groupedCorr("Par",         h => `Par ${h.par}`);

  // Grade correlations: holes from rounds with each grade bucket
  const GRADE_CORR_CATS = [
    { key: "driver" as const, label: "Driver" },
    { key: "iron" as const,   label: "Irons" },
    { key: "chipping" as const, label: "Chipping" },
    { key: "putter" as const, label: "Putting" },
  ];
  const GRADE_CORR_BUCKETS = [
    { suffix: "A+/A", letters: ["A+","A"] },
    { suffix: "B",    letters: ["B"] },
    { suffix: "C",    letters: ["C"] },
    { suffix: "D/F",  letters: ["D","F"] },
  ];
  const gradeCorrelations = GRADE_CORR_CATS.flatMap(gc =>
    GRADE_CORR_BUCKETS.map(bucket => {
      const holes = filtered.filter(h => {
        const g = roundGrades[h.roundIndex]?.[gc.key];
        return g != null && bucket.letters.includes(g.letter);
      });
      return { label: `Grade: ${gc.label} ${bucket.suffix}`, holes };
    })
  ).map(({ label, holes }) => ({
    label, count: holes.length, avg: calcAvg(holes),
    impact: holes.length > 0 ? calcAvg(holes) - baseline : NaN,
  }));

  function getFactorType(label: string): string {
    if (label.startsWith("Par:")) return "Par";
    if (label.startsWith("Hole Yards:")) return "Hole Yards";
    if (label.startsWith("Hole Cluster:")) return "Hole Cluster";
    if (label.startsWith("Handicap:")) return "Handicap Tier";
    if (label.startsWith("Dogleg:")) return "Dogleg";
    if (label.startsWith("Appr Dist:")) return "Approach Distance";
    if (label.startsWith("Drive ")) return "Drive Accuracy";
    if (label.startsWith("Approach ")) return "Approach Accuracy";
    if (label === "GIR" || label === "Non-GIR") return "GIR";
    if (label.endsWith("Putt") || label.endsWith("Putts")) return "Putting";
    if (label.startsWith("Tee:") || label.startsWith("High ")) return "Tee Hazards";
    if (label.startsWith("Appr:")) return "Approach Hazards";
    if (label.startsWith("GS Bunker:") || label.startsWith("GS Green:") || label === "GS Bunker") return "Greenside";
    if (label.startsWith("Green Depth")) return "Green Depth";
    if (label === "1+ Chips") return "Short Game";
    if (label.startsWith("Grade:")) return "Performance Grades";
    return "Other";
  }

  const allCorrelations = [
    ...correlations, ...yardsBuckets, ...holeClusters, ...siBuckets, ...doglegBuckets, ...apprBuckets, ...parBuckets,
    ...gradeCorrelations,
  ]
    .filter(c => c.count >= MIN_HOLES)
    .filter(c => {
      if (filters.impactDir === "positive") return c.impact > 0;
      if (filters.impactDir === "negative") return c.impact < 0;
      return true;
    })
    .filter(c => !factorTypeFilter || getFactorType(c.label) === factorTypeFilter)
    .sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact));

  const pill = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: "1px solid",
    background: active ? "#0f6e56" : "white",
    color: active ? "white" : "#0f6e56", borderColor: "#0f6e56",
    whiteSpace: "nowrap",
  });
  const sel: React.CSSProperties = {
    padding: "5px 8px", borderRadius: 8, border: "1px solid #0f6e56",
    fontSize: 12, color: "#0f6e56", background: "white", cursor: "pointer",
  };
  const numInput: React.CSSProperties = {
    padding: "5px 6px", borderRadius: 8, border: "1px solid #0f6e56",
    fontSize: 12, color: "#0f6e56", width: 54,
  };
  const fl: React.CSSProperties = { fontSize: 11, color: "#0f6e56", margin: "0 0 6px", fontWeight: 600 };

  const driveActive = filters.driveAcc.size + filters.drivingClubs.size +
    (filters.highWater?1:0) + (filters.highTree?1:0) + (filters.highBunker?1:0) +
    (filters.teeTreeLeft?1:0) + (filters.teeTreeRight?1:0) + (filters.teeTreeAcross?1:0) +
    (filters.teeBunkerLeft?1:0) + (filters.teeBunkerRight?1:0) +
    (filters.teeWaterLeft?1:0) + (filters.teeWaterRight?1:0) + (filters.teeWaterAcross?1:0);
  const apprActive = filters.apprAcc.size + filters.apprClubs.size + (filters.girOnly?1:0) + (filters.nonGirOnly?1:0) +
    (filters.apprTreeLeft?1:0) + (filters.apprTreeRight?1:0) + (filters.apprTreeLong?1:0) + (filters.apprTreeAcross?1:0) +
    (filters.apprWaterLeft?1:0) + (filters.apprWaterRight?1:0) + (filters.apprWaterShort?1:0) + (filters.apprWaterLong?1:0);
  const greensideActive = (filters.gsBunker?1:0) +
    (filters.puttsMin||filters.puttsMax?1:0) +
    (filters.chipsMin||filters.chipsMax?1:0) +
    (filters.firstPutt?1:0) + (filters.greenDepth?1:0) +
    (Object.values(filters.gsPositionFilter).some(v=>v!==0)?1:0) +
    (filters.gsSurface!=="any"?1:0);
  const courseActive = (filters.courseId?1:0) + filters.pars.size +
    (filters.siMin||filters.siMax?1:0) +
    (filters.ratingMin||filters.ratingMax?1:0) +
    (filters.slopeMin||filters.slopeMax?1:0) +
    (filters.yardsBucket?1:0) + (filters.siTierFilter?1:0) +
    (filters.doglegFilter?1:0) + (filters.apprDistBucket?1:0) +
    (filters.diffBucket.size>0?1:0)

  const visibleSummaries = roundSummaries.length > 0 ? roundSummaries : (coachingInsights?.summaries ?? []);

  return (
    <div style={COACH_ROOT}>
    <main style={{ maxWidth: tab === "coach" || tab === "clubs" ? 1280 : 900, width: "100%", margin: "0 auto", padding: isMobile ? "0 16px 80px" : "0 24px 80px", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0 16px" }}>
        <div>
          <a href="/rounds" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.3, textDecoration: "none" }}>← Rounds</a>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontStyle: "italic", fontSize: 28, color: "var(--ink)", lineHeight: 1.1, marginTop: 4 }}>
            Coach
          </div>
        </div>
        <a href="/rounds/chat" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--green-deep)", color: "white", border: "none",
          borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
        }}>Ask Coach</a>
      </div>

      {/* Tab bar — matches clubhouse exactly */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)", marginBottom: 24, gap: 0, overflowX: "auto" }}>
        {([
          { id: "coach" as const, label: "Coach" },
          { id: "trends" as const, label: "Performance Trend" },
          { id: "factors" as const, label: "Factor Correlations" },
          { id: "clubs" as const, label: "Irons & Wedges" },
          { id: "chipping" as const, label: "Chipping" },
          { id: "putting" as const, label: "Putting" },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: "none", background: "none", border: "none",
            borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            padding: "10px 14px", marginBottom: -1, cursor: "pointer",
            fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? "var(--ink)" : "var(--ink-mute)",
            whiteSpace: "nowrap" as const,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: tab === "coach" ? "block" : "none" }}>
        <FocusBoard
          leaks={focusBoardData?.leaks}
          strengths={focusBoardData?.strengths}
          player={focusBoardData?.player}
        />
      </div>

      <div style={{ display: tab === "clubs" ? "block" : "none" }}>
        <IronsWedges
          holes={allHoles}
          totalRounds={totalRounds}
          roundSummaries={roundSummaries}
          onShowFactors={(club) => {
            setFilters(f => ({ ...f, apprClubs: new Set([club]), impactDir: "all" }));
            setFactorTypeFilter("");
            setTab("factors");
          }}
        />
      </div>

      <div style={{ display: tab === "trends" ? "block" : "none" }}>
        {visibleSummaries.length > 0 ? (
          <TrendsView summaries={visibleSummaries} />
        ) : loading ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading rounds…</p>
        ) : (
          <p style={{ color: "var(--muted)" }}>No hole data found. Add some rounds first.</p>
        )}
      </div>

      <div style={{ display: tab === "factors" ? "block" : "none" }}>
        {loading && allHoles.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading rounds…</p>
        ) : !loading && allHoles.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No hole data found. Add some rounds first.</p>
        ) : (
          <div>
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Filters</p>
            {(anyActive || useLastN) && (
              <button onClick={() => { setFilters(DEFAULT_FILTERS); setUseLastN(false); setLastN(10); }}
                style={{ fontSize: 12, color: "#0f6e56", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset</button>
            )}
          </div>

          <CollapsibleSection title="Course / Rounds" activeCount={
            (useLastN?1:0) + filters.years.size + (filters.courseId?1:0) +
            (filters.ratingMin||filters.ratingMax?1:0) + (filters.slopeMin||filters.slopeMax?1:0) +
            (filters.diffBucket?1:0)
          }>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Rounds</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <button style={pill(!useLastN)} onClick={() => setUseLastN(false)}>All</button>
                <button style={pill(useLastN)} onClick={() => setUseLastN(true)}>Last</button>
                {useLastN && (<>
                  <input type="number" min={1} max={totalRounds} value={lastNInput}
                    onChange={e => setLastNInput(e.target.value)}
                    onBlur={e => { const v = Math.max(1, Math.min(totalRounds, Number(e.target.value) || 1)); setLastN(v); setLastNInput(String(v)); }}
                    style={{ width: 44, padding: "4px 5px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 12, color: "#0f6e56", textAlign: "center" }} />
                  <span style={{ fontSize: 10, color: "#0f6e56" }}>of {totalRounds}</span>
                </>)}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Year</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {availableYears.map(y => (
                  <button key={y} style={pill(filters.years.has(String(y)))} onClick={() => setFilters(f => ({ ...f, years: toggleSet(f.years, String(y)) }))}>{y}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Course</p>
              <select value={filters.courseId} onChange={e => setFilters(f => ({ ...f, courseId: e.target.value }))} style={{ ...sel, width: "100%" }}>
                <option value="">All courses</option>
                {Array.from(new Map(allHoles.map(h => [h.courseId, h.courseName])).entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Handicap Differential</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {DIFF_BUCKETS.map(b => (
                  <button key={b.val} style={pill(filters.diffBucket.has(b.val))}
                    onClick={() => setFilters(f => ({ ...f, diffBucket: toggleSet(f.diffBucket, b.val) }))}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Course Rating</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" step="0.1" placeholder="Min" value={filters.ratingMin} onChange={e => setFilters(f => ({ ...f, ratingMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" step="0.1" placeholder="Max" value={filters.ratingMax} onChange={e => setFilters(f => ({ ...f, ratingMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div>
              <p style={fl}>Slope</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" placeholder="Min" value={filters.slopeMin} onChange={e => setFilters(f => ({ ...f, slopeMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" placeholder="Max" value={filters.slopeMax} onChange={e => setFilters(f => ({ ...f, slopeMax: e.target.value }))} style={numInput} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Hole" activeCount={
            filters.pars.size + (filters.yardsBucket?1:0) + (filters.siTierFilter?1:0) +
            (filters.siMin||filters.siMax?1:0) + (filters.doglegFilter?1:0)
          }>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Par</p>
              <div style={{ display: "flex", gap: 4 }}>
                {["3","4","5"].map(p => (
                  <button key={p} style={pill(filters.pars.has(p))} onClick={() => setFilters(f => ({ ...f, pars: toggleSet(f.pars, p) }))}>Par {p}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Hole Yards Bucket</p>
              <select value={filters.yardsBucket} onChange={e => setFilters(f => ({ ...f, yardsBucket: e.target.value }))} style={{ ...sel, width: "100%", maxWidth: 160 }}>
                <option value="">Any</option>
                {Array.from(new Set(allHoles.map(h => yardsBucket(h.yards)))).filter(Boolean).sort().map(b => <option key={b} value={b}>{b} yds</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Hole Handicap Tier</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["SI 1-4","SI 5-9","SI 10-14","SI 15-18"].map(t => (
                  <button key={t} style={pill(filters.siTierFilter===t)} onClick={() => setFilters(f => ({ ...f, siTierFilter: f.siTierFilter===t?"":t }))}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Hole Handicap Range</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <select value={filters.siMin} onChange={e => setFilters(f => ({ ...f, siMin: e.target.value }))} style={sel}>
                  <option value="">Min</option>
                  {Array.from({length:18},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <select value={filters.siMax} onChange={e => setFilters(f => ({ ...f, siMax: e.target.value }))} style={sel}>
                  <option value="">Max</option>
                  {Array.from({length:18},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <p style={fl}>Dogleg</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Array.from(new Set(allHoles.map(h => h.dogleg || "None"))).sort().map(d => (
                  <button key={d} style={pill(filters.doglegFilter===d)} onClick={() => setFilters(f => ({ ...f, doglegFilter: f.doglegFilter===d?"":d }))}>{d}</button>
                ))}
              </div>
            </div>
          <div style={{ marginBottom: 10 }}>
              <p style={fl}>Hole #</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["1–3","4–6","7–9","10–12","13–15","16–18"].map(c => (
                  <button key={c} style={pill(filters.holeCluster===c)} onClick={() => setFilters(f => ({ ...f, holeCluster: f.holeCluster===c?"":c }))}>{c}</button>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Driving / Tee" activeCount={driveActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Drive Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["Hit","Left","Right","Short","Long"].map(acc => (
                  <button key={acc} style={pill(filters.driveAcc.has(acc))} onClick={() => setFilters(f => ({ ...f, driveAcc: toggleSet(f.driveAcc, acc) }))}>{acc}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Driving Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {DRIVE_CLUBS.map(club => (
                  <button key={club} style={pill(filters.drivingClubs.has(club))} onClick={() => setFilters(f => ({ ...f, drivingClubs: toggleSet(f.drivingClubs, club) }))}>{club}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Tee Risks</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                <button style={pill(filters.highWater)}  onClick={() => setFilters(f => ({ ...f, highWater: !f.highWater }))}>Water</button>
                <button style={pill(filters.highTree)}   onClick={() => setFilters(f => ({ ...f, highTree: !f.highTree }))}>Trees</button>
                <button style={pill(filters.highBunker)} onClick={() => setFilters(f => ({ ...f, highBunker: !f.highBunker }))}>Bunker</button>
              </div>
            </div>
            <div>
              <p style={fl}>Tee Hazards</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[
                  { label: "Trees L",   key: "teeTreeLeft" },   { label: "Trees R",   key: "teeTreeRight" },
                  { label: "Trees Across", key: "teeTreeAcross" },
                  { label: "Bkr L",    key: "teeBunkerLeft" },  { label: "Bkr R",    key: "teeBunkerRight" },
                  { label: "Water L",  key: "teeWaterLeft" },   { label: "Water R",  key: "teeWaterRight" },
                  { label: "Water Across", key: "teeWaterAcross" },
                ].map(({ label, key }) => (
                  <button key={key} style={pill(!!(filters as any)[key])} onClick={() => setFilters(f => ({ ...f, [key]: !(f as any)[key] }))}>{label}</button>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Approach" activeCount={apprActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["Hit","Left","Right","Short","Long"].map(acc => (
                  <button key={acc} style={pill(filters.apprAcc.has(acc))} onClick={() => setFilters(f => ({ ...f, apprAcc: toggleSet(f.apprAcc, acc) }))}>{acc}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {APPROACH_CLUBS.map(club => (
                  <button key={club} style={pill(filters.apprClubs.has(club))} onClick={() => setFilters(f => ({ ...f, apprClubs: toggleSet(f.apprClubs, club) }))}>{club}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Distance Bucket</p>
              <select value={filters.apprDistBucket} onChange={e => setFilters(f => ({ ...f, apprDistBucket: e.target.value }))} style={{ ...sel, width: "100%", maxWidth: 160 }}>
                <option value="">Any</option>
                {Array.from(new Set(allHoles.filter(h=>h.appr_dist_num>0).map(h => apprDistBucket(h.appr_dist_num)))).sort().map(b => <option key={b} value={b}>{b} yds</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Hazards</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[
                  { label: "Tree L",   key: "apprTreeLeft" },   { label: "Tree R",   key: "apprTreeRight" },
                  { label: "Tree Long",key: "apprTreeLong" },   { label: "Tree Across",key: "apprTreeAcross" },
                  { label: "Water L",  key: "apprWaterLeft" },  { label: "Water R",  key: "apprWaterRight" },
                  { label: "Water Short",key:"apprWaterShort"}, { label: "Water Long",key:"apprWaterLong" },
                ].map(({ label, key }) => (
                  <button key={key} style={pill(!!(filters as any)[key])} onClick={() => setFilters(f => ({ ...f, [key]: !(f as any)[key] }))}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Scoring</p>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={pill(filters.girOnly)}    onClick={() => setFilters(f => ({ ...f, girOnly: !f.girOnly, nonGirOnly: false }))}>GIR</button>
                <button style={pill(filters.nonGirOnly)} onClick={() => setFilters(f => ({ ...f, nonGirOnly: !f.nonGirOnly, girOnly: false }))}>Non-GIR</button>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Greenside" activeCount={greensideActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Putts</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.puttsMin} onChange={e => setFilters(f => ({ ...f, puttsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.puttsMax} onChange={e => setFilters(f => ({ ...f, puttsMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Chips <span style={{ fontSize:10, color:"#bbb", fontWeight:400 }}>(known only)</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.chipsMin} onChange={e => setFilters(f => ({ ...f, chipsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.chipsMax} onChange={e => setFilters(f => ({ ...f, chipsMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>1st Putt Distance</p>
              <select value={filters.firstPutt} onChange={e => setFilters(f => ({ ...f, firstPutt: e.target.value }))} style={{ ...sel, width: "100%", maxWidth: 160 }}>
                <option value="">Any</option>
                {PUTT_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>GS Bunker</p>
              <button style={pill(filters.gsBunker)} onClick={() => setFilters(f => ({ ...f, gsBunker: !f.gsBunker }))}>In GS Bunker</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Green Depth (yards)</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {([
                  { label: "< 20", val: "lt20" }, { label: "20-24", val: "20-24" },
                  { label: "25-29", val: "25-29" }, { label: "30-34", val: "30-34" },
                  { label: "35-39", val: "35-39" }, { label: "40+", val: "gt40" },
                ] as const).map(({ label, val }) => (
                  <button key={val} style={pill(filters.greenDepth === val)} onClick={() => setFilters(f => ({ ...f, greenDepth: f.greenDepth === val ? "" : val }))}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Greenside Position</p>
              <GreensideDial value={filters.gsPositionFilter} onChange={v => setFilters(f => ({ ...f, gsPositionFilter: v }))} />
              <button onClick={() => setFilters(f => ({ ...f, gsPositionFilter: defaultGreensideFilter() }))}
                style={{ marginTop: 6, fontSize: 11, color: "#0f6e56", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Clear position
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <p style={fl}>Surface Type</p>
              <SurfacePicker value={filters.gsSurface} onChange={v => setFilters(f => ({ ...f, gsSurface: v }))} />
            </div>
          </CollapsibleSection>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 14 }}>
          {[
            { label: "Baseline Avg", val: fmt(baseline), color: clr(baseline), sub: `${roundFiltered.length} holes` },
            { label: "Filtered Avg", val: filtered.length>0?fmt(filteredAvg):"—", color: filtered.length>0?clr(filteredAvg):"#666", sub: `${filtered.length} holes` },
            { label: "Impact",       val: filtered.length>0?fmt(impact):"—", color: clr(impact), sub: "vs baseline" },
          ].map(({ label, val, color, sub }) => (
            <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#0f6e56", margin: "0 0 3px" }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color }}>{val}</p>
              <p style={{ fontSize: 10, color: "#0f6e56", margin: "3px 0 0" }}>{sub}</p>
            </div>
          ))}
        </div>

        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Factor Correlations</p>
            <p style={{ fontSize: 10, color: "#0f6e56", margin: 0 }}>≥{MIN_HOLES} holes only · sorted by impact</p>
          </div>
          <div style={{ marginBottom: 10 }}>
            <select
              value={factorTypeFilter}
              onChange={e => setFactorTypeFilter(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 12, color: "#0f6e56", background: "white", cursor: "pointer", width: "100%" }}
            >
              <option value="">All factor types</option>
              {["Par","Hole Yards","Hole Cluster","Handicap Tier","Dogleg","Approach Distance",
                "Drive Accuracy","Approach Accuracy","GIR","Putting","Tee Hazards","Approach Hazards",
                "Greenside","Green Depth","Short Game","Performance Grades"
              ].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["all","positive","negative"] as const).map(dir => (
              <button key={dir} style={{
                padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: "pointer", border: "1px solid",
                background: filters.impactDir === dir ? "#0f6e56" : "white",
                color: filters.impactDir === dir ? "white" : "#0f6e56", borderColor: "#0f6e56",
              }} onClick={() => setFilters(f => ({ ...f, impactDir: dir }))}>
                {dir === "all" ? "All" : dir === "positive" ? "↑ Costs strokes" : "↓ Saves strokes"}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 280 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: "#0f6e56", fontWeight: 600, textAlign: "left",  padding: "0 8px 6px 0" }}>Factor</th>
                  <th style={{ fontSize: 11, color: "#0f6e56", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Holes</th>
                  <th style={{ fontSize: 11, color: "#0f6e56", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Avg</th>
                  <th style={{ fontSize: 11, color: "#0f6e56", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Impact</th>
                </tr>
              </thead>
              <tbody>
                {allCorrelations.map(({ label, count, avg, impact: imp }) => (
                  <tr key={label}>
                    <td style={{ fontSize: 13, color: "#0f6e56", fontWeight: 500, padding: "3px 8px 3px 0", whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ fontSize: 13, color: "#1a1a1a", textAlign: "right", padding: "3px 0 3px 8px" }}>{count}</td>
                    <td style={{ fontSize: 13, color: "#1a1a1a", textAlign: "right", padding: "3px 0 3px 8px" }}>{fmt(avg)}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: clr(imp), textAlign: "right", padding: "3px 0 3px 8px" }}>{fmt(imp)}</td>
                  </tr>
                ))}
                {allCorrelations.length === 0 && (
                  <tr><td colSpan={4} style={{ fontSize: 12, color: "#0f6e56", padding: "8px 0" }}>Not enough data yet — need ≥{MIN_HOLES} holes per factor</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        )}
      </div>

      <div style={{ display: tab === "chipping" ? "block" : "none" }}>
        <ChippingInsights allHoles={allHoles} roundSummaries={roundSummaries} />
      </div>

      <div style={{ display: tab === "putting" ? "block" : "none" }}>
        <PuttingInsights allHoles={allHoles} roundSummaries={roundSummaries} />
      </div>
    </main>
    </div>
  );
}
