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

type EnrichedHole = { roundHole: any; courseHole: any; similarityScore: number; isExactHole: boolean };

function impactColor(impact: number, lowCount=false): { bg: string; color: string } {
  if (lowCount) {
    if (impact > 0.1)  return { bg:"#f9d6d6", color:"#1a1a1a" };
    if (impact < -0.1) return { bg:"#d6f0e0", color:"#1a1a1a" };
    return              { bg:"white", color:"#1a1a1a" };
  }
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
      const dirHoles = dir==="Unknown"
        ? clubHoles.filter(e => !e.roundHole.tee_accuracy)
        : clubHoles.filter(e => e.roundHole.tee_accuracy===dir);
      const likelihood = count>0 ? dirHoles.length/count : 0;
      const avg = dirHoles.length>0 ? wAvg(dirHoles, scoreToPar) : NaN;
      const impact = !isNaN(avg) ? avg-baseline : NaN;
      return { likelihood, impact, count: dirHoles.length };
    });
    return { club: rowClub, count, cols };
  });
}
function computeHazardImpacts(enriched: EnrichedHole[], hole: any, baseline: number) {
  const hazards = [
    { label:"OB/Water Left",   key:"tee_water_out_left",   filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"OB/Water Right",  key:"tee_water_out_right",  filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 && e.roundHole.tee_accuracy==="Right" },
    { label:"OB/Water Across", key:"tee_water_out_across", filterFn:(e:EnrichedHole)=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0 },
    { label:"Trees Left",      key:"tee_tree_hazard_left", filterFn:(e:EnrichedHole)=>Number(e.roundHole.tree_haz)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"Trees Right",     key:"tee_tree_hazard_right",filterFn:(e:EnrichedHole)=>Number(e.roundHole.tree_haz)>0 && e.roundHole.tee_accuracy==="Right" },
    { label:"Bunker Left",     key:"tee_bunkers_left",     filterFn:(e:EnrichedHole)=>Number(e.roundHole.fairway_bunker)>0 && e.roundHole.tee_accuracy==="Left" },
    { label:"Bunker Right",    key:"tee_bunkers_right",    filterFn:(e:EnrichedHole)=>Number(e.roundHole.fairway_bunker)>0 && e.roundHole.tee_accuracy==="Right" },
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
    .slice(0,4);
}

function GridCell({ likelihood, impact, count, greyed }: { likelihood:number; impact:number; count:number; greyed?:boolean }) {
  const fmtSTP = (s:number) => s>=0?`+${s.toFixed(2)}`:s.toFixed(2);
  if (greyed) return (
    <div style={{ background:"#f0f0f0", borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40 }}>
      <p style={{ fontSize:9, color:"#bbb", margin:0 }}>N/A</p>
    </div>
  );
  const lowCount = count <= 2;
  const colors = isNaN(impact) ? { bg:"#f6f6f6", color:"#aaa" } : impactColor(impact, lowCount);
  return (
    <div style={{ background:colors.bg, borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40, display:"flex", flexDirection:"column", justifyContent:"center" }}>
      {count>0 ? <>
        <p style={{ fontSize:10, fontWeight:600, color:colors.color, margin:0 }}>{isNaN(impact)?"-":fmtSTP(impact)}</p>
        <p style={{ fontSize:9, color:colors.color, margin:0, opacity:0.85 }}>{count}</p>
      </> : <p style={{ fontSize:9, color:"#bbb", margin:0 }}>—</p>}
    </div>
  );
}

function RoundScorecard({ roundHoles, courseName, teeBox, date, allVersions, roundId }: {
  roundHoles: RoundHole[]; courseName: string; teeBox: string; date: string;
  allVersions: CourseRecord[]; roundId: string;
}) {
  const is18 = roundHoles.length === 18;
  const sortedTees = [...allVersions].sort((a,b) =>
    b.holes.reduce((s:number,h:any)=>s+(h.yards||0),0) - a.holes.reduce((s:number,h:any)=>s+(h.yards||0),0)
  );
  type Col = {type:"hole";rh:RoundHole}|{type:"spacer";label:string;parSum:number;scoreSum:number;yardsMap:Record<string,number>};
  const cols: Col[] = [];
  const makeSpacerYards = (sliceHoles: RoundHole[]) => {
    const nums = new Set(sliceHoles.map(h=>h.hole));
    return Object.fromEntries(sortedTees.map(t=>[t.tee_box, t.holes.filter((h:any)=>nums.has(h.hole)).reduce((s:number,h:any)=>s+(h.yards||0),0)]));
  };
  if (is18) {
    roundHoles.slice(0,9).forEach(h=>cols.push({type:"hole",rh:h}));
    cols.push({type:"spacer",label:"Out",parSum:roundHoles.slice(0,9).reduce((s,h)=>s+h.par,0),scoreSum:roundHoles.slice(0,9).reduce((s,h)=>s+(Number(h.score)||0),0),yardsMap:makeSpacerYards(roundHoles.slice(0,9))});
    roundHoles.slice(9).forEach(h=>cols.push({type:"hole",rh:h}));
    cols.push({type:"spacer",label:"In",parSum:roundHoles.slice(9).reduce((s,h)=>s+h.par,0),scoreSum:roundHoles.slice(9).reduce((s,h)=>s+(Number(h.score)||0),0),yardsMap:makeSpacerYards(roundHoles.slice(9))});
  } else {
    roundHoles.forEach(h=>cols.push({type:"hole",rh:h}));
  }
  cols.push({type:"spacer",label:"Total",parSum:roundHoles.reduce((s,h)=>s+h.par,0),scoreSum:roundHoles.reduce((s,h)=>s+(Number(h.score)||0),0),yardsMap:makeSpacerYards(roundHoles)});
  const c: React.CSSProperties = {padding:"5px 3px",textAlign:"center",fontSize:11,borderRight:"1px solid #e0e0e0",whiteSpace:"nowrap",};
  const hdr: React.CSSProperties = { ...c, background:"#1a3a2a", color:"white", fontWeight:600 };
  const lbl: React.CSSProperties = {...c,background:"#f0f0f0",fontWeight:600,color:"#333",textAlign:"left",paddingLeft:8,minWidth:72,fontSize:10};
  const sp: React.CSSProperties = {...c,background:"#e8f5f0",fontWeight:700,color:"#0f6e56"};
  const totalScore = roundHoles.reduce((s,h)=>s+(Number(h.score)||0),0);
  const totalPar = roundHoles.reduce((s,h)=>s+h.par,0);
  const toPar = totalScore-totalPar;
  return (
    <main style={{maxWidth:960,margin:"40px auto",fontFamily:"sans-serif",padding:"0 24px"}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a1a",margin:"0 0 2px"}}>{courseName}</h1>
        <p style={{fontSize:14,color:"#666",margin:0}}>{teeBox} tees · {date}</p>
        <p style={{fontSize:20,fontWeight:700,color:toPar>0?"#c0392b":toPar<0?"#27ae60":"#333",margin:"8px 0 0"}}>
          {totalScore} ({toPar===0?"E":toPar>0?`+${toPar}`:toPar})
        </p>
      </div>
      <div style={{overflowX:"auto",marginBottom:28,borderRadius:10,border:"1px solid #ddd",boxShadow:"0 2px 8px #0001"}}>
        <table style={{borderCollapse:"collapse",width:"100%",tableLayout:"auto"}}>
          <tbody>
            <tr><td style={lbl}>Hole</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={hdr}>{col.rh.hole}</td>:<td key={ci} style={sp}>{col.label}</td>)}</tr>
            <tr><td style={lbl}>Index</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={{...c,background:"#fafafa",color:"#555"}}>{col.rh.stroke_index}</td>:<td key={ci} style={{...c,background:"#e8f5f0"}}></td>)}</tr>
            <tr><td style={lbl}>Par</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={{...c,fontWeight:600}}>{col.rh.par}</td>:<td key={ci} style={sp}>{col.parSum}</td>)}</tr>
            {sortedTees.map((tee,ti)=>(
              <tr key={tee.id} style={{background:ti%2===0?"#fff":"#f9f9f9"}}>
                <td style={{...lbl,background:ti%2===0?"#fff":"#f9f9f9"}}><span style={{fontSize:10,color:"#0f6e56",fontWeight:600}}>{tee.tee_box}</span></td>
                {cols.map((col,ci)=>{
                  if(col.type==="hole"){const th=tee.holes.find((h:any)=>h.hole===col.rh.hole);return<td key={ci} style={c}>{th?.yards||"—"}</td>;}
                  return<td key={ci} style={{...sp,fontSize:12}}>{col.yardsMap[tee.tee_box]||"—"}</td>;
                })}
              </tr>
            ))}
            <tr style={{borderTop:"2px solid #0f6e56"}}>
              <td style={{...lbl,background:"#f0f9f6"}}>Score</td>
              {cols.map((col,ci)=>col.type==="hole"
                ?<td key={ci} style={{...c,fontWeight:700,color:col.rh.score!==""?scoreColor(Number(col.rh.score),col.rh.par):"#aaa"}}>{col.rh.score!==""?col.rh.score:"—"}</td>
                :<td key={ci} style={sp}>{col.scoreSum||"—"}</td>)}
            </tr>
            <tr><td style={lbl}>Driv Club</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={c}>{col.rh.club||"—"}</td>:<td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}</tr>
            <tr style={{background:"#f9f9f9"}}>
              <td style={{...lbl,background:"#f9f9f9"}}>Driv Acc</td>
              {cols.map((col,ci)=>col.type==="hole"
                ?<td key={ci} style={{...c,background:"#f9f9f9",color:col.rh.tee_accuracy==="Hit"?"#27ae60":col.rh.tee_accuracy?"#c0392b":"#aaa"}}>{col.rh.tee_accuracy||"—"}</td>
                :<td key={ci} style={{...c,background:"#e8f5f0"}}></td>)}
            </tr>
            <tr><td style={lbl}>Appr Club</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={c}>{col.rh.appr_distance||"—"}</td>:<td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}</tr>
            <tr style={{background:"#f9f9f9"}}>
              <td style={{...lbl,background:"#f9f9f9"}}>Appr Acc</td>
              {cols.map((col,ci)=>col.type==="hole"
                ?<td key={ci} style={{...c,background:"#f9f9f9",color:col.rh.appr_accuracy==="Hit"?"#27ae60":col.rh.appr_accuracy?"#c0392b":"#aaa"}}>{col.rh.appr_accuracy||"—"}</td>
                :<td key={ci} style={{...c,background:"#e8f5f0"}}></td>)}
            </tr>
            <tr><td style={lbl}>Chips</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={c}>{col.rh.chips!==""?col.rh.chips:"—"}</td>:<td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}</tr>
            <tr style={{background:"#f9f9f9"}}>
              <td style={{...lbl,background:"#f9f9f9"}}>Putts</td>
              {cols.map((col,ci)=>col.type==="hole"
                ?<td key={ci} style={{...c,background:"#f9f9f9"}}>{col.rh.putts!==""?col.rh.putts:"—"}</td>
                :<td key={ci} style={sp}>{col.type==="spacer"?roundHoles.filter(h=>is18?(col.label==="Out"?h.hole<=9:col.label==="In"?h.hole>9:true):true).reduce((s,h)=>s+(Number(h.putts)||0),0)||"—":"—"}</td>)}
            </tr>
            <tr><td style={lbl}>1st Putt</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={c}>{col.rh.first_putt_distance||"—"}</td>:<td key={ci} style={{...c,background:"#f5f5f5"}}></td>)}</tr>
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        <a href={`/rounds/${roundId}/edit`} style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"#0f6e56",color:"white",border:"1px solid #0f6e56",borderRadius:8,textDecoration:"none"}}>Edit this round</a>
        <a href="/rounds" style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"white",color:"#1a1a1a",border:"1px solid #1a1a1a",borderRadius:8,textDecoration:"none"}}>All rounds</a>
        <a href="/" style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"white",color:"#666",border:"1px solid #ccc",borderRadius:8,textDecoration:"none"}}>Strategy</a>
      </div>
    </main>
  );
}

// ── Main component — ALL hooks must come before any conditional returns ────────
function PlayCourseInner() {
  const searchParams = useSearchParams();
  const initCourseId = searchParams.get("courseId") ?? "";
  const initRoundId = searchParams.get("roundId") ?? "";
  const isEditMode = !!initRoundId;

  // ── ALL useState hooks ────────────────────────────────────────────────────────
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseId, setCourseId] = useState(initCourseId);
  const [roundDate, setRoundDate] = useState(new Date().toISOString().split("T")[0]);
  const [holesPlayed, setHolesPlayed] = useState<9|18>(18);
  const [startingHole, setStartingHole] = useState(1);
  const [started, setStarted] = useState(isEditMode); // start in playing mode if editing
  const [loadingRound, setLoadingRound] = useState(isEditMode);
  const [holeNotesOpen, setHoleNotesOpen] = useState(false);
  const [holeNotesText, setHoleNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [currentHoleIdx, setCurrentHoleIdx] = useState(0);
  const [roundHoles, setRoundHoles] = useState<RoundHole[]>([]);
  const [roundId, setRoundId] = useState<string|null>(initRoundId||null);
  const [showScore, setShowScore] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showThisHoleOnly, setShowThisHoleOnly] = useState(false);
  const [approachDist, setApproachDist] = useState<number|null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);

  // ── ALL useEffect hooks ───────────────────────────────────────────────────────
  useEffect(() => {
    loadCourses().then(data => { setCourses(data); });
  }, []);

  useEffect(() => {
    if (!initRoundId) return;
    supabase.from("rounds").select("*").eq("id", initRoundId).single().then(async ({ data, error }) => {
      if (!error && data) {
        setCourseId(data.course_id ?? "");
        setRoundDate(data.date ?? new Date().toISOString().split("T")[0]);
        setHolesPlayed(data.holes_played ?? 18);
        setStartingHole(data.starting_hole ?? 1);
        setRoundHoles(data.holes ?? []);
        setRoundId(initRoundId);
        const allCourses = await loadCourses();
        setAllTeeVersions(allCourses.filter(c => c.name === data.course_name));
        if (data.holes?.length > 0) {
          fetchStrategy(data.holes[0].hole, data.course_id);
        }
      }
      setLoadingRound(false);
    });
  }, [initRoundId]);

  // ── ALL useMemo hooks ─────────────────────────────────────────────────────────
  const selectedCourse = useMemo(() => courses.find(c => c.id === courseId), [courses, courseId]);

  const enriched: EnrichedHole[] = useMemo(() => strategy?.enrichedHoles ?? [], [strategy]);
  const holeHistory = useMemo(() => strategy?.holeHistory ?? [], [strategy]);

  const displayEnriched = useMemo(() => {
    if (!showThisHoleOnly) return enriched;
    return enriched.filter((e: EnrichedHole) => e.isExactHole);
  }, [enriched, showThisHoleOnly]);

  const baseline = useMemo(() => {
    if (!displayEnriched.length) return 0;
    return wAvg(displayEnriched, scoreToPar);
  }, [displayEnriched]);

  const gridData = useMemo(() => computeGridData(displayEnriched, baseline), [displayEnriched, baseline]);

  const hole = useMemo(() => strategy?.hole, [strategy]);

  const hazardImpacts = useMemo(() => computeHazardImpacts(displayEnriched, hole, baseline), [displayEnriched, hole, baseline]);

  const t = useMemo(() => {
    if (!displayEnriched.length) return null;
    const valid = displayEnriched.filter(e => e.roundHole.score !== "");
    if (!valid.length) return null;
    const wp = (pred: (e: EnrichedHole) => boolean, denom?: (e: EnrichedHole) => boolean) => {
      let n = 0, d = 0;
      for (const e of valid) { const ok = denom ? denom(e) : true; if (ok) { d += e.similarityScore; if (pred(e)) n += e.similarityScore; } }
      return d > 0 ? n / d : 0;
    };
    const drv = (e: EnrichedHole) => e.roundHole.par >= 4;
    return {
      avgScoreToPar: wAvg(valid, scoreToPar),
      driveHitPct: wp(e => e.roundHole.tee_accuracy === "Hit", drv),
      driveMissLeftPct: wp(e => e.roundHole.tee_accuracy === "Left", drv),
      driveMissRightPct: wp(e => e.roundHole.tee_accuracy === "Right", drv),
      driveWaterPct: wp(e => (Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0, drv),
      driveTreePct: wp(e => (Number(e.roundHole.tree_haz)||0)>0, drv),
      driveBunkerPct: wp(e => (Number(e.roundHole.fairway_bunker)||0)>0, drv),
      apprHitPct: wp(e => e.roundHole.appr_accuracy === "Hit"),
      apprMissLeftPct: wp(e => e.roundHole.appr_accuracy === "Left"),
      apprMissRightPct: wp(e => e.roundHole.appr_accuracy === "Right"),
      apprMissShortPct: wp(e => e.roundHole.appr_accuracy === "Short"),
      apprMissLongPct: wp(e => e.roundHole.appr_accuracy === "Long"),
      girPct: wp(e => !!e.roundHole.gir),
      apprWaterPct: wp(e => (Number(e.roundHole.water_penalty)||0)>0),
      apprBunkerPct: wp(e => (Number(e.roundHole.greenside_bunker)||0)>0),
      apprTreePct: wp(e => (Number(e.roundHole.tree_haz)||0)>0),
      avgPutts: wAvg(valid, e => e.roundHole.putts !== "" ? Number(e.roundHole.putts) : null),
    };
  }, [displayEnriched]);

  // ── Derived values (not hooks) ────────────────────────────────────────────────
  const currentHole = roundHoles[currentHoleIdx];
  const isLastHole = currentHoleIdx === roundHoles.length - 1;
  const strat = strategy?.strategy;
  const course = strategy?.course;
  const ds = strategy?.data_summary;
  const conf = strat?.confidence;
  const isPar3 = currentHole?.par === 3;
  const scorecardCourse = selectedCourse ?? allTeeVersions[0] ?? null;

  // ── Helper functions ──────────────────────────────────────────────────────────
  async function fetchStrategy(holeNum: number, cId?: string) {
    setLoadingStrategy(true); setStrategy(null);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: cId ?? courseId, hole: holeNum }),
      });
      const data = await res.json();
      setStrategy(data);
      setApproachDist(data.defaultApproachDist ?? null);
      // Load notes from all tee boxes of this course and merge
      const { data: allTeeNotes } = await supabase.from("courses").select("hole_notes").eq("name", selectedCourse?.name ?? "");
      const mergedNotes: Record<string,string> = {};
      for (const row of allTeeNotes ?? []) {
        if (row.hole_notes) Object.assign(mergedNotes, row.hole_notes);
      }
      setHoleNotesText(mergedNotes[String(holeNum)] ?? "");
      setHoleNotesOpen(false);
    } catch {}
    setLoadingStrategy(false);
  }

  async function startRound() {
    if (!selectedCourse) return;
    const holes = (() => {
      const courseHoles = selectedCourse.holes;
      const hs = holesPlayed===9 ? courseHoles.slice(startingHole-1, startingHole-1+9) : courseHoles;
      return hs.map(h => blankHole(h));
    })();
    setRoundHoles(holes);
    setCurrentHoleIdx(0);
    const id = `round_${Date.now()}`;
    setRoundId(id);
    await supabase.from("rounds").insert({
      id, course_id: courseId,
      course_name: selectedCourse.name,
      tee_box: selectedCourse.tee_box ?? "",
      date: roundDate, holes_played: holesPlayed, starting_hole: startingHole, holes,
    });
    const allCourses = await loadCourses();
    setAllTeeVersions(allCourses.filter(c => c.name === selectedCourse.name));
    setStarted(true);
    fetchStrategy(holes[0].hole, courseId);
  }

  async function saveHoleNotes() {
    if (!hole) return;
    setSavingNotes(true);
    // Save to all tee boxes of this course
    const { data: allTees } = await supabase.from("courses").select("id").eq("name", selectedCourse?.name ?? "");
    for (const tee of allTees ?? []) {
      await supabase.rpc('upsert_hole_note', {
        p_course_id: tee.id,
        p_hole: hole.hole,
        p_note: holeNotesText,
      });
    }
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
    setSavingNotes(false);
  }

  async function cancelRound() {
    if (isEditMode) { window.location.href = `/rounds/${roundId}/edit`; return; }
    if (!roundId) { setStarted(false); return; }
    if (!confirm("Cancel this round? It will be deleted.")) return;
    await supabase.from("rounds").delete().eq("id", roundId);
    setStarted(false); setRoundId(null); setRoundHoles([]);
  }

  async function saveCurrentHole() {
    if (!roundId) return;
    setSaving(true);
    await supabase.from("rounds").update({ holes: roundHoles }).eq("id", roundId);
    setSaving(false);
  }

  async function postScore() {
    await saveCurrentHole();
    setShowScorecard(true);
  }

  function updateHoleField(field: keyof RoundHole, value: any) {
    setRoundHoles(prev => prev.map((h, i) => {
      if (i !== currentHoleIdx) return h;
      const updated = { ...h, [field]: value };
      updated.gir = calcGir(updated.score, updated.par, updated.putts);
      updated.grints = calcGrints(updated.score, updated.par);
      return updated;
    }));
  }

  async function goToHole(idx: number) {
    await saveCurrentHole();
    setCurrentHoleIdx(idx);
    setShowScore(false);
    if (roundHoles[idx]) fetchStrategy(roundHoles[idx].hole, courseId);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width:"100%", padding:"6px 8px", fontSize:14, border:"1px solid #ddd", borderRadius:6, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const disabledSelectStyle: React.CSSProperties = { ...inputStyle, background:"#f0f0f0", color:"#bbb" };
  const labelStyle: React.CSSProperties = { fontSize:12, color:"#666", display:"block", marginBottom:3 };
  const sl: React.CSSProperties = { fontSize:11, fontWeight:600, color:"#0f6e56", textTransform:"uppercase", letterSpacing:1, margin:"0 0 6px" };
  const card = (bg: string): React.CSSProperties => ({ background:bg, borderRadius:12, padding:"12px 16px" });
  const btnStyle = (primary: boolean, small = false): React.CSSProperties => ({
    padding: small ? "6px 12px" : "10px 16px", fontSize: small ? 13 : 15, fontWeight: 600,
    background: primary ? "#1a1a1a" : "white", color: primary ? "white" : "#1a1a1a",
    border: "1px solid #1a1a1a", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-block",
  });
  const confidenceColor: Record<string,string> = { high:"#0f6e56", medium:"#e67e22", low:"#c0392b" };

  // ── NOW safe to do conditional returns ────────────────────────────────────────

  if (loadingRound) return (
    <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <p style={{ color:"#666" }}>Loading round...</p>
    </main>
  );

  if (showScorecard && roundId && scorecardCourse) {
    return (
      <RoundScorecard
        roundHoles={roundHoles}
        courseName={scorecardCourse.name}
        teeBox={scorecardCourse.tee_box ?? ""}
        date={roundDate}
        allVersions={allTeeVersions.length > 0 ? allTeeVersions : [scorecardCourse]}
        roundId={roundId}
      />
    );
  }

  if (showScorecard && roundId && !scorecardCourse) return (
    <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <p style={{ color:"#666" }}>Loading scorecard...</p>
    </main>
  );

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
            <select style={selectStyle} value={courseId} onChange={e => setCourseId(e.target.value)}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={roundDate} onChange={e => setRoundDate(e.target.value)} style={{ ...inputStyle, maxWidth:160 }} />
          </div>
          <div>
            <label style={labelStyle}>Holes</label>
            <select style={selectStyle} value={holesPlayed} onChange={e => setHolesPlayed(Number(e.target.value) as 9|18)}>
              <option value={9}>9 holes</option>
              <option value={18}>18 holes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Starting hole</label>
            <select style={selectStyle} value={startingHole} onChange={e => setStartingHole(Number(e.target.value))}>
              {Array.from({ length: selectedCourse?.holes.length ?? 18 }, (_, i) => i + 1).map(n => (
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

  // ── Club distance map ─────────────────────────────────────────────────────
  const CLUB_DIST: Record<string,number> = {
    Driver:230,"3W":210,"5W":195,"7W":180,
    "4i":185,"5i":175,"6i":165,"7i":155,
    "8i":145,"9i":130,PW:120,SW:100,LW:80,
  };

function scoreBg(score: number|"", par: number): string {
    if (score === "") return "#e0e0e0";
    const d = Number(score) - par;
    if (d <= -2) return "#0096FF";
    if (d === -1) return "#1a7a3f";
    if (d === 0)  return "#44cc44";
    if (d === 1)  return "#d0d0d0";
    if (d === 2)  return "#f97316";
    return "#c0392b";
  }
  function scoreTxtColor(score: number|"", par: number): string {
    if (score === "") return "#aaa";
    const d = Number(score) - par;
    if (d === 1) return "#1a1a1a";
    return "white";
  }
  function accLabel(v: string): string {
    if (v === "Hit")   return "C";
    if (v === "Left")  return "L";
    if (v === "Right") return "R";
    if (v === "Short") return "D";
    if (v === "Long")  return "U";
    return "—";
  }
  function accColor(v: string): string {
    if (v === "Hit") return "#27ae60";
    if (v === "Left" || v === "Right") return "#2980b9";
    if (v === "Short" || v === "Long") return "#e67e22";
    return "#aaa";
  }

  function updateHoleFieldTracked(field: keyof RoundHole, value: any) {
    updateHoleField(field, value);
    setHasUnsaved(true);
  }
  async function saveAndClear() {
    await saveCurrentHole();
    setHasUnsaved(false);
  }

  // ── Playing screen ────────────────────────────────────────────────────────
  return (
    <main style={{ fontFamily:"sans-serif", padding:0 }}>

      {/* ── Sticky scorecard ── */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"white", borderBottom:"2px solid #0f6e56", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>

        {/* Top bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px" }}>
          <a href={isEditMode ? `/rounds/${roundId}/edit` : "/"} style={{ fontSize:12, color:"#666" }}>
            ← {isEditMode ? "Edit" : "Exit"}
          </a>
          <span style={{ fontSize:12, fontWeight:700, color:"#0f6e56" }}>
            {selectedCourse?.name ?? ""} · Hole {currentHole?.hole}
          </span>
          <span style={{ fontSize:12, color: saving ? "#e67e22" : "#aaa" }}>
            {saving ? "Saving..." : "Auto-saved"}
          </span>
        </div>

        {/* Unsaved banner */}
        {hasUnsaved && (
          <div style={{ background:"#fff8e1", borderTop:"1px solid #f0c040", padding:"6px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:"#7a5c00" }}>⚠ Unsaved changes</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setHasUnsaved(false)} style={{ fontSize:12, color:"#999", background:"none", border:"none", cursor:"pointer" }}>Keep editing</button>
              <button onClick={saveAndClear} style={{ fontSize:12, fontWeight:700, color:"#0f6e56", background:"none", border:"1px solid #0f6e56", borderRadius:6, padding:"2px 10px", cursor:"pointer" }}>Save now</button>
            </div>
          </div>
        )}

        {/* Scrollable scorecard */}
        <div style={{ overflowX:"auto" }}>
          <table style={{ borderCollapse:"collapse", fontSize:11, whiteSpace:"nowrap" }}>
            <tbody>
              {/* Hole numbers */}
              <tr style={{ background:"#0f6e56" }}>
                <td style={{ padding:"4px 8px", color:"white", fontWeight:700, fontSize:10, position:"sticky", left:0, background:"#0f6e56", zIndex:2, minWidth:38 }}>#</td>
                {roundHoles.map((h, i) => (
                  <td key={i} onClick={() => goToHole(i)}
                    style={{ padding:"4px 8px", textAlign:"center", color: i===currentHoleIdx ? "#ffeb3b" : "white", fontWeight:700, cursor:"pointer", borderLeft:"1px solid rgba(255,255,255,0.15)", minWidth:30, background: i===currentHoleIdx ? "rgba(255,255,255,0.15)" : "transparent" }}>
                    {h.hole}
                  </td>
                ))}
              </tr>
              {/* Yds */}
              <tr style={{ background:"#f9f9f9" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"#f9f9f9", zIndex:2 }}>Yds</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#444", borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>{h.yards}</td>
                ))}
              </tr>
              {/* Par */}
              <tr>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"white", zIndex:2 }}>Par</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", fontWeight:600, color:"#333", borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>{h.par}</td>
                ))}
              </tr>
              {/* Idx */}
              <tr style={{ background:"#f9f9f9" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"#f9f9f9", zIndex:2 }}>Idx</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#666", borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>{h.stroke_index}</td>
                ))}
              </tr>
              {/* Club */}
              <tr>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#0f6e56", fontWeight:600, position:"sticky", left:0, background:"white", zIndex:2 }}>Club</td>
                {roundHoles.map((h, i) => {
                  const ch = selectedCourse?.holes.find(x => x.hole === h.hole);
                  return (
                    <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#0f6e56", fontWeight:600, fontSize:10, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                      {(ch as any)?.preferred_club || "—"}
                    </td>
                  );
                })}
              </tr>
              {/* Land */}
              <tr>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#0f6e56", fontWeight:600, position:"sticky", left:0, background:"white", zIndex:2 }}>Land</td>
                {roundHoles.map((h, i) => {
                  const ch = selectedCourse?.holes.find(x => x.hole === h.hole);
                  return (
                    <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#555", fontWeight:600, fontSize:10, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                      {(ch as any)?.preferred_landing || "—"}
                    </td>
                  );
                })}
              </tr>
              {/* Rem */}
              <tr style={{ background:"#f9f9f9" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#0f6e56", fontWeight:600, position:"sticky", left:0, background:"#f9f9f9", zIndex:2 }}>Rem</td>
                {roundHoles.map((h, i) => {
                  const ch = selectedCourse?.holes.find(x => x.hole === h.hole);
                  const club = (ch as any)?.preferred_club ?? "";
                  const rem = club && CLUB_DIST[club] ? h.yards - CLUB_DIST[club] : null;
                  return (
                    <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#555", fontSize:10, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                      {rem !== null ? rem : "—"}
                    </td>
                  );
                })}
              </tr>
              {/* Score */}
              <tr style={{ borderTop:"2px solid #0f6e56" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#333", fontWeight:700, position:"sticky", left:0, background:"white", zIndex:2 }}>Score</td>
                {roundHoles.map((h, i) => (
                  <td key={i} onClick={() => goToHole(i)} style={{ padding:"3px 4px", textAlign:"center", cursor:"pointer", borderLeft:"1px solid #eee" }}>
                    <div style={{ background: scoreBg(h.score, h.par), color: scoreTxtColor(h.score, h.par), borderRadius:4, minWidth:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, margin:"0 auto" }}>
                      {h.score !== "" ? h.score : "·"}
                    </div>
                  </td>
                ))}
              </tr>
              {/* Appr */}
              <tr style={{ background:"#f9f9f9" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"#f9f9f9", zIndex:2 }}>Appr</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#555", fontSize:10, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                    {h.appr_distance || "—"}
                  </td>
                ))}
              </tr>
              {/* Acc */}
              <tr>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"white", zIndex:2 }}>Acc</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                    <span style={{ fontSize:11, fontWeight:700, color: accColor(h.appr_accuracy) }}>
                      {accLabel(h.appr_accuracy)}
                    </span>
                  </td>
                ))}
              </tr>
              {/* Chips */}
              <tr style={{ background:"#f9f9f9" }}>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"#f9f9f9", zIndex:2 }}>Chips</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", color: Number(h.chips) > 0 ? "#b8860b" : "#aaa", fontWeight: Number(h.chips) > 0 ? 700 : 400, fontSize:10, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                    {h.chips !== "" ? h.chips : "—"}
                  </td>
                ))}
              </tr>
              {/* Haz */}
              <tr>
                <td style={{ padding:"3px 8px", fontSize:10, color:"#666", fontWeight:600, position:"sticky", left:0, background:"white", zIndex:2 }}>Haz</td>
                {roundHoles.map((h, i) => (
                  <td key={i} style={{ padding:"3px 6px", textAlign:"center", color:"#e67e22", fontSize:10, fontWeight:600, borderLeft:"1px solid #eee", background: i===currentHoleIdx ? "#e8f5e9" : "transparent" }}>
                    {hazardCode(h)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Hole detail ── */}
      <div style={{ maxWidth:520, margin:"0 auto", padding:"12px 16px" }}>

        {/* Score entry */}
        {currentHole && (
          <div key={"hole-" + currentHoleIdx + "-" + currentHole.score} style={{ background:"#f9f9f9", border:"1px solid #eee", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <p style={{ fontSize:13, fontWeight:700, color:"#0f6e56", margin:0 }}>
                Hole {currentHole.hole} · Par {currentHole.par} · {currentHole.yards} yds · SI {currentHole.stroke_index}
              </p>
              {isLastHole ? (
                <button onClick={postScore} style={{ padding:"5px 12px", fontSize:12, fontWeight:600, background:"#0f6e56", color:"white", border:"1px solid #0f6e56", borderRadius:8, cursor:"pointer" }}>
                  Post Score ✓
                </button>
              ) : (
                <button onClick={() => { if (hasUnsaved) saveAndClear(); goToHole(currentHoleIdx + 1); }}
                  style={{ padding:"5px 12px", fontSize:12, fontWeight:600, background:"#0f6e56", color:"white", border:"none", borderRadius:8, cursor:"pointer" }}>
                  Next →
                </button>
              )}
            </div>

            <p style={{ fontSize:10, fontWeight:600, color:"#aaa", letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Scoring</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              {[{label:"Score",field:"score",min:1,max:20},{label:"Putts",field:"putts",min:0,max:10},{label:"Chips",field:"chips",min:0,max:10}].map(({label,field,min,max}) => (
                <div key={field}>
                  <label style={{ fontSize:10, color: field==="chips" ? "#b8860b" : "#666", fontWeight:600, display:"block", marginBottom:3 }}>{label}</label>
                  <input type="number" min={min} max={max}
                    style={{ width:"100%", padding:"6px 4px", fontSize:15, border: field==="chips" ? "2px solid #f0c040" : "1px solid #ddd", borderRadius:8, textAlign:"center", background: field==="chips" ? "#fffde7" : "white", color:"#1a1a1a" }}
                    value={(currentHole as any)[field] === "" || (currentHole as any)[field] == null ? "" : Number((currentHole as any)[field])}
                    onChange={e => updateHoleFieldTracked(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:10, color:"#666", fontWeight:600, display:"block", marginBottom:3 }}>1st Putt</label>
                <select style={{ width:"100%", padding:"6px 2px", fontSize:11, border:"1px solid #ddd", borderRadius:8, background:"white", color:"#0f6e56" }}
                  value={currentHole.first_putt_distance}
                  onChange={e => updateHoleFieldTracked("first_putt_distance", e.target.value)}>
                  <option value="">—</option>
                  {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <p style={{ fontSize:10, fontWeight:600, color:"#aaa", letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Tee & Approach</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:10, color: isPar3 ? "#ccc" : "#666", fontWeight:600, display:"block", marginBottom:3 }}>DRIV Club</label>
                <select style={{ width:"100%", padding:"6px 2px", fontSize:11, border:"1px solid #ddd", borderRadius:8, background: isPar3 ? "#f5f5f5" : "white", color:"#0f6e56" }}
                  value={isPar3?"":currentHole.club} disabled={isPar3}
                  onChange={e => !isPar3 && updateHoleFieldTracked("club", e.target.value)}>
                  <option value="">—</option>
                  {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:10, color: isPar3 ? "#ccc" : "#666", fontWeight:600, display:"block", marginBottom:3 }}>DRIV Acc</label>
                <select style={{ width:"100%", padding:"6px 2px", fontSize:11, border:"1px solid #ddd", borderRadius:8, background: isPar3 ? "#f5f5f5" : "white", color:"#0f6e56" }}
                  value={isPar3?"":currentHole.tee_accuracy} disabled={isPar3}
                  onChange={e => !isPar3 && updateHoleFieldTracked("tee_accuracy", e.target.value)}>
                  <option value="">—</option>
                  {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:10, color:"#b8860b", fontWeight:700, display:"block", marginBottom:3 }}>APPR Club</label>
                <select style={{ width:"100%", padding:"6px 2px", fontSize:11, border:"2px solid #f0c040", borderRadius:8, background:"#fffde7", color:"#0f6e56" }}
                  value={currentHole.appr_distance}
                  onChange={e => updateHoleFieldTracked("appr_distance", e.target.value)}>
                  <option value="">—</option>
                  {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:10, color:"#b8860b", fontWeight:700, display:"block", marginBottom:3 }}>APPR Acc</label>
                <select style={{ width:"100%", padding:"6px 2px", fontSize:11, border:"2px solid #f0c040", borderRadius:8, background:"#fffde7", color:"#0f6e56" }}
                  value={currentHole.appr_accuracy}
                  onChange={e => updateHoleFieldTracked("appr_accuracy", e.target.value)}>
                  <option value="">—</option>
                  {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <p style={{ fontSize:10, fontWeight:600, color:"#aaa", letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Penalties</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
              {[{label:"Water",field:"water_penalty"},{label:"Drop/OB",field:"drop_or_out"},{label:"Tree/Haz",field:"tree_haz"},{label:"FWY Bkr",field:"fairway_bunker"},{label:"GS Bkr",field:"greenside_bunker"}].map(({label,field}) => (
                <div key={field}>
                  <label style={{ fontSize:10, color: field==="tree_haz" ? "#b8860b" : "#666", fontWeight: field==="tree_haz" ? 700 : 600, display:"block", marginBottom:3 }}>{label}</label>
                  <input type="number" min={0} max={10}
                    style={{ width:"100%", padding:"6px 4px", fontSize:14, border: field==="tree_haz" ? "2px solid #f0c040" : "1px solid #ddd", borderRadius:8, textAlign:"center", background: field==="tree_haz" ? "#fffde7" : "white", color:"#1a1a1a" }}
                    value={(currentHole as any)[field] === "" || (currentHole as any)[field] == null ? "" : Number((currentHole as any)[field])}
                    onChange={e => updateHoleFieldTracked(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
                </div>
              ))}
            </div>
          </div>
        )}

        {loadingStrategy && <p style={{ color:"#aaa", fontSize:13, textAlign:"center", marginTop:24 }}>Loading strategy...</p>}

        {!loadingStrategy && strategy && hole && strat && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:confidenceColor[conf]??"#666", textTransform:"uppercase" }}>{conf} confidence</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, color:"#aaa" }}>
                  {ds?.exact_hole_history>0?`${ds.exact_hole_history}× this hole · `:""}{displayEnriched.length} similar
                </span>
                <button onClick={() => setShowThisHoleOnly(v=>!v)}
                  style={{ fontSize:11, padding:"2px 8px", borderRadius:12, border:"1px solid #0f6e56", background:showThisHoleOnly?"#0f6e56":"white", color:showThisHoleOnly?"white":"#0f6e56", cursor:"pointer", fontWeight:600 }}>
                  {showThisHoleOnly?"This hole only":"All similar"}
                </button>
              </div>
            </div>

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

            <div style={{ ...card("#f0f0f0"), display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px" }}>
              <span style={{ fontSize:13, color:"#aaa" }}>Avg on {showThisHoleOnly?"this hole":"similar holes"}</span>
              <span style={{ fontSize:20, fontWeight:700, color:(t?.avgScoreToPar??0)>0?"#c0392b":"#27ae60" }}>
                {t?fmtSTP(t.avgScoreToPar??0):ds?.avg_score_to_par}
              </span>
            </div>

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

            {/* Hole Notes */}
            <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 16px"}}>
              <button onClick={()=>setHoleNotesOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:0}}>
                <span style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1}}>Hole Notes {holeNotesText?"✓":""}</span>
                <span style={{fontSize:13,color:"#999"}}>{holeNotesOpen?"▲":"▼"}</span>
              </button>
              {holeNotesOpen&&(
                <div style={{marginTop:10}}>
                  <textarea value={holeNotesText} onChange={e=>setHoleNotesText(e.target.value)}
                    placeholder="Add notes about this hole..."
                    rows={8}
                    style={{width:"100%",padding:"8px 10px",fontSize:13,border:"1px solid #ddd",borderRadius:8,boxSizing:"border-box",resize:"vertical",fontFamily:"sans-serif",lineHeight:1.5}}
                  />
                  <button onClick={saveHoleNotes} disabled={savingNotes}
                    style={{marginTop:6,padding:"6px 16px",fontSize:12,fontWeight:600,background:"#0f6e56",color:"white",border:"none",borderRadius:6,cursor:"pointer",opacity:savingNotes?0.6:1}}>
                    {notesSaved?"Saved!":savingNotes?"Saving...":"Save Notes"}
                  </button>
                </div>
              )}
            </div>

            {hole.par>=4&&(
              <div style={card("#f6f6f6")}>
                <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:"0 0 8px" }}>TEE STRATEGY</p>
                {hazardImpacts.length>0&&(
                  <div style={{ marginBottom:14 }}>
                    <p style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:1, margin:"0 0 6px" }}>TEE SHOT HAZARDS</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
                      {hazardImpacts.map((h,i)=>{
                        const colors=impactColor(h.impact);
                        return(
                          <div key={i} style={{background:colors.bg,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:12,color:colors.color,fontWeight:500}}>{h.label}</span>
                            <div style={{textAlign:"right"}}>
                              <p style={{fontSize:13,fontWeight:700,color:colors.color,margin:0}}>{fmtSTP(h.impact)}</p>
                              <p style={{fontSize:10,color:colors.color,opacity:0.75,margin:0}}>{h.count} holes</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ marginTop:8 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:3, marginBottom:3 }}>
                    {["Club","Left","Hit","Right","Unk"].map(h=>(
                      <div key={h} style={{fontSize:9,fontWeight:600,color:"#aaa",textAlign:"center",textTransform:"uppercase"}}>{h}</div>
                    ))}
                  </div>
                  {gridData.map(row=>(
                    <div key={row.club} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,marginBottom:3}}>
                      <div style={{background:"#f6f6f6",borderRadius:4,padding:"3px 4px",display:"flex",flexDirection:"column",justifyContent:"center",textAlign:"center"}}>
                        <p style={{fontSize:10,fontWeight:600,color:"#1a1a1a",margin:0}}>{row.club}</p>
                        <p style={{fontSize:9,color:"#aaa",margin:0}}>{row.count}</p>
                      </div>
                      {row.cols.map((col,ci)=>{
                        const isLeftCol=ci===0, isRightCol=ci===2;
                        const leftHazard=hole.tee_water_out_left||hole.tee_tree_hazard_left||hole.tee_bunkers_left;
                        const rightHazard=hole.tee_water_out_right||hole.tee_tree_hazard_right||hole.tee_bunkers_right;
                        const greyed=(isLeftCol&&!leftHazard)||(isRightCol&&!rightHazard);
                        return<GridCell key={ci} likelihood={col.likelihood} impact={col.impact} count={col.count} greyed={greyed}/>;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                    <div key={label} style={{background:"#eee",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#999"}}>{label}: </span><span style={{fontWeight:600,color:c}}>{pct(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              {t&&(
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {(hole.approach_water_out_left||hole.approach_water_out_right||hole.approach_water_out_short||hole.approach_water_out_long)&&(
                    <div style={{background:"#fff3e0",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#999"}}>OB/Water: </span><span style={{fontWeight:600,color:"#e67e22"}}>{pct(t.apprWaterPct)}</span>
                    </div>
                  )}
                  {(hole.approach_bunker_short_left||hole.approach_bunker_short_middle||hole.approach_bunker_short_right||hole.approach_bunker_middle_left||hole.approach_bunker_middle_right||hole.approach_bunker_long_left||hole.approach_bunker_long_middle||hole.approach_bunker_long_right)&&(
                    <div style={{background:"#fef9e7",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#999"}}>Bunker: </span><span style={{fontWeight:600,color:"#c8a84b"}}>{pct(t.apprBunkerPct)}</span>
                    </div>
                  )}
                  {(hole.approach_tree_hazard_left||hole.approach_tree_hazard_right||hole.approach_tree_hazard_long)&&(
                    <div style={{background:"#eafaf1",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#999"}}>Trees/Haz: </span><span style={{fontWeight:600,color:"#27ae60"}}>{pct(t.apprTreePct)}</span>
                    </div>
                  )}
                </div>
              )}
              <p style={{ fontSize:13, color:"#666", margin:"8px 0 0" }}>{strat.approach_strategy?.reason}</p>
            </div>

            {strat.warning&&(
              <div style={{background:"#fff4e5",border:"1px solid #f0a500",borderRadius:12,padding:"14px 20px"}}>
                <p style={{fontSize:11,color:"#b37400",fontWeight:700,letterSpacing:1,margin:"0 0 6px"}}>⚠ WATCH OUT</p>
                <p style={{fontSize:13,color:"#7a4f00",margin:0}}>{strat.warning}</p>
              </div>
            )}

            {ds?.insights?.length>0&&(
              <div style={card("#f0f9f6")}>
                <p style={{fontSize:11,color:"#0f6e56",fontWeight:700,letterSpacing:1,margin:"0 0 8px"}}>YOUR TENDENCIES ON SIMILAR HOLES</p>
                <ul style={{margin:0,paddingLeft:16}}>
                  {ds.insights.map((ins:string,i:number)=><li key={i} style={{fontSize:13,color:"#333",marginBottom:4}}>{ins}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:24, textAlign:"center" }}>
          <button onClick={cancelRound} style={{ fontSize:13, color:"#c0392b", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>
            {isEditMode?"← Back to edit round":"Cancel round"}
          </button>
        </div>

      </div>
    </main>
  );
}

export default function PlayCourse() {
  return (
    <Suspense fallback={<main style={{maxWidth:520,margin:"60px auto",fontFamily:"sans-serif",padding:"0 24px"}}><p style={{color:"#666"}}>Loading...</p></main>}>
      <PlayCourseInner />
    </Suspense>
  );
}
