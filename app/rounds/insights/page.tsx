"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";
import { HoleData } from "@/lib/types";

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
  greensideFilter: GreensideFilter;
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
  greenDepth: "", greensideFilter: defaultGreensideFilter(),
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

function GreensideFilterWidget({ value, onChange }: { value: GreensideFilter; onChange: (v: GreensideFilter) => void }) {
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 10, color: "#999", margin: "0 0 4px", fontStyle: "italic" }}>
        Tap to cycle: grey = any · teal = green side · sand = bunker
      </p>
      <svg viewBox="0 0 200 190" style={{ width: "100%", maxWidth: 200, height: "auto", display: "block" }}>
        <text x={CX} y={CY - R_OUTER - 6} textAnchor="middle" fontSize={8} fontStyle="italic" fill="#999">↑ Far</text>
        <text x={CX - R_OUTER - 6} y={CY + 3} textAnchor="end" fontSize={8} fontStyle="italic" fill="#999">← L</text>
        <text x={CX + R_OUTER + 6} y={CY + 3} textAnchor="start" fontSize={8} fontStyle="italic" fill="#999">R →</text>
        {GS_SEGMENTS.map(seg => {
          const v = value[seg.key];
          const col = GS_COLORS[v];
          const lp = labelPos(seg.angle);
          const d = arcPath(seg.angle, R_INNER + 2, R_OUTER);
          return (
            <g key={seg.key} onClick={() => onChange({ ...value, [seg.key]: ((v + 1) % 3) as CellValue })} style={{ cursor: "pointer" }}>
              <path d={d} fill={col.fill} stroke="#fff" strokeWidth={1.5} style={{ transition: "fill 0.15s" }} />
              <text x={lp.x} y={lp.y + 3} textAnchor="middle" fontSize={8} fontWeight={500} fill={col.text} style={{ pointerEvents: "none" }}>{seg.abbr}</text>
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
    const gsAny = Object.values(f.greensideFilter).some(v => v !== 0);
    if (gsAny) {
      const combined: GreensideFilter = defaultGreensideFilter();
      const keys = Object.keys(combined) as (keyof GreensideFilter)[];
      for (const k of keys) {
        if (h.approach_bunker[k] === 2) combined[k] = 2;
        else if (h.approach_green[k] === 1) combined[k] = 1;
      }
      if (!greensideMatches(combined, f.greensideFilter)) return false;
    }
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

export default function RoundsInsights() {
  const [allHoles, setAllHoles] = useState<EnrichedHole[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [factorTypeFilter, setFactorTypeFilter] = useState("");
  const [useLastN, setUseLastN] = useState(false);
  const [lastN, setLastN] = useState(10);
  const [lastNInput, setLastNInput] = useState("10");

  useEffect(() => {
    async function loadAll() {
      const { data: rounds } = await supabase.from("rounds").select("*").order("date", { ascending: true });
      if (!rounds) { setLoading(false); return; }
      setTotalRounds(rounds.length);
      const years = new Set<number>();
      const enriched: EnrichedHole[] = [];
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
      }
      setAvailableYears(Array.from(years).sort((a,b) => b-a));
      setAllHoles(enriched);
      setLoading(false);
    }
    loadAll();
  }, []);

  const roundFiltered = useLastN ? allHoles.filter(h => h.roundIndex >= totalRounds - lastN) : allHoles;
  const filtered = filterHoles(roundFiltered, filters);
  const baseline = calcAvg(roundFiltered);
  const filteredAvg = calcAvg(filtered);
  const impact = filtered.length > 0 ? filteredAvg - baseline : NaN;

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
    Object.values(filters.greensideFilter).some(v => v !== 0);

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
    return "Other";
  }

  const allCorrelations = [
    ...correlations, ...yardsBuckets, ...holeClusters, ...siBuckets, ...doglegBuckets, ...apprBuckets, ...parBuckets,
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
    (Object.values(filters.greensideFilter).some(v=>v!==0)?1:0);
  const courseActive = (filters.courseId?1:0) + filters.pars.size +
    (filters.siMin||filters.siMax?1:0) +
    (filters.ratingMin||filters.ratingMax?1:0) +
    (filters.slopeMin||filters.slopeMax?1:0) +
    (filters.yardsBucket?1:0) + (filters.siTierFilter?1:0) +
    (filters.doglegFilter?1:0) + (filters.apprDistBucket?1:0) +
    (filters.diffBucket.size>0?1:0)

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "white" }}>← Back to rounds</a>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, color: "#d0d0d0" }}>Insights</h1>
      <p style={{ color: "white", marginBottom: 20, fontSize: 13 }}>Analyze how different factors impact your score vs par.</p>

      {loading && <p style={{ color: "white" }}>Loading rounds...</p>}
      {!loading && allHoles.length === 0 && <p style={{ color: "white" }}>No hole data found. Add some rounds first.</p>}

      {!loading && allHoles.length > 0 && (<>
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
              <GreensideFilterWidget value={filters.greensideFilter} onChange={v => setFilters(f => ({ ...f, greensideFilter: v }))} />
              <button onClick={() => setFilters(f => ({ ...f, greensideFilter: defaultGreensideFilter() }))}
                style={{ marginTop: 6, fontSize: 11, color: "#0f6e56", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Clear greenside
              </button>
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
                "Greenside","Green Depth","Short Game"
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
      </>)}
    </main>
  );
}
