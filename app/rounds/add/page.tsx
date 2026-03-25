"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { loadCourses } from "@/lib/storage";
import { CourseRecord, HoleData } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";

type RoundHole = {
  hole: number;
  par: number;
  yards: number;
  stroke_index: number;
  score: number | "";
  chips: number | "";
  putts: number | "";
  tee_accuracy: TeeAccuracy;
  appr_accuracy: TeeAccuracy;
  appr_distance: number | "";
  water_penalty: number | "";
  drop_or_out: number | "";
  tree_haz: number | "";
  fairway_bunker: number | "";
  greenside_bunker: number | "";
  gir: boolean;
  grints: boolean;
  club: string;
  first_putt_distance: string;
};

function calcGir(score: number | "", par: number, putts: number | ""): boolean {
  if (score === "" || putts === "") return false;
  return (score - (putts as number)) <= (par - 2);
}

function calcGrints(score: number | "", par: number): boolean {
  if (score === "") return false;
  return score <= par;
}

function buildHoles(courseHoles: HoleData[], startingHole: number, holesPlayed: number): RoundHole[] {
  let holes: HoleData[] = [];
  if (holesPlayed === 9) {
    holes = courseHoles.slice(startingHole - 1, startingHole - 1 + 9);
  } else if (courseHoles.length === 18) {
    holes = courseHoles;
  } else {
    const front = courseHoles.map(h => ({ ...h }));
    const back = courseHoles.map(h => ({ ...h, hole: h.hole + 9, stroke_index: h.stroke_index + 1 }));
    holes = [...front, ...back];
  }
  return holes.map(h => ({
    hole: h.hole, par: h.par, yards: h.yards, stroke_index: h.stroke_index,
    score: "", chips: "", putts: "", tee_accuracy: "", appr_accuracy: "",
    appr_distance: "", water_penalty: "", drop_or_out: "", tree_haz: "",
    fairway_bunker: "", greenside_bunker: "", gir: false, grints: false,
    club: "", first_putt_distance: "",
  }));
}

export default function AddRound() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [holesPlayed, setHolesPlayed] = useState<9 | 18>(18);
  const [startingHole, setStartingHole] = useState(1);
  const [roundHoles, setRoundHoles] = useState<RoundHole[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    loadCourses().then((data) => {
      setCourses(data);
      if (data.length > 0) setCourseId(data[0].id);
      setLoadingCourses(false);
    });
  }, []);

  useEffect(() => {
    const course = courses.find(c => c.id === courseId);
    if (course) setRoundHoles(buildHoles(course.holes, startingHole, holesPlayed));
  }, [courseId, holesPlayed, startingHole, courses]);

  function updateHole(index: number, field: keyof RoundHole, value: any) {
    setRoundHoles(prev => prev.map((h, i) => {
      if (i !== index) return h;
      const newHole = { ...h, [field]: value };
      newHole.gir = calcGir(newHole.score, newHole.par, newHole.putts);
      newHole.grints = calcGrints(newHole.score, newHole.par);
      return newHole;
    }));
  }

  async function handleSave() {
    setSaving(true);
    const course = courses.find(c => c.id === courseId);
    const id = `round_${Date.now()}`;
    const { error } = await supabase.from("rounds").insert({
      id,
      course_id: courseId,
      course_name: course?.name ?? "",
      tee_box: course?.tee_box ?? "",
      date,
      holes_played: holesPlayed,
      starting_hole: startingHole,
      holes: roundHoles,
    });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => window.location.href = "/rounds", 1000);
    }
  }

  const inputStyle = {
    width: "100%", padding: "6px 8px", fontSize: 14,
    border: "1px solid #ddd", borderRadius: 6,
    boxSizing: "border-box" as const,
  };
  const selectStyle = { ...inputStyle, background: "white", color: "#0f6e56" };
  const labelStyle = { fontSize: 12, color: "#666", display: "block" as const, marginBottom: 3 };
  const btnStyle = (primary: boolean) => ({
    padding: "10px 20px", fontSize: 15, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white",
    color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer" as const,
  });

  const totalScore = roundHoles.reduce((s, h) => s + (Number(h.score) || 0), 0);
  const totalPutts = roundHoles.reduce((s, h) => s + (Number(h.putts) || 0), 0);
  const drivingHoles = roundHoles.filter(h => h.par === 4 || h.par === 5);
  const fairways = drivingHoles.filter(h => h.tee_accuracy === "Hit").length;
  const girs = roundHoles.filter(h => h.gir).length;
  const grints = roundHoles.filter(h => h.grints).length;

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Add a round</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Course</label>
          <select style={selectStyle} value={courseId} onChange={e => setCourseId(e.target.value)}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Holes played</label>
          <select style={selectStyle} value={holesPlayed} onChange={e => setHolesPlayed(Number(e.target.value) as 9 | 18)}>
            <option value={9}>9</option>
            <option value={18}>18</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Starting hole</label>
          <select style={selectStyle} value={startingHole} onChange={e => setStartingHole(Number(e.target.value))}>
            {Array.from({ length: holesPlayed }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Hole {n}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 24 }}>
        {[
          { label: "Score", value: totalScore || "—" },
          { label: "Putts", value: totalPutts || "—" },
          { label: "Driving", value: `${fairways}/${drivingHoles.length}` },
          { label: "GIR", value: `${girs}/${roundHoles.length}` },
          { label: "GRINTS", value: `${grints}/${roundHoles.length}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#f6f6f6", borderRadius: 8, padding: 8, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#666", margin: "0 0 2px" }}>{label}</p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roundHoles.map((hole, i) => (
          <div key={i} style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Hole {hole.hole}</span>
                <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>Par {hole.par} · {hole.yards} yds · SI {hole.stroke_index}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {hole.gir && <span style={{ fontSize: 11, background: "#e8f5e9", color: "#2e7d32", padding: "2px 8px", borderRadius: 20 }}>GIR</span>}
                {hole.grints && <span style={{ fontSize: 11, background: "#e3f2fd", color: "#1565c0", padding: "2px 8px", borderRadius: 20 }}>GRINTS</span>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(2, auto)", gridAutoFlow: "column", gap: 8 }}>
              <div>
                <label style={labelStyle}>Score</label>
                <input style={inputStyle} type="number" min={1} max={20}
                  value={hole.score}
                  onChange={e => updateHole(i, "score", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div></div>
              <div>
                <label style={labelStyle}>Club</label>
                <select style={selectStyle} value={hole.club} onChange={e => updateHole(i, "club", e.target.value)}>
                  <option value="">—</option>
                  {["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>DRIV Acc</label>
                <select style={selectStyle} value={hole.tee_accuracy} onChange={e => updateHole(i, "tee_accuracy", e.target.value)}>
                  <option value="">—</option>
                  <option value="Hit">Hit</option>
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                  <option value="Short">Short</option>
                  <option value="Long">Long</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>APPR Dist</label>
                <input min={0} max={999} type="number" style={inputStyle}
                  value={hole.appr_distance}
                  onChange={e => updateHole(i, "appr_distance", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>APPR Acc</label>
                <select style={selectStyle} value={hole.appr_accuracy} onChange={e => updateHole(i, "appr_accuracy", e.target.value)}>
                  <option value="">—</option>
                  <option value="Hit">Hit</option>
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                  <option value="Short">Short</option>
                  <option value="Long">Long</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Chips</label>
                <input min={0} max={10} type="number" style={inputStyle}
                  value={hole.chips}
                  onChange={e => updateHole(i, "chips", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div></div>
              <div>
                <label style={labelStyle}>Putts</label>
                <input style={inputStyle} type="number" min={0} max={10}
                  value={hole.putts}
                  onChange={e => updateHole(i, "putts", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>1st Putt</label>
                <select style={selectStyle} value={hole.first_putt_distance} onChange={e => updateHole(i, "first_putt_distance", e.target.value)}>
                  <option value="">—</option>
                  {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Water</label>
                <input style={inputStyle} type="number" min={0} max={10}
                  value={hole.water_penalty}
                  onChange={e => updateHole(i, "water_penalty", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>Drop/OB</label>
                <input style={inputStyle} type="number" min={0} max={10}
                  value={hole.drop_or_out}
                  onChange={e => updateHole(i, "drop_or_out", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>Tree/Haz</label>
                <input min={0} max={10} type="number" style={inputStyle}
                  value={hole.tree_haz}
                  onChange={e => updateHole(i, "tree_haz", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>FWY Bkr</label>
                <input style={inputStyle} type="number" min={0} max={10}
                  value={hole.fairway_bunker}
                  onChange={e => updateHole(i, "fairway_bunker", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>GS Bkr</label>
                <input style={inputStyle} type="number" min={0} max={10}
                  value={hole.greenside_bunker}
                  onChange={e => updateHole(i, "greenside_bunker", e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee" }}>
        <button
          style={{ ...btnStyle(true), opacity: saving ? 0.6 : 1, width: "100%" }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved! Redirecting..." : "Save round"}
        </button>
      </div>
    </main>
  );
}