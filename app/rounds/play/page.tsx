"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadCourses } from "@/lib/storage";
import { CourseRecord } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";
type RoundHole = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number | ""; chips: number | ""; putts: number | "";
  first_putt_distance: string; club: string; tee_accuracy: TeeAccuracy;
  appr_distance: string; appr_accuracy: TeeAccuracy;
  water_penalty: number | ""; drop_or_out: number | "";
  tree_haz: number | ""; fairway_bunker: number | ""; greenside_bunker: number | "";
  gir: boolean; grints: boolean;
};

const CLUBS = ["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const WOODS = ["Driver","3W","5W","7W"];
const IRONS = ["4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const DOGLEG_LABELS: Record<string,string> = {
  severe_left:"Severe Left",moderate_left:"Moderate Left",slight_left:"Slight Left",
  straight:"Straight",slight_right:"Slight Right",moderate_right:"Moderate Right",severe_right:"Severe Right",
};

function calcGir(score: number|"", par: number, putts: number|""): boolean {
  if (score===""||putts==="") return false;
  return (score-(putts as number))<=(par-2);
}
function calcGrints(score: number|"", par: number): boolean {
  if (score==="") return false; return score<=par;
}
function blankHole(h: any): RoundHole {
  return {
    hole:h.hole, par:h.par, yards:h.yards, stroke_index:h.stroke_index,
    score:"", chips:"", putts:"", first_putt_distance:"",
    club:"", tee_accuracy:"", appr_distance:"", appr_accuracy:"",
    water_penalty:"", drop_or_out:"", tree_haz:"",
    fairway_bunker:"", greenside_bunker:"", gir:false, grints:false,
  };
}
function pct(n: number) { return `${Math.round(n*100)}%`; }
function fmtSTP(n: number) { return n>=0?`+${n.toFixed(2)}`:n.toFixed(2); }
function hazardCode(h:any):string{
  const parts:string[]=[];
  const ob=(Number(h.water_penalty)||0)+(Number(h.drop_or_out)||0);
  const th=Number(h.tree_haz)||0;
  const fb=Number(h.fairway_bunker)||0;
  const gb=Number(h.greenside_bunker)||0;
  if(ob>0)parts.push(ob>1?`${ob}O`:"O");
  if(th>0)parts.push(th>1?`${th}H`:"H");
  if(fb>0)parts.push(fb>1?`${fb}F`:"F");
  if(gb>0)parts.push(gb>1?`${gb}S`:"S");
  return parts.join(" ")||"—";
}
function scoreColor(score:number,par:number):string{
  const d=score-par;
  if(d<=-2)return"#1a6fd4"; if(d===-1)return"#27ae60"; if(d===0)return"#333"; if(d===1)return"#e67e22"; return"#c0392b";
}
function fmt0(n:number){return n>=0?`+${n.toFixed(1)}`:n.toFixed(1);}

// ── Tee Shot Grid helpers ──────────────────────────────────────────────────────
type EnrichedHole = { roundHole: any; courseHole: any; similarityScore: number; isExactHole: boolean };

function impactColor(impact: number): { bg: string; color: string } {
  if (impact >= 0.3)  return { bg:"#c0392b", color:"white" };
  if (impact >= 0.1)  return { bg:"#f1948a", color:"#1a1a1a" };
  if (impact > -0.1)  return { bg:"white",   color:"#1a1a1a" };
  if (impact > -0.3)  return { bg:"#a9dfbf", color:"#1a1a1a" };
  return               { bg:"#1e8449", color:"white" };
}

function wAvg(holes: EnrichedHole[], fn: (e: EnrichedHole)=>number|null): number {
  let n=0,d=0;
  for (const e of holes) { const v=fn(e); if(v!==null&&!isNaN(v)){n+=v*e.similarityScore;d+=e.similarityScore;} }
  return d>0?n/d:0;
}

function scoreToPar(e: EnrichedHole) { return Number(e.roundHole.score)-e.roundHole.par; }

function clubGroup(club: string): string {
  if (!club) return "Unknown";
  if (club==="Driver") return "Driver";
  if (club==="3W") return "3W";
  if (club==="5W") return "5W";
  if (club==="7W") return "7W";
  if (IRONS.includes(club)) return "Irons";
  return "Unknown";
}

function computeGridData(enriched: EnrichedHole[], baseline: number) {
  const rows = ["Driver","3W","5W","7W","Irons","Unknown"];
  const dirs = ["Left","Hit","Right","Unknown"] as const;

  return rows.map(rowClub => {
    const clubHoles = enriched.filter(e => clubGroup(e.roundHole.club||"")=== rowClub);
    const count = clubHoles.length;
    const cols = dirs.map(dir => {
      let dirHoles: EnrichedHole[];
      if (dir==="Unknown") {
        dirHoles = clubHoles.filter(e => !e.roundHole.tee_accuracy);
      } else {
        dirHoles = clubHoles.filter(e => e.roundHole.tee_accuracy===dir);
      }
      const total = clubHoles.length;
      const likelihood = total>0 ? dirHoles.length/total : 0;
      const avg = dirHoles.length>0 ? wAvg(dirHoles, scoreToPar) : NaN;
      const impact = !isNaN(avg) ? avg-baseline : NaN;
      return { likelihood, impact, count: dirHoles.length };
    });
    return { club: rowClub, count, cols };
  });
}

function computeHazardImpacts(enriched: EnrichedHole[], hole: any, baseline: number) {
  const hazards = [
    { label:"OB/Water Left", key:"tee_water_out_left", filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"OB/Water Right", key:"tee_water_out_right", filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 && e.roundHole.tee_accuracy==="Right" },
    { label:"OB/Water Across", key:"tee_water_out_across", filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 },
    { label:"Trees Left", key:"tee_tree_hazard_left", filterFn:(e:EnrichedHole)=>Number(e.roundHole.tree_haz)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"Trees Right", key:"tee_tree_hazard_right", filterFn:(e:EnrichedHole)=>Number(e.roundHole.tree_haz)>0 && e.roundHole.tee_accuracy==="Right" },
    { label:"Bunker Left", key:"tee_bunkers_left", filterFn:(e:EnrichedHole)=>Number(e.roundHole.fairway_bunker)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"Bunker Right", key:"tee_bunkers_right", filterFn:(e:EnrichedHole)=>Number(e.roundHole.fairway_bunker)>0 && e.roundHole.tee_accuracy==="Right" },
  ];
  return hazards
    .filter(h => hole?.[h.key])
    .map(h => {
      const matching = enriched.filter(h.filterFn);
      const avg = matching.length>0 ? wAvg(matching, scoreToPar) : NaN;
      const impact = !isNaN(avg) ? avg-baseline : NaN;
      return { label:h.label, impact, count:matching.length };
    })
    .filter(h => !isNaN(h.impact))
    .sort((a,b)=>b.impact-a.impact)
    .slice(0,5);
}

// ── Grid cell component ────────────────────────────────────────────────────────
function GridCell({ likelihood, impact, count, greyed }: { likelihood:number; impact:number; count:number; greyed?:boolean }) {
  if (greyed) return (
    <div style={{ background:"#f0f0f0", borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40 }}>
      <p style={{ fontSize:9, color:"#bbb", margin:0 }}>N/A</p>
    </div>
  );
  const colors = isNaN(impact) ? { bg:"#f6f6f6", color:"#aaa" } : impactColor(impact);
  return (
    <div style={{ background:colors.bg, borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40, display:"flex", flexDirection:"column", justifyContent:"center" }}>
      {count>0 ? <>
        <p style={{ fontSize:10, fontWeight:600, color:colors.color, margin:0 }}>{pct(likelihood)}</p>
        <p style={{ fontSize:9, color:colors.color, margin:0, opacity:0.85 }}>{isNaN(impact)?"-":fmtSTP(impact)}</p>
      </> : <p style={{ fontSize:9, color:"#bbb", margin:0 }}>—</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function PlayCourseInner() {
  const searchParams = useSearchParams();
  const initCourseId = searchParams.get("courseId")??"";

  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseId, setCourseId] = useState(initCourseId);
  const [holesPlayed, setHolesPlayed] = useState<9|18>(18);
  const [startingHole, setStartingHole] = useState(1);
  const [started, setStarted] = useState(false);
  const [currentHoleIdx, setCurrentHoleIdx] = useState(0);
  const [roundHoles, setRoundHoles] = useState<RoundHole[]>([]);
  const [roundId, setRoundId] = useState<string|null>(null);
  const [showScore, setShowScore] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showThisHoleOnly, setShowThisHoleOnly] = useState(false);
  const [approachDist, setApproachDist] = useState<number|null>(null);

  useEffect(() => { loadCourses().then(data=>{ setCourses(data); }); }, []);

  const selectedCourse = courses.find(c=>c.id===courseId);

  function buildRoundHoles(): RoundHole[] {
    if (!selectedCourse) return [];
    const courseHoles = selectedCourse.holes;
    const holes = holesPlayed===9 ? courseHoles.slice(startingHole-1, startingHole-1+9) : courseHoles;
    return holes.map(h=>blankHole(h));
  }

  async function startRound() {
    if (!selectedCourse) return;
    const holes = buildRoundHoles();
    setRoundHoles(holes);
    setCurrentHoleIdx(0);
    const id = `round_${Date.now()}`;
    setRoundId(id);
    await supabase.from("rounds").insert({
      id, course_id:courseId,
      course_name:selectedCourse.name,
      tee_box:selectedCourse.tee_box??"",
      date:new Date().toISOString().split("T")[0],
      holes_played:holesPlayed,
      starting_hole:startingHole,
      holes,
    });
    setStarted(true);
    fetchStrategy(holes[0].hole);
  }

  async function fetchStrategy(holeNum: number) {
    setLoadingStrategy(true); setStrategy(null);
    try {
      const res = await fetch("/api/strategy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseId,hole:holeNum})});
      const data = await res.json();
      setStrategy(data);
      setApproachDist(data.defaultApproachDist??null);
    } catch {}
    setLoadingStrategy(false);
  }

  async function saveCurrentHole() {
    if (!roundId) return;
    setSaving(true);
    await supabase.from("rounds").update({ holes:roundHoles }).eq("id",roundId);
    setSaving(false);
  }

  function updateHoleField(field: keyof RoundHole, value: any) {
    setRoundHoles(prev => prev.map((h,i) => {
      if (i!==currentHoleIdx) return h;
      const updated = {...h,[field]:value};
      updated.gir = calcGir(updated.score,updated.par,updated.putts);
      updated.grints = calcGrints(updated.score,updated.par);
      return updated;
    }));
  }

  async function goToHole(idx: number) {
    await saveCurrentHole();
    setCurrentHoleIdx(idx);
    setShowScore(false);
    if (roundHoles[idx]) fetchStrategy(roundHoles[idx].hole);
  }

  // Derived
  const currentHole = roundHoles[currentHoleIdx];
  const strat = strategy?.strategy;
  const hole = strategy?.hole;
  const course = strategy?.course;
  const enriched: EnrichedHole[] = strategy?.enrichedHoles??[];
  const holeHistory = strategy?.holeHistory??[];
  const ds = strategy?.data_summary;

  const displayEnriched = useMemo(()=> {
    if (!showThisHoleOnly) return enriched;
    return enriched.filter((e:EnrichedHole)=>e.isExactHole);
  }, [enriched, showThisHoleOnly]);

  const baseline = useMemo(()=>{
    if (!displayEnriched.length) return 0;
    return wAvg(displayEnriched, scoreToPar);
  }, [displayEnriched]);

  const gridData = useMemo(()=>computeGridData(displayEnriched, baseline), [displayEnriched, baseline]);
  const hazardImpacts = useMemo(()=>computeHazardImpacts(displayEnriched, hole, baseline), [displayEnriched, hole, baseline]);

  const t = useMemo(()=>{
    if (!displayEnriched.length) return null;
    const valid = displayEnriched.filter(e=>e.roundHole.score!=="");
    if (!valid.length) return null;
    const wp = (pred:(e:EnrichedHole)=>boolean, denom?:(e:EnrichedHole)=>boolean)=>{
      let n=0,d=0; for(const e of valid){const ok=denom?denom(e):true;if(ok){d+=e.similarityScore;if(pred(e))n+=e.similarityScore;}} return d>0?n/d:0;
    };
    const drv = (e:EnrichedHole)=>e.roundHole.par>=4;
    const apprAcc = (e:EnrichedHole)=>e.roundHole.par===3?e.roundHole.tee_accuracy:e.roundHole.appr_accuracy;
    return {
      avgScoreToPar: wAvg(valid, scoreToPar),
      driveHitPct: wp(e=>e.roundHole.tee_accuracy==="Hit",drv),
      driveMissLeftPct: wp(e=>e.roundHole.tee_accuracy==="Left",drv),
      driveMissRightPct: wp(e=>e.roundHole.tee_accuracy==="Right",drv),
      driveWaterPct: wp(e=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0,drv),
      driveTreePct: wp(e=>(Number(e.roundHole.tree_haz)||0)>0,drv),
      driveBunkerPct: wp(e=>(Number(e.roundHole.fairway_bunker)||0)>0,drv),
      apprHitPct: wp(e=>apprAcc(e)==="Hit",e=>apprAcc(e)!==""),
      apprMissLeftPct: wp(e=>apprAcc(e)==="Left",e=>apprAcc(e)!==""),
      apprMissRightPct: wp(e=>apprAcc(e)==="Right",e=>apprAcc(e)!==""),
      apprMissShortPct: wp(e=>apprAcc(e)==="Short",e=>apprAcc(e)!==""),
      apprMissLongPct: wp(e=>apprAcc(e)==="Long",e=>apprAcc(e)!==""),
      girPct: wp(e=>!!e.roundHole.gir),
      apprWaterPct: wp(e=>(Number(e.roundHole.water_penalty)||0)>0),
      apprBunkerPct: wp(e=>(Number(e.roundHole.greenside_bunker)||0)>0),
      apprTreePct: wp(e=>(Number(e.roundHole.tree_haz)||0)>0),
      avgPutts: wAvg(valid,e=>e.roundHole.putts!==""?Number(e.roundHole.putts):null),
    };
  }, [displayEnriched]);

  // Styles
  const inputStyle: React.CSSProperties = { width:"100%", padding:"6px 8px", fontSize:14, border:"1px solid #ddd", borderRadius:6, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const labelStyle: React.CSSProperties = { fontSize:12, color:"#666", display:"block", marginBottom:3 };
  const sl: React.CSSProperties = { fontSize:11, fontWeight:600, color:"#0f6e56", textTransform:"uppercase", letterSpacing:1, margin:"0 0 6px" };
  const card = (bg:string): React.CSSProperties => ({ background:bg, borderRadius:12, padding:"12px 16px" });
  const btnStyle = (primary:boolean, small=false): React.CSSProperties => ({
    padding:small?"6px 12px":"10px 16px", fontSize:small?13:15, fontWeight:600,
    background:primary?"#1a1a1a":"white", color:primary?"white":"#1a1a1a",
    border:"1px solid #1a1a1a", borderRadius:8, cursor:"pointer", textDecoration:"none", display:"inline-block",
  });
  const aimColors: Record<string,string> = { left:"#2980b9", right:"#8e44ad", center:"#27ae60", short:"#e67e22", long:"#c0392b" };
  const conf = strat?.confidence;
  const confidenceColor: Record<string,string> = { high:"#0f6e56", medium:"#e67e22", low:"#c0392b" };

  // ── Setup screen ──────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
        <div style={{ marginBottom:24 }}>
          <a href="/" style={{ fontSize:13, color:"#666" }}>← Back to Strategy</a>
        </div>
        <h1 style={{ fontSize:22, fontWeight:600, marginBottom:4, color:"#0f6e56" }}>Play Course</h1>
        <p style={{ color:"#aaa", marginBottom:24, fontSize:13 }}>Set up your round and start playing.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={labelStyle}>Course</label>
            <select style={selectStyle} value={courseId} onChange={e=>setCourseId(e.target.value)}>
              {courses.map(c=><option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Holes</label>
            <select style={selectStyle} value={holesPlayed} onChange={e=>setHolesPlayed(Number(e.target.value) as 9|18)}>
              <option value={9}>9 holes</option>
              <option value={18}>18 holes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Starting hole</label>
            <select style={selectStyle} value={startingHole} onChange={e=>setStartingHole(Number(e.target.value))}>
              {Array.from({length:selectedCourse?.holes.length??18},(_,i)=>i+1).map(n=>(
                <option key={n} value={n}>Hole {n}</option>
              ))}
            </select>
          </div>
          <button onClick={startRound} style={{ ...btnStyle(true), width:"100%", textAlign:"center" }}>
            ⛳ Start Round
          </button>
        </div>
      </main>
    );
  }

  // ── Playing screen ────────────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <a href="/" style={{ fontSize:13, color:"#666" }}>← Exit</a>
        <span style={{ fontSize:13, color:"#666" }}>{saving?"Saving...":"Auto-saved"}</span>
      </div>

      {/* Hole navigation */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button onClick={()=>goToHole(Math.max(0,currentHoleIdx-1))} disabled={currentHoleIdx===0}
          style={{ ...btnStyle(false,true), opacity:currentHoleIdx===0?0.4:1 }}>← Prev</button>
        <div style={{ textAlign:"center" }}>
          <p style={{ fontSize:18, fontWeight:700, color:"#0f6e56", margin:0 }}>Hole {currentHole?.hole}</p>
          <p style={{ fontSize:13, color:"#666", margin:0 }}>Par {currentHole?.par} · {currentHole?.yards} yds · SI {currentHole?.stroke_index}</p>
        </div>
        <button onClick={()=>{ if(currentHoleIdx<roundHoles.length-1) goToHole(currentHoleIdx+1); }}
          disabled={currentHoleIdx===roundHoles.length-1}
          style={{ ...btnStyle(true,true), opacity:currentHoleIdx===roundHoles.length-1?0.4:1 }}>Next →</button>
      </div>

      {/* Score toggle */}
      <button onClick={()=>setShowScore(s=>!s)}
        style={{ ...btnStyle(showScore,true), width:"100%", marginBottom:12, textAlign:"center" }}>
        {showScore?"Hide Score Entry":"📝 Enter Score"}
      </button>

      {/* Score entry */}
      {showScore && currentHole && (
        <div style={{ background:"#f9f9f9", border:"1px solid #eee", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <p style={sl}>Scoring</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
            {[{label:"Score",field:"score",min:1,max:20},{label:"Putts",field:"putts",min:0,max:10},{label:"Chips",field:"chips",min:0,max:10}].map(({label,field,min,max})=>(
              <div key={field}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min={min} max={max} style={inputStyle}
                  value={(currentHole as any)[field]}
                  onChange={e=>updateHoleField(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>1st Putt</label>
              <select style={selectStyle} value={currentHole.first_putt_distance} onChange={e=>updateHoleField("first_putt_distance",e.target.value)}>
                <option value="">—</option>
                {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <p style={sl}>Tee & Approach</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
            <div>
              <label style={labelStyle}>DRIV Club</label>
              <select style={selectStyle} value={currentHole.club} onChange={e=>updateHoleField("club",e.target.value)}>
                <option value="">—</option>
                {CLUBS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>DRIV Acc</label>
              <select style={selectStyle} value={currentHole.tee_accuracy} onChange={e=>updateHoleField("tee_accuracy",e.target.value)}>
                <option value="">—</option>
                {["Hit","Left","Right","Short","Long"].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>APPR Club</label>
              <select style={selectStyle} value={currentHole.appr_distance} onChange={e=>updateHoleField("appr_distance",e.target.value)}>
                <option value="">—</option>
                {CLUBS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>APPR Acc</label>
              <select style={selectStyle} value={currentHole.appr_accuracy} onChange={e=>updateHoleField("appr_accuracy",e.target.value)}>
                <option value="">—</option>
                {["Hit","Left","Right","Short","Long"].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <p style={sl}>Penalties</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
            {[{label:"Water",field:"water_penalty"},{label:"Drop/OB",field:"drop_or_out"},{label:"Tree/Haz",field:"tree_haz"},{label:"FWY Bkr",field:"fairway_bunker"},{label:"GS Bkr",field:"greenside_bunker"}].map(({label,field})=>(
              <div key={field}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min={0} max={10} style={inputStyle}
                  value={(currentHole as any)[field]}
                  onChange={e=>updateHoleField(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
              </div>
            ))}
          </div>
          <button onClick={()=>{ saveCurrentHole(); setShowScore(false); if(currentHoleIdx<roundHoles.length-1) goToHole(currentHoleIdx+1); }}
            style={{ ...btnStyle(true), width:"100%", textAlign:"center" }}>
            Save & Next →
          </button>
        </div>
      )}

      {loadingStrategy && <p style={{ color:"#aaa", fontSize:13, textAlign:"center", marginTop:24 }}>Loading strategy...</p>}

      {!loadingStrategy && strategy && hole && strat && (<div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Confidence + sample size */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:confidenceColor[conf]??"#666", textTransform:"uppercase" }}>{conf} confidence</span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#aaa" }}>
              {ds?.exact_hole_history>0?`${ds.exact_hole_history}× this hole · `:""}{displayEnriched.length} similar
            </span>
            <button onClick={()=>setShowThisHoleOnly(v=>!v)}
              style={{ fontSize:11, padding:"2px 8px", borderRadius:12, border:"1px solid #0f6e56", background:showThisHoleOnly?"#0f6e56":"white", color:showThisHoleOnly?"white":"#0f6e56", cursor:"pointer", fontWeight:600 }}>
              {showThisHoleOnly?"This hole only":"All similar"}
            </button>
          </div>
        </div>

        {/* Hole info */}
        <div style={card("#f0f0f0")}>
          <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:"0 0 8px" }}>HOLE INFO</p>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:4 }}>
            <span style={{ fontSize:14, color:"#333" }}>Par {hole.par}</span>
            <span style={{ fontSize:14, color:"#333" }}>{hole.yards} yds</span>
            <span style={{ fontSize:14, color:"#333" }}>SI {hole.stroke_index}</span>
            {course?.rating&&<span style={{ fontSize:14, color:"#666" }}>Rating {course.rating}</span>}
            {course?.slope&&<span style={{ fontSize:14, color:"#666" }}>Slope {course.slope}</span>}
          </div>
          {hole.dogleg_direction&&<p style={{ fontSize:13, color:"#555", margin:"4px 0 0" }}>Dogleg: {DOGLEG_LABELS[hole.dogleg_direction]??hole.dogleg_direction}</p>}
          {hole.approach_green_depth>0&&<p style={{ fontSize:13, color:"#555", margin:"4px 0 0" }}>Green depth: {hole.approach_green_depth} yds</p>}
        </div>

        {/* Avg score */}
        <div style={{ ...card("#f0f0f0"), display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px" }}>
          <span style={{ fontSize:13, color:"#aaa" }}>Avg on {showThisHoleOnly?"this hole":"similar holes"}</span>
          <span style={{ fontSize:20, fontWeight:700, color:(t?.avgScoreToPar??0)>0?"#c0392b":"#27ae60" }}>
            {t?fmtSTP(t.avgScoreToPar??0):ds?.avg_score_to_par}
          </span>
        </div>

        {/* History */}
        {holeHistory.length>0&&(()=>{
          const avgScore=holeHistory.reduce((s:number,h:any)=>s+(Number(h.score)-h.par),0)/holeHistory.length;
          const COLS="60px 28px 32px 30px 26px 26px 28px 1fr";
          return(
            <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <p style={{fontSize:12,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1,margin:0}}>My History — This Hole</p>
                <span style={{fontSize:13,fontWeight:700,color:avgScore>0?"#c0392b":avgScore<0?"#27ae60":"#333"}}>
                  avg {fmt0(avgScore)} · {holeHistory.length} rounds
                </span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:COLS,gap:"0 4px",marginBottom:4}}>
                {["Date","Sc","Club","Tee","Ap","Pu","Haz","Appr"].map(h=>(
                  <span key={h} style={{fontSize:9,color:"#aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</span>
                ))}
              </div>
              {holeHistory.map((h:any,i:number)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:COLS,gap:"0 4px",alignItems:"center",padding:"3px 0",borderTop:i>0?"1px solid #f0f0f0":"none"}}>
                  <span style={{fontSize:10,color:"#888"}}>{h.date?.slice(2,10)||"—"}</span>
                  <span style={{fontSize:13,fontWeight:700,color:scoreColor(Number(h.score),h.par)}}>
                    {Number(h.score)-h.par===0?"E":Number(h.score)-h.par>0?`+${Number(h.score)-h.par}`:Number(h.score)-h.par}
                  </span>
                  <span style={{fontSize:10,color:"#555"}}>{h.club||"—"}</span>
                  <span style={{fontSize:10,color:"#555"}}>{h.tee_accuracy?.slice(0,3)||"—"}</span>
                  <span style={{fontSize:10,color:"#555"}}>{h.appr_accuracy?.slice(0,3)||"—"}</span>
                  <span style={{fontSize:10,color:"#555"}}>{h.putts||"—"}</span>
                  <span style={{fontSize:10,color:"#e67e22",fontWeight:500}}>{hazardCode(h)}</span>
                  <span style={{fontSize:10,color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.appr_distance||"—"}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Tee Shot section — skip for par 3 */}
        {hole.par>=4&&(
          <div style={card("#f6f6f6")}>
            <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:"0 0 8px" }}>TEE STRATEGY</p>
            {/* Tee Shot Grid */}
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:"0 0 8px" }}>TEE SHOT GRID</p>

              {/* Hazard row */}
              {hazardImpacts.length>0&&(
                <div style={{ marginBottom:8 }}>
                  <p style={{ fontSize:10, color:"#aaa", margin:"0 0 4px" }}>Hazard Impacts (sorted by impact)</p>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {hazardImpacts.map((h,i)=>{
                      const colors = impactColor(h.impact);
                      return (
                        <div key={i} style={{ background:colors.bg, borderRadius:6, padding:"4px 8px", fontSize:11 }}>
                          <span style={{ color:colors.color, fontWeight:600 }}>{h.label}: {fmtSTP(h.impact)}</span>
                          <span style={{ color:colors.color, opacity:0.7, fontSize:10 }}> ({h.count})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Column headers */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:3, marginBottom:3 }}>
                {["Club","Left","Hit","Right","Unknown"].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:600, color:"#aaa", textAlign:"center", textTransform:"uppercase" }}>{h}</div>
                ))}
              </div>

              {/* Grid rows */}
              {gridData.map(row=>(
                <div key={row.club} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:3, marginBottom:3 }}>
                  {/* Club label cell */}
                  <div style={{ background:"#f6f6f6", borderRadius:4, padding:"3px 4px", display:"flex", flexDirection:"column", justifyContent:"center", textAlign:"center" }}>
                    <p style={{ fontSize:10, fontWeight:600, color:"#1a1a1a", margin:0 }}>{row.club}</p>
                    <p style={{ fontSize:9, color:"#aaa", margin:0 }}>{row.count}</p>
                  </div>
                  {/* Direction cells */}
                  {row.cols.map((col,ci)=>{
                    // Check if hazard exists for Left (col 0) and Right (col 2)
                    const isLeftCol = ci===0;
                    const isRightCol = ci===2;
                    const leftHazard = hole.tee_water_out_left||hole.tee_tree_hazard_left||hole.tee_bunkers_left;
                    const rightHazard = hole.tee_water_out_right||hole.tee_tree_hazard_right||hole.tee_bunkers_right;
                    const greyed = (isLeftCol&&!leftHazard)||(isRightCol&&!rightHazard);
                    return <GridCell key={ci} likelihood={col.likelihood} impact={col.impact} count={col.count} greyed={greyed} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approach */}
        <div style={card("#f6f6f6")}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
            <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:0 }}>APPROACH</p>
            {approachDist!=null&&(
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:11, color:"#aaa" }}>Distance (yds)</span>
                <input type="number" min={0} max={700} value={approachDist}
                  onChange={e=>setApproachDist(Number(e.target.value))}
                  style={{ width:64, padding:"3px 6px", fontSize:13, border:"1px solid #0f6e56", borderRadius:6, color:"#0f6e56", fontWeight:600, textAlign:"center" }} />
              </div>
            )}
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:"#0f6e56", marginBottom:8 }}>
            {t?pct(t.girPct):"—"} <span style={{ fontSize:14, color:"#aaa", fontWeight:400 }}>GIR</span>
          </div>
          {t&&(
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
              {[{label:"Hit",v:t.apprHitPct,c:"#27ae60"},{label:"Left",v:t.apprMissLeftPct,c:"#2980b9"},{label:"Right",v:t.apprMissRightPct,c:"#8e44ad"},{label:"Short",v:t.apprMissShortPct,c:"#e67e22"},{label:"Long",v:t.apprMissLongPct,c:"#c0392b"}].map(({label,v,c})=>(
                <div key={label} style={{ background:"#eee", borderRadius:8, padding:"4px 10px", fontSize:12 }}>
                  <span style={{ color:"#999" }}>{label}: </span><span style={{ fontWeight:600, color:c }}>{pct(v)}</span>
                </div>
              ))}
            </div>
          )}
          {t&&(
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {(hole.approach_water_out_left||hole.approach_water_out_right||hole.approach_water_out_short||hole.approach_water_out_long)&&(
                <div style={{ background:"#fff3e0", borderRadius:8, padding:"4px 10px", fontSize:12 }}>
                  <span style={{ color:"#999" }}>OB/Water: </span><span style={{ fontWeight:600, color:"#e67e22" }}>{pct(t.apprWaterPct)}</span>
                </div>
              )}
              {(hole.approach_bunker_short_left||hole.approach_bunker_short_middle||hole.approach_bunker_short_right||hole.approach_bunker_middle_left||hole.approach_bunker_middle_right||hole.approach_bunker_long_left||hole.approach_bunker_long_middle||hole.approach_bunker_long_right)&&(
                <div style={{ background:"#fef9e7", borderRadius:8, padding:"4px 10px", fontSize:12 }}>
                  <span style={{ color:"#999" }}>Bunker: </span><span style={{ fontWeight:600, color:"#c8a84b" }}>{pct(t.apprBunkerPct)}</span>
                </div>
              )}
              {(hole.approach_tree_hazard_left||hole.approach_tree_hazard_right||hole.approach_tree_hazard_long)&&(
                <div style={{ background:"#eafaf1", borderRadius:8, padding:"4px 10px", fontSize:12 }}>
                  <span style={{ color:"#999" }}>Trees/Haz: </span><span style={{ fontWeight:600, color:"#27ae60" }}>{pct(t.apprTreePct)}</span>
                </div>
              )}
            </div>
          )}
          <p style={{ fontSize:13, color:"#666", margin:"8px 0 0" }}>{strat.approach_strategy?.reason}</p>
        </div>

        {/* Warning */}
        {strat.warning&&(
          <div style={{ background:"#fff4e5", border:"1px solid #f0a500", borderRadius:12, padding:"14px 20px" }}>
            <p style={{ fontSize:11, color:"#b37400", fontWeight:700, letterSpacing:1, margin:"0 0 6px" }}>⚠ WATCH OUT</p>
            <p style={{ fontSize:13, color:"#7a4f00", margin:0 }}>{strat.warning}</p>
          </div>
        )}

        {/* Tendencies */}
        {ds?.insights?.length>0&&(
          <div style={card("#f0f9f6")}>
            <p style={{ fontSize:11, color:"#0f6e56", fontWeight:700, letterSpacing:1, margin:"0 0 8px" }}>YOUR TENDENCIES ON SIMILAR HOLES</p>
            <ul style={{ margin:0, paddingLeft:16 }}>
              {ds.insights.map((ins:string,i:number)=><li key={i} style={{ fontSize:13, color:"#333", marginBottom:4 }}>{ins}</li>)}
            </ul>
          </div>
        )}

      </div>)}

      {/* Progress dots */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:24, justifyContent:"center" }}>
        {roundHoles.map((h,i)=>(
          <button key={i} onClick={()=>goToHole(i)} style={{
            width:28, height:28, borderRadius:"50%", border:"none", cursor:"pointer",
            background:i===currentHoleIdx?"#0f6e56":h.score!==""?"#b2dfdb":"#eee",
            color:i===currentHoleIdx?"white":"#1a1a1a", fontSize:11, fontWeight:600,
          }}>{h.hole}</button>
        ))}
      </div>

    </main>
  );
}

export default function PlayCourse() {
  return (
    <Suspense fallback={<main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}><p style={{ color:"#666" }}>Loading...</p></main>}>
      <PlayCourseInner />
    </Suspense>
  );
}
