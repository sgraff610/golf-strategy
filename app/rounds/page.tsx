"use client";
import { useState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";

type Round = {
  id: string;
  course_id: string;
  course_name: string;
  date: string;
  holes_played: number;
  starting_hole: number;
  holes: any[];
  score_differential: number | null;
  recap?: Record<string, unknown> | null;
};

type CourseInfo = {
  rating: number | null;
  slope: number | null;
  hole_count: number | null;
};

function handicapStrokesOnHole(courseHandicap: number, strokeIndex: number): number {
  const base = Math.floor(courseHandicap / 18);
  const extra = courseHandicap % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

function adjustedGrossScore(holes: any[], courseHandicap: number): number {
  return holes.reduce((sum, h) => {
    const strokes = handicapStrokesOnHole(courseHandicap, h.stroke_index);
    const ndb = h.par + 2 + strokes;
    const score = Number(h.score) || 0;
    return sum + (score > 0 ? Math.min(score, ndb) : 0);
  }, 0);
}

function handicapDifferential(round: Round, courseInfo: CourseInfo | undefined): string {
  if (!courseInfo?.rating || !courseInfo?.slope) return "—";
  const scoredHoles = round.holes.filter(h => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (scoredHoles.length === 0) return "—";
  const totalPar = scoredHoles.reduce((s: number, h: any) => s + (h.par || 0), 0);
  const tempCH = Math.round(20 * (courseInfo.slope / 113) + (courseInfo.rating - totalPar));
  const ags = adjustedGrossScore(scoredHoles, Math.max(0, tempCH));
  const holesPlayed = round.holes_played ?? scoredHoles.length;
  const is9Round = holesPlayed <= 9;
  const is9Course = (courseInfo.hole_count ?? round.holes.length) <= 9;

  let rating = courseInfo.rating;
  let slope = courseInfo.slope;

  // Adjust rating if round holes don't match course holes
  if (is9Round && !is9Course) {
    // Playing 9 from an 18-hole course — halve the rating
    rating = rating / 2;
  } else if (!is9Round && is9Course) {
    // Playing 18 from a 9-hole course — double the rating
    rating = rating * 2;
  }

  let diff: number;
  if (is9Round) {
    diff = ((113 / slope) * (ags - rating)) * 2;
  } else {
    diff = (ags - rating) * 113 / slope;
  }
  return diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
}

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courseInfoMap, setCourseInfoMap] = useState<Record<string, CourseInfo>>({});
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Round | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);

  async function addAnalysis(round: Round) {
    setCalculatingId(round.id);
    const course = await getCourse(round.course_id);
    const courseHoles = course?.holes ?? [];
    const CLUB_DIST: Record<string, number> = {
      Driver: 230, "3W": 210, "5W": 195, "7W": 180,
      "4i": 185, "5i": 175, "6i": 165, "7i": 155,
      "8i": 145, "9i": 130, PW: 120, SW: 100, LW: 80,
    };
    const APPR_CLUBS = ["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
    const updatedHoles = round.holes.map((hole: any) => {
      const ch = courseHoles.find((h: any) => h.hole === hole.hole);
      const driveDist = CLUB_DIST[hole.club] ?? 0;
      const secondShotDist = driveDist > 0 && hole.yards > 0 ? Math.max(0, hole.yards - driveDist) : null;
      const score = Number(hole.score) || 0;
      const putts = Number(hole.putts) || 0;
      const nonPuttStrokes = score - putts;
      const approachClubEst = secondShotDist !== null && nonPuttStrokes === 2
        ? APPR_CLUBS.reduce((best: string, club: string) =>
            Math.abs((CLUB_DIST[club] ?? 0) - secondShotDist) < Math.abs((CLUB_DIST[best] ?? 0) - secondShotDist) ? club : best,
            APPR_CLUBS[0])
        : null;
      const waterPenalty = (Number(hole.water_penalty) || 0) + (Number(hole.drop_or_out) || 0);
      let driveWaterPct = 0;
      if (ch && waterPenalty > 0 && hole.tee_accuracy !== "Hit" && hole.tee_accuracy) {
        const chips = hole.appr_accuracy === "Hit" ? 0 : (hole.chips !== "" && hole.chips != null ? Number(hole.chips) : 0);
        const other = score - putts - chips - 1;
        const match = (hole.tee_accuracy === "Left" && ch.tee_water_out_left) || (hole.tee_accuracy === "Right" && ch.tee_water_out_right);
        if (match) driveWaterPct = other === 1 ? 100 : other > 1 ? 50 : 0;
      }
      let driveTreePct = 0;
      if (ch && hole.tee_accuracy !== "Hit" && hole.tee_accuracy) {
        const treeHaz = (Number(hole.tree_haz) || 0) > 0;
        if (hole.tee_accuracy === "Left"  && ch.tee_tree_hazard_left)  driveTreePct = treeHaz ? 75 : 25;
        else if (hole.tee_accuracy === "Right" && ch.tee_tree_hazard_right) driveTreePct = treeHaz ? 75 : 25;
      }
      let driveBunkerPct = 0;
      if (ch && hole.tee_accuracy !== "Hit" && hole.tee_accuracy) {
        const fwyBunker = (Number(hole.fairway_bunker) || 0) > 0;
        if (hole.tee_accuracy === "Left"  && ch.tee_bunkers_left)  driveBunkerPct = fwyBunker ? 100 : 0;
        else if (hole.tee_accuracy === "Right" && ch.tee_bunkers_right) driveBunkerPct = fwyBunker ? 100 : 0;
      }
      return {
        ...hole,
        drive_distance_est: driveDist > 0 ? driveDist : null,
        second_shot_dist_est: secondShotDist,
        approach_club_est: approachClubEst,
        drive_water_ob_pct: driveWaterPct,
        drive_tree_pct: driveTreePct,
        drive_bunker_pct: driveBunkerPct,
      };
    });
    await supabase.from("rounds").update({ holes: updatedHoles }).eq("id", round.id);
    setRounds(prev => prev.map(r => r.id === round.id ? { ...r, holes: updatedHoles } : r));
    setCalculatingId(null);
  }

  useEffect(() => {
    supabase
      .from("rounds")
      .select("*")
      .order("date", { ascending: false })
      .then(async ({ data, error }) => {
        if (!error && data) {
          setRounds(data);
          // Fetch course info for all unique course_ids
          const uniqueCourseIds = [...new Set(data.map((r: any) => r.course_id).filter(Boolean))];
          if (uniqueCourseIds.length > 0) {
            const { data: courses } = await supabase
              .from("courses")
              .select("id, rating, slope, hole_count")
              .in("id", uniqueCourseIds);
            if (courses) {
              const map: Record<string, CourseInfo> = {};
              courses.forEach((c: any) => { map[c.id] = { rating: c.rating, slope: c.slope, hole_count: c.hole_count }; });
              setCourseInfoMap(map);
            }
          }
        }
        setLoading(false);
      });
  }, []);

  const selectStyle = {
    padding: "6px 10px", fontSize: 13, borderRadius: 8,
    border: "1px solid #ddd", background: "white",
    color: "#0f6e56", cursor: "pointer" as const,
  };

  const iconBtn = (color: string, id: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: 8,
    border: `1px solid ${hoveredBtn === id ? color : "#e0e0e0"}`,
    background: hoveredBtn === id ? `${color}15` : "white",
    color: hoveredBtn === id ? color : "#888",
    cursor: "pointer", transition: "all 0.15s ease",
  });

  function totalScore(holes: any[]) {
    return holes.reduce((sum, h) => sum + (Number(h.score) || 0), 0);
  }
  function totalPutts(holes: any[]) {
    return holes.reduce((sum, h) => sum + (Number(h.putts) || 0), 0);
  }
  function fairwaysHit(holes: any[]) {
    return holes.filter(h => (h.par === 4 || h.par === 5) && h.tee_accuracy === "Hit").length;
  }
  function drivingTotal(holes: any[]) {
    return holes.filter(h => h.par === 4 || h.par === 5).length;
  }
  function girsHit(holes: any[]) {
    return holes.filter(h => h.gir).length;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await supabase.from("rounds").delete().eq("id", deleteTarget.id);
    setRounds(prev => prev.filter(r => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  const uniqueCourses = Array.from(new Set(rounds.map(r => r.course_name))).sort();
  const uniqueYears = Array.from(new Set(rounds.map(r => r.date?.substring(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));

  const filtered = rounds.filter(r => {
    if (courseFilter && r.course_name !== courseFilter) return false;
    if (yearFilter && !r.date?.startsWith(yearFilter)) return false;
    return true;
  });

  const anyFilter = !!courseFilter || !!yearFilter;

  if (loading) return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "white" }}>Loading rounds...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: "#d0d0d0" }}>My rounds</h1>
        <a href="/rounds/add" style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, background: "#1a1a1a", color: "white", border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>+ Add round</a>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 6 }}>
          <select style={selectStyle} value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
            <option value="">All courses</option>
            {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={selectStyle} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">All years</option>
            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {anyFilter && (
            <button onClick={() => { setCourseFilter(""); setYearFilter(""); }}
              style={{ fontSize: 12, color: "white", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Reset
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: "white", margin: 0 }}>
          {anyFilter ? `${filtered.length} of ${rounds.length} rounds` : `${rounds.length} rounds`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "white" }}>No rounds match your filters.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((round) => {
            const diff = (() => {
  if (round.score_differential == null) return "—";
  const d = round.holes_played <= 9 ? round.score_differential * 2 : round.score_differential;
  return d >= 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
})();

            return (
              <div key={round.id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#0f6e56" }}>{round.course_name}</p>
                    <p style={{ fontSize: 13, color: "#0f6e56", margin: 0 }}>
                      {round.date} · {round.holes_played} holes · Starting hole {round.starting_hole}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>
                        {totalScore(round.holes)}
                      </div>
                      {diff !== "—" && (
                        <div style={{ fontSize: 11, color: "#0f6e56", fontWeight: 500 }}>
                          Diff: <span style={{ color: "#0f6e56", fontWeight: 700 }}>{diff}</span>
                        </div>
                      )}
                    </div>
                    <a
                      href={`/rounds/${round.id}/edit`}
                      title="Edit"
                      style={iconBtn("#1a1a1a", `edit-${round.id}`)}
                      onMouseEnter={() => setHoveredBtn(`edit-${round.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                    >
                      <Pencil size={15} />
                    </a>
                    <button
                      title="Delete"
                      onClick={() => setDeleteTarget(round)}
                      style={iconBtn("#c0392b", `delete-${round.id}`)}
                      onMouseEnter={() => setHoveredBtn(`delete-${round.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Putts", value: totalPutts(round.holes) },
                    { label: "Driving", value: `${fairwaysHit(round.holes)}/${drivingTotal(round.holes)}` },
                    { label: "GIR", value: `${girsHit(round.holes)}/${round.holes.length}` },
                    { label: "GRINTS", value: `${round.holes.filter((h: any) => h.grints).length}/${round.holes.length}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: "8px 12px", textAlign: "center" as const }}>
                      <p style={{ fontSize: 11, color: "#0f6e56", margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                  {(() => {
                    const hasAnalysis = round.holes.some((h: any) => h.drive_water_ob_pct !== undefined);
                    const isCalc = calculatingId === round.id;
                    return (
                      <button
                        onClick={() => !hasAnalysis && !isCalc && addAnalysis(round)}
                        disabled={isCalc}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                          cursor: hasAnalysis ? "default" : "pointer",
                          background: hasAnalysis ? "#d8e7df" : "#f6f6f6",
                          color: hasAnalysis ? "#0a4d3c" : "#888",
                          border: `1px solid ${hasAnalysis ? "#0f6e56" : "#ddd"}`,
                        }}
                      >
                        {isCalc ? "Calculating…" : hasAnalysis ? "✓ Analysis" : "+ Add analysis"}
                      </button>
                    );
                  })()}
                  <a
                    href={`/rounds/recap?roundId=${round.id}`}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                      textDecoration: "none",
                      background: round.recap ? "#d8e7df" : "#f6f6f6",
                      color: round.recap ? "#0a4d3c" : "#888",
                      border: `1px solid ${round.recap ? "#0f6e56" : "#ddd"}`,
                    }}
                  >
                    {round.recap ? "✓ Recap" : "+ Add recap"}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ fontSize: 13, color: "white" }}>← Back to strategy</a>
      </div>

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 400, width: "90%", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", fontFamily: "sans-serif" }}>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: "#1a1a1a" }}>Delete this round?</p>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
              {deleteTarget.date} — {deleteTarget.course_name}. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmDelete} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, background: "#c0392b", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                Yes, delete
              </button>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, background: "#eee", color: "#333", border: "none", borderRadius: 8, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
