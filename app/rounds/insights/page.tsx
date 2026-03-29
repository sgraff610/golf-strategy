"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";
import { HoleData } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";

type EnrichedHole = {
  hole: number; par: number; score: number;
  tee_accuracy: TeeAccuracy; appr_accuracy: TeeAccuracy;
  appr_distance: string; club: string;
  chips: number | null;  // null = unknown (blank + not a GIR)
  putts: number; first_putt_distance: string;
  greenside_bunker: number;
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
  driveAcc: { left: boolean; right: boolean; short: boolean; long: boolean; hit: boolean };
  apprAcc:  { left: boolean; right: boolean; short: boolean; long: boolean; hit: boolean };
  drivingClub: string; apprClub: string;
  highWater: boolean; highTree: boolean; highBunker: boolean;
  courseId: string; par: string;
  teeTreeLeft: boolean; teeTreeRight: boolean;
  teeBunkerLeft: boolean; teeBunkerRight: boolean;
  teeWaterLeft: boolean; teeWaterRight: boolean;
  siMin: string; siMax: string;
  ratingMin: string; ratingMax: string;
  slopeMin: string; slopeMax: string;
  year: string;
  gsBunker: boolean; girOnly: boolean; grintsOnly: boolean;
  puttsMin: string; puttsMax: string;
  chipsMin: string; chipsMax: string;
  firstPutt: string;
};

const DEFAULT_FILTERS: Filters = {
  driveAcc: { left: false, right: false, short: false, long: false, hit: false },
  apprAcc:  { left: false, right: false, short: false, long: false, hit: false },
  drivingClub: "", apprClub: "",
  highWater: false, highTree: false, highBunker: false,
  courseId: "", par: "",
  teeTreeLeft: false, teeTreeRight: false,
  teeBunkerLeft: false, teeBunkerRight: false,
  teeWaterLeft: false, teeWaterRight: false,
  siMin: "", siMax: "", ratingMin: "", ratingMax: "", slopeMin: "", slopeMax: "",
  year: "", gsBunker: false, girOnly: false, grintsOnly: false,
  puttsMin: "", puttsMax: "", chipsMin: "", chipsMax: "", firstPutt: "",
};

const DRIVE_CLUBS    = ["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const APPROACH_CLUBS = ["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const PUTT_DISTANCES = ["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"];

/**
 * Resolve chips:
 * - appr_accuracy "Hit" → 0 (GIR, no chip needed)
 * - chips field has a value (including 0) → that value
 * - blank + not a Hit → null (unknown)
 */
function resolveChips(hole: any): number | null {
  if (hole.appr_accuracy === "Hit") return 0;
  if (hole.chips !== "" && hole.chips !== undefined && hole.chips !== null) return Number(hole.chips);
  return null;
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

function filterHoles(holes: EnrichedHole[], f: Filters): EnrichedHole[] {
  return holes.filter(h => {
    const da = f.driveAcc; const anyDA = Object.values(da).some(Boolean);
    if (anyDA && !((da.left&&h.tee_accuracy==="Left")||(da.right&&h.tee_accuracy==="Right")||(da.short&&h.tee_accuracy==="Short")||(da.long&&h.tee_accuracy==="Long")||(da.hit&&h.tee_accuracy==="Hit"))) return false;
    const aa = f.apprAcc; const anyAA = Object.values(aa).some(Boolean);
    if (anyAA && !((aa.left&&h.appr_accuracy==="Left")||(aa.right&&h.appr_accuracy==="Right")||(aa.short&&h.appr_accuracy==="Short")||(aa.long&&h.appr_accuracy==="Long")||(aa.hit&&h.appr_accuracy==="Hit"))) return false;
    if (f.drivingClub && h.club !== f.drivingClub) return false;
    if (f.apprClub && h.appr_distance !== f.apprClub) return false;
    if (f.highWater && h.drive_water_ob_pct <= 0) return false;
    if (f.highTree  && h.drive_tree_pct   <= 0) return false;
    if (f.highBunker && h.drive_bunker_pct <= 0) return false;
    if (f.courseId && h.courseId !== f.courseId) return false;
    if (f.par && h.par !== Number(f.par)) return false;
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
    if (f.year && h.year !== Number(f.year)) return false;
    if (f.gsBunker   && h.greenside_bunker <= 0) return false;
    if (f.girOnly    && !h.gir)    return false;
    if (f.grintsOnly && !h.grints) return false;
    if (f.puttsMin && h.putts < Number(f.puttsMin)) return false;
    if (f.puttsMax && h.putts > Number(f.puttsMax)) return false;
    // Chips filters only apply to holes where chips is known
    if ((f.chipsMin || f.chipsMax) && h.chips === null) return false;
    if (f.chipsMin && h.chips !== null && h.chips < Number(f.chipsMin)) return false;
    if (f.chipsMax && h.chips !== null && h.chips > Number(f.chipsMax)) return false;
    if (f.firstPutt && h.first_putt_distance !== f.firstPutt) return false;
    return true;
  });
}

function fmt(n: number): string { return isNaN(n) ? "—" : `${n>=0?"+":""}${n.toFixed(2)}`; }
function clr(n: number): string { return isNaN(n)||n===0 ? "#666" : n>0 ? "#c0392b" : "#27ae60"; }

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
          const chipsResolved = resolveChips(hole);
          enriched.push({
            hole: hole.hole, par: hole.par, score,
            tee_accuracy: hole.tee_accuracy ?? "",
            appr_accuracy: hole.appr_accuracy ?? "",
            appr_distance: hole.appr_distance ?? "",
            club: hole.club ?? "",
            chips: chipsResolved,
            putts,
            first_putt_distance: hole.first_putt_distance ?? "",
            greenside_bunker: Number(hole.greenside_bunker)||0,
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

  const anyActive = Object.values(filters.driveAcc).some(Boolean) ||
    Object.values(filters.apprAcc).some(Boolean) ||
    !!filters.drivingClub || !!filters.apprClub || !!filters.year ||
    filters.highWater || filters.highTree || filters.highBunker ||
    filters.gsBunker || filters.girOnly || filters.grintsOnly ||
    !!filters.courseId || !!filters.par ||
    filters.teeTreeLeft || filters.teeTreeRight ||
    filters.teeBunkerLeft || filters.teeBunkerRight ||
    filters.teeWaterLeft || filters.teeWaterRight ||
    !!filters.siMin || !!filters.siMax ||
    !!filters.ratingMin || !!filters.ratingMax ||
    !!filters.slopeMin || !!filters.slopeMax ||
    !!filters.puttsMin || !!filters.puttsMax ||
    !!filters.chipsMin || !!filters.chipsMax || !!filters.firstPutt;

  // Chips correlations only use holes where chips is known
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
    // Chips correlations scoped to holes where chips is known
    { label: "0 Chips",          holes: holesWithKnownChips.filter(h => h.chips === 0) },
    { label: "1+ Chips",         holes: holesWithKnownChips.filter(h => (h.chips ?? 0) >= 1) },
    { label: "1 Putt",           holes: roundFiltered.filter(h => h.putts === 1) },
    { label: "2 Putts",          holes: roundFiltered.filter(h => h.putts === 2) },
    { label: "3+ Putts",         holes: roundFiltered.filter(h => h.putts >= 3) },
    { label: "High Water Risk",  holes: roundFiltered.filter(h => h.drive_water_ob_pct > 0) },
    { label: "High Tree Risk",   holes: roundFiltered.filter(h => h.drive_tree_pct > 0) },
    { label: "High Bunker Risk", holes: roundFiltered.filter(h => h.drive_bunker_pct > 0) },
  ].map(({ label, holes }) => ({
    label, count: holes.length, avg: calcAvg(holes),
    impact: holes.length > 0 ? calcAvg(holes) - baseline : NaN,
  })).filter(c => c.count > 0).sort((a,b) => b.impact - a.impact);

  const pill = (active: boolean): React.CSSProperties => ({
    padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: "1px solid",
    background: active ? "#0f6e56" : "white",
    color: active ? "white" : "#0f6e56", borderColor: "#0f6e56",
  });
  const sel: React.CSSProperties = {
    padding: "5px 8px", borderRadius: 8, border: "1px solid #0f6e56",
    fontSize: 12, color: "#0f6e56", background: "white", cursor: "pointer",
  };
  const numInput: React.CSSProperties = {
    padding: "5px 8px", borderRadius: 8, border: "1px solid #0f6e56",
    fontSize: 12, color: "#0f6e56", width: 60,
  };
  const filterLabel: React.CSSProperties = { fontSize: 11, color: "#999", margin: "0 0 6px", fontWeight: 600 };

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Insights</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>Analyze how different factors impact your score vs par.</p>

      {loading && <p style={{ color: "#666" }}>Loading rounds...</p>}
      {!loading && allHoles.length === 0 && <p style={{ color: "#666" }}>No hole data found. Add some rounds first.</p>}

      {!loading && allHoles.length > 0 && (<>
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Filters</p>
            {(anyActive || useLastN) && (
              <button onClick={() => { setFilters(DEFAULT_FILTERS); setUseLastN(false); setLastN(10); }}
                style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset</button>
            )}
          </div>

          {/* Rounds + Year */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Rounds</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button style={pill(!useLastN)} onClick={() => setUseLastN(false)}>All</button>
                <button style={pill(useLastN)} onClick={() => setUseLastN(true)}>Last</button>
                {useLastN && (<>
                  <input type="number" min={1} max={totalRounds} value={lastN}
                    onChange={e => setLastN(Math.max(1, Math.min(totalRounds, Number(e.target.value))))}
                    style={{ width: 48, padding: "4px 6px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 12, color: "#0f6e56", textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: "#999" }}>of {totalRounds}</span>
                </>)}
              </div>
            </div>
            <div>
              <p style={filterLabel}>Year</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                <button style={pill(filters.year==="")} onClick={() => setFilters(f => ({ ...f, year: "" }))}>All</button>
                {availableYears.map(y => (
                  <button key={y} style={pill(filters.year===String(y))}
                    onClick={() => setFilters(f => ({ ...f, year: f.year===String(y)?"":String(y) }))}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Course + Par */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Course</p>
              <select value={filters.courseId} onChange={e => setFilters(f => ({ ...f, courseId: e.target.value }))} style={{ ...sel, width: "100%" }}>
                <option value="">All courses</option>
                {Array.from(new Map(allHoles.map(h => [h.courseId, h.courseName])).entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <p style={filterLabel}>Par</p>
              <div style={{ display: "flex", gap: 5 }}>
                {["3","4","5"].map(p => (
                  <button key={p} style={pill(filters.par===p)} onClick={() => setFilters(f => ({ ...f, par: f.par===p?"":p }))}>Par {p}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Drive Acc + Approach Acc */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Drive Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(["hit","left","right","short","long"] as const).map(acc => (
                  <button key={acc} style={pill(filters.driveAcc[acc])}
                    onClick={() => setFilters(f => ({ ...f, driveAcc: { ...f.driveAcc, [acc]: !f.driveAcc[acc] } }))}>
                    {acc.charAt(0).toUpperCase()+acc.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={filterLabel}>Approach Accuracy</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(["hit","left","right","short","long"] as const).map(acc => (
                  <button key={acc} style={pill(filters.apprAcc[acc])}
                    onClick={() => setFilters(f => ({ ...f, apprAcc: { ...f.apprAcc, [acc]: !f.apprAcc[acc] } }))}>
                    {acc.charAt(0).toUpperCase()+acc.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Driving Club + Approach Club */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Driving Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {DRIVE_CLUBS.map(club => (
                  <button key={club} style={pill(filters.drivingClub===club)}
                    onClick={() => setFilters(f => ({ ...f, drivingClub: f.drivingClub===club?"":club }))}>
                    {club}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={filterLabel}>Approach Club</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {APPROACH_CLUBS.map(club => (
                  <button key={club} style={pill(filters.apprClub===club)}
                    onClick={() => setFilters(f => ({ ...f, apprClub: f.apprClub===club?"":club }))}>
                    {club}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Putts + Chips + 1st Putt */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Putts</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.puttsMin}
                  onChange={e => setFilters(f => ({ ...f, puttsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize: 11, color: "#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.puttsMax}
                  onChange={e => setFilters(f => ({ ...f, puttsMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div>
              <p style={filterLabel}>Chips <span style={{ fontSize:10, color:"#bbb", fontWeight:400 }}>(known only)</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" min={0} max={10} placeholder="Min" value={filters.chipsMin}
                  onChange={e => setFilters(f => ({ ...f, chipsMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize: 11, color: "#999" }}>–</span>
                <input type="number" min={0} max={10} placeholder="Max" value={filters.chipsMax}
                  onChange={e => setFilters(f => ({ ...f, chipsMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div>
              <p style={filterLabel}>1st Putt Distance</p>
              <select value={filters.firstPutt} onChange={e => setFilters(f => ({ ...f, firstPutt: e.target.value }))} style={{ ...sel, width: "100%" }}>
                <option value="">Any</option>
                {PUTT_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Scoring toggles */}
          <div style={{ marginBottom: 14 }}>
            <p style={filterLabel}>Scoring</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              <button style={pill(filters.girOnly)}    onClick={() => setFilters(f => ({ ...f, girOnly: !f.girOnly }))}>GIR</button>
              <button style={pill(filters.grintsOnly)} onClick={() => setFilters(f => ({ ...f, grintsOnly: !f.grintsOnly }))}>GRINTS</button>
              <button style={pill(filters.gsBunker)}   onClick={() => setFilters(f => ({ ...f, gsBunker: !f.gsBunker }))}>GS Bunker</button>
            </div>
          </div>

          {/* Tee Risks + Tee Hazards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={filterLabel}>Tee Risks</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                <button style={pill(filters.highWater)}  onClick={() => setFilters(f => ({ ...f, highWater: !f.highWater }))}>Water</button>
                <button style={pill(filters.highTree)}   onClick={() => setFilters(f => ({ ...f, highTree: !f.highTree }))}>Trees</button>
                <button style={pill(filters.highBunker)} onClick={() => setFilters(f => ({ ...f, highBunker: !f.highBunker }))}>Bunker</button>
              </div>
            </div>
            <div>
              <p style={filterLabel}>Tee Hazards</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {[
                  { label: "Trees L", key: "teeTreeLeft" },   { label: "Trees R", key: "teeTreeRight" },
                  { label: "Bkr L",   key: "teeBunkerLeft" }, { label: "Bkr R",   key: "teeBunkerRight" },
                  { label: "Water L", key: "teeWaterLeft" },  { label: "Water R", key: "teeWaterRight" },
                ].map(({ label, key }) => (
                  <button key={key} style={pill(!!filters[key as keyof Filters])}
                    onClick={() => setFilters(f => ({ ...f, [key]: !f[key as keyof Filters] }))}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Ranges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <p style={filterLabel}>Hole Handicap</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <select value={filters.siMin} onChange={e => setFilters(f => ({ ...f, siMin: e.target.value }))} style={sel}>
                  <option value="">Min</option>
                  {Array.from({length:18},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ fontSize:11, color:"#999" }}>–</span>
                <select value={filters.siMax} onChange={e => setFilters(f => ({ ...f, siMax: e.target.value }))} style={sel}>
                  <option value="">Max</option>
                  {Array.from({length:18},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <p style={filterLabel}>Course Rating</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" step="0.1" placeholder="Min" value={filters.ratingMin} onChange={e => setFilters(f => ({ ...f, ratingMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:11, color:"#999" }}>–</span>
                <input type="number" step="0.1" placeholder="Max" value={filters.ratingMax} onChange={e => setFilters(f => ({ ...f, ratingMax: e.target.value }))} style={numInput} />
              </div>
            </div>
            <div>
              <p style={filterLabel}>Slope</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input type="number" placeholder="Min" value={filters.slopeMin} onChange={e => setFilters(f => ({ ...f, slopeMin: e.target.value }))} style={numInput} />
                <span style={{ fontSize:11, color:"#999" }}>–</span>
                <input type="number" placeholder="Max" value={filters.slopeMax} onChange={e => setFilters(f => ({ ...f, slopeMax: e.target.value }))} style={numInput} />
              </div>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Baseline Avg", val: fmt(baseline), color: clr(baseline), sub: `${roundFiltered.length} holes` },
            { label: "Filtered Avg", val: filtered.length>0?fmt(filteredAvg):"—", color: filtered.length>0?clr(filteredAvg):"#666", sub: `${filtered.length} holes` },
            { label: "Impact",       val: filtered.length>0?fmt(impact):"—",       color: clr(impact),       sub: "vs baseline" },
          ].map(({ label, val, color, sub }) => (
            <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#666", margin: "0 0 4px" }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color }}>{val}</p>
              <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Correlations */}
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Factor Correlations</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "5px 12px", alignItems: "center" }}>
            <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600 }}>Factor</p>
            <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Holes</p>
            <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Avg</p>
            <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Impact</p>
            {correlations.map(({ label, count, avg, impact: imp }) => (<>
              <p key={label+"l"} style={{ fontSize: 13, margin: 0, color: "#0f6e56", fontWeight: 500 }}>{label}</p>
              <p key={label+"c"} style={{ fontSize: 13, margin: 0, textAlign: "right", color: "#1a1a1a" }}>{count}</p>
              <p key={label+"a"} style={{ fontSize: 13, margin: 0, textAlign: "right", color: "#1a1a1a" }}>{fmt(avg)}</p>
              <p key={label+"i"} style={{ fontSize: 13, margin: 0, textAlign: "right", fontWeight: 600, color: clr(imp) }}>{fmt(imp)}</p>
            </>))}
          </div>
        </div>
      </>)}
    </main>
  );
}
