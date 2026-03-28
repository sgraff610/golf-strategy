"use client";
import { useState, useEffect } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses().then((data) => { setCourses(data); setLoading(false); });
  }, []);

  const btnStyle = (primary: boolean) => ({
    padding: "6px 14px", fontSize: 13, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white",
    color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8,
    cursor: "pointer" as const, textDecoration: "none" as const,
    display: "inline-block" as const,
  });

  const totalYards = (course: CourseRecord) =>
    course.holes.reduce((s, h) => s + (h.yards || 0), 0).toLocaleString();

  const grouped = courses.reduce<Record<string, CourseRecord[]>>((acc, course) => {
    if (!acc[course.name]) acc[course.name] = [];
    acc[course.name].push(course);
    return acc;
  }, {});

  if (loading) return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading courses...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>My courses</h1>
        <a href="/add-course" style={btnStyle(true)}>+ Add course</a>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <p style={{ color: "#666" }}>No courses yet. Add one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(grouped).map(([name, teeBoxes]) => {
            const first = teeBoxes[0];
            return (
              <div key={name} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{name}</p>
                  <a href={"/add-course?copyFrom=" + first.id} style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px" }}>+ Tees</a>
                </div>
                <p style={{ fontSize: 13, color: "#666", margin: "0 0 10px" }}>{first.city}, {first.state}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {teeBoxes.map(course => (
                    <div key={course.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f9f9f9", borderRadius: 8 }}>
                      <span style={{ fontSize: 14, color: "#1a1a1a" }}>{course.tee_box} tees — {totalYards(course)} yds</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <a href={`/courses/${course.id}/edit`} style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px" }}>Edit</a>
                        <a href={`/?course=${course.id}`} style={{ ...btnStyle(true), fontSize: 12, padding: "4px 10px" }}>Play</a>
                      </div>
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
    </main>
  );
}
