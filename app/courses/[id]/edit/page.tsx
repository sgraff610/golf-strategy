"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { getCourse, saveCourse, loadCourses } from "@/lib/storage";
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
  { key: "tee_tree_hazard_left",   label: "Trees / Hazard left" },
  { key: "tee_tree_hazard_right",  label: "Trees / Hazard right" },
  { key: "tee_tree_hazard_across", label: "Trees / Hazard across/middle" },
  { key: "tee_bunkers_left",       label: "Bunkers left" },
  { key: "tee_bunkers_right",      label: "Bunkers right" },
  { key: "tee_water_out_left",     label: "Water / OB left" },
  { key: "tee_water_out_right",    label: "Water / OB right" },
  { key: "tee_water_out_across",   label: "Water / OB across/middle" },
];

const APPROACH_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "approach_tree_hazard_left",   label: "Trees / Hazard left" },
  { key: "approach_tree_hazard_right",  label: "Trees / Hazard right" },
  { key: "approach_tree_hazard_long",   label: "Trees / Hazard long" },
  { key: "approach_tree_hazard_across", label: "Trees / Hazard across/middle" },
  { key: "approach_water_out_left",     label: "Water / OB left" },
  { key: "approach_water_out_right",    label: "Water / OB right" },
  { key: "approach_water_out_short",    label: "Water / OB short" },
  { key: "approach_water_out_long",     label: "Water / OB long" },
];

// Shared light-grey label/section styles
const LABEL: React.CSSProperties   = { fontSize: 13, color: "#aaa", display: "block", marginBottom: 4 };
const SECTION: React.CSSProperties = { fontSize: 11, color: "#bbb", fontWeight: 600, letterSpacing: 1, marginBottom: 8, marginTop: 20, display: "block", textTransform: "uppercase" };
const HOLE_NAME: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#bbb" };

// ─── Scorecard ────────────────────────────────────────────────────────────────

function Scorecard({ savedCourse, allVersions, onEditCourse }: {
  savedCourse: CourseRecord;
  allVersions: CourseRecord[];
  onEditCourse: () => void;
}) {
  const holes = savedCourse.holes;
  const is18 = holes.length === 18;

  const sortedTees = [...allVersions].sort((a, b) =>
    b.holes.reduce((s, h) => s + (h.yards||0), 0) - a.holes.reduce((s, h) => s + (h.yards||0), 0)
  );

  type Col = { type: "hole"; hole: HoleData } | { type: "spacer"; label: string; parSum: number; yardsMap: Record<string, number> };
  const cols: Col[] = [];
  const makeSpacerYards = (sliceHoles: HoleData[]) => {
    const nums = new Set(sliceHoles.map(h => h.hole));
    return Object.fromEntries(sortedTees.map(t => [t.tee_box, t.holes.filter(h => nums.has(h.hole)).reduce((s, h) => s + (h.yards||0), 0)]));
  };

  if (is18) {
    holes.slice(0,9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"Out", parSum:holes.slice(0,9).reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes.slice(0,9)) });
    holes.slice(9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"In", parSum:holes.slice(9).reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes.slice(9)) });
  } else {
    holes.forEach(h => cols.push({ type:"hole", hole:h }));
  }
  cols.push({ type:"spacer", label:"Total", parSum:holes.reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes) });

  const c: React.CSSProperties  = { padding:"6px 4px", textAlign:"center", fontSize:12, borderRight:"1px solid #e0e0e0", whiteSpace:"nowrap" };
  const hdr: React.CSSProperties = { ...c, background:"#1a3a2a", color:"white", fontWeight:600 };
  const lbl: React.CSSProperties = { ...c, background:"#f0f0f0", fontWeight:600, color:"#333", textAlign:"left", paddingLeft:8, minWidth:64 };
  const sp: React.CSSProperties  = { ...c, background:"#e8f5f0", fontWeight:700, color:"#0f6e56" };

  const btn = (primary: boolean): React.CSSProperties => ({
    padding:"10px 20px", fontSize:14, fontWeight:600,
    background: primary ? "#0f6e56" : "white",
    color: primary ? "white" : "#0f6e56",
    border:"1px solid #0f6e56",
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
              {cols.map((col,ci) => col.type==="hole" ? <td key={ci} style={hdr}>{col.hole.hole}</td> : <td key={ci} style={sp}>{col.label}</td>)}
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
              <tr key={tee.id} style={{ background:ti%2===0?"#fff":"#f9f9f9" }}>
                <td style={{ ...lbl, background:ti%2===0?"#fff":"#f9f9f9" }}>
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
        <a href={`/rounds/add?course=${savedCourse.id}`} style={btn(true)}>+ Add a round</a>
        <button onClick={onEditCourse} style={btn(false)}>← Edit this course</button>
        <a href="/courses" style={btn(false)}>Back to courses</a>
        <a href="/" style={{ ...btn(false), color:"#666", borderColor:"#ccc" }}>Go to strategy</a>
      </div>
    </main>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EditCourse() {
  const params = useParams();
  const id = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id as string);

  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [saving, setSaving] = useState(false);
  const [holeNotesOpen, setHoleNotesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [greenside, setGreenside] = useState<GreensideState>(defaultGreensideState());
  const [showScorecard, setShowScorecard] = useState(false);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    getCourse(id).then((data) => {
      if (data) {
        setCourse(data);
        setCourseName(data.name ?? "");
        setTeeBox(data.tee_box ?? "");
        setCity(data.city ?? "");
        setState(data.state ?? "");
        setRating(data.rating != null ? String(data.rating) : "");
        setSlope(data.slope != null ? String(data.slope) : "");
        setAiSummary(data.ai_summary ?? "");
        setHoles(data.holes ?? []);
        if (data.holes?.length > 0) setGreenside(flatToGreenside(data.holes[0] as Record<string,unknown>));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const inputStyle: React.CSSProperties  = { width:"100%", padding:"8px 12px", fontSize:15, border:"1px solid #ddd", borderRadius:8, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const primaryBtn: React.CSSProperties  = { padding:"10px 20px", fontSize:15, fontWeight:600, background:"#1a1a1a", color:"white", border:"1px solid #1a1a1a", borderRadius:8, cursor:"pointer" };
  const navBtn = (disabled: boolean): React.CSSProperties => ({
    padding:"8px 16px", fontSize:14, fontWeight:600, background:"white",
    color: disabled ? "#ddd" : "#bbb",
    border:`1px solid ${disabled ? "#eee" : "#ddd"}`,
    borderRadius:8, cursor: disabled ? "not-allowed" : "pointer",
  });

  function updateHole(field: keyof HoleData, value: any) {
    setHoles(prev => prev.map((h, i) => {
      if (i !== currentHole) return h;
      const u = { ...h, [field]: value };
      if (field === "par" && value === 3) {
        u.tee_tree_hazard_left=false; u.tee_tree_hazard_right=false;
        u.tee_tree_hazard_across=false;
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
    const next = Math.min(holes.length-1, currentHole+1);
    setCurrentHole(next);
    setGreenside(flatToGreenside(holes[next] as Record<string,unknown>));
  }

  async function handleSave() {
    if (!course) return;
    setSaving(true);
    const updated = {
      ...course, name:courseName.trim(), tee_box:teeBox.trim(),
      city:city.trim(), state:state.trim(),
      rating: rating!==""?parseFloat(rating):null,
      slope: slope!==""?parseInt(slope):null,
      holes,
      ai_summary: aiSummary || null,
    };
    await saveCourse(updated);
    const allCourses = await loadCourses();
    const versions = allCourses.filter(c => c.name === updated.name);
    setAllTeeVersions(versions.length > 0 ? versions : [updated]);
    setCourse(updated);
    setSaving(false);
    setShowScorecard(true);
  }

  if (loading) return <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}><p style={{ color:"#666" }}>Loading course...</p></main>;
  if (!course) return <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}><p style={{ color:"red" }}>Course not found.</p><a href="/courses" style={{ fontSize:13, color:"#666" }}>← Back to courses</a></main>;

  if (showScorecard && course) {
    return (
      <Scorecard
        savedCourse={{ ...course, name:courseName, tee_box:teeBox, city, state, rating:rating?parseFloat(rating):null, slope:slope?parseInt(slope):null, holes }}
        allVersions={allTeeVersions}
        onEditCourse={() => setShowScorecard(false)}
      />
    );
  }

  const hole = holes[currentHole];

  return (
    <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <div style={{ marginBottom:16 }}>
        <a href="/courses" style={{ fontSize:13, color:"#bbb" }}>← Back to courses</a>
      </div>
      <h1 style={{ fontSize:20, fontWeight:600, marginBottom:20, color:"#bbb" }}>Edit course</h1>

      {/* Course details */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:28, padding:20, background:"#f6f6f6", borderRadius:12 }}>
        <p style={{ fontSize:12, color:"#bbb", margin:"0 0 4px", fontWeight:600, letterSpacing:1 }}>COURSE DETAILS</p>
        <div><label style={LABEL}>Course name</label><input style={inputStyle} value={courseName} onChange={e => setCourseName(e.target.value)} /></div>
        <div><label style={LABEL}>Tee box</label><input style={inputStyle} value={teeBox} onChange={e => setTeeBox(e.target.value)} /></div>
        <div><label style={LABEL}>Course Rating</label><input style={inputStyle} value={rating} type="number" step="0.1" min="60" max="80" onChange={e => setRating(e.target.value)} placeholder="e.g. 71.4" /></div>
        <div><label style={LABEL}>Slope</label><input style={inputStyle} value={slope} type="number" min="55" max="155" onChange={e => setSlope(e.target.value)} placeholder="e.g. 128" /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={LABEL}>City</label><input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} /></div>
          <div><label style={LABEL}>State</label><input style={inputStyle} value={state} onChange={e => setState(e.target.value)} /></div>
        </div>
        {/* AI Summary collapsible */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:10 }}>
          <button onClick={() => setSummaryOpen(o => !o)}
            style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", background:"none", border:"none", cursor:"pointer", padding:0 }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#0f6e56", textTransform:"uppercase", letterSpacing:1 }}>
              AI Course Summary {aiSummary ? "✓" : ""}
            </span>
            <span style={{ fontSize:13, color:"#999" }}>{summaryOpen ? "▲" : "▼"}</span>
          </button>
          {summaryOpen && (
            <div style={{ marginTop:10 }}>
              <label style={LABEL}>Paste an AI-generated course description here</label>
              <textarea
                value={aiSummary}
                onChange={e => setAiSummary(e.target.value)}
                placeholder="e.g. Designed by Arthur Hills, this course features..."
                rows={8}
                style={{ ...inputStyle, resize:"vertical", lineHeight:1.5, fontSize:13 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Hole navigation — centered */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, gap:12 }}>
        <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
        <div style={{ textAlign:"center", flex:1 }}>
          <div style={HOLE_NAME}>Hole {hole.hole}</div>
          <div style={{ fontSize:13, color:"#bbb", marginTop:2 }}>{currentHole+1} of {holes.length}</div>
        </div>
        <button style={navBtn(currentHole>=holes.length-1)} onClick={goToNextHole} disabled={currentHole>=holes.length-1}>Next →</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div><label style={LABEL}>Par</label>
            <select style={selectStyle} value={hole.par} onChange={e => updateHole("par", Number(e.target.value))}>
              {[3,4,5].map(p => <option key={p} value={p}>Par {p}</option>)}
            </select>
          </div>
          <div><label style={LABEL}>Yards</label>
            <input style={inputStyle} type="number" min={1} max={700} value={hole.yards||""} onChange={e => updateHole("yards", Number(e.target.value))} />
          </div>
          <div><label style={LABEL}>Stroke Index</label>
            <input style={inputStyle} type="number" min={1} max={18} value={hole.stroke_index||""} onChange={e => updateHole("stroke_index", Number(e.target.value))} />
          </div>
        </div>

        {/* Hole Notes */}
        <div>
          <button onClick={()=>setHoleNotesOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"4px 0"}}>
            <span style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1}}>Hole Notes {hole.hole_notes?"✓":""}</span>
            <span style={{fontSize:13,color:"#bbb"}}>{holeNotesOpen?"▲":"▼"}</span>
          </button>
          {holeNotesOpen&&(
            <textarea
              value={hole.hole_notes??""} onChange={e=>updateHole("hole_notes",e.target.value)}
              placeholder="Add notes about this hole..."
              rows={3}
              style={{width:"100%",padding:"8px 10px",fontSize:13,border:"1px solid #ddd",borderRadius:8,boxSizing:"border-box",resize:"vertical",fontFamily:"sans-serif",lineHeight:1.5,marginTop:6}}
            />
          )}
        </div>

        <div>
          <label style={LABEL}>Dogleg direction</label>
          <select style={selectStyle} value={hole.dogleg_direction??""} onChange={e => updateHole("dogleg_direction", e.target.value===""?null:e.target.value as DoglegDirection)} disabled={hole.par===3}>
            {DOGLEG_OPTIONS.map(o => <option key={String(o.value)} value={o.value??""}>{o.label}</option>)}
          </select>
          {hole.par===3 && <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 0" }}>Disabled for par 3</p>}
        </div>

        {/* Tee Shot Hazards — 2 columns */}
        <div>
          <span style={SECTION}>Tee Shot Hazards</span>
          {hole.par===3 && <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 8px" }}>Disabled for par 3</p>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, opacity:hole.par===3?0.3:1 }}>
            {TEE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#bbb", cursor:hole.par===3?"not-allowed":"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => hole.par!==3&&toggleCheck(key)} disabled={hole.par===3} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Approach Hazards */}
        <div>
          <span style={SECTION}>Approach Hazards</span>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {APPROACH_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#bbb", cursor:"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Greenside */}
        <div>
          <span style={SECTION}>Greenside</span>
          <div style={{ marginBottom:12 }}>
            <label style={LABEL}>Green depth (yards)</label>
            <input style={{ ...inputStyle, maxWidth:120 }} type="number" min={0} value={hole.approach_green_depth||""} onChange={e => updateHole("approach_green_depth", Number(e.target.value))} />
          </div>
          <GreensideSelector value={greenside} onChange={handleGreensideChange} />
        </div>

        {/* Bottom nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8, paddingTop:16, borderTop:"1px solid #eee", gap:12 }}>
          <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
          <span style={{ fontSize:14, fontWeight:600, color:"#bbb" }}>Hole {hole.hole}</span>
          <button style={navBtn(currentHole>=holes.length-1)} onClick={goToNextHole} disabled={currentHole>=holes.length-1}>Next →</button>
        </div>

        <button style={{ ...primaryBtn, opacity:saving?0.6:1, marginTop:8 }} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save all changes"}
        </button>
      </div>
    </main>
  );
}
