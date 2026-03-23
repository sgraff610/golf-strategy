"use client";
import { useState, useEffect } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";

const DOGLEG_LABELS: Record<string, string> = {
  severe_left: "Severe Left",
  moderate_left: "Moderate Left",
  slight_left: "Slight Left",
  straight: "Straight",
  slight_right: "Slight Right",
  moderate_right: "Moderate Right",
  severe_right: "Severe Right",
};

const HOLE_NUMBERS = Array.from({ length: 18 }, (_, i) => i + 1);

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
  const holeCount = selectedCourse?.holes.length ?? 18;
  const availableHoles = Array.from({ length: holeCount }, (_, i) => i + 1);

  const handleSubmit = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: selectedCourse.name, hole: holeNumber }),
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
    boxSizing: "border-box" as const,
  };
  const labelStyle = {
    fontSize: 13, color: "#444", display: "block" as const, marginBottom: 4,
  };

  if (loadingCourses) return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading courses...</p>
    </main>
  );

  if (courses.length === 0) return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Golf Strategy Engine</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>No courses found. Add one first.</p>
      <a href="/add-course" style={{ padding: "10px 20px", fontSize: 15, fontWeight: 600, background: "#1a1a1a", color: "white", borderRadius: 8, textDecoration: "none" }}>
        Add a course
      </a>
    </main>
  );

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Golf Strategy Engine</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Select a course and hole to get your strategy.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Course</label>
          <select style={selectStyle} value={courseId} onChange={e => { setCourseId(e.target.value); setHoleNumber(1); setResult(null); }}>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees ({c.city}, {c.state})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Hole number</label>
          <select style={selectStyle} value={holeNumber} onChange={e => { setHoleNumber(Number(e.target.value)); setResult(null); }}>
            {availableHoles.map(n => <option key={n} value={n}>Hole {n}</option>)}
          </select>
        </div>

        <button
          onClick={handleSubmit} disabled={loading}
          style={{ marginTop: 8, padding: "12px", fontSize: 15, fontWeight: 600, background: "#1a1a1a", color: "white", border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Loading..." : "Get Strategy"}
        </button>

        <a href="/add-course" style={{ fontSize: 13, color: "#888", textAlign: "center" as const }}>
          + Add a new course
        </a>
      </div>

      {error && <p style={{ color: "red", marginTop: 24 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#f0f0f0", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>HOLE INFO</p>
            <p style={{ fontSize: 15, marginBottom: 4 }}>Par {result.hole.par} — {result.hole.yards} yards</p>
            {result.hole.dogleg_direction && (
              <p style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>
                Dogleg: {DOGLEG_LABELS[result.hole.dogleg_direction] ?? result.hole.dogleg_direction}
              </p>
            )}
            {result.hole.approach_green_depth > 0 && (
              <p style={{ fontSize: 14, color: "#555" }}>Green depth: {result.hole.approach_green_depth} yards</p>
            )}
          </div>

          {result.hole.hazards && result.hole.hazards.length > 0 && (
            <div style={{ background: "#f0f0f0", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>HAZARDS</p>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {result.hole.hazards.map((h: string) => (
                  <li key={h} style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ background: "#f6f6f6", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>TEE STRATEGY</p>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {result.strategy.tee_strategy.club} — aim {result.strategy.tee_strategy.aim}
            </p>
            <p style={{ fontSize: 14, color: "#555" }}>{result.strategy.tee_strategy.reason}</p>
          </div>

          <div style={{ background: "#f6f6f6", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>APPROACH</p>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              Favor {result.strategy.approach_strategy.aim}
            </p>
            <p style={{ fontSize: 14, color: "#555" }}>{result.strategy.approach_strategy.reason}</p>
          </div>

          {result.strategy.warning && (
            <div style={{ background: "#fff4e5", border: "1px solid #f0a500", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 12, color: "#b37400", marginBottom: 4 }}>WARNING</p>
              <p style={{ fontSize: 15, color: "#7a4f00" }}>{result.strategy.warning}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}