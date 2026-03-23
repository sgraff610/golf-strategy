"use client";
import { useState } from "react";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { saveCourse } from "@/lib/storage";

const DOGLEG_OPTIONS: { value: DoglegDirection; label: string }[] = [
  { value: null, label: "None" },
  { value: "slight_left", label: "Slight Left" },
  { value: "moderate_left", label: "Moderate Left" },
  { value: "severe_left", label: "Severe Left" },
  { value: "slight_right", label: "Slight Right" },
  { value: "moderate_right", label: "Moderate Right" },
  { value: "severe_right", label: "Severe Right" },
  { value: "straight", label: "Straight" },
];

const TEE_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "tee_tree_hazard_left", label: "Trees left" },
  { key: "tee_tree_hazard_right", label: "Trees right" },
  { key: "tee_bunkers_left", label: "Bunkers left" },
  { key: "tee_bunkers_right", label: "Bunkers right" },
  { key: "tee_water_out_left", label: "Water / OB left" },
  { key: "tee_water_out_right", label: "Water / OB right" },
];

const APPROACH_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "approach_tree_hazard_left", label: "Trees left" },
  { key: "approach_tree_hazard_right", label: "Trees right" },
  { key: "approach_bunkers_left", label: "Bunkers left" },
  { key: "approach_bunkers_right", label: "Bunkers right" },
  { key: "approach_water_out_left", label: "Water / OB left" },
  { key: "approach_water_out_right", label: "Water / OB right" },
  { key: "approach_water_out_short", label: "Water short" },
  { key: "approach_water_out_long", label: "Water long" },
  { key: "approach_bunker_short_middle", label: "Bunker short middle" },
  { key: "approach_bunker_short_left", label: "Bunker short left" },
  { key: "approach_bunker_middle_left", label: "Bunker middle left" },
  { key: "approach_bunker_long_left", label: "Bunker long left" },
  { key: "approach_bunker_long_middle", label: "Bunker long middle" },
  { key: "approach_bunker_long_right", label: "Bunker long right" },
  { key: "approach_bunker_middle_right", label: "Bunker middle right" },
  { key: "approach_bunker_short_right", label: "Bunker short right" },
  { key: "approach_green_short_middle", label: "Approach green short middle" },
  { key: "approach_green_short_left", label: "Approach green short left" },
  { key: "approach_green_middle_left", label: "Approach green middle left" },
  { key: "approach_green_long_left", label: "Approach green long left" },
  { key: "approach_green_long_middle", label: "Approach green long middle" },
  { key: "approach_green_long_right", label: "Approach green long right" },
  { key: "approach_green_middle_right", label: "Approach green middle right" },
  { key: "approach_green_short_right", label: "Approach green short right" },
];

function blankHole(n: number): HoleData {
  return {
    hole: n, par: 4, yards: 0, stroke_index: n,
    dogleg_direction: null,
    tee_tree_hazard_left: false, tee_tree_hazard_right: false,
    tee_bunkers_left: false, tee_bunkers_right: false,
    tee_water_out_left: false, tee_water_out_right: false,
    approach_tree_hazard_left: false, approach_tree_hazard_right: false,
    approach_bunkers_left: false, approach_bunkers_right: false,
    approach_water_out_left: false, approach_water_out_right: false,
    approach_water_out_short: false, approach_water_out_long: false,
    approach_bunker_short_middle: false, approach_bunker_short_left: false,
    approach_bunker_middle_left: false, approach_bunker_long_left: false,
    approach_bunker_long_middle: false, approach_bunker_long_right: false,
    approach_bunker_middle_right: false, approach_bunker_short_right: false,
    approach_green_short_middle: false, approach_green_short_left: false,
    approach_green_middle_left: false, approach_green_long_left: false,
    approach_green_long_middle: false, approach_green_long_right: false,
    approach_green_middle_right: false, approach_green_short_right: false,
    approach_green_depth: 0,
  };
}

type Step = "info" | "holes" | "done";

export default function AddCourse() {
  const [step, setStep] = useState<Step>("info");
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [currentHole, setCurrentHole] = useState(0);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    width: "100%", padding: "8px 12px", fontSize: 15,
    border: "1px solid #ddd", borderRadius: 8,
    boxSizing: "border-box" as const,
  };
  const selectStyle = { ...inputStyle, background: "white" };
  const labelStyle = { fontSize: 13, color: "#444", display: "block" as const, marginBottom: 4 };
  const sectionLabel = { fontSize: 12, color: "#888", fontWeight: 600 as const, letterSpacing: 1, marginBottom: 8, marginTop: 20, display: "block" as const };
  const btnStyle = (primary: boolean) => ({
    padding: "10px 20px", fontSize: 15, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white",
    color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer" as const,
  });

  function startCourse() {
    if (!courseName.trim() || !teeBox.trim() || !city.trim() || !state.trim()) {
      return alert("Please fill in all course details.");
    }
    setHoles(Array.from({ length: holeCount }, (_, i) => blankHole(i + 1)));
    setCurrentHole(0);
    setStep("holes");
  }

  function updateHole(field: keyof HoleData, value: any) {
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, [field]: value } : h));
  }

  function toggleCheck(field: keyof HoleData) {
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, [field]: !h[field] } : h));
  }

  async function finish() {
    setSaving(true);
    const course: CourseRecord = {
      id: `${courseName.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
      name: courseName.trim(),
      tee_box: teeBox.trim(),
      city: city.trim(),
      state: state.trim(),
      holes,
    };
    await saveCourse(course);
    setSaving(false);
    setStep("done");
  }

  const hole = holes[currentHole];

  if (step === "done") return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Course saved!</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>{courseName} has been saved to your database.</p>
      <div style={{ display: "flex", gap: 12 }}>
        <a href="/add-course" style={{ ...btnStyle(false), textDecoration: "none" }}>Add another</a>
        <a href="/" style={{ ...btnStyle(true), textDecoration: "none" }}>Go to strategy</a>
      </div>
    </main>
  );

  if (step === "info") return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Add a course</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Enter the course details to get started.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Course name</label>
          <input style={inputStyle} value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="e.g. Augusta National Golf Club" />
        </div>
        <div>
          <label style={labelStyle}>Tee box</label>
          <input style={inputStyle} value={teeBox} onChange={e => setTeeBox(e.target.value)} placeholder="e.g. Blue, White, Red" />
        </div>
        <div>
          <label style={labelStyle}>City</label>
          <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Augusta" />
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <input style={inputStyle} value={state} onChange={e => setState(e.target.value)} placeholder="e.g. GA" />
        </div>
        <div>
          <label style={labelStyle}>Number of holes</label>
          <select style={selectStyle} value={holeCount} onChange={e => setHoleCount(Number(e.target.value) as 9 | 18)}>
            <option value={9}>9 holes</option>
            <option value={18}>18 holes</option>
          </select>
        </div>
        <button style={btnStyle(true)} onClick={startCourse}>Start entering holes</button>
      </div>
    </main>
  );

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{courseName} — Hole {hole.hole}</h1>
        <span style={{ fontSize: 13, color: "#888" }}>{currentHole + 1} of {holes.length}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Par</label>
            <select style={selectStyle} value={hole.par} onChange={e => updateHole("par", Number(e.target.value))}>
              {[3, 4, 5].map(p => <option key={p} value={p}>Par {p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Yards</label>
            <input style={inputStyle} type="number" min={1} max={700} value={hole.yards || ""} onChange={e => updateHole("yards", Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Stroke index</label>
            <input style={inputStyle} type="number" min={1} max={18} value={hole.stroke_index || ""} onChange={e => updateHole("stroke_index", Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Dogleg direction</label>
          <select style={selectStyle} value={hole.dogleg_direction ?? ""} onChange={e => updateHole("dogleg_direction", e.target.value === "" ? null : e.target.value as DoglegDirection)} disabled={hole.par === 3}>
            {DOGLEG_OPTIONS.map(o => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
          </select>
          {hole.par === 3 && <p style={{ fontSize: 12, color: "#aaa", margin: "4px 0 0" }}>Disabled for par 3</p>}
        </div>

        <div>
          <span style={sectionLabel}>TEE SHOT HAZARDS</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {TEE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span style={sectionLabel}>APPROACH HAZARDS</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {APPROACH_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Green depth (yards)</label>
          <input style={{ ...inputStyle, maxWidth: 120 }} type="number" min={0} value={hole.approach_green_depth || ""} onChange={e => updateHole("approach_green_depth", Number(e.target.value))} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
          <button style={btnStyle(false)} onClick={() => setCurrentHole(i => Math.max(0, i - 1))} disabled={currentHole === 0}>
            Previous
          </button>
          {currentHole < holes.length - 1
            ? <button style={btnStyle(true)} onClick={() => setCurrentHole(i => i + 1)}>Next hole</button>
            : <button style={{ ...btnStyle(true), opacity: saving ? 0.6 : 1 }} onClick={finish} disabled={saving}>
                {saving ? "Saving..." : "Save course"}
              </button>
          }
        </div>
      </div>
    </main>
  );
}