"use client";
import { useState, useEffect } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";

const DOGLEG_LABELS: Record<string, string> = {
  severe_left: "Severe Left", moderate_left: "Moderate Left", slight_left: "Slight Left",
  straight: "Straight",
  slight_right: "Slight Right", moderate_right: "Moderate Right", severe_right: "Severe Right",
};

export default function Home() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [holeNumber, setHoleNumber] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCourses().then((data) => {
      setCourses(data);
      if (data.length > 0) setCourseId(data[0].id);
      setLoadingCourses(false);
    });
  }, []);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const availableHoles = Array.from({ length: selectedCourse?.holes.length ?? 18 }, (_, i) => i + 1);

  const handleSubmit = async () => {
    if (!selectedCourse) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, hole: holeNumber }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const selectStyle = {
    width: "100%", padding: "8px 12px", fontSize: 15,
    border: "1px solid #ddd", borderRadius: 8, background: "white",
    boxSizing: "border-box" as const, color: "#0f6e56",
  };
  const labelStyle = { fontSize: 13, color: "#aaa", display: "block" as const, marginBottom: 4 };
  const cardStyle = (bg: string): React.CSSProperties => ({
    background: bg, borderRadius: 12, padding: "16px 20px",
  });

  if (loadingCourses) return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading courses...</p>
    </main>
  );

  if (courses.length === 0) return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Golf Strategy Engine</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>No courses found. Add one first.</p>
      <a href="/add-course" style={{ padding: "10px 20px", fontSize: 15, fontWeight: 600, background: "#1a1a1a", color: "white", borderRadius: 8, textDecoration: "none" }}>Add a course</a>
    </main>
  );

  const confidenceColor: Record<string, string> = { high: "#27ae60", medium: "#e67e22", low: "#95a5a6" };
  const aimColors: Record<string, string> = { left: "#2980b9", right: "#8e44ad", center: "#27ae60", short: "#e67e22", long: "#c0392b" };

  return (
    <main style={{ maxWidth: 500, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: "#0f6e56" }}>Strategy Engine</h1>
      <p style={{ color: "#aaa", marginBottom: 24, fontSize: 13 }}>Select a course and hole to get your personalised strategy.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Course</label>
          <select style={selectStyle} value={courseId} onChange={e => { setCourseId(e.target.value); setHoleNumber(1); setResult(null); }}>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees ({c.city}, {c.state})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Hole</label>
          <select style={selectStyle} value={holeNumber} onChange={e => { setHoleNumber(Number(e.target.value)); setResult(null); }}>
            {availableHoles.map(n => {
              const hd = selectedCourse?.holes.find(h => h.hole === n);
              return (
                <option key={n} value={n}>
                  Hole {n}{hd ? ` — Par ${hd.par}, ${hd.yards} yds, SI ${hd.stroke_index}` : ""}
                </option>
              );
            })}
          </select>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{
          padding: "12px", fontSize: 15, fontWeight: 600,
          background: "#0f6e56", color: "white", border: "none",
          borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "Analysing..." : "Get Strategy"}
        </button>
      </div>

      {error && <p style={{ color: "red", marginTop: 20 }}>{error}</p>}

      {result && (() => {
        const { hole, strategy, course } = result;
        const ds = strategy.data_summary;
        const conf = strategy.confidence;

        return (
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Confidence + data badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: confidenceColor[conf] ?? "#666",
                textTransform: "uppercase",
              }}>
                {conf} confidence
              </span>
              <span style={{ fontSize: 11, color: "#aaa" }}>
                {ds.exact_hole_history > 0
                  ? `${ds.exact_hole_history}× this hole · ${ds.similar_holes_used} similar`
                  : `${ds.similar_holes_used} similar holes`}
              </span>
            </div>

            {/* Hole info */}
            <div style={cardStyle("#f0f0f0")}>
              <p style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 1, margin: "0 0 8px" }}>HOLE INFO</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: "#333" }}>Par {hole.par}</span>
                <span style={{ fontSize: 14, color: "#333" }}>{hole.yards} yds</span>
                <span style={{ fontSize: 14, color: "#333" }}>SI {hole.stroke_index}</span>
                {course?.rating && <span style={{ fontSize: 14, color: "#666" }}>Rating {course.rating}</span>}
                {course?.slope  && <span style={{ fontSize: 14, color: "#666" }}>Slope {course.slope}</span>}
              </div>
              {hole.dogleg_direction && hole.dogleg_direction !== "straight" && (
                <p style={{ fontSize: 13, color: "#555", margin: "6px 0 0" }}>
                  Dogleg: {DOGLEG_LABELS[hole.dogleg_direction] ?? hole.dogleg_direction}
                </p>
              )}
              {hole.approach_green_depth > 0 && (
                <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Green depth: {hole.approach_green_depth} yds</p>
              )}
            </div>

            {/* Avg score on similar holes */}
            <div style={{ ...cardStyle("#f0f0f0"), display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px" }}>
              <span style={{ fontSize: 13, color: "#aaa" }}>Your avg on similar holes</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: ds.avg_score_to_par.startsWith("+") ? "#c0392b" : ds.avg_score_to_par === "+0.00" ? "#27ae60" : "#27ae60" }}>
                {ds.avg_score_to_par}
              </span>
            </div>

            {/* Tee strategy */}
            <div style={cardStyle("#f6f6f6")}>
              <p style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 1, margin: "0 0 8px" }}>TEE STRATEGY</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{strategy.tee_strategy.club}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: aimColors[strategy.tee_strategy.aim] ?? "#333" }}>
                  aim {strategy.tee_strategy.aim}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#666", margin: 0 }}>{strategy.tee_strategy.reason}</p>
            </div>

            {/* Approach strategy */}
            <div style={cardStyle("#f6f6f6")}>
              <p style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 1, margin: "0 0 8px" }}>APPROACH</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: aimColors[strategy.approach_strategy.aim] ?? "#333", margin: "0 0 6px" }}>
                Favour {strategy.approach_strategy.aim}
              </p>
              <p style={{ fontSize: 13, color: "#666", margin: 0 }}>{strategy.approach_strategy.reason}</p>
            </div>

            {/* Warning */}
            {strategy.warning && (
              <div style={{ background: "#fff4e5", border: "1px solid #f0a500", borderRadius: 12, padding: "14px 20px" }}>
                <p style={{ fontSize: 11, color: "#b37400", fontWeight: 700, letterSpacing: 1, margin: "0 0 6px" }}>⚠ WATCH OUT</p>
                <p style={{ fontSize: 13, color: "#7a4f00", margin: 0 }}>{strategy.warning}</p>
              </div>
            )}

            {/* Key insights */}
            {ds.insights && ds.insights.length > 0 && (
              <div style={cardStyle("#f0f9f6")}>
                <p style={{ fontSize: 11, color: "#0f6e56", fontWeight: 700, letterSpacing: 1, margin: "0 0 8px" }}>YOUR TENDENCIES ON SIMILAR HOLES</p>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {ds.insights.map((insight: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: "#333", marginBottom: 4 }}>{insight}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Low confidence notice */}
            {conf === "low" && (
              <p style={{ fontSize: 12, color: "#aaa", textAlign: "center", margin: 0 }}>
                Limited data for this hole type — strategy is based on general tendencies. Play more rounds to improve accuracy.
              </p>
            )}
          </div>
        );
      })()}
    </main>
  );
}
