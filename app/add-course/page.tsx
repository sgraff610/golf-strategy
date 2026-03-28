"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { saveCourse, getCourse } from "@/lib/storage";
import GreensideSelector, {
  GreensideState,
  defaultGreensideState,
  flatToGreenside,
  greensideToFlat,
} from "@/app/components/GreensideSelector";

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
  { key: "tee_tree_hazard_left", label: "Trees / Hazard left" },
  { key: "tee_tree_hazard_right", label: "Trees / Hazard right" },
  { key: "tee_bunkers_left", label: "Bunkers left" },
  { key: "tee_bunkers_right", label: "Bunkers right" },
  { key: "tee_water_out_left", label: "Water / OB left" },
  { key: "tee_water_out_right", label: "Water / OB right" },
  { key: "tee_water_out_across", label: "Water / OB across" },
];

// Approach checkboxes — bunker/green rows removed (handled by GreensideSelector)
const APPROACH_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "approach_tree_hazard_left", label: "Trees left" },
  { key: "approach_tree_hazard_right", label: "Trees right" },
  { key: "approach_tree_hazard_long", label: "Trees long" },
  { key: "approach_water_out_left", label: "Water / OB left" },
  { key: "approach_water_out_right", label: "Water / OB right" },
  { key: "approach_water_out_short", label: "Water short" },
  { key: "approach_water_out_long", label: "Water / OB long" },
];

function blankHole(n: number): HoleData {
  return {
    hole: n, par: 4, yards: 0, stroke_index: n,
    dogleg_direction: null,
    tee_tree_hazard_left: false, tee_tree_hazard_right: false,
    tee_bunkers_left: false, tee_bunkers_right: false,
    tee_water_out_left: false, tee_water_out_right: false, tee_water_out_across: false,
    approach_tree_hazard_left: false, approach_tree_hazard_right: false, approach_tree_hazard_long: false,
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

function AddCourseInner() {
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get("copyFrom");

  const [step, setStep] = useState<Step>("info");
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [currentHole, setCurrentHole] = useState(0);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const [greenside, setGreenside] = useState<GreensideState>(defaultGreensideState());

  useEffect(() => {
    if (!copyFromId) return;
    setCopyingFrom(true);
    getCourse(copyFromId).then(course => {
      if (course) {
        setCourseName(course.name);
        setCity(course.city);
        setState(course.state);
        setRating(course.rating != null ? String(course.rating) : "");
        setSlope(course.slope != null ? String(course.slope) : "");
        setHoleCount(course.holes.length as 9 | 18);
        setHoles(course.holes.map(h => ({ ...h })));
        if (course.holes.length > 0) {
          setGreenside(flatToGreenside(course.holes[0] as Record<string, unknown>));
        }
      }
      setCopyingFrom(false);
    });
  }, [copyFromId]);

  const inputStyle = {
    width: "100%", padding: "8px 12px", fontSize: 15,
    border: "1px solid #ddd", borderRadius: 8,
    boxSizing: "border-box" as const,
  };
  const selectStyle = { ...inputStyle, background: "white", color: "#0f6e56" };
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
    if (!copyFromId || holes.length === 0) {
      setHoles(Array.from({ length: holeCount }, (_, i) => blankHole(i + 1)));
    }
    setGreenside(defaultGreensideState());
    setCurrentHole(0);
    setStep("holes");
  }

  function updateHole(field: keyof HoleData, value: any) {
    setHoles(prev => prev.map((h, i) => {
      if (i !== currentHole) return h;
      const updated = { ...h, [field]: value };
      if (field === "par" && value === 3) {
        updated.tee_tree_hazard_left = false;
        updated.tee_tree_hazard_right = false;
        updated.tee_bunkers_left = false;
        updated.tee_bunkers_right = false;
        updated.tee_water_out_left = false;
        updated.tee_water_out_right = false;
        updated.tee_water_out_across = false;
      }
      return updated;
    }));
  }

  function toggleCheck(field: keyof HoleData) {
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, [field]: !h[field] } : h));
  }

  // Called when the greenside selector changes — updates both local state and the holes array
  function handleGreensideChange(next: GreensideState) {
    setGreenside(next);
    const flat = greensideToFlat(next);
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, ...flat } : h));
  }

  function goToPrevHole() {
    const prev = Math.max(0, currentHole - 1);
    setCurrentHole(prev);
    setGreenside(flatToGreenside(holes[prev] as Record<string, unknown>));
  }

  function goToNextHole() {
    const next = currentHole + 1;
    setCurrentHole(next);
    setGreenside(flatToGreenside(holes[next] as Record<string, unknown>));
  }

  async function finish() {
    setSaving(true);
    const course: CourseRecord = {
      id: `${courseName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "")}_${Date.now()}`,
      name: courseName.trim(),
      tee_box: teeBox.trim(),
      city: city.trim(),
      state: state.trim(),
      rating: rating !== "" ? parseFloat(rating) : null,
      slope: slope !== "" ? parseInt(slope) : null,
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
          <label style={labelStyle}>Course Rating</label>
          <input style={inputStyle} value={rating} type="number" step="0.1" min="60" max="80"
            onChange={e => setRating(e.target.value)} placeholder="e.g. 71.4" />
          <label style={labelStyle}>Slope</label>
          <input style={inputStyle} value={slope} type="number" min="55" max="155"
            onChange={e => setSlope(e.target.value)} placeholder="e.g. 128" />
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
          {hole.par === 3 && <p style={{ fontSize: 12, color: "#aaa", margin: "4px 0 8px" }}>Disabled for par 3</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: hole.par === 3 ? 0.3 : 1 }}>
            {TEE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: hole.par === 3 ? "not-allowed" : "pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => hole.par !== 3 && toggleCheck(key)} disabled={hole.par === 3} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span style={sectionLabel}>APPROACH HAZARDS</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {APPROACH_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
          <GreensideSelector
            value={greenside}
            onChange={handleGreensideChange}
          />
        </div>

        <div>
          <label style={labelStyle}>Green depth (yards)</label>
          <input style={{ ...inputStyle, maxWidth: 120 }} type="number" min={0} value={hole.approach_green_depth || ""} onChange={e => updateHole("approach_green_depth", Number(e.target.value))} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
          <button style={btnStyle(false)} onClick={goToPrevHole} disabled={currentHole === 0}>
            Previous
          </button>
          {currentHole < holes.length - 1
            ? <button style={btnStyle(true)} onClick={goToNextHole}>Next hole</button>
            : <button style={{ ...btnStyle(true), opacity: saving ? 0.6 : 1 }} onClick={finish} disabled={saving}>
                {saving ? "Saving..." : "Save course"}
              </button>
          }
        </div>
      </div>
    </main>
  );
}

export default function AddCourse() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading...</div>}>
      <AddCourseInner />
    </Suspense>
  );
}
