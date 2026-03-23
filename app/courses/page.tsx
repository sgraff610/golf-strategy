"use client";
import { useState, useEffect } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses().then((data) => {
      setCourses(data);
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

  if (loading) return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading courses...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>My courses</h1>
        <a href="/add-course" style={btnStyle(true)}>+ Add course</a>
      </div>

      {courses.length === 0 ? (
        <p style={{ color: "#666" }}>No courses yet. Add one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {courses.map((course) => (
            <div key={course.id} style={{
              background: "white", border: "1px solid #eee", borderRadius: 12,
              padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#0f6e56" }}>{course.name}</p>
                <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                  {course.tee_box} tees · {course.city}, {course.state} · {course.holes.length} holes
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/courses/${course.id}/edit`} style={btnStyle(false)}>Edit</a>
                <a href="/" style={btnStyle(true)}>Play</a>
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