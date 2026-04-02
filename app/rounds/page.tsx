"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Round = {
  id: string;
  course_name: string;
  date: string;
  holes_played: number;
  starting_hole: number;
  holes: any[];
};

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  useEffect(() => {
    supabase
      .from("rounds")
      .select("*")
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setRounds(data);
        setLoading(false);
      });
  }, []);

  const btnStyle = (primary: boolean) => ({
    padding: "8px 16px", fontSize: 14, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white",
    color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8,
    cursor: "pointer" as const, textDecoration: "none" as const,
    display: "inline-block" as const,
  });

  const selectStyle = {
    padding: "6px 10px", fontSize: 13, borderRadius: 8,
    border: "1px solid #ddd", background: "white",
    color: "#0f6e56", cursor: "pointer" as const,
  };

  function totalScore(holes: any[]) {
    return holes.reduce((sum, h) => sum + (h.score || 0), 0);
  }
  function totalPutts(holes: any[]) {
    return holes.reduce((sum, h) => sum + (h.putts || 0), 0);
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

  // Unique courses and years for filters
  const uniqueCourses = Array.from(new Set(rounds.map(r => r.course_name))).sort();
  const uniqueYears = Array.from(new Set(rounds.map(r => r.date?.substring(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));

  // Apply filters
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
        <a href="/rounds/add" style={btnStyle(true)}>+ Add round</a>
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
          {filtered.map((round) => (
            <div key={round.id} style={{
              background: "white", border: "1px solid #eee", borderRadius: 12,
              padding: "16px 20px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#0f6e56" }}>{round.course_name}</p>
                  <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                    {round.date} · {round.holes_played} holes · Starting hole {round.starting_hole}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>
                    {totalScore(round.holes)}
                  </div>
                  <a href={`/rounds/${round.id}/edit`} style={{
                    padding: "6px 12px", fontSize: 13, fontWeight: 600,
                    background: "white", color: "#1a1a1a",
                    border: "1px solid #1a1a1a", borderRadius: 8,
                    textDecoration: "none",
                  }}>Edit</a>
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
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ fontSize: 13, color: "#666" }}>← Back to strategy</a>
      </div>
    </main>
  );
}
