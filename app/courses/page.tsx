"use client";
import { useState, useEffect } from "react";
import { Pencil, Trash2, Flag } from "lucide-react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CourseRecord | null>(null);
  const [blockingRounds, setBlockingRounds] = useState<{ id: string; date: string; course_name: string }[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  useEffect(() => {
    loadCourses().then((data) => { setCourses(data); setLoading(false); });
  }, []);

  const totalYards = (course: CourseRecord) =>
    course.holes.reduce((s, h) => s + (h.yards || 0), 0).toLocaleString();

  async function handleDeleteClick(course: CourseRecord) {
    const { data } = await supabase
      .from("rounds")
      .select("id, date, course_name")
      .eq("course_id", course.id);
    setDeleteTarget(course);
    if (data && data.length > 0) {
      setBlockingRounds(data);
      setShowConfirm(false);
    } else {
      setBlockingRounds(null);
      setShowConfirm(true);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await supabase.from("courses").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setShowConfirm(false);
    const updated = await loadCourses();
    setCourses(updated);
  }

  function closeModal() {
    setDeleteTarget(null);
    setBlockingRounds(null);
    setShowConfirm(false);
  }

  const iconBtn = (color: string, id: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${hoveredBtn === id ? color : "#e0e0e0"}`,
    background: hoveredBtn === id ? `${color}15` : "white",
    color: hoveredBtn === id ? color : "#888",
    cursor: "pointer",
    transition: "all 0.15s ease",
  });

  const addTeeBtn: React.CSSProperties = {
    padding: "4px 10px", fontSize: 12, fontWeight: 600,
    background: "white", color: "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8,
    cursor: "pointer", textDecoration: "none", display: "inline-block",
  };

  const addCourseBtn: React.CSSProperties = {
    padding: "6px 14px", fontSize: 13, fontWeight: 600,
    background: "#1a1a1a", color: "white",
    border: "1px solid #1a1a1a", borderRadius: 8,
    cursor: "pointer", textDecoration: "none", display: "inline-block",
  };

  const grouped = courses.reduce<Record<string, CourseRecord[]>>((acc, course) => {
    if (!acc[course.name]) acc[course.name] = [];
    acc[course.name].push(course);
    return acc;
  }, {});

  if (loading) return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "white" }}>Loading courses...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: "#d0d0d0" }}>My courses</h1>
        <a href="/add-course" style={addCourseBtn}>+ Add course</a>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p style={{ color: "white" }}>No courses yet. Add one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(grouped).map(([name, teeBoxes]) => {
            const first = teeBoxes[0];
            return (
              <div key={name} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{name}</p>
                  <a href={"/add-course?copyFrom=" + first.id} style={addTeeBtn}>+ Tees</a>
                </div>
                <p style={{ fontSize: 13, color: "#0f6e56", margin: "0 0 10px" }}>{first.city}, {first.state}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {teeBoxes.map(course => (
                    <div key={course.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f9f9f9", borderRadius: 8 }}>
                      <span style={{ fontSize: 14, color: "#1a1a1a" }}>{course.tee_box} tees — {totalYards(course)} yds</span>
                      <div style={{ display: "flex", gap: 6 }}>

                        {/* Edit */}
                        <a
                          href={`/courses/${course.id}/edit`}
                          title="Edit"
                          style={iconBtn("#1a1a1a", `edit-${course.id}`)}
                          onMouseEnter={() => setHoveredBtn(`edit-${course.id}`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                        >
                          <Pencil size={15} />
                        </a>

                        {/* Play */}
                        <a
                          href={`/?course=${course.id}`}
                          title="Play"
                          style={iconBtn("#0f6e56", `play-${course.id}`)}
                          onMouseEnter={() => setHoveredBtn(`play-${course.id}`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                        >
                          <Flag size={15} />
                        </a>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteClick(course)}
                          title="Delete"
                          style={iconBtn("#c0392b", `delete-${course.id}`)}
                          onMouseEnter={() => setHoveredBtn(`delete-${course.id}`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                        >
                          <Trash2 size={15} />
                        </button>

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
        <a href="/" style={{ fontSize: 13, color: "white" }}>← Back to strategy</a>
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 420, width: "90%", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", fontFamily: "sans-serif" }}>
            {blockingRounds && blockingRounds.length > 0 ? (
              <>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: "#1a1a1a" }}>
                  Can't delete {deleteTarget.tee_box} tees
                </p>
                <p style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
                  {blockingRounds.length} round{blockingRounds.length > 1 ? "s are" : " is"} using this course:
                </p>
                <ul style={{ paddingLeft: 16, marginBottom: 20 }}>
                  {blockingRounds.map(r => (
                    <li key={r.id} style={{ marginBottom: 6 }}>
                      <a href={`/rounds/${r.id}/edit`} style={{ color: "#0f6e56", fontWeight: 500, fontSize: 14 }}>
                        {r.date} — {r.course_name}
                      </a>
                    </li>
                  ))}
                </ul>
                <button onClick={closeModal} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, background: "#0f6e56", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Close
                </button>
              </>
            ) : showConfirm ? (
              <>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: "#1a1a1a" }}>
                  Delete {deleteTarget.tee_box} tees?
                </p>
                <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
                  This will permanently delete {deleteTarget.name} ({deleteTarget.tee_box}) and cannot be undone.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={confirmDelete} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, background: "#c0392b", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                    Yes, delete
                  </button>
                  <button onClick={closeModal} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, background: "#eee", color: "#333", border: "none", borderRadius: 8, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
