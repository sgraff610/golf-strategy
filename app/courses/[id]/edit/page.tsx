"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { getCourse, saveCourse } from "@/lib/storage";
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

export default function EditCourse() {
  const params = useParams();
  const id = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id as string);

  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [courseName, setCourseName] = useState<string>("");
  const [teeBox, setTeeBox] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [rating, setRating] = useState<string>("");
  const [slope, setSlope] = useState<string>("");
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [greenside, setGreenside] = useState<GreensideState>(defaultGreensideState());

  useEffect(() => {
    if (!id) return;
    getCourse(id).then((data) => {
      if (data) {
        setCourse(data);
        setCourseName(data.name ?? "");
        setTeeBox(data.tee_box !== undefined && data.tee_box !== null ? data.tee_box : "");
        setCity(data.city ?? "");
        setState(data.state ?? "");
        setRating(data.rating != null ? String(data.rating) : "");
        setSlope(data.slope != null ? String(data.slope) : "");
        setHoles(data.holes ?? []);
        if (data.holes && data.holes.length > 0) {
          setGreenside(flatToGreenside(data.holes[0] as Record<string, unknown>));
        }
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Error:", err);
      setLoading(false);
    });
  }, [id]);

  const inputStyle = {
    width: "100%", padding: "8px 12px", fontSize: 15,
    border: "1px solid #ddd", borderRadius: 8,
    boxSizing: "border-box" as const,
  };
  const selectStyle = { ...inputStyle, background: "white", color: "#0f6e56" };
  const labelStyle = { fontSize: 13, color: "#666", display: "block" as const, marginBottom: 4 };
  const sectionLabel = { fontSize: 12, color: "#666", fontWeight: 600 as const, letterSpacing: 1, marginBottom: 8, marginTop: 20, display: "block" as const };
  const btnStyle = (primary: boolean) => ({
    padding: "10px 20px", fontSize: 15, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white",
    color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer" as const,
  });

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
    const next = Math.min(holes.length - 1, currentHole + 1);
    setCurrentHole(next);
    setGreenside(flatToGreenside(holes[next] as Record<string, unknown>));
  }

  async function handleSave() {
    if (!course) return;
    setSaving(true);
    await saveCourse({
      ...course,
      name: courseName.trim(),
      tee_box: teeBox.trim(),
      city: city.trim(),
      state: state.trim(),
      rating: rating !== "" ? parseFloat(rating) : null,
      slope: slope !== "" ? parseInt(slope) : null,
      holes,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading course...</p>
    </main>
  );

  if (!course) return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "red" }}>Course not found.</p>
      <a href="/courses" style={{ fontSize: 13, color: "#666" }}>← Back to courses</a>
    </main>
  );

  const hole = holes[currentHole];

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/courses" style={{ fontSize: 13, color: "#666" }}>← Back to courses</a>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Edit course</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32, padding: 20, background: "#f6f6f6", borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px", fontWeight: 600, letterSpacing: 1 }}>COURSE DETAILS</p>
        <div>
          <label style={labelStyle}>Course name</label>
          <input style={inputStyle} value={courseName} onChange={e => setCourseName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Tee box</label>
          <input style={inputStyle} value={teeBox} onChange={e => setTeeBox(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Course Rating</label>
          <input style={inputStyle} value={rating} type="number" step="0.1" min="60" max="80"
            onChange={e => setRating(e.target.value)} placeholder="e.g. 71.4" />
        </div>
        <div>
          <label style={labelStyle}>Slope</label>
          <input style={inputStyle} value={slope} type="number" min="55" max="155"
            onChange={e => setSlope(e.target.value)} placeholder="e.g. 128" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input style={inputStyle} value={state} onChange={e => setState(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Hole {hole.hole}</h2>
        <span style={{ fontSize: 13, color: "#666" }}>{currentHole + 1} of {holes.length}</span>
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
          {hole.par === 3 && <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Disabled for par 3</p>}
        </div>

        <div>
          <span style={sectionLabel}>TEE SHOT HAZARDS</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {hole.par === 3 && <p style={{ fontSize: 12, color: "#aaa", margin: "4px 0 8px" }}>Disabled for par 3</p>}
            <div style={{ opacity: hole.par === 3 ? 0.3 : 1 }}>
              {TEE_CHECKBOXES.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: hole.par === 3 ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" checked={!!hole[key]} onChange={() => hole.par !== 3 && toggleCheck(key)} disabled={hole.par === 3} />
                  {label}
                </label>
              ))}
            </div>
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

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 16, borderTop: "1px solid #eee" }}>
          <button style={btnStyle(false)} onClick={goToPrevHole} disabled={currentHole === 0}>
            Previous
          </button>
          <button style={btnStyle(false)} onClick={goToNextHole} disabled={currentHole === holes.length - 1}>
            Next hole
          </button>
        </div>

        <button
          style={{ ...btnStyle(true), opacity: saving ? 0.6 : 1, marginTop: 8 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save all changes"}
        </button>
      </div>
    </main>
  );
}
