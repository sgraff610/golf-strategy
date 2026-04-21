"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCourse, loadCourses } from "@/lib/storage";
import { CourseRecord } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";
type RoundHole = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number | ""; chips: number | ""; putts: number | "";
  tee_accuracy: TeeAccuracy; appr_accuracy: TeeAccuracy;
  appr_distance: string; water_penalty: number | ""; drop_or_out: number | "";
  tree_haz: number | ""; fairway_bunker: number | ""; greenside_bunker: number | "";
  gir: boolean; grints: boolean; club: string; first_putt_distance: string;
};

function calcGir(score: number | "", par: number, putts: number | ""): boolean {
  if (score === "" || putts === "") return false;
  return (score - (putts as number)) <= (par - 2);
}
function calcGrints(score: number | "", par: number): boolean {
  if (score === "") return false;
  return score <= par;
}
function computeHandicapIndexAtDate(allRounds: any[], beforeDate: string): number {
  // Get rounds before this date, sorted chronologically
  const prior = allRounds
    .filter(r => r.date < beforeDate && r.score_differential != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build list of differentials — pad with 14.0 if fewer than 20
  const diffs = prior.map(r => r.score_differential as number);
  while (diffs.length < 20) diffs.unshift(14.0);
  const last20 = diffs.slice(-20);

  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1
    : last20.length <= 8 ? 2
    : last20.length <= 11 ? 3
    : last20.length <= 14 ? 4
    : last20.length <= 16 ? 5
    : last20.length <= 18 ? 6
    : last20.length === 19 ? 7
    : 8;
  const best = sorted.slice(0, count);
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return Math.floor(avg * 10) / 10;
}

function computeCourseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
  holesPlayed: number,
  courseHoleCount: number = 18
): number {
  const is9Course = courseHoleCount <= 9;
  const is9Round = holesPlayed <= 9;

  let adjRating = rating;
  if (!is9Round && is9Course) adjRating = rating * 2;
  else if (is9Round && !is9Course) adjRating = rating / 2;

  if (is9Round) {
    const halfHI = Math.round(handicapIndex / 2 * 10) / 10;
    return Math.round(halfHI * (slope / 113) + (adjRating - par));
  }
  return Math.round(handicapIndex * (slope / 113) + (adjRating - par));
}

function handicapStrokesOnHole(courseHandicap: number, strokeIndex: number): number {
  // strokes = floor(courseHandicap / 18), plus 1 if strokeIndex <= (courseHandicap % 18)
  const base = Math.floor(courseHandicap / 18);
  const extra = courseHandicap % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

function netDoubleBogey(par: number, handicapStrokes: number): number {
  return par + 2 + handicapStrokes;
}

function adjustedScore(actualScore: number | "", par: number, handicapStrokes: number): number | "" {
  if (actualScore === "") return "";
  const ndb = netDoubleBogey(par, handicapStrokes);
  return Math.min(Number(actualScore), ndb);
}

function computeAdjustedGrossScore(holes: any[], courseHandicap: number): number {
  return holes.reduce((sum, h) => {
    const strokes = handicapStrokesOnHole(courseHandicap, h.stroke_index);
    const adj = adjustedScore(h.score, h.par, strokes);
    return sum + (adj === "" ? 0 : Number(adj));
  }, 0);
}

function computeScoreDifferential(ags: number, rating: number, slope: number): number {
  return Math.round(((ags - rating) * (113 / slope)) * 10) / 10;
}
function scoreColor(score:number, par:number):string {
  const d=score-par;
  if(d<=-2)return"#1a6fd4"; if(d===-1)return"#27ae60"; if(d===0)return"#333"; if(d===1)return"#e67e22"; return"#c0392b";
}

// ── Scorecard component ───────────────────────────────────────────────────────
function RoundScorecard({ roundHoles, courseName, teeBox, date, allVersions, roundId, onBack }: {
  roundHoles: RoundHole[];
  courseName: string;
  teeBox: string;
  date: string;
  allVersions: CourseRecord[];
  roundId: string;
  onBack: () => void;
}) {
  const is18 = roundHoles.length === 18;
  const sortedTees = [...allVersions].sort((a, b) =>
    b.holes.reduce((s:number, h:any) => s + (h.yards||0), 0) - a.holes.reduce((s:number, h:any) => s + (h.yards||0), 0)
  );

  type Col =
    | { type: "hole"; rh: RoundHole }
    | { type: "spacer"; label: string; parSum: number; scoreSum: number; yardsMap: Record<string,number> };

  const cols: Col[] = [];
  const makeSpacerYards = (sliceHoles: RoundHole[]) => {
    const nums = new Set(sliceHoles.map(h => h.hole));
    return Object.fromEntries(sortedTees.map(t => [t.tee_box, t.holes.filter((h:any) => nums.has(h.hole)).reduce((s:number,h:any) => s+(h.yards||0), 0)]));
  };

  if (is18) {
    roundHoles.slice(0,9).forEach(h => cols.push({ type:"hole", rh:h }));
    cols.push({ type:"spacer", label:"Out", parSum:roundHoles.slice(0,9).reduce((s,h)=>s+h.par,0), scoreSum:roundHoles.slice(0,9).reduce((s,h)=>s+(Number(h.score)||0),0), yardsMap:makeSpacerYards(roundHoles.slice(0,9)) });
    roundHoles.slice(9).forEach(h => cols.push({ type:"hole", rh:h }));
    cols.push({ type:"spacer", label:"In", parSum:roundHoles.slice(9).reduce((s,h)=>s+h.par,0), scoreSum:roundHoles.slice(9).reduce((s,h)=>s+(Number(h.score)||0),0), yardsMap:makeSpacerYards(roundHoles.slice(9)) });
  } else {
    roundHoles.forEach(h => cols.push({ type:"hole", rh:h }));
  }
  cols.push({ type:"spacer", label:"Total", parSum:roundHoles.reduce((s,h)=>s+h.par,0), scoreSum:roundHoles.reduce((s,h)=>s+(Number(h.score)||0),0), yardsMap:makeSpacerYards(roundHoles) });

  const c: React.CSSProperties  = { padding:"5px 3px", textAlign:"center", fontSize:11, borderRight:"1px solid #e0e0e0", whiteSpace:"nowrap", };
  const hdr: React.CSSProperties = { ...c, background:"#1a3a2a", color:"white", fontWeight:600 };
  const lbl: React.CSSProperties = { ...c, background:"#f0f0f0", fontWeight:600, color:"#333", textAlign:"left", paddingLeft:8, minWidth:72, fontSize:10 };
  const sp: React.CSSProperties  = { ...c, background:"#e8f5f0", fontWeight:700, color:"#0f6e56" };

  const totalScore = roundHoles.reduce((s,h)=>s+(Number(h.score)||0),0);
  const totalPar = roundHoles.reduce((s,h)=>s+h.par,0);
  const toPar = totalScore - totalPar;

  return (
    <div style={{ marginTop:32 }}>
      <div style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#d0d0d0", margin:"0 0 2px" }}>{courseName}</h2>
        <p style={{ fontSize:13, color:"white", margin:0 }}>{teeBox} tees · {date}</p>
        <p style={{ fontSize:18, fontWeight:700, color:toPar>0?"#c0392b":toPar<0?"#27ae60":"#333", margin:"6px 0 0" }}>
          {totalScore} ({toPar===0?"E":toPar>0?`+${toPar}`:toPar})
        </p>
      </div>

      <div style={{ overflowX:"auto", marginBottom:20, borderRadius:10, border:"1px solid #ddd", boxShadow:"0 2px 8px #0001" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", tableLayout:"auto" }}>
          <tbody>
            <tr>
              <td style={lbl}>Hole</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={hdr}>{col.rh.hole}</td>
                : <td key={ci} style={sp}>{col.label}</td>)}
            </tr>
            <tr>
              <td style={lbl}>Index</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#fafafa", color:"#555" }}>{col.rh.stroke_index}</td>
                : <td key={ci} style={{ ...c, background:"#e8f5f0" }}></td>)}
            </tr>
            <tr>
              <td style={lbl}>Par</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, fontWeight:600 }}>{col.rh.par}</td>
                : <td key={ci} style={sp}>{col.parSum}</td>)}
            </tr>
            {sortedTees.map((tee,ti) => (
              <tr key={tee.id} style={{ background: ti%2===0?"#f5f5f5":"#f9f9f9" }}>
                <td style={{ ...lbl, background: ti%2===0?"#f5f5f5":"#f9f9f9" }}>
                  <span style={{ fontSize:10, color:"#0f6e56", fontWeight:600 }}>{tee.tee_box}</span>
                </td>
                {cols.map((col,ci) => {
                  if (col.type==="hole") {
                    const th = tee.holes.find((h:any) => h.hole===col.rh.hole);
                    return <td key={ci} style={c}>{th?.yards||"—"}</td>;
                  }
                  return <td key={ci} style={{ ...sp, fontSize:12 }}>{col.yardsMap[tee.tee_box]||"—"}</td>;
                })}
              </tr>
            ))}
            {/* Score */}
            <tr style={{ borderTop:"2px solid #0f6e56" }}>
              <td style={{ ...lbl, background:"#f0f9f6" }}>Score</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, fontWeight:700, color: col.rh.score!==""?scoreColor(Number(col.rh.score),col.rh.par):"#aaa" }}>
                    {col.rh.score!==""?col.rh.score:"—"}
                  </td>
                : <td key={ci} style={sp}>{col.scoreSum||"—"}</td>)}
            </tr>
            <tr>
              <td style={lbl}>Driv Club</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={c}>{col.rh.club||"—"}</td>
                : <td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}
            </tr>
            <tr style={{ background:"#f9f9f9" }}>
              <td style={{ ...lbl, background:"#f9f9f9" }}>Driv Acc</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#f9f9f9", color: col.rh.tee_accuracy==="Hit"?"#27ae60":col.rh.tee_accuracy?"#c0392b":"#aaa" }}>
                    {col.rh.tee_accuracy||"—"}
                  </td>
                : <td key={ci} style={{ ...c, background:"#e8f5f0" }}></td>)}
            </tr>
            <tr>
              <td style={lbl}>Appr Club</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={c}>{col.rh.appr_distance||"—"}</td>
                : <td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}
            </tr>
            <tr style={{ background:"#f9f9f9" }}>
              <td style={{ ...lbl, background:"#f9f9f9" }}>Appr Acc</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#f9f9f9", color: col.rh.appr_accuracy==="Hit"?"#27ae60":col.rh.appr_accuracy?"#c0392b":"#aaa" }}>
                    {col.rh.appr_accuracy||"—"}
                  </td>
                : <td key={ci} style={{ ...c, background:"#e8f5f0" }}></td>)}
            </tr>
            <tr>
              <td style={lbl}>Chips</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={c}>{col.rh.chips!==""?col.rh.chips:"—"}</td>
                : <td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}
            </tr>
            <tr style={{ background:"#f9f9f9" }}>
              <td style={{ ...lbl, background:"#f9f9f9" }}>Putts</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#f9f9f9" }}>{col.rh.putts!==""?col.rh.putts:"—"}</td>
                : <td key={ci} style={sp}>{col.type==="spacer"
                    ? roundHoles.filter(h => is18
                        ? col.label==="Out"?h.hole<=9:col.label==="In"?h.hole>9:true
                        : true
                      ).reduce((s,h)=>s+(Number(h.putts)||0),0)||"—"
                    : "—"}</td>)}
            </tr>
            <tr>
              <td style={lbl}>1st Putt</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={c}>{col.rh.first_putt_distance||"—"}</td>
                : <td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EditRound() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : (rawId as string) ?? "";

  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [date, setDate] = useState("");
  const [holesPlayed, setHolesPlayed] = useState(18);
  const [startingHole, setStartingHole] = useState(1);
  const [roundHoles, setRoundHoles] = useState<RoundHole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [showScorecard, setShowScorecard] = useState(false);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [courseHandicap, setCourseHandicap] = useState<number | null>(null);
  const [adjustedGrossScore, setAdjustedGrossScore] = useState<number | null>(null);
  const [scoreDifferential, setScoreDifferential] = useState<number | null>(null);
  const [course, setCourse] = useState<CourseRecord | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("rounds").select("*").eq("id", id).single().then(async ({ data, error }) => {
      if (!error && data) {
        setCourseName(data.course_name ?? "");
        if (data.tee_box) {
          setTeeBox(data.tee_box);
        } else if (data.course_id) {
          supabase.from("courses").select("tee_box").eq("id", data.course_id).single().then(({ data: courseData }) => {
            if (courseData?.tee_box) setTeeBox(courseData.tee_box);
          });
        }
        setCourseId(data.course_id ?? "");
        setDate(data.date ?? "");
        setHolesPlayed(data.holes_played ?? 18);
        setStartingHole(data.starting_hole ?? 1);
        setRoundHoles(data.holes ?? []);
        // Load all tee versions for scorecard
        const allCourses = await loadCourses();
        setAllTeeVersions(allCourses.filter(c => c.name === data.course_name));
        // Load handicap calculations
        const courseRecord = allCourses.find(c => c.id === data.course_id) ?? null;
        setCourse(courseRecord);

        // Load existing stored values if present
        if (data.handicap_index != null) setHandicapIndex(data.handicap_index);
        if (data.course_handicap != null) setCourseHandicap(data.course_handicap);
        if (data.adjusted_gross_score != null) setAdjustedGrossScore(data.adjusted_gross_score);
        if (data.score_differential != null) setScoreDifferential(data.score_differential);

        // If not stored yet, compute from prior rounds
        if (data.handicap_index == null && courseRecord?.slope && courseRecord?.rating) {
          const { data: allRoundsData } = await supabase
            .from("rounds")
            .select("date, score_differential")
            .neq("id", data.id ?? "")
            .order("date", { ascending: true });

          if (allRoundsData) {
            const hi = computeHandicapIndexAtDate(allRoundsData, data.date ?? "");
            const totalPar = (data.holes ?? []).reduce((s: number, h: any) => s + (h.par || 0), 0);
            const ch = computeCourseHandicap(hi, courseRecord.slope, courseRecord.rating, totalPar, data.holes_played ?? 18, courseRecord.holes?.length ?? 18);
            const ags = computeAdjustedGrossScore(data.holes ?? [], ch);
            const is9Course = (courseRecord.holes?.length ?? 18) <= 9;
            const is9Round = (data.holes_played ?? 18) <= 9;
            const adjRating = (!is9Round && is9Course) ? courseRecord.rating * 2 : (is9Round && !is9Course) ? courseRecord.rating / 2 : courseRecord.rating;
            const sd = computeScoreDifferential(ags, adjRating, courseRecord.slope);
            console.log("[differential debug]", { ags, adjRating, slope: courseRecord.slope, is9Course, is9Round, courseHoleCount: courseRecord.holes?.length, holesPlayed: data.holes_played, sd });
            setHandicapIndex(hi);
            setCourseHandicap(ch);
            setAdjustedGrossScore(ags);
            setScoreDifferential(sd);
          }
        }
      }
      setLoading(false);
    });
  }, [id]);

  function updateHole(index: number, field: keyof RoundHole, value: any) {
    setRoundHoles(prev => prev.map((h, i) => {
      if (i !== index) return h;
      const newHole = { ...h, [field]: value };
      newHole.gir = calcGir(newHole.score, newHole.par, newHole.putts);
      newHole.grints = calcGrints(newHole.score, newHole.par);
      return newHole;
    }));
  }

  async function handleSync() {
    if (!courseId) return;
    setSyncing(true);
    const course = await getCourse(courseId);
    if (!course) { alert("Could not find course data."); setSyncing(false); return; }
    setCourseName(course.name);
    await supabase.from("rounds").update({ course_name: course.name }).eq("id", id);
    setRoundHoles(prev => prev.map(roundHole => {
      const courseHole = course.holes.find(h => h.hole === roundHole.hole);
      if (!courseHole) return roundHole;
      const synced = { ...roundHole, par: courseHole.par, yards: courseHole.yards, stroke_index: courseHole.stroke_index, grints: calcGrints(roundHole.score, courseHole.par) };
      synced.gir = calcGir(synced.score, synced.par, synced.putts);
      return synced;
    }));
    setSyncing(false);
  }

  async function handleSave() {
    setSaving(true);
    // Recompute AGS and differential on save in case scores changed
    let finalAgs = adjustedGrossScore;
    let finalSd = scoreDifferential;
    if (courseHandicap != null && course?.rating && course?.slope) {
      finalAgs = computeAdjustedGrossScore(roundHoles, courseHandicap);
      const is9C = (course.holes?.length ?? 18) <= 9;
      const is9R = holesPlayed <= 9;
      const adjR = (!is9R && is9C) ? course.rating * 2 : (is9R && !is9C) ? course.rating / 2 : course.rating;
      finalSd = computeScoreDifferential(finalAgs, adjR, course.slope);
      setAdjustedGrossScore(finalAgs);
      setScoreDifferential(finalSd);
    }

    const { error } = await supabase.from("rounds").update({
      date, holes_played: holesPlayed, starting_hole: startingHole, holes: roundHoles,
      course_name: courseName,
      handicap_index: handicapIndex,
      course_handicap: courseHandicap,
      adjusted_gross_score: finalAgs,
      score_differential: finalSd,
    }).eq("id", id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setShowScorecard(true);
    }
  }

  const inputStyle = { width: "100%", padding: "6px 8px", fontSize: 14, border: "1px solid #ddd", borderRadius: 6, boxSizing: "border-box" as const };
  const selectStyle = { ...inputStyle, background: "white", color: "#0f6e56" };
  const labelStyle = { fontSize: 12, color: "white", display: "block" as const, marginBottom: 3 };
  const sectionLabel = { fontSize: 11, fontWeight: 600 as const, color: "#0f6e56", textTransform: "uppercase" as const, letterSpacing: 1, margin: "0 0 6px" };
  const btnStyle = (primary: boolean) => ({
    padding: "10px 20px", fontSize: 15, fontWeight: 600 as const,
    background: primary ? "#1a1a1a" : "white", color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer" as const,
    textDecoration: "none" as const, display: "block" as const, textAlign: "center" as const,
  });

  const totalScore = roundHoles.reduce((s, h) => s + (Number(h.score) || 0), 0);
  const totalPutts = roundHoles.reduce((s, h) => s + (Number(h.putts) || 0), 0);

  const drivingHoles = roundHoles.filter(h => h.par === 4 || h.par === 5);
  const fairways = drivingHoles.filter(h => h.tee_accuracy === "Hit").length;
  const girs = roundHoles.filter(h => h.gir).length;
  const grints = roundHoles.filter(h => h.grints).length;

  if (loading) return (
    <main style={{ maxWidth: 700, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "white" }}>Loading round...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "white" }}>← Back to rounds</a>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: "#d0d0d0" }}>Edit round</h1>
      <p style={{ color: "white", marginBottom: 24, fontSize: 14 }}>
        {courseName}{teeBox ? ` — ${teeBox} tees` : ""}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, maxWidth: 130, padding: "3px 6px", fontSize: 13 }} />
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
            <p style={{ fontSize: 11, color: "#0f6e56", margin: "0 0 2px" }}>{label}</p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0f6e56" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Per-hole adjusted score indicator */}
      {courseHandicap != null && roundHoles.map((h, i) => {
        const strokes = handicapStrokesOnHole(courseHandicap, h.stroke_index);
        const adj = adjustedScore(h.score, h.par, strokes);
        const isAdjusted = h.score !== "" && adj !== "" && Number(adj) < Number(h.score);
        return isAdjusted ? (
          <div key={i} style={{ fontSize:11, color:"#e67e22", marginBottom:2 }}>
            Hole {h.hole}: score capped at {adj} (actual {h.score}, max net double bogey = {netDoubleBogey(h.par, strokes)})
          </div>
        ) : null;
      })}

      {/* Handicap calculations */}
      {(courseHandicap != null || handicapIndex != null) && (
        <div style={{ background:"#f0faf6", border:"1px solid #c8e6c9", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:600, color:"#0f6e56", textTransform:"uppercase", letterSpacing:1, margin:"0 0 10px" }}>Round Handicap</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {[
              { label:"HI at round", value: handicapIndex != null ? handicapIndex.toFixed(1) : "—" },
              { label:"Course HCP", value: courseHandicap != null ? courseHandicap : "—" },
              { label:"Adj Gross", value: adjustedGrossScore != null && adjustedGrossScore > 0 ? adjustedGrossScore : "—" },
              { label:"Differential", value: scoreDifferential != null ? (holesPlayed <= 9 ? (scoreDifferential * 2).toFixed(1) : scoreDifferential.toFixed(1)) : "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign:"center", background:"white", borderRadius:8, padding:"8px 4px", border:"1px solid #e0f0ea" }}>
                <div style={{ fontSize:18, fontWeight:700, color:"#0f6e56" }}>{value}</div>
                <div style={{ fontSize:10, color:"#0f6e56", marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
          {courseHandicap != null && (
            <p style={{ fontSize:11, color:"#0f6e56", margin:"8px 0 0", fontStyle:"italic" }}>
              Course HCP {courseHandicap}: you receive 1 stroke on holes ranked 1–{Math.min(courseHandicap, 18)}
              {courseHandicap > 18 ? ` plus 2 strokes on holes ranked 1–${courseHandicap - 18}` : ""}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roundHoles.map((hole, i) => (
          <div key={i} style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#0f6e56" }}>Hole {hole.hole}</span>
                <span style={{ fontSize: 13, color: "#0f6e56", marginLeft: 8 }}>Par {hole.par} · {hole.yards} yds · SI {hole.stroke_index}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {hole.gir && <span style={{ fontSize: 11, background: "#e8f5e9", color: "#2e7d32", padding: "2px 8px", borderRadius: 20 }}>GIR</span>}
                {hole.grints && <span style={{ fontSize: 11, background: "#e3f2fd", color: "#1565c0", padding: "2px 8px", borderRadius: 20 }}>GRINTS</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={sectionLabel}>Scoring</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div><label style={labelStyle}>Score</label>
                    <input style={inputStyle} type="number" min={1} max={20} value={hole.score}
                      onChange={e => updateHole(i, "score", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div><label style={labelStyle}>Putts</label>
                    <input style={inputStyle} type="number" min={0} max={10} value={hole.putts}
                      onChange={e => updateHole(i, "putts", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div><label style={labelStyle}>Chips</label>
                    <input min={0} max={10} type="number" style={inputStyle} value={hole.chips ?? ""}
                      onChange={e => updateHole(i, "chips", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div><label style={labelStyle}>1st Putt</label>
                    <select style={selectStyle} value={hole.first_putt_distance ?? ""} onChange={e => updateHole(i, "first_putt_distance", e.target.value)}>
                      <option value="">—</option>
                      {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d => <option key={d} value={d}>{d}</option>)}
                    </select></div>
                </div>
              </div>
              <div>
                <p style={sectionLabel}>Tee & Approach</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div><label style={labelStyle}>DRIV Club</label>
                    <select style={selectStyle} value={hole.club ?? ""} onChange={e => updateHole(i, "club", e.target.value)}>
                      <option value="">—</option>
                      {["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>DRIV Acc</label>
                    <select style={selectStyle} value={hole.tee_accuracy} onChange={e => updateHole(i, "tee_accuracy", e.target.value)}>
                      <option value="">—</option>
                      {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>APPR Club</label>
                    <select style={selectStyle} value={hole.appr_distance ?? ""} onChange={e => updateHole(i, "appr_distance", e.target.value)}>
                      <option value="">—</option>
                      {["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>APPR Acc</label>
                    <select style={selectStyle} value={hole.appr_accuracy ?? ""} onChange={e => updateHole(i, "appr_accuracy", e.target.value)}>
                      <option value="">—</option>
                      {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                </div>
              </div>
              <div>
                <p style={sectionLabel}>Penalties</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {[{label:"Water",field:"water_penalty"},{label:"Drop/OB",field:"drop_or_out"},{label:"Tree/Haz",field:"tree_haz"},{label:"FWY Bkr",field:"fairway_bunker"},{label:"GS Bkr",field:"greenside_bunker"}].map(({label,field}) => (
                    <div key={field}><label style={labelStyle}>{label}</label>
                      <input style={inputStyle} type="number" min={0} max={10} value={(hole as any)[field]}
                        onChange={e => updateHole(i, field as keyof RoundHole, e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee", display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={{ ...btnStyle(false), opacity: syncing ? 0.6 : 1 }} onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync with course"}
        </button>
        <button style={{ ...btnStyle(true), opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        {id && (
          <a href={`/rounds/play?roundId=${id}`} style={{ ...btnStyle(false), color: "#0f6e56", borderColor: "#0f6e56" }}>
            ⛳ Play this round
          </a>
        )}
      </div>

      {/* Scorecard shown after saving */}
      {showScorecard && (
        <RoundScorecard
          roundHoles={roundHoles}
          courseName={courseName}
          teeBox={teeBox}
          date={date}
          allVersions={allTeeVersions.length > 0 ? allTeeVersions : []}
          roundId={id}
          onBack={() => setShowScorecard(false)}
        />
      )}
    </main>
  );
}