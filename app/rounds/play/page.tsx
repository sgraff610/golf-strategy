"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadCourses, getClubDistances } from "@/lib/storage";
import type { ClubDistances } from "@/lib/planTypes";
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
  preferred_club_override: string;
  plan_club: string;
  scoring_opp: 0 | 0.5 | 1 | "";
  diff_max: 2 | 3 | "";
  opportunity: string;
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
    preferred_club_override:"", plan_club:"",
    scoring_opp:"", diff_max:"", opportunity:"",
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

const APPR_DIRS = [
  { key:"Long",  label:"Far",   col:2, row:1 },
  { key:"Left",  label:"Left",  col:1, row:2 },
  { key:"Hit",   label:"Hit",   col:2, row:2 },
  { key:"Right", label:"Right", col:3, row:2 },
  { key:"Short", label:"Short", col:2, row:3 },
] as const;

function computeApprDirs(enriched: EnrichedHole[], baseline: number, clubFilter?: string) {
  const holes = clubFilter
    ? enriched.filter(e => (e.roundHole.appr_distance || "") === clubFilter)
    : enriched;
  return APPR_DIRS.map(({ key, label, col, row }) => {
    const matching = holes.filter(e => (e.roundHole.appr_accuracy || "") === key);
    const count = matching.length;
    const avg = count > 0 ? wAvg(matching, scoreToPar) : NaN;
    const impact = !isNaN(avg) ? avg - baseline : NaN;
    return { key, label, col, row, count, impact };
  });
}

function GridCell({ likelihood, impact, count, greyed }: { likelihood:number; impact:number; count:number; greyed?:boolean }) {
  const fmtSTP = (s:number) => s>=0?`+${s.toFixed(2)}`:s.toFixed(2);
  if (greyed) return (
    <div style={{ background:"#f0f0f0", borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40 }}>
      <p style={{ fontSize:9, color:"#0f6e56", margin:0 }}>N/A</p>
    </div>
  );
  const lowCount = count <= 2;
  const colors = isNaN(impact) ? { bg:"#f6f6f6", color:"#0f6e56" } : impactColor(impact, lowCount);
  return (
    <div style={{ background:colors.bg, borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40, display:"flex", flexDirection:"column", justifyContent:"center" }}>
      {count>0 ? <>
        <p style={{ fontSize:10, fontWeight:600, color:colors.color, margin:0 }}>{isNaN(impact)?"-":fmtSTP(impact)}</p>
        <p style={{ fontSize:9, color:colors.color, margin:0, opacity:0.85 }}>{count}</p>
      </> : <p style={{ fontSize:9, color:"#0f6e56", margin:0 }}>—</p>}
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

  const [showCalc, setShowCalc] = useState(false);
  const courseHoles: any[] = allVersions[0]?.holes ?? [];
  const CALC_DIST: Record<string,number> = { Driver:230,"3W":210,"5W":195,"7W":180,"4i":185,"5i":175,"6i":165,"7i":155,"8i":145,"9i":130,PW:120,SW:100,LW:80 };

  function calcEstRem(rh: RoundHole): number | null {
    if (rh.par < 4 || !rh.club || !CALC_DIST[rh.club]) return null;
    const rem = rh.yards - CALC_DIST[rh.club];
    return rem > 0 ? rem : 0;
  }
  function calcWaterRisk(rh: RoundHole, ch: any): number {
    if (!ch || rh.tee_accuracy === "Hit" || !rh.tee_accuracy) return 0;
    const penalties = (Number(rh.water_penalty)||0) + (Number(rh.drop_or_out)||0);
    if (!penalties) return 0;
    const match = (rh.tee_accuracy === "Left" && ch.tee_water_out_left) ||
                  (rh.tee_accuracy === "Right" && ch.tee_water_out_right);
    return match ? 100 : 0;
  }
  function calcTreeRisk(rh: RoundHole, ch: any): number {
    if (!ch || rh.tee_accuracy === "Hit" || !rh.tee_accuracy || !Number(rh.tree_haz)) return 0;
    if (rh.tee_accuracy === "Left"  && ch.tee_tree_hazard_left)  return 75;
    if (rh.tee_accuracy === "Right" && ch.tee_tree_hazard_right) return 75;
    return 0;
  }
  function calcBunkerRisk(rh: RoundHole, ch: any): number {
    if (!ch || rh.tee_accuracy === "Hit" || !rh.tee_accuracy || !Number(rh.fairway_bunker)) return 0;
    if (rh.tee_accuracy === "Left"  && ch.tee_bunkers_left)  return 100;
    if (rh.tee_accuracy === "Right" && ch.tee_bunkers_right) return 100;
    return 0;
  }

  return (
    <main style={{maxWidth:960,margin:"40px auto",fontFamily:"sans-serif",padding:"0 24px"}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:22,fontWeight:700,color:"#d0d0d0",margin:"0 0 2px"}}>{courseName}</h1>
        <p style={{fontSize:14,color:"white",margin:0}}>{teeBox} tees · {date}</p>
        <p style={{fontSize:20,fontWeight:700,color:toPar>0?"#c0392b":toPar<0?"#27ae60":"#333",margin:"8px 0 0"}}>
          {totalScore} ({toPar===0?"E":toPar>0?`+${toPar}`:toPar})
        </p>
      </div>
      <div style={{overflowX:"auto",marginBottom:28,borderRadius:10,border:"1px solid #ddd",boxShadow:"0 2px 8px #0001"}}>
        <table style={{borderCollapse:"collapse",width:"100%",tableLayout:"auto"}}>
          <tbody>
            <tr><td style={lbl}>Hole</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={hdr}>{col.rh.hole}</td>:<td key={ci} style={sp}>{col.label}</td>)}</tr>
            <tr><td style={lbl}>Index</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={{...c,background:"#fafafa",color:"#0f6e56"}}>{col.rh.stroke_index}</td>:<td key={ci} style={{...c,background:"#e8f5f0"}}></td>)}</tr>
            <tr><td style={lbl}>Par</td>{cols.map((col,ci)=>col.type==="hole"?<td key={ci} style={{...c,fontWeight:600}}>{col.rh.par}</td>:<td key={ci} style={sp}>{col.parSum}</td>)}</tr>
            {sortedTees.map((tee,ti)=>(
              <tr key={tee.id} style={{background:ti%2===0?"#fff":"#f9f9f9"}}>
                <td style={{...lbl,background:ti%2===0?"#fff":"#f9f9f9"}}><span style={{fontSize:10,color:"#0f6e56",fontWeight:600}}>{tee.tee_box}</span></td>
                {cols.map((col,ci)=>{
                  if(col.type==="hole"){const th=tee.holes.find((h:any)=>h.hole===col.rh.hole);return<td key={ci} style={{...c,color:"#1a1a1a"}}>{th?.yards||"—"}</td>;}
                  return<td key={ci} style={{...sp,fontSize:12,color:"#1a1a1a"}}>{col.yardsMap[tee.tee_box]||"—"}</td>;
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
            {showCalc && <>
              <tr>
                <td colSpan={cols.length+1} style={{padding:"4px 8px",background:"#e8f5f0",fontSize:9,fontWeight:700,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1,borderTop:"2px solid #0f6e56"}}>Calculations</td>
              </tr>
              <tr>
                <td style={lbl}>Est Rem</td>
                {cols.map((col,ci) => {
                  if (col.type==="spacer") return <td key={ci} style={{...c,background:"#f5f5f5"}}></td>;
                  const rem = calcEstRem(col.rh);
                  return <td key={ci} style={{...c,color:"#0f6e56",fontWeight:rem!==null?600:400}}>{rem!==null?rem:"—"}</td>;
                })}
              </tr>
              <tr style={{background:"#f9f9f9"}}>
                <td style={{...lbl,background:"#f9f9f9"}}>Water</td>
                {cols.map((col,ci) => {
                  if (col.type==="spacer") return <td key={ci} style={{...c,background:"#e8f5f0"}}></td>;
                  const ch = courseHoles.find((h:any)=>h.hole===col.rh.hole);
                  const v = calcWaterRisk(col.rh, ch);
                  return <td key={ci} style={{...c,background:"#f9f9f9",color:v>0?"#e67e22":"#aaa",fontWeight:v>0?700:400}}>{v>0?`${v}%`:"—"}</td>;
                })}
              </tr>
              <tr>
                <td style={lbl}>Trees</td>
                {cols.map((col,ci) => {
                  if (col.type==="spacer") return <td key={ci} style={{...c,background:"#f5f5f5"}}></td>;
                  const ch = courseHoles.find((h:any)=>h.hole===col.rh.hole);
                  const v = calcTreeRisk(col.rh, ch);
                  return <td key={ci} style={{...c,color:v>0?"#27ae60":"#aaa",fontWeight:v>0?700:400}}>{v>0?`${v}%`:"—"}</td>;
                })}
              </tr>
              <tr style={{background:"#f9f9f9"}}>
                <td style={{...lbl,background:"#f9f9f9"}}>Bkr</td>
                {cols.map((col,ci) => {
                  if (col.type==="spacer") return <td key={ci} style={{...c,background:"#e8f5f0"}}></td>;
                  const ch = courseHoles.find((h:any)=>h.hole===col.rh.hole);
                  const v = calcBunkerRisk(col.rh, ch);
                  return <td key={ci} style={{...c,background:"#f9f9f9",color:v>0?"#c8a84b":"#aaa",fontWeight:v>0?700:400}}>{v>0?`${v}%`:"—"}</td>;
                })}
              </tr>
            </>}
          </tbody>
        </table>
      </div>
      <div style={{marginBottom:16}}>
        <button onClick={()=>setShowCalc(v=>!v)} style={{padding:"8px 18px",fontSize:13,fontWeight:600,borderRadius:8,border:"1.5px solid #0f6e56",background:showCalc?"#0f6e56":"transparent",color:showCalc?"white":"#0f6e56",cursor:"pointer"}}>
          {showCalc?"Hide Calculations":"Include Calculations"}
        </button>
        {showCalc && <p style={{fontSize:11,color:"#0f6e56",margin:"6px 0 0",fontStyle:"italic"}}>Est Rem = estimated approach yardage · Water/Trees/Bkr = % confidence hazard was implicated</p>}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        <a href={`/rounds/${roundId}/edit`} style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"#0f6e56",color:"white",border:"1px solid #0f6e56",borderRadius:8,textDecoration:"none"}}>Edit this round</a>
        <a href="/rounds" style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"white",color:"#1a1a1a",border:"1px solid #1a1a1a",borderRadius:8,textDecoration:"none"}}>All rounds</a>
        <a href="/" style={{padding:"10px 20px",fontSize:14,fontWeight:600,background:"white",color:"#0f6e56",border:"1px solid #0f6e56",borderRadius:8,textDecoration:"none"}}>Strategy</a>
      </div>
    </main>
  );
}

const PLAY_TOKENS = `
  .play-root {
    --bg:#eef1f4; --paper:#f7f9fb; --paper-alt:#e6ebf0;
    --ink:#131821; --ink-soft:#253041; --muted:#5d6b7a; --muted-2:#8995a3;
    --line:#d7dde3; --line-soft:#e5eaef;
    --green:#0f6e56; --green-deep:#084634; --green-soft:#d2e8df;
    --accent:#f29450; --accent-soft:#fde0c8;
    --sand:#c8a84b; --sand-soft:#f5ecd0;
    --flag:#c94a2a; --good:#1e8449;
    --font-display: var(--font-fraunces, Georgia, serif);
    --font-ui: var(--font-inter, system-ui, sans-serif);
    background: var(--bg); color: var(--ink); font-family: var(--font-ui);
    min-height: 100vh;
  }
`;

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
  const [courseHandicap, setCourseHandicap] = useState<number|null>(null);
  const [showScore, setShowScore] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showThisHoleOnly, setShowThisHoleOnly] = useState(false);
  const [approachDist, setApproachDist] = useState<number|null>(null);
  const [approachClub, setApproachClub] = useState<string>("");
  const [apprTooltip, setApprTooltip] = useState<{x:number;y:number;label:string;impact:number;count:number}|null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);
  const [clubDistances, setClubDistances] = useState<ClubDistances | null>(null);
  const [scoreInputMode, setScoreInputMode] = useState<"quick"|"full">("full");
  const [activeSection, setActiveSection] = useState<"tee"|"approach"|"score">("tee");
  const [scorecardPanel, setScorecardPanel] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number|null>(null);

  // ── ALL useEffect hooks ───────────────────────────────────────────────────────
  useEffect(() => {
    loadCourses().then(data => { setCourses(data); });
    getClubDistances().then(setClubDistances);
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
        console.log("round handicap fields:", (data as any).course_handicap, (data as any).handicap_index, (data as any).score_differential);
        setCourseHandicap((data as any).course_handicap ?? (data as any).handicap_index ?? null);
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

  useEffect(() => {
    if (roundHoles.length === 18) setScorecardPanel(currentHoleIdx < 9 ? 0 : 1);
  }, [currentHoleIdx, roundHoles.length]);

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
  const teeFilled = isPar3
    ? !!(currentHole?.tee_accuracy)
    : !!(currentHole?.club && currentHole?.tee_accuracy);
  const scoreFilled = !!(currentHole?.score !== "" && currentHole?.score !== undefined &&
    currentHole?.putts !== "" && currentHole?.putts !== undefined);
  const inputPhase: "tee" | "approach" | "normal" =
    !currentHole || scoreFilled ? "normal" : teeFilled ? "approach" : "tee";
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
      const dist = data.defaultApproachDist ?? null;
      setApproachDist(dist);
      if (dist && clubDistances) {
        const mids = Object.fromEntries(Object.entries(clubDistances).map(([k,v])=>[k,Math.round((v.min+v.max)/2)]));
        let best="", bestDiff=Infinity;
        for (const [c,d] of Object.entries(mids)) { const df=Math.abs((d as number)-dist); if(df<bestDiff){bestDiff=df;best=c;} }
        setApproachClub(best);
      } else {
        setApproachClub("");
      }
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
      if (field === "scoring_opp") {
        const opp = value as 0 | 0.5 | 1;
        const max = updated.diff_max;
        if (max === 2 || max === 3) {
          if (opp === 0 && max === 2) updated.opportunity = "birdie";
          else if ((opp === 0.5 || opp === 1) && max === 2) updated.opportunity = "go-for-it";
          else if ((opp === 0 || opp === 0.5) && max === 3) updated.opportunity = "caution";
          else updated.opportunity = "danger";
        }
      }
      return updated;
    }));
  }

  async function goToHole(idx: number) {
    await saveCurrentHole();
    setCurrentHoleIdx(idx);
    setShowScore(false);
    setActiveSection("tee");
    if (roundHoles[idx]) fetchStrategy(roundHoles[idx].hole, courseId);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width:"100%", padding:"6px 8px", fontSize:14, border:"1px solid #ddd", borderRadius:6, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const disabledSelectStyle: React.CSSProperties = { ...inputStyle, background:"#f0f0f0", color:"#bbb" };
  const labelStyle: React.CSSProperties = { fontSize:12, color:"white", display:"block", marginBottom:3 };
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
      <p style={{ color:"white" }}>Loading round...</p>
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
      <p style={{ color:"white" }}>Loading scorecard...</p>
    </main>
  );

  // ── Setup screen ──────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
        <div style={{ marginBottom:24 }}>
          <a href="/" style={{ fontSize:13, color:"white" }}>← Back to Strategy</a>
        </div>
        <h1 style={{ fontSize:22, fontWeight:600, marginBottom:4, color:"#d0d0d0" }}>Play Course</h1>
        <p style={{ color:"white", marginBottom:24, fontSize:13 }}>Set up your round and start playing.</p>
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

  // ── Club distance map (midpoint of saved ranges) ──────────────────────────
  const CLUB_DIST: Record<string,number> = Object.fromEntries(
    Object.entries(clubDistances ?? {}).map(([k, v]) => [k, Math.round((v.min + v.max) / 2)])
  );

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
    if (v === "Short") return "Sh";
    if (v === "Long")  return "Lo";
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
    <main className="play-root" style={{ padding:0 }}>
      <style dangerouslySetInnerHTML={{ __html: PLAY_TOKENS }} />

      {/* ── Sticky scorecard ── */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"var(--paper)", borderBottom:"2px solid var(--green)", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
        <div style={{ maxWidth:520, margin:"0 auto" }}>

        {/* Top bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 16px" }}>
          <a href={isEditMode ? `/rounds/${roundId}/edit` : "/"} style={{ fontSize:12, color:"var(--green)" }}>
            ← {isEditMode ? "Edit" : "Exit"}
          </a>
          <span style={{ fontSize:12, fontWeight:700, color:"var(--green)", fontFamily:"var(--font-display)", fontStyle:"italic" }}>
            {selectedCourse?.name ?? ""} · Hole {currentHole?.hole}
          </span>
          <span style={{ fontSize:12, color: saving ? "var(--accent)" : "var(--muted)" }}>
            {saving ? "Saving..." : "Saved"}
          </span>
        </div>

        {/* Unsaved banner */}
        {hasUnsaved && (
          <div style={{ background:"var(--accent-soft)", borderTop:"1px solid var(--accent)", padding:"6px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:"#7a5c00" }}>⚠ Unsaved changes</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setHasUnsaved(false)} style={{ fontSize:12, color:"var(--green)", background:"none", border:"none", cursor:"pointer" }}>Keep editing</button>
              <button onClick={saveAndClear} style={{ fontSize:12, fontWeight:700, color:"var(--green)", background:"none", border:"1px solid var(--green)", borderRadius:6, padding:"2px 10px", cursor:"pointer" }}>Save now</button>
            </div>
          </div>
        )}

        {/* Panel nav for 18-hole rounds */}
        {roundHoles.length === 18 && (
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"2px 16px 1px" }}>
            <button onClick={() => setScorecardPanel(0)}
              style={{ fontSize:10, fontWeight:700, color: scorecardPanel===0 ? "var(--green)" : "var(--muted)", background:"none", border:"none", cursor:"pointer", padding:"2px 4px" }}>
              Front 9
            </button>
            <div style={{ display:"flex", gap:5, alignItems:"center" }}>
              {[0,1].map(i => (
                <div key={i} onClick={() => setScorecardPanel(i)}
                  style={{ width:7, height:7, borderRadius:"50%", background: scorecardPanel===i ? "var(--green)" : "var(--line)", cursor:"pointer", transition:"background 0.15s" }} />
              ))}
            </div>
            <button onClick={() => setScorecardPanel(1)}
              style={{ fontSize:10, fontWeight:700, color: scorecardPanel===1 ? "var(--green)" : "var(--muted)", background:"none", border:"none", cursor:"pointer", padding:"2px 4px" }}>
              Back 9
            </button>
          </div>
        )}

        {/* Swipeable scorecard */}
        {(() => {
          const ph = roundHoles.length === 18
            ? (scorecardPanel === 0 ? roundHoles.slice(0,9) : roundHoles.slice(9))
            : roundHoles;
          const panelLabel = roundHoles.length === 18 ? (scorecardPanel === 0 ? "Out" : "In") : "Tot";
          const parSum = ph.reduce((s,h)=>s+h.par,0);
          const scoreSum = ph.reduce((s,h)=>s+(Number(h.score)||0),0);
          const chipsSum = ph.reduce((s,h)=>s+(Number(h.chips)||0),0);
          const chipsGsSum = ph.reduce((s,h)=>s+(Number(h.chips)||0)+(Number(h.greenside_bunker)||0),0);
          const puttsSum = ph.reduce((s,h)=>s+(Number(h.putts)||0),0);
          const hzdObSum = ph.reduce((s,h)=>s+(Number(h.tree_haz)||0)+(Number(h.water_penalty)||0)+(Number(h.drop_or_out)||0),0);
          const tc: React.CSSProperties = { padding:"3px 5px", textAlign:"center", fontSize:11, whiteSpace:"nowrap" };
          const lc: React.CSSProperties = { padding:"3px 8px", fontSize:10, color:"var(--green)", fontWeight:600, position:"sticky", left:0, zIndex:2, whiteSpace:"nowrap", background:"var(--paper)" };
          const sc: React.CSSProperties = { ...tc, background:"var(--green-soft)", fontWeight:700, color:"var(--green-deep)", borderLeft:"2px solid var(--green)", minWidth:28 };
          const hi = (ai:number) => ai===currentHoleIdx;
          const cBg = (ai:number, base:string) => hi(ai) ? "var(--green-soft)" : base;
          return (
            <div style={{ overflowX:"auto", margin:"0 16px" }}
              onTouchStart={e => setTouchStartX(e.touches[0].clientX)}
              onTouchEnd={e => {
                if (touchStartX===null||roundHoles.length!==18) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(dx)>40) setScorecardPanel(dx<0?1:0);
                setTouchStartX(null);
              }}>
              <table style={{ borderCollapse:"collapse", fontSize:11, whiteSpace:"nowrap", width:"100%" }}>
                <tbody>
                  <tr style={{ background:"var(--green)" }}>
                    <td style={{ ...lc, background:"var(--green)", color:"white" }}>#</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return (
                      <td key={i} onClick={()=>goToHole(ai)}
                        style={{ ...tc, color:hi(ai)?"#ffeb3b":"white", fontWeight:700, cursor:"pointer", borderLeft:"1px solid rgba(255,255,255,0.15)", minWidth:28, background:hi(ai)?"rgba(255,255,255,0.2)":"transparent" }}>
                        {h.hole}
                      </td>
                    ); })}
                    <td style={{ ...sc, background:"var(--green-deep)", color:"white" }}>{panelLabel}</td>
                  </tr>
                  <tr>
                    <td style={{ ...lc, background:"var(--paper-alt)" }}>Yds</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, color:"var(--muted)", borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{h.yards}</td>; })}
                    <td style={sc}></td>
                  </tr>
                  <tr>
                    <td style={{ ...lc }}>Par</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, fontWeight:600, color:"var(--ink)", borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>{h.par}</td>; })}
                    <td style={sc}>{parSum}</td>
                  </tr>
                  <tr>
                    <td style={{ ...lc, background:"var(--paper-alt)" }}>Idx</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const isAggressive=h.diff_max===2; return (
                      <td key={i} style={{ padding:"2px 3px", textAlign:"center", borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>
                        {isAggressive
                          ? <div style={{ background:"transparent", border:"2px solid #22C55E", color:"#065f46", borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, margin:"0 auto" }}>{h.stroke_index}</div>
                          : <span style={{ fontSize:10, color:"var(--muted)" }}>{h.stroke_index}</span>
                        }
                      </td>
                    ); })}
                    <td style={sc}></td>
                  </tr>
                  <tr>
                    <td style={{ ...lc }}>Scoring</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const OPP_BOLD: Record<string,string>={birdie:"#60a5fa","go-for-it":"#34d399",caution:"#fbbf24",danger:"#f87171"}; const oppBg=h.opportunity?OPP_BOLD[h.opportunity]:null; const scoringVal=h.scoring_opp!==""?(h.scoring_opp===0?"E":`+${h.scoring_opp}`):"—"; return <td key={i} style={{ ...tc, borderLeft:"1px solid var(--line)", background:oppBg??cBg(ai,"var(--paper)"), fontWeight:h.scoring_opp!==""?700:400, color:h.scoring_opp!==""?"#000":"var(--muted-2)" }}>{scoringVal}</td>;})}
                    <td style={{ ...sc }}>{(()=>{ const sum=ph.reduce((s,h)=>s+(h.scoring_opp!==""?Number(h.scoring_opp):0),0); if(!ph.some(h=>h.scoring_opp!=="")) return "—"; const d=sum%1===0?String(sum):sum.toFixed(1); return sum===0?"E":sum>0?`+${d}`:d; })()}</td>
                  </tr>
                  <tr>
                    <td style={{ ...lc, background:"var(--paper-alt)" }}>Club</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const ch2=selectedCourse?.holes.find((x:any)=>x.hole===h.hole); const dispClub=h.preferred_club_override||(ch2 as any)?.preferred_club||""; const dispClubShort=dispClub==="Driver"?"Driv":dispClub; return <td key={i} style={{ ...tc, color:"var(--green)", fontWeight:600, fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{dispClubShort||"—"}</td>; })}
                    <td style={sc}></td>
                  </tr>
                  <tr>
                    <td style={{ ...lc }}>Land</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const ch2=selectedCourse?.holes.find((x:any)=>x.hole===h.hole); return <td key={i} style={{ ...tc, color:"var(--green)", fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>{(ch2 as any)?.preferred_landing||"—"}</td>; })}
                    <td style={sc}></td>
                  </tr>
                  <tr>
                    <td style={{ ...lc, background:"var(--paper-alt)" }}>Rem</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const ch2=selectedCourse?.holes.find((x:any)=>x.hole===h.hole); const club2=(ch2 as any)?.preferred_club??""; const rem=club2&&CLUB_DIST[club2]?h.yards-CLUB_DIST[club2]:null; return <td key={i} style={{ ...tc, color:"var(--green)", fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{rem!==null?rem:"—"}</td>; })}
                    <td style={sc}></td>
                  </tr>
                  <tr>
                    <td style={{ ...lc }}>Aim</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const ch2=selectedCourse?.holes.find((x:any)=>x.hole===h.hole); const aimDir=((ch2 as any)?.aim_dir)??""; const aimLevel=((ch2 as any)?.aim_level)??0; const noAim=!aimDir||aimLevel===0; const aimBg=noAim?"transparent":aimLevel===1?"#f5c842":"#e03c2d"; const aimColor=noAim?"var(--muted)":aimLevel===1?"#000":"#fff"; return (
                      <td key={i} onClick={()=>goToHole(ai)} style={{ padding:"2px 3px", textAlign:"center", cursor:"pointer", borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>
                        <div style={{ background:aimBg, color:aimColor, borderRadius:999, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:10, margin:"0 auto" }}>{noAim?"⛳":aimDir}</div>
                      </td>
                    ); })}
                    <td style={sc}></td>
                  </tr>
                  <tr style={{ borderTop:"2px solid var(--green)" }}>
                    <td style={{ ...lc, color:"var(--ink)", fontWeight:700 }}>Score</td>
                    {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return (
                      <td key={i} onClick={()=>goToHole(ai)} style={{ padding:"2px 3px", textAlign:"center", cursor:"pointer", borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>
                        <div style={{ background:scoreBg(h.score,h.par), color:scoreTxtColor(h.score,h.par), borderRadius:3, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, margin:"0 auto" }}>{h.score!==""?h.score:"·"}</div>
                      </td>
                    ); })}
                    <td style={{ ...sc, color:scoreSum>parSum?"var(--flag)":scoreSum<parSum?"var(--good)":"var(--ink-soft)" }}>{scoreSum>0?scoreSum:"—"}</td>
                  </tr>
                  {scoreInputMode === "full" ? (<>
                    <tr>
                      <td style={{ ...lc, background:"var(--paper-alt)" }}>Putts</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const v=Number(h.putts)||0; return <td key={i} style={{ ...tc, color:v>0?"var(--ink)":"var(--muted-2)", fontWeight:v>0?600:400, fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{v>0?v:"—"}</td>; })}
                      <td style={{ ...sc }}>{puttsSum>0?puttsSum:"—"}</td>
                    </tr>
                    <tr>
                      <td style={{ ...lc }}>Chip/GS</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const v=(Number(h.chips)||0)+(Number(h.greenside_bunker)||0); return <td key={i} style={{ ...tc, color:v>0?"var(--sand)":"var(--muted-2)", fontWeight:v>0?700:400, fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>{v>0?v:"—"}</td>; })}
                      <td style={{ ...sc, color:"var(--sand)" }}>{chipsGsSum>0?chipsGsSum:"—"}</td>
                    </tr>
                    <tr>
                      <td style={{ ...lc, background:"var(--paper-alt)" }}>Hzd/OB</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); const v=(Number(h.tree_haz)||0)+(Number(h.water_penalty)||0)+(Number(h.drop_or_out)||0); return <td key={i} style={{ ...tc, color:v>0?"var(--accent)":"var(--muted-2)", fontWeight:v>0?700:400, fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{v>0?v:"—"}</td>; })}
                      <td style={{ ...sc, color:"var(--accent)" }}>{hzdObSum>0?hzdObSum:"—"}</td>
                    </tr>
                  </>) : (<>
                    <tr>
                      <td style={{ ...lc, background:"var(--paper-alt)" }}>Appr</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, color:"var(--green)", fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{h.appr_distance||"—"}</td>; })}
                      <td style={sc}></td>
                    </tr>
                    <tr>
                      <td style={{ ...lc }}>Acc</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}><span style={{ fontSize:11, fontWeight:700, color:accColor(h.appr_accuracy) }}>{accLabel(h.appr_accuracy)}</span></td>; })}
                      <td style={sc}></td>
                    </tr>
                    <tr>
                      <td style={{ ...lc, background:"var(--paper-alt)" }}>Chips</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, color:Number(h.chips)>0?"var(--sand)":"var(--muted-2)", fontWeight:Number(h.chips)>0?700:400, fontSize:10, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper-alt)") }}>{h.chips!==""?h.chips:"—"}</td>; })}
                      <td style={{ ...sc, color:"var(--sand)" }}>{chipsSum>0?chipsSum:"—"}</td>
                    </tr>
                    <tr>
                      <td style={{ ...lc }}>Haz</td>
                      {ph.map((h,i)=>{ const ai=roundHoles.indexOf(h); return <td key={i} style={{ ...tc, color:"var(--accent)", fontSize:10, fontWeight:600, borderLeft:"1px solid var(--line)", background:cBg(ai,"var(--paper)") }}>{hazardCode(h)}</td>; })}
                      <td style={sc}></td>
                    </tr>
                  </>)}
                </tbody>
              </table>
            </div>
          );
        })()}
        </div>
      </div>

      {/* ── Hole detail ── */}
      <div style={{ maxWidth:520, margin:"0 auto", padding:"12px 16px", display:"flex", flexDirection:"column" }}>

        {/* Score entry */}
        {currentHole && (
          <div key={"hole-" + currentHoleIdx + "-" + currentHole.score} style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"14px 16px", marginBottom:12, order:0 }}>

            {/* Header row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <p style={{ fontSize:13, fontWeight:700, color:"var(--green)", margin:0, fontFamily:"var(--font-display)", fontStyle:"italic" }}>
                Hole {currentHole.hole} · Par {currentHole.par} · {currentHole.yards} yds
              </p>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {/* Mode toggle */}
                <div style={{ display:"flex", border:"1px solid var(--line)", borderRadius:6, overflow:"hidden" }}>
                  <button onClick={() => setScoreInputMode("quick")}
                    style={{ padding:"3px 10px", fontSize:10, fontWeight:600, background:scoreInputMode==="quick"?"var(--green)":"transparent", color:scoreInputMode==="quick"?"white":"var(--muted)", border:"none", cursor:"pointer" }}>
                    Quick
                  </button>
                  <button onClick={() => setScoreInputMode("full")}
                    style={{ padding:"3px 10px", fontSize:10, fontWeight:600, background:scoreInputMode==="full"?"var(--green)":"transparent", color:scoreInputMode==="full"?"white":"var(--muted)", border:"none", cursor:"pointer", borderLeft:"1px solid var(--line)" }}>
                    Full
                  </button>
                </div>
                {isLastHole ? (
                  <button onClick={postScore} style={{ padding:"5px 12px", fontSize:12, fontWeight:600, background:"var(--green)", color:"white", border:"none", borderRadius:8, cursor:"pointer" }}>
                    Post ✓
                  </button>
                ) : (
                  <button onClick={() => { if (hasUnsaved) saveAndClear(); goToHole(currentHoleIdx + 1); }}
                    style={{ padding:"5px 12px", fontSize:12, fontWeight:600, background:"var(--green)", color:"white", border:"none", borderRadius:8, cursor:"pointer" }}>
                    Next →
                  </button>
                )}
              </div>
            </div>

            {scoreInputMode === "quick" ? (
              <>
                {/* Quick Update */}
                <div style={{ background:"var(--green-soft)", border:"1.5px solid var(--green)", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:"var(--green-deep)", letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Quick Update</p>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div>
                      <label style={{ fontSize:10, color:"var(--green-deep)", fontWeight:700, display:"block", marginBottom:3 }}>Chips</label>
                      <input type="number" min={0} max={10}
                        style={{ width:"100%", padding:"6px 4px", fontSize:15, border:"1.5px solid var(--green)", borderRadius:8, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"34px" }}
                        value={currentHole.chips===""||currentHole.chips==null?"":Number(currentHole.chips)}
                        onChange={e => updateHoleFieldTracked("chips", e.target.value===""?"":Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"var(--green-deep)", fontWeight:700, display:"block", marginBottom:3 }}>APPR Club</label>
                      <select style={{ width:"100%", padding:"6px 4px", fontSize:15, border:"1.5px solid var(--green)", borderRadius:8, background:"white", color:"var(--green)", boxSizing:"border-box", height:"34px" }}
                        value={currentHole.appr_distance}
                        onChange={e => updateHoleFieldTracked("appr_distance", e.target.value)}>
                        <option value="">—</option>
                        {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"var(--green-deep)", fontWeight:700, display:"block", marginBottom:3 }}>APPR Acc</label>
                      <select style={{ width:"100%", padding:"6px 4px", fontSize:15, border:"1.5px solid var(--green)", borderRadius:8, background:"white", color:"var(--green)", boxSizing:"border-box", height:"34px" }}
                        value={currentHole.appr_accuracy}
                        onChange={e => updateHoleFieldTracked("appr_accuracy", e.target.value as TeeAccuracy)}>
                        <option value="">—</option>
                        {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"var(--green-deep)", fontWeight:700, display:"block", marginBottom:3 }}>Tree/Haz</label>
                      <input type="number" min={0} max={10}
                        style={{ width:"100%", padding:"6px 4px", fontSize:15, border:"1.5px solid var(--green)", borderRadius:8, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"34px" }}
                        value={currentHole.tree_haz===""||currentHole.tree_haz==null?"":Number(currentHole.tree_haz)}
                        onChange={e => updateHoleFieldTracked("tree_haz", e.target.value===""?"":Number(e.target.value))} />
                    </div>
                  </div>
                </div>
                {/* Updated on other app */}
                <div style={{ border:"1px solid var(--line-soft)", borderRadius:10, padding:"10px 12px", background:"var(--paper-alt)" }}>
                  <p style={{ fontSize:10, fontWeight:600, color:"var(--muted)", letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Updated on other app</p>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:8 }}>
                    {[{label:"Score",field:"score",min:1,max:20},{label:"Putts",field:"putts",min:0,max:10}].map(({label,field,min,max}) => (
                      <div key={field}>
                        <label style={{ fontSize:9, color:"var(--muted)", fontWeight:600, display:"block", marginBottom:2 }}>{label}</label>
                        <input type="number" min={min} max={max}
                          style={{ width:"100%", padding:"5px 4px", fontSize:13, border:"1px solid var(--line)", borderRadius:6, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"30px" }}
                          value={(currentHole as any)[field]===""||((currentHole as any)[field]==null)?"":(Number((currentHole as any)[field]))}
                          onChange={e => updateHoleFieldTracked(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize:9, color:"var(--muted)", fontWeight:600, display:"block", marginBottom:2 }}>1st Putt</label>
                      <select style={{ width:"100%", padding:"5px 4px", fontSize:13, border:"1px solid var(--line)", borderRadius:6, background:"white", color:"var(--muted)", boxSizing:"border-box", height:"30px" }}
                        value={currentHole.first_putt_distance}
                        onChange={e => updateHoleFieldTracked("first_putt_distance", e.target.value)}>
                        <option value="">—</option>
                        {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:9, color:isPar3?"var(--muted-2)":"var(--muted)", fontWeight:600, display:"block", marginBottom:2 }}>DRIV Club</label>
                      <select style={{ width:"100%", padding:"5px 4px", fontSize:13, border:"1px solid var(--line)", borderRadius:6, background:isPar3?"var(--paper-alt)":"white", color:"var(--muted)", boxSizing:"border-box", height:"30px" }}
                        value={isPar3?"":currentHole.club} disabled={isPar3}
                        onChange={e => !isPar3 && updateHoleFieldTracked("club", e.target.value)}>
                        <option value="">—</option>
                        {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
                    <div>
                      <label style={{ fontSize:9, color:isPar3?"var(--muted-2)":"var(--muted)", fontWeight:600, display:"block", marginBottom:2 }}>DRIV Acc</label>
                      <select style={{ width:"100%", padding:"5px 4px", fontSize:13, border:"1px solid var(--line)", borderRadius:6, background:isPar3?"var(--paper-alt)":"white", color:"var(--muted)", boxSizing:"border-box", height:"30px" }}
                        value={isPar3?"":currentHole.tee_accuracy} disabled={isPar3}
                        onChange={e => !isPar3 && updateHoleFieldTracked("tee_accuracy", e.target.value as TeeAccuracy)}>
                        <option value="">—</option>
                        {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {[{label:"Water",field:"water_penalty"},{label:"Drop/OB",field:"drop_or_out"},{label:"FWY Bkr",field:"fairway_bunker"},{label:"GS Bkr",field:"greenside_bunker"}].map(({label,field}) => (
                      <div key={field}>
                        <label style={{ fontSize:9, color:"var(--muted)", fontWeight:600, display:"block", marginBottom:2 }}>{label}</label>
                        <input type="number" min={0} max={10}
                          style={{ width:"100%", padding:"5px 4px", fontSize:13, border:"1px solid var(--line)", borderRadius:6, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"30px" }}
                          value={(currentHole as any)[field]===""||((currentHole as any)[field]==null)?"":(Number((currentHole as any)[field]))}
                          onChange={e => updateHoleFieldTracked(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Section 1: Tee */}
                {(() => {
                  const isActive = activeSection === "tee";
                  return (
                    <div style={{ background: isActive ? "var(--green-soft)" : "var(--paper-alt)", border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line-soft)", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, color: isActive ? "var(--green-deep)" : "var(--muted)", letterSpacing:1, textTransform:"uppercase", margin:0 }}>Tee</p>
                        <button onClick={async () => { await saveCurrentHole(); setActiveSection("approach"); }}
                          style={{ padding:"3px 10px", fontSize:11, fontWeight:700, background:"var(--green)", color:"white", border:"none", borderRadius:6, cursor:"pointer" }}>
                          Next →
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        <div>
                          <label style={{ fontSize:10, color:isPar3?"var(--muted-2)": isActive ? "var(--green-deep)" : "var(--muted)", fontWeight:700, display:"block", marginBottom:3 }}>Tee Club</label>
                          <select style={{ width:"100%", padding:"6px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, background:isPar3?"var(--paper-alt)":"white", color:"var(--green)", boxSizing:"border-box", height:"34px" }}
                            value={isPar3?"":currentHole.club} disabled={isPar3}
                            onChange={e => !isPar3 && updateHoleFieldTracked("club", e.target.value)}>
                            <option value="">—</option>
                            {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize:10, color:isPar3?"var(--muted-2)": isActive ? "var(--green-deep)" : "var(--muted)", fontWeight:700, display:"block", marginBottom:3 }}>Tee Acc</label>
                          <select style={{ width:"100%", padding:"6px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, background:isPar3?"var(--paper-alt)":"white", color:"var(--green)", boxSizing:"border-box", height:"34px" }}
                            value={isPar3?"":currentHole.tee_accuracy} disabled={isPar3}
                            onChange={e => !isPar3 && updateHoleFieldTracked("tee_accuracy", e.target.value as TeeAccuracy)}>
                            <option value="">—</option>
                            {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* Section 2: Approach & Penalties */}
                {(() => {
                  const isActive = activeSection === "approach";
                  const numStyle: React.CSSProperties = { width:"100%", padding:"5px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"32px" };
                  const selStyle: React.CSSProperties = { width:"100%", padding:"5px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, background:"white", color:"var(--green)", boxSizing:"border-box", height:"32px" };
                  const lbl = (text: string): React.CSSProperties => ({ fontSize:10, color: isActive ? "var(--green-deep)" : "var(--muted)", fontWeight:700, display:"block", marginBottom:3 });
                  return (
                    <div style={{ background: isActive ? "var(--green-soft)" : "var(--paper-alt)", border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line-soft)", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, color: isActive ? "var(--green-deep)" : "var(--muted)", letterSpacing:1, textTransform:"uppercase", margin:0 }}>Approach &amp; Penalties</p>
                        <button onClick={async () => { await saveCurrentHole(); setActiveSection("score"); }}
                          style={{ padding:"3px 10px", fontSize:11, fontWeight:700, background:"var(--green)", color:"white", border:"none", borderRadius:6, cursor:"pointer" }}>
                          Next →
                        </button>
                      </div>
                      {/* Row 1: APPR Club | APPR Acc | FWY Bkr | Tree/Haz */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:6 }}>
                        <div>
                          <label style={lbl("APPR Club")}>APPR Club</label>
                          <select style={selStyle} value={currentHole.appr_distance}
                            onChange={e => updateHoleFieldTracked("appr_distance", e.target.value)}>
                            <option value="">—</option>
                            {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl("APPR Acc")}>APPR Acc</label>
                          <select style={selStyle} value={currentHole.appr_accuracy}
                            onChange={e => updateHoleFieldTracked("appr_accuracy", e.target.value as TeeAccuracy)}>
                            <option value="">—</option>
                            {["Hit","Left","Right","Short","Long"].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl("FWY Bkr")}>FWY Bkr</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.fairway_bunker===""||currentHole.fairway_bunker==null?"":Number(currentHole.fairway_bunker)}
                            onChange={e => updateHoleFieldTracked("fairway_bunker", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                        <div>
                          <label style={lbl("Tree/Haz")}>Tree/Haz</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.tree_haz===""||currentHole.tree_haz==null?"":Number(currentHole.tree_haz)}
                            onChange={e => updateHoleFieldTracked("tree_haz", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                      </div>
                      {/* Row 2: Water | Drop/OB | GS Bkr | Chips */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                        <div>
                          <label style={lbl("Water")}>Water</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.water_penalty===""||currentHole.water_penalty==null?"":Number(currentHole.water_penalty)}
                            onChange={e => updateHoleFieldTracked("water_penalty", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                        <div>
                          <label style={lbl("Drop/OB")}>Drop/OB</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.drop_or_out===""||currentHole.drop_or_out==null?"":Number(currentHole.drop_or_out)}
                            onChange={e => updateHoleFieldTracked("drop_or_out", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                        <div>
                          <label style={lbl("GS Bkr")}>GS Bkr</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.greenside_bunker===""||currentHole.greenside_bunker==null?"":Number(currentHole.greenside_bunker)}
                            onChange={e => updateHoleFieldTracked("greenside_bunker", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                        <div>
                          <label style={lbl("Chips")}>Chips</label>
                          <input type="number" min={0} max={10} style={numStyle}
                            value={currentHole.chips===""||currentHole.chips==null?"":Number(currentHole.chips)}
                            onChange={e => updateHoleFieldTracked("chips", e.target.value===""?"":Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* Section 3: Score */}
                {(() => {
                  const isActive = activeSection === "score";
                  return (
                    <div style={{ background: isActive ? "var(--green-soft)" : "var(--paper-alt)", border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line-soft)", borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <p style={{ fontSize:10, fontWeight:700, color: isActive ? "var(--green-deep)" : "var(--muted)", letterSpacing:1, textTransform:"uppercase", margin:0 }}>Score</p>
                        <button onClick={async () => { await saveCurrentHole(); if (isLastHole) { postScore(); } else { goToHole(currentHoleIdx + 1); } }}
                          style={{ padding:"3px 10px", fontSize:11, fontWeight:700, background:"var(--green)", color:"white", border:"none", borderRadius:6, cursor:"pointer" }}>
                          {isLastHole ? "Post ✓" : "Next →"}
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                        {[{label:"Score",field:"score",min:1,max:20},{label:"Putts",field:"putts",min:0,max:10}].map(({label,field,min,max}) => (
                          <div key={field}>
                            <label style={{ fontSize:10, color: isActive ? "var(--green-deep)" : "var(--muted)", fontWeight:600, display:"block", marginBottom:3 }}>{label}</label>
                            <input type="number" min={min} max={max}
                              style={{ width:"100%", padding:"6px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, textAlign:"center", background:"white", color:"var(--ink)", boxSizing:"border-box", height:"34px" }}
                              value={(currentHole as any)[field]===""||((currentHole as any)[field]==null)?"":(Number((currentHole as any)[field]))}
                              onChange={e => updateHoleFieldTracked(field as keyof RoundHole, e.target.value===""?"":Number(e.target.value))} />
                          </div>
                        ))}
                        <div>
                          <label style={{ fontSize:10, color: isActive ? "var(--green-deep)" : "var(--muted)", fontWeight:600, display:"block", marginBottom:3 }}>1st Putt</label>
                          <select style={{ width:"100%", padding:"6px 4px", fontSize:13, border: isActive ? "1.5px solid var(--green)" : "1px solid var(--line)", borderRadius:8, background:"white", color:"var(--green)", boxSizing:"border-box", height:"34px" }}
                            value={currentHole.first_putt_distance}
                            onChange={e => updateHoleFieldTracked("first_putt_distance", e.target.value)}>
                            <option value="">—</option>
                            {["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"].map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Club reference */}
        {currentHole && (
          <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"12px 16px", marginBottom:12, order: inputPhase === "approach" ? 11 : 1 }}>
            <p style={{ fontSize:10, fontWeight:700, color:"var(--green-deep)", letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>Tee Club</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:10, color:"var(--muted)", fontWeight:600, display:"block", marginBottom:4 }}>Course Preferred</label>
                <select
                  style={{ width:"100%", padding:"7px 8px", fontSize:14, border:"1px solid var(--line)", borderRadius:8, background:"white", color:"var(--green)", fontWeight:600, boxSizing:"border-box" }}
                  value={currentHole.preferred_club_override || (selectedCourse?.holes.find((x:any)=>x.hole===currentHole.hole) as any)?.preferred_club || ""}
                  onChange={e => updateHoleFieldTracked("preferred_club_override", e.target.value)}>
                  <option value="">—</option>
                  {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:10, color:"var(--muted)", fontWeight:600, display:"block", marginBottom:4 }}>Plan Recommendation</label>
                <div style={{ padding:"7px 10px", fontSize:14, fontWeight:700, color: currentHole.plan_club ? "var(--green)" : "var(--muted-2)", background:"var(--green-soft)", border:"1px solid var(--green-soft)", borderRadius:8, minHeight:36, display:"flex", alignItems:"center" }}>
                  {currentHole.plan_club || "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scoring Plan */}
        {currentHole && (
          <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:12, padding:"12px 16px", marginBottom:12, order:2 }}>
            <p style={{ fontSize:10, fontWeight:700, color:"var(--green-deep)", letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>Scoring Plan</p>
            <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
              {/* Scoring Opp */}
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"var(--muted-2)", marginRight:2 }}>Scoring</span>
                {([0, 0.5, 1] as const).map(v => {
                  const active = currentHole.scoring_opp === v;
                  return (
                    <button key={v} onClick={() => updateHoleFieldTracked("scoring_opp", v)} style={{
                      padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:700, cursor:"pointer",
                      border: active ? "1.5px solid var(--ink)" : "1.5px solid var(--line)",
                      background: active ? "var(--ink)" : "var(--paper)",
                      color: active ? "var(--paper)" : "var(--muted)",
                    }}>
                      {v === 0 ? "E" : `+${v}`}
                    </button>
                  );
                })}
              </div>
              {/* Diff Max — read-only */}
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"var(--muted-2)", marginRight:2 }}>Max</span>
                <span style={{ padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:700, border:"1.5px solid var(--line)", background:"var(--paper-alt)", color:"var(--muted)" }}>
                  {currentHole.diff_max !== "" ? `+${currentHole.diff_max}` : "—"}
                </span>
              </div>
              {/* Opportunity — read-only, auto-updates with Scoring */}
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"var(--muted-2)", marginRight:2 }}>Opp</span>
                {(()=>{
                  const opp = currentHole.opportunity;
                  const OPP_DEFS: Record<string,{bg:string;fg:string;label:string}> = {
                    birdie:      {bg:"#1a6fd4",fg:"#fff",label:"Birdie"},
                    "go-for-it": {bg:"#0f6e56",fg:"#fff",label:"Go for it"},
                    caution:     {bg:"#c8a84b",fg:"#fff",label:"Caution"},
                    danger:      {bg:"#c94a2a",fg:"#fff",label:"Danger"},
                  };
                  const c = opp ? OPP_DEFS[opp] : null;
                  if (!c) return <span style={{fontSize:12,color:"var(--muted-2)"}}>—</span>;
                  return <span style={{padding:"4px 10px",borderRadius:999,fontSize:12,fontWeight:700,background:c.bg,color:c.fg,border:`1.5px solid ${c.bg}`}}>{c.label}</span>;
                })()}
              </div>
            </div>
          </div>
        )}

        <div style={{ order:3 }}>{loadingStrategy && <p style={{ color:"var(--muted)", fontSize:13, textAlign:"center", marginTop:24 }}>Loading strategy...</p>}</div>

        {!loadingStrategy && strategy && hole && strat && (
          <div style={{ display:"flex", flexDirection:"column", gap:12, order:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:confidenceColor[conf]??"#0f6e56", textTransform:"uppercase" }}>{conf} confidence</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, color:"#0f6e56" }}>
                  {ds?.exact_hole_history>0?`${ds.exact_hole_history}× this hole · `:""}{displayEnriched.length} similar
                </span>
                <button onClick={() => setShowThisHoleOnly(v=>!v)}
                  style={{ fontSize:11, padding:"2px 8px", borderRadius:12, border:"1px solid #0f6e56", background:showThisHoleOnly?"#0f6e56":"white", color:showThisHoleOnly?"white":"#0f6e56", cursor:"pointer", fontWeight:600 }}>
                  {showThisHoleOnly?"This hole only":"All similar"}
                </button>
              </div>
            </div>

            <div style={{ ...card("#f0f0f0"), display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px" }}>
              <span style={{ fontSize:13, color:"#0f6e56" }}>Avg on {showThisHoleOnly?"this hole":"similar holes"}</span>
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
                      <span key={h} style={{fontSize:9,color:"#0f6e56",fontWeight:600,textTransform:"uppercase"}}>{h}</span>
                    ))}
                  </div>
                  {holeHistory.map((h:any,i:number)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:COLS,gap:"0 4px",alignItems:"center",padding:"3px 0",borderTop:i>0?"1px solid #f0f0f0":"none"}}>
                      <span style={{fontSize:10,color:"#0f6e56"}}>{h.date?.slice(2,10)||"—"}</span>
                      <span style={{fontSize:13,fontWeight:700,color:scoreColor(Number(h.score),h.par)}}>
                        {Number(h.score)-h.par===0?"E":Number(h.score)-h.par>0?`+${Number(h.score)-h.par}`:Number(h.score)-h.par}
                      </span>
                      <span style={{fontSize:10,color:"#0f6e56"}}>{h.club||"—"}</span>
                      <span style={{fontSize:10,color:"#0f6e56"}}>{h.tee_accuracy?.slice(0,3)||"—"}</span>
                      <span style={{fontSize:10,color:"#0f6e56"}}>{h.appr_accuracy?.slice(0,3)||"—"}</span>
                      <span style={{fontSize:10,color:"#0f6e56"}}>{h.putts||"—"}</span>
                      <span style={{fontSize:10,color:"#e67e22",fontWeight:500}}>{hazardCode(h)}</span>
                      <span style={{fontSize:10,color:"#0f6e56",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.appr_distance||"—"}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Hole Notes */}
            <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 16px"}}>
              <button onClick={()=>setHoleNotesOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:0}}>
                <span style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1}}>Hole Notes {holeNotesText?"✓":""}</span>
                <span style={{fontSize:13,color:"#0f6e56"}}>{holeNotesOpen?"▲":"▼"}</span>
              </button>
              {holeNotesOpen&&(
                <div style={{marginTop:10}}>
                  <textarea value={holeNotesText} onChange={e=>setHoleNotesText(e.target.value)}
                    placeholder="Add notes about this hole..."
                    rows={8}
                    style={{width:"100%",padding:"8px 10px",fontSize:13,border:"1px solid #ddd",borderRadius:8,boxSizing:"border-box",resize:"vertical",fontFamily:"sans-serif",lineHeight:1.5,background:"white",color:"#131821"}}
                  />
                  <button onClick={saveHoleNotes} disabled={savingNotes}
                    style={{marginTop:6,padding:"6px 16px",fontSize:12,fontWeight:600,background:"#0f6e56",color:"white",border:"none",borderRadius:6,cursor:"pointer",opacity:savingNotes?0.6:1}}>
                    {notesSaved?"Saved!":savingNotes?"Saving...":"Save Notes"}
                  </button>
                </div>
              )}
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

        {/* Tee Strategy — sibling section, order depends on inputPhase */}
        {!loadingStrategy && hole && strat && hole.par >= 4 && (
          <div style={{ order: inputPhase === "approach" ? 12 : 5 }}>
            <div style={card("#f6f6f6")}>
              <p style={{ fontSize:11, color:"#0f6e56", fontWeight:600, letterSpacing:1, margin:"0 0 8px" }}>TEE STRATEGY</p>
              {hazardImpacts.length>0&&(
                <div style={{ marginBottom:14 }}>
                  <p style={{ fontSize:11, color:"#0f6e56", fontWeight:600, letterSpacing:1, margin:"0 0 6px" }}>TEE SHOT HAZARDS</p>
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
                    <div key={h} style={{fontSize:9,fontWeight:600,color:"#0f6e56",textAlign:"center",textTransform:"uppercase"}}>{h}</div>
                  ))}
                </div>
                {gridData.map(row=>(
                  <div key={row.club} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,marginBottom:3}}>
                    <div style={{background:"#f6f6f6",borderRadius:4,padding:"3px 4px",display:"flex",flexDirection:"column",justifyContent:"center",textAlign:"center"}}>
                      <p style={{fontSize:10,fontWeight:600,color:"#1a1a1a",margin:0}}>{row.club}</p>
                      <p style={{fontSize:9,color:"#0f6e56",margin:0}}>{row.count}</p>
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
          </div>
        )}

        {/* Approach — sibling section, order depends on inputPhase */}
        {!loadingStrategy && hole && strat && (
          <div style={{ order: inputPhase === "approach" ? 1 : 6 }}>
            <div style={card("#f6f6f6")}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <p style={{ fontSize:11, color:"#0f6e56", fontWeight:600, letterSpacing:1, margin:0 }}>APPROACH</p>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <input type="number" min={0} max={700} value={approachDist ?? ""}
                      onChange={e => {
                        const d = e.target.value === "" ? null : Number(e.target.value);
                        setApproachDist(d);
                        if (d && Object.keys(CLUB_DIST).length > 0) {
                          let best="", bestDiff=Infinity;
                          for (const [c,cd] of Object.entries(CLUB_DIST)) { const df=Math.abs(cd-d); if(df<bestDiff){bestDiff=df;best=c;} }
                          setApproachClub(best);
                        }
                      }}
                      style={{ width:54, padding:"3px 5px", fontSize:12, border:"1px solid var(--line)", borderRadius:6, color:"var(--ink)", fontWeight:600, textAlign:"center", background:"white" }} />
                    <span style={{ fontSize:11, color:"var(--muted)" }}>yds</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:11, color:"var(--green)" }}>Club</span>
                    <select value={approachClub} onChange={e => setApproachClub(e.target.value)}
                      style={{ padding:"3px 8px", fontSize:13, border:"1px solid var(--green)", borderRadius:6, color:"var(--green)", fontWeight:600, background:"white" }}>
                      <option value="">—</option>
                      {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ fontSize:22, fontWeight:700, color:"#0f6e56", marginBottom:8 }}>
                {t?pct(t.girPct):"—"} <span style={{ fontSize:14, color:"#0f6e56", fontWeight:400 }}>GIR</span>
              </div>
              {displayEnriched.length > 0 && (() => {
                const renderApprGrid = (dirs: ReturnType<typeof computeApprDirs>, title: string) => (
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:9, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:0.5, textAlign:"center", margin:"0 0 4px" }}>{title}</p>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gridTemplateRows:"auto auto auto", gap:4 }}>
                      {dirs.map(({ key, label, col, row, count, impact }) => {
                        const isHit = key === "Hit";
                        const colors = count === 0 || isNaN(impact)
                          ? { bg:"var(--paper-alt)", color:"var(--muted-2)" }
                          : impactColor(impact, count <= 2);
                        return (
                          <div key={key}
                            style={{ gridColumn:col, gridRow:row, background:colors.bg, borderRadius:7, padding:"5px 3px", textAlign:"center",
                              border: isHit ? "1.5px solid var(--green)" : "1px solid transparent", cursor:"default" }}
                            onMouseEnter={e => setApprTooltip({ x:(e as any).clientX, y:(e as any).clientY, label, impact, count })}
                            onMouseLeave={() => setApprTooltip(null)}>
                            <div style={{ fontSize:9, color:colors.color, fontWeight:700, textTransform:"uppercase", opacity: count===0?0.35:0.8 }}>{label}</div>
                            {count > 0 ? <>
                              <div style={{ fontSize:12, fontWeight:700, color:colors.color }}>{isNaN(impact)?"—":fmtSTP(impact)}</div>
                              <div style={{ fontSize:9, color:colors.color, opacity:0.7 }}>{count}</div>
                            </> : <div style={{ fontSize:9, color:"var(--muted-2)", lineHeight:"2.2" }}>—</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
                const distFiltered = approachDist != null && Object.keys(CLUB_DIST).length > 0
                  ? displayEnriched.filter(e => { const d=CLUB_DIST[e.roundHole.appr_distance||""]; return d!=null&&Math.abs(d-approachDist)<=25; })
                  : displayEnriched;
                const allDirs = computeApprDirs(distFiltered, baseline);
                const clubDirs = approachClub ? computeApprDirs(displayEnriched, baseline, approachClub) : null;
                const allTitle = approachDist != null ? `~${approachDist}yds` : (approachClub ? "All Similar" : "Direction");
                return (
                  <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                    {renderApprGrid(allDirs, allTitle)}
                    {clubDirs && renderApprGrid(clubDirs, `With ${approachClub}`)}
                  </div>
                );
              })()}
              {t&&(
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {(hole.approach_water_out_left||hole.approach_water_out_right||hole.approach_water_out_short||hole.approach_water_out_long)&&(
                    <div style={{background:"#fff3e0",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#0f6e56"}}>OB/Water: </span><span style={{fontWeight:600,color:"#e67e22"}}>{pct(t.apprWaterPct)}</span>
                    </div>
                  )}
                  {(hole.approach_bunker_short_left||hole.approach_bunker_short_middle||hole.approach_bunker_short_right||hole.approach_bunker_middle_left||hole.approach_bunker_middle_right||hole.approach_bunker_long_left||hole.approach_bunker_long_middle||hole.approach_bunker_long_right)&&(
                    <div style={{background:"#fef9e7",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#0f6e56"}}>Bunker: </span><span style={{fontWeight:600,color:"#c8a84b"}}>{pct(t.apprBunkerPct)}</span>
                    </div>
                  )}
                  {(hole.approach_tree_hazard_left||hole.approach_tree_hazard_right||hole.approach_tree_hazard_long)&&(
                    <div style={{background:"#eafaf1",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                      <span style={{color:"#0f6e56"}}>Trees/Haz: </span><span style={{fontWeight:600,color:"#27ae60"}}>{pct(t.apprTreePct)}</span>
                    </div>
                  )}
                </div>
              )}
              <p style={{ fontSize:13, color:"#0f6e56", margin:"8px 0 0" }}>{strat.approach_strategy?.reason}</p>
            </div>
          </div>
        )}

        <div style={{ order:20 }}>
          {roundId && roundHoles.length > 0 && roundHoles.every(h => h.score !== "") && (
            <div style={{ marginTop:20, textAlign:"center" }}>
              <a href={`/rounds/grint?roundId=${roundId}`} style={{
                display:"inline-block", padding:"11px 28px",
                background:"#0f6e56", color:"white", borderRadius:8,
                fontWeight:600, fontSize:14, textDecoration:"none",
              }}>
                Submit to TheGrint →
              </a>
            </div>
          )}

          <div style={{ marginTop:16, textAlign:"center" }}>
            <button onClick={cancelRound} style={{ fontSize:13, color:"#c0392b", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>
              {isEditMode?"← Back to edit round":"Cancel round"}
            </button>
          </div>
        </div>

      </div>

      {apprTooltip && (
        <div style={{ position:"fixed", left:apprTooltip.x+12, top:apprTooltip.y-38, background:"var(--ink)", color:"white", borderRadius:6, padding:"5px 10px", fontSize:11, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap", boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}>
          {apprTooltip.label}: {isNaN(apprTooltip.impact) ? "—" : fmtSTP(apprTooltip.impact)} · {apprTooltip.count} shot{apprTooltip.count !== 1 ? "s" : ""}
        </div>
      )}
    </main>
  );
}

export default function PlayCourse() {
  return (
    <Suspense fallback={<main style={{maxWidth:520,margin:"60px auto",fontFamily:"sans-serif",padding:"0 24px"}}><p style={{color:"white"}}>Loading...</p></main>}>
      <PlayCourseInner />
    </Suspense>
  );
}
