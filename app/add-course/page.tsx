"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { saveCourse, getCourse, loadCourses } from "@/lib/storage";
import GreensideSelector, {
  GreensideState, defaultGreensideState, flatToGreenside, greensideToFlat,
} from "@/app/components/GreensideSelector";

const DOGLEG_OPTIONS: { value: DoglegDirection; label: string }[] = [
  { value: null,            label: "None" },
  { value: "straight",      label: "Straight" },
  { value: "slight_left",   label: "Slight Left" },
  { value: "moderate_left", label: "Moderate Left" },
  { value: "severe_left",   label: "Severe Left" },
  { value: "slight_right",  label: "Slight Right" },
  { value: "moderate_right",label: "Moderate Right" },
  { value: "severe_right",  label: "Severe Right" },
];

const TEE_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "tee_tree_hazard_left",  label: "Trees / Hazard left" },
  { key: "tee_tree_hazard_right", label: "Trees / Hazard right" },
  { key: "tee_bunkers_left",      label: "Bunkers left" },
  { key: "tee_bunkers_right",     label: "Bunkers right" },
  { key: "tee_water_out_left",    label: "Water / OB left" },
  { key: "tee_water_out_right",   label: "Water / OB right" },
  { key: "tee_water_out_across",  label: "Water / OB across" },
];

const APPROACH_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "approach_tree_hazard_left",  label: "Trees left" },
  { key: "approach_tree_hazard_right", label: "Trees right" },
  { key: "approach_tree_hazard_long",  label: "Trees long" },
  { key: "approach_water_out_left",    label: "Water / OB left" },
  { key: "approach_water_out_right",   label: "Water / OB right" },
  { key: "approach_water_out_short",   label: "Water short" },
  { key: "approach_water_out_long",    label: "Water / OB long" },
];

function blankHole(n: number): HoleData {
  return {
    hole: n, par: 4, yards: 0, stroke_index: n, dogleg_direction: null,
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

// ─── Scorecard ────────────────────────────────────────────────────────────────

function Scorecard({ savedCourse, allVersions }: { savedCourse: CourseRecord; allVersions: CourseRecord[] }) {
  const holes = savedCourse.holes;
  const is18 = holes.length === 18;

  const sortedTees = [...allVersions].sort((a, b) =>
    b.holes.reduce((s, h) => s + (h.yards||0), 0) - a.holes.reduce((s, h) => s + (h.yards||0), 0)
  );

  type Col = { type: "hole"; hole: HoleData } | { type: "spacer"; label: string; parSum: number; yardsMap: Record<string, number> };
  const cols: Col[] = [];

  const makeSpacerYards = (sliceHoles: HoleData[]) =>
    Object.fromEntries(sortedTees.map(t => {
      const nums = new Set(sliceHoles.map(h => h.hole));
      return [t.tee_box, t.holes.filter(h => nums.has(h.hole)).reduce((s, h) => s + (h.yards||0), 0)];
    }));

  if (is18) {
    holes.slice(0,9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"Out", parSum: holes.slice(0,9).reduce((s,h)=>s+h.par,0), yardsMap: makeSpacerYards(holes.slice(0,9)) });
    holes.slice(9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"In", parSum: holes.slice(9).reduce((s,h)=>s+h.par,0), yardsMap: makeSpacerYards(holes.slice(9)) });
  } else {
    holes.forEach(h => cols.push({ type:"hole", hole:h }));
  }
  cols.push({ type:"spacer", label:"Total", parSum: holes.reduce((s,h)=>s+h.par,0), yardsMap: makeSpacerYards(holes) });

  const c: React.CSSProperties = { padding:"6px 4px", textAlign:"center", fontSize:12, borderRight:"1px solid #e0e0e0", whiteSpace:"nowrap" };
  const hdr: React.CSSProperties = { ...c, background:"#1a3a2a", color:"white", fontWeight:600 };
  const lbl: React.CSSProperties = { ...c, background:"#f0f0f0", fontWeight:600, color:"#333", textAlign:"left", paddingLeft:8, minWidth:64 };
  const sp: React.CSSProperties = { ...c, background:"#e8f5f0", fontWeight:700, color:"#0f6e56" };
  const spLbl: React.CSSProperties = { ...lbl, background:"#e8f5f0", color:"#0f6e56", fontWeight:700 };

  const btn = (primary: boolean): React.CSSProperties => ({
    padding:"10px 20px", fontSize:14, fontWeight:600,
    background: primary ? "#0f6e56" : "white",
    color: primary ? "white" : "#0f6e56",
    border:`1px solid ${primary ? "#0f6e56" : "#0f6e56"}`,
    borderRadius:8, cursor:"pointer", textDecoration:"none", display:"inline-block",
  });

  return (
    <main style={{ maxWidth:940, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:"#1a1a1a", margin:"0 0 4px" }}>{savedCourse.name}</h1>
        <p style={{ fontSize:14, color:"#666", margin:0 }}>
          {savedCourse.city}, {savedCourse.state}
          {savedCourse.rating && savedCourse.slope ? ` · Rating ${savedCourse.rating} / Slope ${savedCourse.slope}`
            : savedCourse.rating ? ` · Rating ${savedCourse.rating}`
            : savedCourse.slope ? ` · Slope ${savedCourse.slope}` : ""}
        </p>
      </div>

      <div style={{ overflowX:"auto", marginBottom:28, borderRadius:10, border:"1px solid #ddd", boxShadow:"0 2px 8px #0001" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", tableLayout:"auto" }}>
          <tbody>
            <tr>
              <td style={lbl}>Hole</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={hdr}>{col.hole.hole}</td>
                : <td key={ci} style={sp}>{col.label}</td>)}
            </tr>
            <tr>
              <td style={lbl}>Index</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#fafafa", color:"#555" }}>{col.hole.stroke_index}</td>
                : <td key={ci} style={{ ...c, background:"#e8f5f0" }}></td>)}
            </tr>
            <tr>
              <td style={lbl}>Par</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#fff", fontWeight:600, color:"#1a1a1a" }}>{col.hole.par}</td>
                : <td key={ci} style={sp}>{col.parSum}</td>)}
            </tr>
            {sortedTees.map((tee,ti) => (
              <tr key={tee.id} style={{ background: ti%2===0 ? "#fff" : "#f9f9f9" }}>
                <td style={{ ...lbl, background: ti%2===0 ? "#fff" : "#f9f9f9" }}>
                  <span style={{ fontSize:11, color:"#0f6e56", fontWeight:600 }}>{tee.tee_box}</span>
                </td>
                {cols.map((col,ci) => {
                  if (col.type==="hole") {
                    const th = tee.holes.find(h => h.hole===col.hole.hole);
                    return <td key={ci} style={c}>{th?.yards||"—"}</td>;
                  }
                  return <td key={ci} style={{ ...sp, fontSize:13 }}>{col.yardsMap[tee.tee_box]||"—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <a href={`/rounds/add?course=${savedCourse.id}`} style={btn(true)}>+ Add a round with this course</a>
        <a href="/add-course" style={btn(false)}>Add another course</a>
        <a href="/" style={{ ...btn(false), color:"#666", borderColor:"#ccc" }}>Go to strategy</a>
      </div>
    </main>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Step = "info" | "holes" | "scorecard";

function AddCourseInner() {
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get("copyFrom");

  const [step, setStep] = useState<Step>("info");
  const [savedCourse, setSavedCourse] = useState<CourseRecord | null>(null);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [holeCount, setHoleCount] = useState<9|18>(18);
  const [currentHole, setCurrentHole] = useState(0);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);
  const [greenside, setGreenside] = useState<GreensideState>(defaultGreensideState());

  useEffect(() => {
    if (!copyFromId) return;
    getCourse(copyFromId).then(course => {
      if (course) {
        setCourseName(course.name); setCity(course.city); setState(course.state);
        setRating(course.rating != null ? String(course.rating) : "");
        setSlope(course.slope != null ? String(course.slope) : "");
        setHoleCount(course.holes.length as 9|18);
        setHoles(course.holes.map(h => ({ ...h })));
        if (course.holes.length > 0) setGreenside(flatToGreenside(course.holes[0] as Record<string,unknown>));
      }
    });
  }, [copyFromId]);

  const inputStyle: React.CSSProperties = { width:"100%", padding:"8px 12px", fontSize:15, border:"1px solid #ddd", borderRadius:8, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const labelStyle: React.CSSProperties = { fontSize:13, color:"#444", display:"block", marginBottom:4 };
  const sectionLabel: React.CSSProperties = { fontSize:12, color:"#888", fontWeight:600, letterSpacing:1, marginBottom:8, marginTop:20, display:"block" };
  const primaryBtn: React.CSSProperties = { padding:"10px 20px", fontSize:15, fontWeight:600, background:"#1a1a1a", color:"white", border:"1px solid #1a1a1a", borderRadius:8, cursor:"pointer" };
  const secondaryBtn: React.CSSProperties = { ...primaryBtn, background:"white", color:"#1a1a1a" };
  const navBtn = (disabled: boolean): React.CSSProperties => ({
    padding:"8px 16px", fontSize:14, fontWeight:600, background:"white", color: disabled ? "#bbb" : "#1a1a1a",
    border:`1px solid ${disabled ? "#ddd" : "#1a1a1a"}`, borderRadius:8, cursor: disabled ? "not-allowed" : "pointer",
  });

  function startCourse() {
    if (!courseName.trim() || !teeBox.trim() || !city.trim() || !state.trim()) return alert("Please fill in all course details.");
    if (!copyFromId || holes.length === 0) setHoles(Array.from({ length: holeCount }, (_, i) => blankHole(i+1)));
    setGreenside(defaultGreensideState());
    setCurrentHole(0);
    setStep("holes");
  }

  function updateHole(field: keyof HoleData, value: any) {
    setHoles(prev => prev.map((h, i) => {
      if (i !== currentHole) return h;
      const u = { ...h, [field]: value };
      if (field === "par" && value === 3) {
        u.tee_tree_hazard_left=false; u.tee_tree_hazard_right=false;
        u.tee_bunkers_left=false; u.tee_bunkers_right=false;
        u.tee_water_out_left=false; u.tee_water_out_right=false; u.tee_water_out_across=false;
      }
      return u;
    }));
  }

  function toggleCheck(field: keyof HoleData) {
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, [field]: !h[field] } : h));
  }

  function handleGreensideChange(next: GreensideState) {
    setGreenside(next);
    const flat = greensideToFlat(next);
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, ...flat } : h));
  }

  function goToPrevHole() {
    const prev = Math.max(0, currentHole - 1);
    setCurrentHole(prev);
    setGreenside(flatToGreenside(holes[prev] as Record<string,unknown>));
  }

  function goToNextHole() {
    const next = currentHole + 1;
    setCurrentHole(next);
    setGreenside(flatToGreenside(holes[next] as Record<string,unknown>));
  }

  async function finish() {
    setSaving(true);
    const course: CourseRecord = {
      id: `${courseName.trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_-]/g,"")}_${Date.now()}`,
      name: courseName.trim(), tee_box: teeBox.trim(), city: city.trim(), state: state.trim(),
      rating: rating !== "" ? parseFloat(rating) : null,
      slope: slope !== "" ? parseInt(slope) : null,
      holes,
    };
    await saveCourse(course);
    const allCourses = await loadCourses();
    const versions = allCourses.filter(c => c.name === course.name);
    setSavedCourse(course);
    setAllTeeVersions(versions.length > 0 ? versions : [course]);
    setSaving(false);
    setStep("scorecard");
  }

  if (step === "scorecard" && savedCourse) {
    return <Scorecard savedCourse={savedCourse} allVersions={allTeeVersions} />;
  }

  if (step === "info") return (
    <main style={{ maxWidth:480, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <h1 style={{ fontSize:24, fontWeight:600, marginBottom:8 }}>Add a course</h1>
      <p style={{ color:"#666", marginBottom:32 }}>Enter the course details to get started.</p>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div><label style={labelStyle}>Course name</label><input style={inputStyle} value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="e.g. Augusta National Golf Club" /></div>
        <div><label style={labelStyle}>Tee box</label><input style={inputStyle} value={teeBox} onChange={e => setTeeBox(e.target.value)} placeholder="e.g. Blue, White, Red" /></div>
        <div><label style={labelStyle}>City</label><input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Augusta" /></div>
        <div><label style={labelStyle}>State</label><input style={inputStyle} value={state} onChange={e => setState(e.target.value)} placeholder="e.g. GA" /></div>
        <div><label style={labelStyle}>Course Rating</label><input style={inputStyle} value={rating} type="number" step="0.1" min="60" max="80" onChange={e => setRating(e.target.value)} placeholder="e.g. 71.4" /></div>
        <div><label style={labelStyle}>Slope</label><input style={inputStyle} value={slope} type="number" min="55" max="155" onChange={e => setSlope(e.target.value)} placeholder="e.g. 128" /></div>
        <div>
          <label style={labelStyle}>Number of holes</label>
          <select style={selectStyle} value={holeCount} onChange={e => setHoleCount(Number(e.target.value) as 9|18)}>
            <option value={9}>9 holes</option>
            <option value={18}>18 holes</option>
          </select>
        </div>
        <button style={primaryBtn} onClick={startCourse}>Start entering holes</button>
      </div>
    </main>
  );

  const hole = holes[currentHole];

  return (
    <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      {/* Top hole navigation — centered */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, gap:12 }}>
        <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
        <div style={{ textAlign:"center", flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#0f6e56" }}>{courseName} — Hole {hole.hole}</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{currentHole+1} of {holes.length}</div>
        </div>
        <button style={navBtn(currentHole>=holes.length-1)} onClick={goToNextHole} disabled={currentHole>=holes.length-1}>Next →</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div><label style={labelStyle}>Par</label>
            <select style={selectStyle} value={hole.par} onChange={e => updateHole("par", Number(e.target.value))}>
              {[3,4,5].map(p => <option key={p} value={p}>Par {p}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Yards</label>
            <input style={inputStyle} type="number" min={1} max={700} value={hole.yards||""} onChange={e => updateHole("yards", Number(e.target.value))} />
          </div>
          <div><label style={labelStyle}>Stroke index</label>
            <input style={inputStyle} type="number" min={1} max={18} value={hole.stroke_index||""} onChange={e => updateHole("stroke_index", Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Dogleg direction</label>
          <select style={selectStyle} value={hole.dogleg_direction??""} onChange={e => updateHole("dogleg_direction", e.target.value===""?null:e.target.value as DoglegDirection)} disabled={hole.par===3}>
            {DOGLEG_OPTIONS.map(o => <option key={String(o.value)} value={o.value??""}>{o.label}</option>)}
          </select>
          {hole.par===3 && <p style={{ fontSize:12, color:"#aaa", margin:"4px 0 0" }}>Disabled for par 3</p>}
        </div>

        <div>
          <span style={sectionLabel}>TEE SHOT HAZARDS</span>
          {hole.par===3 && <p style={{ fontSize:12, color:"#aaa", margin:"4px 0 8px" }}>Disabled for par 3</p>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, opacity:hole.par===3?0.3:1 }}>
            {TEE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, cursor:hole.par===3?"not-allowed":"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => hole.par!==3&&toggleCheck(key)} disabled={hole.par===3} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span style={sectionLabel}>APPROACH HAZARDS</span>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {APPROACH_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, cursor:"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
          <GreensideSelector value={greenside} onChange={handleGreensideChange} />
        </div>

        <div>
          <label style={labelStyle}>Green depth (yards)</label>
          <input style={{ ...inputStyle, maxWidth:120 }} type="number" min={0} value={hole.approach_green_depth||""} onChange={e => updateHole("approach_green_depth", Number(e.target.value))} />
        </div>

        {/* Bottom navigation — prev | hole # | next or save */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:16, paddingTop:16, borderTop:"1px solid #eee", gap:12 }}>
          <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
          <span style={{ fontSize:14, fontWeight:600, color:"#0f6e56" }}>Hole {hole.hole}</span>
          {currentHole < holes.length-1
            ? <button style={navBtn(false)} onClick={goToNextHole}>Next →</button>
            : <button style={{ ...primaryBtn, opacity:saving?0.6:1 }} onClick={finish} disabled={saving}>
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
    <Suspense fallback={<div style={{ padding:40, fontFamily:"sans-serif" }}>Loading...</div>}>
      <AddCourseInner />
    </Suspense>
  );
}
