"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";
import { HoleData } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";

type EnrichedHole = {
  hole: number;
  par: number;
  score: number;
  tee_accuracy: TeeAccuracy;
  water_penalty: number;
  drop_or_out: number;
  tree_haz: number;
  fairway_bunker: number;
  club: string;
  drive_water_ob_pct: number;
  drive_tree_pct: number;
  drive_bunker_pct: number;
  courseId: string;
  courseName: string;
  tee_tree_left: boolean;
  tee_tree_right: boolean;
  tee_bunker_left: boolean;
  tee_bunker_right: boolean;
  tee_water_left: boolean;
  tee_water_right: boolean;
  stroke_index: number;
  rating: number | null;
  slope: number | null;
};

type Filters = {
  driveAcc: { left: boolean; right: boolean; short: boolean; long: boolean; hit: boolean };
  highWater: boolean;
  highTree: boolean;
  highBunker: boolean;
  courseId: string;
  par: string;
  teeTreeLeft: boolean;
  teeTreeRight: boolean;
  teeBunkerLeft: boolean;
  teeBunkerRight: boolean;
  teeWaterLeft: boolean;
  teeWaterRight: boolean;
  siMin: string;
  siMax: string;
  ratingMin: string;
  ratingMax: string;
  slopeMin: string;
  slopeMax: string;
};

const DEFAULT_FILTERS: Filters = {
  driveAcc: { left: false, right: false, short: false, long: false, hit: false },
  highWater: false, highTree: false, highBunker: false,
  courseId: "", par: "",
  teeTreeLeft: false, teeTreeRight: false,
  teeBunkerLeft: false, teeBunkerRight: false,
  teeWaterLeft: false, teeWaterRight: false,
  siMin: "", siMax: "",
  ratingMin: "", ratingMax: "",
  slopeMin: "", slopeMax: "",

function getDriveWaterPct(hole: any, courseHole: HoleData | undefined): number {
  if (!courseHole) return 0;
  const water = (Number(hole.water_penalty) || 0) + (Number(hole.drop_or_out) || 0);
  if (water === 0) return 0;
  if (hole.tee_accuracy === "Hit") return 0;
  const score = Number(hole.score) || 0;
  const putts = Number(hole.putts) || 0;
  const chips = Number(hole.chips) || 0;
  const otherStrokes = score - putts - chips - 1;
  const driveMatchesHazard =
    (hole.tee_accuracy === "Left" && courseHole.tee_water_out_left) ||
    (hole.tee_accuracy === "Right" && courseHole.tee_water_out_right);
  if (!driveMatchesHazard) return 0;
  if (otherStrokes === 1) return 100;
  if (otherStrokes > 1) return 50;
  return 0;
}

function getDriveTreePct(hole: any, courseHole: HoleData | undefined): number {
  if (!courseHole) return 0;
  if (hole.tee_accuracy === "Hit" || hole.tee_accuracy === "") return 0;
  const treeHaz = (Number(hole.tree_haz) || 0) > 0;
  if (hole.tee_accuracy === "Left" && courseHole.tee_tree_hazard_left) return treeHaz ? 75 : 25;
  if (hole.tee_accuracy === "Right" && courseHole.tee_tree_hazard_right) return treeHaz ? 75 : 25;
  return 0;
}

function getDriveBunkerPct(hole: any, courseHole: HoleData | undefined): number {
  if (!courseHole) return 0;
  if (hole.tee_accuracy === "Hit" || hole.tee_accuracy === "") return 0;
  const fwyBunker = (Number(hole.fairway_bunker) || 0) > 0;
  if (hole.tee_accuracy === "Left" && courseHole.tee_bunkers_left) return fwyBunker ? 100 : 0;
  if (hole.tee_accuracy === "Right" && courseHole.tee_bunkers_right) return fwyBunker ? 100 : 0;
  return 0;
}

function getScoreToPar(hole: EnrichedHole): number {
  return hole.score - hole.par;
}

function calculateAverage(holes: EnrichedHole[]): number {
  if (holes.length === 0) return 0;
  return holes.reduce((s, h) => s + getScoreToPar(h), 0) / holes.length;
}

function filterHoles(holes: EnrichedHole[], filters: Filters): EnrichedHole[] {
  return holes.filter(h => {
    const accFilters = filters.driveAcc;
    const anyAccSelected = Object.values(accFilters).some(Boolean);
    if (anyAccSelected) {
      const accMatch =
        (accFilters.left && h.tee_accuracy === "Left") ||
        (accFilters.right && h.tee_accuracy === "Right") ||
        (accFilters.short && h.tee_accuracy === "Short") ||
        (accFilters.long && h.tee_accuracy === "Long") ||
        (accFilters.hit && h.tee_accuracy === "Hit");
      if (!accMatch) return false;
    }
    if (filters.highWater && h.drive_water_ob_pct <= 0) return false;
    if (filters.highTree && h.drive_tree_pct <= 0) return false;
    if (filters.highBunker && h.drive_bunker_pct <= 0) return false;
    if (filters.courseId && h.courseId !== filters.courseId) return false;
    if (filters.par && h.par !== Number(filters.par)) return false;
    if (filters.teeTreeLeft && !h.tee_tree_left) return false;
    if (filters.teeTreeRight && !h.tee_tree_right) return false;
    if (filters.teeBunkerLeft && !h.tee_bunker_left) return false;
    if (filters.teeBunkerRight && !h.tee_bunker_right) return false;
    if (filters.teeWaterLeft && !h.tee_water_left) return false;
    if (filters.teeWaterRight && !h.tee_water_right) return false;
    if (filters.siMin && h.stroke_index < Number(filters.siMin)) return false;
    if (filters.siMax && h.stroke_index > Number(filters.siMax)) return false;
    if (filters.ratingMin && (h.rating ?? 0) < Number(filters.ratingMin)) return false;
    if (filters.ratingMax && (h.rating ?? 999) > Number(filters.ratingMax)) return false;
    if (filters.slopeMin && (h.slope ?? 0) < Number(filters.slopeMin)) return false;
    if (filters.slopeMax && (h.slope ?? 999) > Number(filters.slopeMax)) return false;
    return true;
  });
}

function formatImpact(impact: number): string {
  if (isNaN(impact)) return "—";
  const sign = impact >= 0 ? "+" : "";
  return `${sign}${impact.toFixed(2)}`;
}

function impactColor(impact: number): string {
  if (isNaN(impact) || impact === 0) return "#666";
  return impact > 0 ? "#c0392b" : "#27ae60";
}

export default function RoundsInsights() {
  const [allHoles, setAllHoles] = useState<EnrichedHole[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    async function loadAll() {
      const { data: rounds } = await supabase.from("rounds").select("*");
      if (!rounds) { setLoading(false); return; }
      const enriched: EnrichedHole[] = [];
      for (const round of rounds) {
        const course = await getCourse(round.course_id);
        const holes = round.holes ?? [];
        for (const hole of holes) {
          if (!hole.score || !hole.par) continue;
          const courseHole = course?.holes.find((h: HoleData) => h.hole === hole.hole);
          enriched.push({
            hole: hole.hole,
            par: hole.par,
            score: Number(hole.score),
            tee_accuracy: hole.tee_accuracy ?? "",
            water_penalty: Number(hole.water_penalty) || 0,
            drop_or_out: Number(hole.drop_or_out) || 0,
            tree_haz: Number(hole.tree_haz) || 0,
            fairway_bunker: Number(hole.fairway_bunker) || 0,
            club: hole.club ?? "",
            drive_water_ob_pct: getDriveWaterPct(hole, courseHole),
            drive_tree_pct: getDriveTreePct(hole, courseHole),
            drive_bunker_pct: getDriveBunkerPct(hole, courseHole),
            courseId: round.course_id ?? "",
            courseName: round.course_name ?? "",
            tee_tree_left: courseHole?.tee_tree_hazard_left ?? false,
            tee_tree_right: courseHole?.tee_tree_hazard_right ?? false,
            tee_bunker_left: courseHole?.tee_bunkers_left ?? false,
            tee_bunker_right: courseHole?.tee_bunkers_right ?? false,
            tee_water_left: courseHole?.tee_water_out_left ?? false,
            tee_water_right: courseHole?.tee_water_out_right ?? false,
            stroke_index: hole.stroke_index ?? 0,
            rating: course?.rating ?? null,
            slope: course?.slope ?? null,
          });
        }
      }
      setAllHoles(enriched);
      setLoading(false);
    }
    loadAll();
  }, []);

  const filteredHoles = filterHoles(allHoles, filters);
  const baseline = calculateAverage(allHoles);
  const filteredAvg = calculateAverage(filteredHoles);
  const impact = filteredHoles.length > 0 ? filteredAvg - baseline : NaN;
  const anyFilterActive = Object.values(filters.driveAcc).some(Boolean) ||
    filters.highWater || filters.highTree || filters.highBunker ||
    !!filters.courseId || !!filters.par ||
    filters.teeTreeLeft || filters.teeTreeRight ||
    filters.teeBunkerLeft || filters.teeBunkerRight ||
    filters.teeWaterLeft || filters.teeWaterRight ||
    !!filters.siMin || !!filters.siMax ||
    !!filters.ratingMin || !!filters.ratingMax ||
    !!filters.slopeMin || !!filters.slopeMax;

  const correlations = [
    { label: "Drive Hit", holes: allHoles.filter(h => h.tee_accuracy === "Hit") },
    { label: "Drive Left", holes: allHoles.filter(h => h.tee_accuracy === "Left") },
    { label: "Drive Right", holes: allHoles.filter(h => h.tee_accuracy === "Right") },
    { label: "Drive Short", holes: allHoles.filter(h => h.tee_accuracy === "Short") },
    { label: "Drive Long", holes: allHoles.filter(h => h.tee_accuracy === "Long") },
    { label: "High Water Risk", holes: allHoles.filter(h => h.drive_water_ob_pct > 0) },
    { label: "High Tree Risk", holes: allHoles.filter(h => h.drive_tree_pct > 0) },
    { label: "High Bunker Risk", holes: allHoles.filter(h => h.drive_bunker_pct > 0) },
  ].map(({ label, holes }) => ({
    label, count: holes.length,
    avg: calculateAverage(holes),
    impact: holes.length > 0 ? calculateAverage(holes) - baseline : NaN,
  })).filter(c => c.count > 0).sort((a, b) => b.impact - a.impact);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
    cursor: "pointer", border: "1px solid",
    background: active ? "#0f6e56" : "white",
    color: active ? "white" : "#0f6e56",
    borderColor: "#0f6e56",
  });

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Insights</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Analyze how different factors impact your score vs par across all rounds.
      </p>

      {loading && <p style={{ color: "#666" }}>Loading rounds...</p>}

      {!loading && allHoles.length === 0 && (
        <p style={{ color: "#666" }}>No hole data found. Add some rounds first.</p>
      )}

      {!loading && allHoles.length > 0 && (
        <>
          <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Filters</p>
              {anyFilterActive && (
                <button onClick={() => setFilters(DEFAULT_FILTERS)}
                  style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Reset
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Drive Accuracy</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {(["hit","left","right","short","long"] as const).map(acc => (
                <button key={acc} style={pillStyle(filters.driveAcc[acc])}
                  onClick={() => setFilters(f => ({ ...f, driveAcc: { ...f.driveAcc, [acc]: !f.driveAcc[acc] } }))}>
                  {acc.charAt(0).toUpperCase() + acc.slice(1)}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Course</p>
            <div style={{ marginBottom: 12 }}>
              <select
                value={filters.courseId}
                onChange={e => setFilters(f => ({ ...f, courseId: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", background: "white", cursor: "pointer" }}
              >
                <option value="">All courses</option>
                {Array.from(new Map(allHoles.map(h => [h.courseId, h.courseName])).entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Par</p>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {["3", "4", "5"].map(p => (
                <button key={p} style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", border: "1px solid",
                  background: filters.par === p ? "#0f6e56" : "white",
                  color: filters.par === p ? "white" : "#0f6e56",
                  borderColor: "#0f6e56",
                }}
                  onClick={() => setFilters(f => ({ ...f, par: f.par === p ? "" : p }))}>
                  Par {p}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Hole Handicap Range</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <select
                value={filters.siMin}
                onChange={e => setFilters(f => ({ ...f, siMin: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", background: "white", cursor: "pointer" }}
              >
                <option value="">Min</option>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span style={{ fontSize: 13, color: "#666" }}>to</span>
              <select
                value={filters.siMax}
                onChange={e => setFilters(f => ({ ...f, siMax: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", background: "white", cursor: "pointer" }}
              >
                <option value="">Max</option>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Course Rating Range</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="number" step="0.1" placeholder="Min" value={filters.ratingMin}
                onChange={e => setFilters(f => ({ ...f, ratingMin: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", width: 70 }} />
              <span style={{ fontSize: 13, color: "#666" }}>to</span>
              <input type="number" step="0.1" placeholder="Max" value={filters.ratingMax}
                onChange={e => setFilters(f => ({ ...f, ratingMax: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", width: 70 }} />
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Slope Range</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="number" placeholder="Min" value={filters.slopeMin}
                onChange={e => setFilters(f => ({ ...f, slopeMin: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", width: 70 }} />
              <span style={{ fontSize: 13, color: "#666" }}>to</span>
              <input type="number" placeholder="Max" value={filters.slopeMax}
                onChange={e => setFilters(f => ({ ...f, slopeMax: e.target.value }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #0f6e56", fontSize: 13, color: "#0f6e56", width: 70 }} />
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Tee Risks</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button style={pillStyle(filters.highWater)} onClick={() => setFilters(f => ({ ...f, highWater: !f.highWater }))}>Water Risk</button>
              <button style={pillStyle(filters.highTree)} onClick={() => setFilters(f => ({ ...f, highTree: !f.highTree }))}>Tree Risk</button>
              <button style={pillStyle(filters.highBunker)} onClick={() => setFilters(f => ({ ...f, highBunker: !f.highBunker }))}>Bunker Risk</button>
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 8px" }}>Tee Hazards</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "Trees Left", key: "teeTreeLeft" },
                { label: "Trees Right", key: "teeTreeRight" },
                { label: "Bunkers Left", key: "teeBunkerLeft" },
                { label: "Bunkers Right", key: "teeBunkerRight" },
                { label: "Water/OB Left", key: "teeWaterLeft" },
                { label: "Water/OB Right", key: "teeWaterRight" },
              ].map(({ label, key }) => (
                <button key={key}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                    cursor: "pointer", border: "1px solid",
                    background: filters[key as keyof Filters] ? "#0f6e56" : "white",
                    color: filters[key as keyof Filters] ? "white" : "#0f6e56",
                    borderColor: "#0f6e56",
                  }}
                  onClick={() => setFilters(f => ({ ...f, [key]: !f[key as keyof Filters] }))}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#f6f6f6", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#666", margin: "0 0 4px" }}>Baseline Avg</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: impactColor(baseline) }}>{formatImpact(baseline)}</p>
              <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>{allHoles.length} holes</p>
            </div>
            <div style={{ background: "#f6f6f6", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#666", margin: "0 0 4px" }}>Filtered Avg</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: filteredHoles.length > 0 ? impactColor(filteredAvg) : "#666" }}>
                {filteredHoles.length > 0 ? formatImpact(filteredAvg) : "—"}
              </p>
              <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>{filteredHoles.length} holes</p>
            </div>
            <div style={{ background: "#f6f6f6", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#666", margin: "0 0 4px" }}>Impact</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: impactColor(impact) }}>
                {filteredHoles.length > 0 ? formatImpact(impact) : "—"}
              </p>
              <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>vs baseline</p>
            </div>
          </div>

          <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
              Factor Correlations
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "6px 12px", alignItems: "center" }}>
              <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600 }}>Factor</p>
              <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Holes</p>
              <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Avg</p>
              <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 600, textAlign: "right" }}>Impact</p>
              {correlations.map(({ label, count, avg, impact: imp }) => (
                <>
                  <p key={label + "l"} style={{ fontSize: 14, margin: 0, color: "#0f6e56", fontWeight: 500 }}>{label}</p>
                  <p key={label + "c"} style={{ fontSize: 14, margin: 0, textAlign: "right", color: "#1a1a1a" }}>{count}</p>
                  <p key={label + "a"} style={{ fontSize: 14, margin: 0, textAlign: "right", color: "#1a1a1a" }}>{formatImpact(avg)}</p>
                  <p key={label + "i"} style={{ fontSize: 14, margin: 0, textAlign: "right", fontWeight: 600, color: impactColor(imp) }}>{formatImpact(imp)}</p>
                </>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
