"use client";
import { useState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Round = {
  id: string;
  course_id: string;
  course_name: string;
  date: string;
  holes_played: number;
  starting_hole: number;
  holes: any[];
};

type CourseInfo = {
  rating: number | null;
  slope: number | null;
  hole_count: number | null;
};

function adjustedGrossScore(holes: any[]): number {
  return holes.reduce((sum, h) => {
    const score = Number(h.score) || 0;
    const maxScore = h.par + 2;
    return sum + Math.min(score, maxScore);
  }, 0);
}

function handicapDifferential(round: Round, courseInfo: CourseInfo | undefined): string {
  if (!courseInfo?.rating || !courseInfo?.slope) return "—";
  const scoredHoles = round.holes.filter(h => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (scoredHoles.length === 0) return "—";
  const ags = adjustedGrossScore(scoredHoles);
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
      <p style={{ color: "#666" }}>Loading rounds...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>My rounds</h1>
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
              style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Reset
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
          {anyFilter ? `${filtered.length} of ${rounds.length} rounds` : `${rounds.length} rounds`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "#666" }}>No rounds match your filters.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((round) => {
            const diff = handicapDifferential(round, courseInfoMap[round.course_id]);

            return (
              <div key={round.id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#0f6e56" }}>{round.course_name}</p>
                    <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                      {round.date} · {round.holes_played} holes · Starting hole {round.starting_hole}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>
                        {totalScore(round.holes)}
                      </div>
                      {diff !== "—" && (
                        <div style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>
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
                      <p style={{ fontSize: 11, color: "#666", margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ fontSize: 13, color: "#666" }}>← Back to strategy</a>
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
