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
  tee_tree_left: boolean; tee_tree_right: boolean;
  tee_bunker_left: boolean; tee_bunker_right: boolean;
  tee_water_left: boolean; tee_water_right: boolean;
  stroke_index: number; rating: number | null; slope: number | null;
  roundIndex: number; year: number;
  gir: boolean; grints: boolean;
};

type Filters = {
  driveAcc: Set<string>; apprAcc: Set<string>;
  drivingClubs: Set<string>; apprClubs: Set<string>;
  highWater: boolean; highTree: boolean; highBunker: boolean;
  courseId: string; pars: Set<string>;
  teeTreeLeft: boolean; teeTreeRight: boolean;
  teeBunkerLeft: boolean; teeBunkerRight: boolean;
  teeWaterLeft: boolean; teeWaterRight: boolean;
  siMin: string; siMax: string;
  ratingMin: string; ratingMax: string;
  slopeMin: string; slopeMax: string;
  years: Set<string>;
  gsBunker: boolean; girOnly: boolean;
  puttsMin: string; puttsMax: string;
  chipsMin: string; chipsMax: string;
  firstPutt: string;
  greenDepth: string; // "lt20" | "gt40" | ""
  greensideFilter: GreensideFilter;
};

const DEFAULT_FILTERS: Filters = {
  driveAcc: new Set(), apprAcc: new Set(),
  drivingClubs: new Set(), apprClubs: new Set(),
  highWater: false, highTree: false, highBunker: false,
  courseId: "", pars: new Set(),
  teeTreeLeft: false, teeTreeRight: false,
  teeBunkerLeft: false, teeBunkerRight: false,
  teeWaterLeft: false, teeWaterRight: false,
  siMin: "", siMax: "", ratingMin: "", ratingMax: "", slopeMin: "", slopeMax: "",
  years: new Set(), gsBunker: false, girOnly: false,
  puttsMin: "", puttsMax: "", chipsMin: "", chipsMax: "", firstPutt: "",
  greenDepth: "", greensideFilter: defaultGreensideFilter(),
};

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
  const VW = 200, VH = 190;
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 10, color: "#999", margin: "0 0 4px", fontStyle: "italic" }}>
        Tap to cycle: grey = any · teal = green side · sand = bunker
      </p>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", maxWidth: 200, height: "auto", display: "block" }}>
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
    if (f.drivingClubs.size > 0 && !f.drivingClubs.has(h.club))         return false;
    if (f.apprClubs.size    > 0 && !f.apprClubs.has(h.appr_distance))   return false;
    if (f.highWater  && h.drive_water_ob_pct <= 0) return false;
    if (f.highTree   && h.drive_tree_pct    <= 0) return false;
    if (f.highBunker && h.drive_bunker_pct  <= 0) return false;
    if (f.courseId && h.courseId !== f.courseId) return false;
    if (f.pars.size > 0 && !f.pars.has(String(h.par))) return false;
    if (f.teeTreeLeft    && !h.tee_tree_left)    return false;
    if (f.teeTreeRight   && !h.tee_tree_right)   return false;
    if (f.teeBunkerLeft  && !h.tee_bunker_left)  return false;
    if (f.teeBunkerRight && !h.tee_bunker_right) return false;
    if (f.teeWaterLeft   && !h.tee_water_left)   return false;
    if (f.teeWaterRight  && !h.tee_water_right)  return false;
    if (f.siMin && h.stroke_index < Number(f.siMin)) return false;
    if (f.siMax && h.stroke_index > Number(f.siMax)) return false;
    if (f.ratingMin && (h.rating??0)   < Number(f.ratingMin)) return false;
    if (f.ratingMax && (h.rating??999) > Number(f.ratingMax)) return false;
    if (f.slopeMin  && (h.slope??0)    < Number(f.slopeMin))  return false;
    if (f.slopeMax  && (h.slope??999)  > Number(f.slopeMax))  return false;
    if (f.years.size > 0 && !f.years.has(String(h.year))) return false;
    if (f.gsBunker  && h.greenside_bunker <= 0) return false;
    if (f.girOnly   && !h.gir)   return false;
    if (f.puttsMin && h.putts < Number(f.puttsMin)) return false;
    if (f.puttsMax && h.putts > Number(f.puttsMax)) return false;
    if ((f.chipsMin || f.chipsMax) && h.chips === null) return false;
    if (f.chipsMin && h.chips !== null && h.chips < Number(f.chipsMin)) return false;
    if (f.chipsMax && h.chips !== null && h.chips > Number(f.chipsMax)) return false;
    if (f.firstPutt && h.first_putt_distance !== f.firstPutt) return false;
    if (f.greenDepth === "lt20" && h.green_depth >= 20) return false;
    if (f.greenDepth === "gt40" && h.green_depth < 40)  return false;
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
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1 }}>{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {activeCount > 0 && (
            <span style={{ fontSize: 10, background: "#0f6e56", color: "#fff", borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>{activeCount}</span>
          )}
          <span style={{ fontSize: 14, color: "#999" }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function toggleSet(s: Set<string>, val: string): Set<string> {
  const n = new Set(s);
  n.has(val) ? n.delete(val) : n.add(val);
  return n;
}

export default function RoundsInsights() {
  const [allHoles, setAllHoles] = useState<EnrichedHole[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [useLastN, setUseLastN] = useState(false);
  const [lastN, setLastN] = useState(10);

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
        for (const hole of round.holes ?? []) {
          if (!hole.score || !hole.par) continue;
          const ch = course?.holes.find((h: HoleData) => h.hole === hole.hole);
          const score = Number(hole.score);
          const putts = Number(hole.putts)||0;
          enriched.push({
            hole: hole.hole, par: hole.par, score,
            tee_accuracy: hole.tee_accuracy ?? "",
            appr_accuracy: hole.appr_accuracy ?? "",
            appr_distance: hole.appr_distance ?? "",
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
            tee_tree_left:    ch?.tee_tree_hazard_left  ?? false,
            tee_tree_right:   ch?.tee_tree_hazard_right ?? false,
            tee_bunker_left:  ch?.tee_bunkers_left      ?? false,
            tee_bunker_right: ch?.tee_bunkers_right     ?? false,
            tee_water_left:   ch?.tee_water_out_left    ?? false,
            tee_water_right:  ch?.tee_water_out_right   ?? false,
            stroke_index: hole.stroke_index ?? 0,
            rating: course?.rating ?? null, slope: course?.slope ?? null,
            roundIndex: ri, year,
            gir:    typeof hole.gir    === "boolean" ? hole.gir    : (score - putts) <= (hole.par - 2),
            grints: typeof hole.grints === "boolean" ? hole.grints : score <= hole.par,
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
    filters.gsBunker || filters.girOnly ||
    filters.teeTreeLeft || filters.teeTreeRight ||
    filters.teeBunkerLeft || filters.teeBunkerRight ||
    filters.teeWaterLeft || filters.teeWaterRight ||
    !!filters.courseId || !!filters.siMin || !!filters.siMax ||
    !!filters.ratingMin || !!filters.ratingMax ||
    !!filters.slopeMin || !!filters.slopeMax ||
    !!filters.puttsMin || !!filters.puttsMax ||
    !!filters.chipsMin || !!filters.chipsMax || !!filters.firstPutt ||
    !!filters.greenDepth ||
    Object.values(filters.greensideFilter).some(v => v !== 0);

  const holesWithKnownChips = roundFiltered.filter(h => h.chips !== null);

  const correlations = [
    { label: "Drive Hit",        holes: roundFiltered.filter(h => h.tee_accuracy==="Hit") },
    { label: "Drive Left",       holes: roundFiltered.filter(h => h.tee_accuracy==="Left") },
    { label: "Drive Right",      holes: roundFiltered.filter(h => h.tee_accuracy==="Right") },
    { label: "Drive Short",      holes: roundFiltered.filter(h => h.tee_accuracy==="Short") },
    { label: "Drive Long",       holes: roundFiltered.filter(h => h.tee_accuracy==="Long") },
    { label: "Approach Hit",     holes: roundFiltered.filter(h => h.appr_accuracy==="Hit") },
    { label: "Approach Left",    holes: roundFiltered.filter(h => h.appr_accuracy==="Left") },
    { label: "Approach Right",   holes: roundFiltered.filter(h => h.appr_accuracy==="Right") },
    { label: "Approach Short",   holes: roundFiltered.filter(h => h.appr_accuracy==="Short") },
    { label: "Approach Long",    holes: roundFiltered.filter(h => h.appr_accuracy==="Long") },
    { label: "GIR",              holes: roundFiltered.filter(h => h.gir) },
    { label: "GRINTS",           holes: roundFiltered.filter(h => h.grints) },
    { label: "GS Bunker",        holes: roundFiltered.filter(h => h.greenside_bunker > 0) },
    { label: "0 Chips",          holes: holesWithKnownChips.filter(h => h.chips === 0) },
    { label: "1+ Chips",         holes: holesWithKnownChips.filter(h => (h.chips ?? 0) >= 1) },
    { label: "1 Putt",           holes: roundFiltered.filter(h => h.putts === 1) },
    { label: "2 Putts",          holes: roundFiltered.filter(h => h.putts === 2) },
    { label: "3+ Putts",         holes: roundFiltered.filter(h => h.putts >= 3) },
    { label: "High Water Risk",  holes: roundFiltered.filter(h => h.drive_water_ob_pct > 0) },
    { label: "High Tree Risk",   holes: roundFiltered.filter(h => h.drive_tree_pct > 0) },
    { label: "High Bunker Risk", holes: roundFiltered.filter(h => h.drive_bunker_pct > 0) },
    { label: "Green Depth <20",  holes: roundFiltered.filter(h => h.green_depth > 0 && h.green_depth < 20) },
    { label: "Green Depth 40+",  holes: roundFiltered.filter(h => h.green_depth >= 40) },
  ].map(({ label, holes }) => ({
    label, count: holes.length, avg: calcAvg(holes),
    impact: holes.length > 0 ? calcAvg(holes) - baseline : NaN,
  })).filter(c => c.count > 0).sort((a,b) => b.impact - a.impact);

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
  const fl: React.CSSProperties = { fontSize: 11, color: "#999", margin: "0 0 6px", fontWeight: 600 };

  // Active count helpers for section badges
  const driveActive = filters.driveAcc.size + filters.drivingClubs.size +
    (filters.highWater?1:0) + (filters.highTree?1:0) + (filters.highBunker?1:0) +
    (filters.teeTreeLeft?1:0) + (filters.teeTreeRight?1:0) +
    (filters.teeBunkerLeft?1:0) + (filters.teeBunkerRight?1:0) +
    (filters.teeWaterLeft?1:0) + (filters.teeWaterRight?1:0);
  const apprActive = filters.apprAcc.size + filters.apprClubs.size + (filters.girOnly?1:0);
  const greensideActive = (filters.gsBunker?1:0) +
    (filters.puttsMin||filters.puttsMax?1:0) +
    (filters.chipsMin||filters.chipsMax?1:0) +
    (filters.firstPutt?1:0) +
    (filters.greenDepth?1:0) +
    (Object.values(filters.greensideFilter).some(v=>v!==0)?1:0);
  const courseActive = (filters.courseId?1:0) + filters.pars.size +
    (filters.siMin||filters.siMax?1:0) +
    (filters.ratingMin||filters.ratingMax?1:0) +
    (filters.slopeMin||filters.slopeMax?1:0);

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Insights</h1>
      <p style={{ color: "#666", marginBottom: 20, fontSize: 13 }}>Analyze how different factors impact your score vs par.</p>

      {loading && <p style={{ color: "#666" }}>Loading rounds...</p>}
      {!loading && allHoles.length === 0 && <p style={{ color: "#666" }}>No hole data found. Add some rounds first.</p>}

      {!loading && allHoles.length > 0 && (<>
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Filters</p>
            {(anyActive || useLastN) && (
              <button onClick={() => { setFilters(DEFAULT_FILTERS); setUseLastN(false); setLastN(10); }}
                style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset</button>
            )}
          </div>

          {/* Rounds + Year — always visible */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: "1 1 120px" }}>
              <p style={fl}>Rounds</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <button style={pill(!useLastN)} onClick={() => setUseLastN(false)}>All</button>
                <button style={pill(useLastN)} onClick={() => setUseLastN(true)}>Last</button>
                {useLastN && (<>
                  <input type="number" min={1} max={totalRounds} value={lastN}
                    onChange={e => setLastN(Math.max(1, Math.min(totalRounds, Number(e.target.value))))}
                    style={{ width: 44, padding: "4px 5px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 12, color: "#0f6e56", textAlign: "center" }} />
                  <span style={{ fontSize: 10, color: "#999" }}>of {totalRounds}</span>
                </>)}
              </div>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <p style={fl}>Year</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {availableYears.map(y => (
                  <button key={y} style={pill(filters.years.has(String(y)))}
                    onClick={() => setFilters(f => ({ ...f, years: toggleSet(f.years, String(y)) }))}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Course + Par — always visible */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
            <div style={{ flex: "1 1 140px" }}>
              <p style={fl}>Course</p>
              <select value={filters.courseId} onChange={e => setFilters(f => ({ ...f, courseId: e.target.value }))} style={{ ...sel, width: "100%" }}>
                <option value="">All courses</option>
                {Array.from(new Map(allHoles.map(h => [h.courseId, h.courseName])).entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <p style={fl}>Par</p>
              <div style={{ display: "flex", gap: 4 }}>
                {["3","4","5"].map(p => (
                  <button key={p} style={pill(filters.pars.has(p))}
                    onClick={() => setFilters(f => ({ ...f, pars: toggleSet(f.pars, p) }))}>Par {p}</button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Collapsible sections ── */}

          <CollapsibleSection title="Hole / Course" activeCount={courseActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Hole Handicap</p>
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

          <CollapsibleSection title="Driving / Tee" activeCount={driveActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Drive Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(["Hit","Left","Right","Short","Long"]).map(acc => (
                  <button key={acc} style={pill(filters.driveAcc.has(acc))}
                    onClick={() => setFilters(f => ({ ...f, driveAcc: toggleSet(f.driveAcc, acc) }))}>{acc}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Driving Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {DRIVE_CLUBS.map(club => (
                  <button key={club} style={pill(filters.drivingClubs.has(club))}
                    onClick={() => setFilters(f => ({ ...f, drivingClubs: toggleSet(f.drivingClubs, club) }))}>{club}</button>
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
                  { label: "Trees L",  key: "teeTreeLeft" },   { label: "Trees R",  key: "teeTreeRight" },
                  { label: "Bkr L",    key: "teeBunkerLeft" }, { label: "Bkr R",    key: "teeBunkerRight" },
                  { label: "Water L",  key: "teeWaterLeft" },  { label: "Water R",  key: "teeWaterRight" },
                ].map(({ label, key }) => (
                  <button key={key} style={pill(!!(filters as any)[key])}
                    onClick={() => setFilters(f => ({ ...f, [key]: !(f as any)[key] }))}>{label}</button>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Approach" activeCount={apprActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(["Hit","Left","Right","Short","Long"]).map(acc => (
                  <button key={acc} style={pill(filters.apprAcc.has(acc))}
                    onClick={() => setFilters(f => ({ ...f, apprAcc: toggleSet(f.apprAcc, acc) }))}>{acc}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Approach Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {APPROACH_CLUBS.map(club => (
                  <button key={club} style={pill(filters.apprClubs.has(club))}
                    onClick={() => setFilters(f => ({ ...f, apprClubs: toggleSet(f.apprClubs, club) }))}>{club}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Scoring</p>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={pill(filters.girOnly)} onClick={() => setFilters(f => ({ ...f, girOnly: !f.girOnly }))}>GIR</button>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Greenside" activeCount={greensideActive}>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Putts</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.puttsMin}
                  onChange={e => setFilters(f => ({ ...f, puttsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.puttsMax}
                  onChange={e => setFilters(f => ({ ...f, puttsMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={fl}>Chips <span style={{ fontSize:10, color:"#bbb", fontWeight:400 }}>(known only)</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.chipsMin}
                  onChange={e => setFilters(f => ({ ...f, chipsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:10, color:"#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.chipsMax}
                  onChange={e => setFilters(f => ({ ...f, chipsMax: e.target.value }))} style={numInput} />
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
              <p style={fl}>Green Depth</p>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={pill(filters.greenDepth==="lt20")} onClick={() => setFilters(f => ({ ...f, greenDepth: f.greenDepth==="lt20"?"":"lt20" }))}>{"< 20 yds"}</button>
                <button style={pill(filters.greenDepth==="gt40")} onClick={() => setFilters(f => ({ ...f, greenDepth: f.greenDepth==="gt40"?"":"gt40" }))}>{"40+ yds"}</button>
              </div>
            </div>
            <div>
              <p style={fl}>Greenside Position</p>
              <GreensideFilterWidget
                value={filters.greensideFilter}
                onChange={v => setFilters(f => ({ ...f, greensideFilter: v }))}
              />
              <button
                onClick={() => setFilters(f => ({ ...f, greensideFilter: defaultGreensideFilter() }))}
                style={{ marginTop: 6, fontSize: 11, color: "#999", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Clear greenside
              </button>
            </div>
          </CollapsibleSection>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 14 }}>
          {[
            { label: "Baseline Avg", val: fmt(baseline), color: clr(baseline), sub: `${roundFiltered.length} holes` },
            { label: "Filtered Avg", val: filtered.length>0?fmt(filteredAvg):"—", color: filtered.length>0?clr(filteredAvg):"#666", sub: `${filtered.length} holes` },
            { label: "Impact",       val: filtered.length>0?fmt(impact):"—", color: clr(impact), sub: "vs baseline" },
          ].map(({ label, val, color, sub }) => (
            <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#666", margin: "0 0 3px" }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color }}>{val}</p>
              <p style={{ fontSize: 10, color: "#999", margin: "3px 0 0" }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Correlations — horizontal scroll on mobile */}
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>Factor Correlations</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 280 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: "#999", fontWeight: 600, textAlign: "left",  padding: "0 8px 6px 0" }}>Factor</th>
                  <th style={{ fontSize: 11, color: "#999", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Holes</th>
                  <th style={{ fontSize: 11, color: "#999", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Avg</th>
                  <th style={{ fontSize: 11, color: "#999", fontWeight: 600, textAlign: "right", padding: "0 0 6px 8px" }}>Impact</th>
                </tr>
              </thead>
              <tbody>
                {correlations.map(({ label, count, avg, impact: imp }) => (
                  <tr key={label}>
                    <td style={{ fontSize: 13, color: "#0f6e56", fontWeight: 500, padding: "3px 8px 3px 0", whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ fontSize: 13, color: "#1a1a1a", textAlign: "right", padding: "3px 0 3px 8px" }}>{count}</td>
                    <td style={{ fontSize: 13, color: "#1a1a1a", textAlign: "right", padding: "3px 0 3px 8px" }}>{fmt(avg)}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: clr(imp), textAlign: "right", padding: "3px 0 3px 8px" }}>{fmt(imp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </main>
  );
}
