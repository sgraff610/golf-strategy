"use client";
import { useState, useEffect, useMemo } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses } from "@/lib/storage";

// ─── Shared types ─────────────────────────────────────────────────────────────
type RoundHole = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number|""; putts: number|""; chips: number|""; club: string;
  tee_accuracy: string; appr_accuracy: string; appr_distance: string;
  water_penalty: number|""; drop_or_out: number|""; tree_haz: number|"";
  fairway_bunker: number|""; greenside_bunker: number|""; gir: boolean;
  first_putt_distance: string;
};
type HoleData = any;
type EnrichedHole = {
  roundHole: RoundHole; courseHole: HoleData|null;
  courseRating: number|null; courseSlope: number|null;
  similarityScore: number; roundDate: string; courseId: string; isExactHole: boolean;
};
type CellValue = 0|1|2;
type GreensideState = { long_left:CellValue; long_middle:CellValue; long_right:CellValue; middle_left:CellValue; middle_right:CellValue; short_left:CellValue; short_middle:CellValue; short_right:CellValue; };

// ─── Tee Shot Grid helpers ────────────────────────────────────────────────────
const IRONS = ["4i","5i","6i","7i","8i","9i","PW","SW","LW"];

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

function wAvgGrid(holes: EnrichedHole[], fn: (e: EnrichedHole)=>number|null): number {
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
      const total = clubHoles.length;
      const likelihood = total>0 ? dirHoles.length/total : 0;
      const avg = dirHoles.length>0 ? wAvgGrid(dirHoles, scoreToPar) : NaN;
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
      const avg = matching.length>0 ? wAvgGrid(matching, scoreToPar) : NaN;
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
      <p style={{ fontSize:9, color:"#0f6e56", margin:0 }}>N/A</p>
    </div>
  );
  const lowCount = count <= 2;
  const colors = isNaN(impact) ? { bg:"#f6f6f6", color:"#aaa" } : impactColor(impact, lowCount);
  return (
    <div style={{ background:colors.bg, borderRadius:4, padding:"4px 2px", textAlign:"center", minHeight:40, display:"flex", flexDirection:"column", justifyContent:"center" }}>
      {count>0 ? <>
        <p style={{ fontSize:10, fontWeight:600, color:colors.color, margin:0 }}>{isNaN(impact)?"-":fmtSTP(impact)}</p>
        <p style={{ fontSize:9, color:colors.color, margin:0, opacity:0.85 }}>{count}</p>
      </> : <p style={{ fontSize:9, color:"#0f6e56", margin:0 }}>—</p>}
    </div>
  );
}

// ─── Greenside radial ─────────────────────────────────────────────────────────
const GS_SEGMENTS = [
  {key:"long_left"as keyof GreensideState,abbr:"FL",angle:315},{key:"long_middle"as keyof GreensideState,abbr:"F",angle:0},
  {key:"long_right"as keyof GreensideState,abbr:"FR",angle:45},{key:"middle_right"as keyof GreensideState,abbr:"R",angle:90},
  {key:"short_right"as keyof GreensideState,abbr:"SR",angle:135},{key:"short_middle"as keyof GreensideState,abbr:"S",angle:180},
  {key:"short_left"as keyof GreensideState,abbr:"SL",angle:225},{key:"middle_left"as keyof GreensideState,abbr:"L",angle:270},
];
const CX=80,CY=80,RI=38,RO=67,GAP=3.5,SPAN=45;
function toRad(d:number){return d*Math.PI/180;}
function polar(a:number,r:number){const rad=toRad(90-a);return{x:CX+r*Math.cos(rad),y:CY-r*Math.sin(rad)};}
function arcPath(ca:number,ri:number,ro:number){
  const h=SPAN/2-GAP/2;
  const s1=polar(ca-h,ro),e1=polar(ca+h,ro),s2=polar(ca+h,ri),e2=polar(ca-h,ri);
  return `M ${s1.x} ${s1.y} A ${ro} ${ro} 0 0 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${ri} ${ri} 0 0 0 ${e2.x} ${e2.y} Z`;
}
function lpos(ca:number){const r=RI+(RO-RI)*0.5;return polar(ca,r);}
const GS_COLORS:{fill:string;text:string}[]=[{fill:"#e8e8e8",text:"#666"},{fill:"#0f6e56",text:"#fff"},{fill:"#c8a84b",text:"#fff"}];

function GreensideWidget({value,onChange,readOnly=false}:{value:GreensideState;onChange?:(v:GreensideState)=>void;readOnly?:boolean}){
  return(
    <div>
      <svg viewBox="0 0 200 190" style={{width:"100%",maxWidth:180,height:"auto",display:"block"}}>
        <text x={CX} y={CY-RO-6} textAnchor="middle" fontSize={8} fontStyle="italic" fill="#999">↑ Far</text>
        <text x={CX-RO-6} y={CY+3} textAnchor="end" fontSize={8} fontStyle="italic" fill="#999">← L</text>
        <text x={CX+RO+6} y={CY+3} textAnchor="start" fontSize={8} fontStyle="italic" fill="#999">R →</text>
        {GS_SEGMENTS.map(seg=>{
          const v=value[seg.key];
          const col=GS_COLORS[v]??GS_COLORS[0];
          const lp=lpos(seg.angle);
          const d=arcPath(seg.angle,RI+2,RO);
          return(
            <g key={seg.key} onClick={readOnly?undefined:()=>{if(onChange)onChange({...value,[seg.key]:((v+1)%3)as CellValue});}} style={{cursor:readOnly?"default":"pointer"}}>
              <path d={d} fill={col.fill} stroke="#fff" strokeWidth={1.5} style={{transition:"fill 0.15s"}}/>
              <text x={lp.x} y={lp.y+3} textAnchor="middle" fontSize={8} fontWeight={500} fill={col.text} style={{pointerEvents:"none"}}>{seg.abbr}</text>
              {!readOnly&&<path d={d} fill="transparent" stroke="none" style={{pointerEvents:"all"}}/>}
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={RI} fill="#0f6e56" style={{pointerEvents:"none"}}/>
        <text x={CX} y={CY-4} textAnchor="middle" fontSize={13} style={{pointerEvents:"none"}}>🚩</text>
        <text x={CX} y={CY+11} textAnchor="middle" fontSize={7} fontWeight={500} fill="#fff" style={{pointerEvents:"none"}}>GREEN</text>
      </svg>
      <div style={{textAlign:"center",fontSize:9,color:"#999",fontStyle:"italic"}}>↓ Short</div>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({title,badge,defaultOpen=false,children}:{title:string;badge?:number;defaultOpen?:boolean;children:React.ReactNode}){
  const [open,setOpen]=useState(defaultOpen);
  return(
    <div style={{borderTop:"1px solid #eee",paddingTop:10,marginTop:10}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:0}}>
        <span style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1}}>{title}</span>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          {!!badge&&<span style={{fontSize:10,background:"#0f6e56",color:"#fff",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{badge}</span>}
          <span style={{fontSize:13,color:"#999"}}>{open?"▲":"▼"}</span>
        </span>
      </button>
      {open&&<div style={{marginTop:10}}>{children}</div>}
    </div>
  );
}

// ─── Tendency recomputation ───────────────────────────────────────────────────
function recomputeTendencies(enriched:EnrichedHole[]){
  const valid=enriched.filter(e=>e.roundHole.score!==""&&e.similarityScore>0);
  if(!valid.length)return null;
  const wPct=(pred:(e:EnrichedHole)=>boolean,denom?:(e:EnrichedHole)=>boolean)=>{
    let n=0,d=0;
    for(const e of valid){const ok=denom?denom(e):true;if(ok){d+=e.similarityScore;if(pred(e))n+=e.similarityScore;}}
    return d>0?n/d:0;
  };
  const wAvg=(fn:(e:EnrichedHole)=>number|null)=>{
    let n=0,d=0;
    for(const e of valid){const v=fn(e);if(v!==null&&!isNaN(v)){n+=v*e.similarityScore;d+=e.similarityScore;}}
    return d>0?n/d:0;
  };
  const stp=(e:EnrichedHole)=>Number(e.roundHole.score)-e.roundHole.par;
  const drv=(e:EnrichedHole)=>e.roundHole.par>=4;
  return{
    sampleSize:valid.length,
    avgScoreToPar:wAvg(stp),
    driveHitPct:wPct(e=>e.roundHole.tee_accuracy==="Hit",drv),
    driveMissLeftPct:wPct(e=>e.roundHole.tee_accuracy==="Left",drv),
    driveMissRightPct:wPct(e=>e.roundHole.tee_accuracy==="Right",drv),
    driveWaterPct:wPct(e=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0,drv),
    driveTreePct:wPct(e=>(Number(e.roundHole.tree_haz)||0)>0,drv),
    driveBunkerPct:wPct(e=>(Number(e.roundHole.fairway_bunker)||0)>0,drv),
    apprHitPct:wPct(e=>e.roundHole.appr_accuracy==="Hit"),
    apprMissLeftPct:wPct(e=>e.roundHole.appr_accuracy==="Left"),
    apprMissRightPct:wPct(e=>e.roundHole.appr_accuracy==="Right"),
    apprMissShortPct:wPct(e=>e.roundHole.appr_accuracy==="Short"),
    apprMissLongPct:wPct(e=>e.roundHole.appr_accuracy==="Long"),
    girPct:wPct(e=>!!e.roundHole.gir),
    apprWaterPct:wPct(e=>(Number(e.roundHole.water_penalty)||0)>0),
    apprTreePct:wPct(e=>(Number(e.roundHole.tree_haz)||0)>0),
    apprBunkerPct:wPct(e=>(Number(e.roundHole.greenside_bunker)||0)>0),
    avgPutts:wAvg(e=>e.roundHole.putts!==""?Number(e.roundHole.putts):null),
  };
}

// ─── Filter logic ─────────────────────────────────────────────────────────────
const DRIVE_CLUBS=["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const APPROACH_CLUBS=["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];
const defaultGS=():GreensideState=>({long_left:0,long_middle:0,long_right:0,middle_left:0,middle_right:0,short_left:0,short_middle:0,short_right:0});

type StratFilters={
  useLastN:boolean; lastN:number; pars:Set<string>; siDelta:string; yardsDelta:string;
  drivingClubs:Set<string>;
  teeHazards:{teeTreeLeft:boolean;teeTreeRight:boolean;teeBunkerLeft:boolean;teeBunkerRight:boolean;teeWaterLeft:boolean;teeWaterRight:boolean};
  apprClubs:Set<string>; greenDepth:string; greensideFilter:GreensideState;
};
const DEFAULT_FILTERS=(totalRounds:number):StratFilters=>({
  useLastN:false,lastN:Math.min(10,totalRounds),pars:new Set(),siDelta:"",yardsDelta:"",
  drivingClubs:new Set(),
  teeHazards:{teeTreeLeft:false,teeTreeRight:false,teeBunkerLeft:false,teeBunkerRight:false,teeWaterLeft:false,teeWaterRight:false},
  apprClubs:new Set(),greenDepth:"",greensideFilter:defaultGS(),
});

function toggleSet(s:Set<string>,v:string):Set<string>{const n=new Set(s);n.has(v)?n.delete(v):n.add(v);return n;}

function applyFilters(enriched:EnrichedHole[],f:StratFilters,targetHole:HoleData,totalRounds:number):EnrichedHole[]{
  const isExact=(e:EnrichedHole)=>e.isExactHole===true;
  let pool=enriched;
  if(f.useLastN&&f.lastN>0){
    const dates=[...new Set(enriched.map(e=>e.roundDate))].sort().reverse().slice(0,f.lastN);
    const dateSet=new Set(dates);
    pool=pool.filter(e=>dateSet.has(e.roundDate));
  }
  if(f.pars.size>0) pool=pool.filter(e=>f.pars.has(String(e.roundHole.par)));
  if(f.siDelta&&targetHole?.stroke_index){
    const si=targetHole.stroke_index;
    const delta=f.siDelta==="pm1"?1:f.siDelta==="pm2"?2:3;
    pool=pool.filter(e=>Math.abs((e.courseHole?.stroke_index??e.roundHole.stroke_index)-si)<=delta);
  }
  if(f.yardsDelta&&targetHole?.yards){
    const y=targetHole.yards;
    const delta=f.yardsDelta==="pm10"?10:f.yardsDelta==="pm20"?20:30;
    pool=pool.filter(e=>Math.abs((e.courseHole?.yards??e.roundHole.yards)-y)<=delta);
  }
  if(f.drivingClubs.size>0) pool=pool.filter(e=>f.drivingClubs.has(e.roundHole.club));
  const th=f.teeHazards;
  if(th.teeTreeLeft)   pool=pool.filter(e=>e.courseHole?.tee_tree_hazard_left);
  if(th.teeTreeRight)  pool=pool.filter(e=>e.courseHole?.tee_tree_hazard_right);
  if(th.teeBunkerLeft) pool=pool.filter(e=>e.courseHole?.tee_bunkers_left);
  if(th.teeBunkerRight)pool=pool.filter(e=>e.courseHole?.tee_bunkers_right);
  if(th.teeWaterLeft)  pool=pool.filter(e=>e.courseHole?.tee_water_out_left);
  if(th.teeWaterRight) pool=pool.filter(e=>e.courseHole?.tee_water_out_right);
  if(f.apprClubs.size>0) pool=pool.filter(e=>f.apprClubs.has(e.roundHole.appr_distance));
  if(f.greenDepth){
    const gd=(e:EnrichedHole)=>e.courseHole?.approach_green_depth??0;
    if(f.greenDepth==="lt20")  pool=pool.filter(e=>gd(e)>0&&gd(e)<20);
    if(f.greenDepth==="20-24") pool=pool.filter(e=>gd(e)>=20&&gd(e)<=24);
    if(f.greenDepth==="25-29") pool=pool.filter(e=>gd(e)>=25&&gd(e)<=29);
    if(f.greenDepth==="30-34") pool=pool.filter(e=>gd(e)>=30&&gd(e)<=34);
    if(f.greenDepth==="35-39") pool=pool.filter(e=>gd(e)>=35&&gd(e)<=39);
    if(f.greenDepth==="gt40")  pool=pool.filter(e=>gd(e)>=40);
  }
  const gsAny=Object.values(f.greensideFilter).some(v=>v!==0);
  if(gsAny){
    const keys=Object.keys(f.greensideFilter)as(keyof GreensideState)[];
    pool=pool.filter(e=>{
      for(const k of keys){
        const fv=f.greensideFilter[k]; if(fv===0)continue;
        const isBunker=e.courseHole?.[`approach_bunker_${k}`];
        const isGreen=e.courseHole?.[`approach_green_${k}`];
        const cv:CellValue=isBunker?2:isGreen?1:0;
        if(cv!==fv)return false;
      }
      return true;
    });
  }
  const exactHoles=enriched.filter(isExact);
  const poolKeys=new Set(pool.map(e=>`${e.roundDate}|${e.courseId}|${e.roundHole.hole}`));
  for(const e of exactHoles){
    const key=`${e.roundDate}|${e.courseId}|${e.roundHole.hole}`;
    if(!poolKeys.has(key)){pool=[...pool,e];poolKeys.add(key);}
  }
  return pool;
}

const DOGLEG_LABELS:Record<string,string>={
  severe_left:"Severe Left",moderate_left:"Moderate Left",slight_left:"Slight Left",straight:"Straight",
  slight_right:"Slight Right",moderate_right:"Moderate Right",severe_right:"Severe Right",
};
const pill=(active:boolean):React.CSSProperties=>({
  padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",border:"1px solid",
  background:active?"#0f6e56":"white",color:active?"white":"#0f6e56",borderColor:"#0f6e56",whiteSpace:"nowrap",
});
const fl:React.CSSProperties={fontSize:11,color:"#0f6e56",margin:"0 0 6px",fontWeight:600};

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

function HoleHistorySection({history}:{history:any[]}){
  const avgScore=history.reduce((s,h)=>s+(Number(h.score)-h.par),0)/history.length;
  const fmt0=(n:number)=>n>=0?`+${n.toFixed(1)}`:n.toFixed(1);
  const COLS="60px 28px 32px 30px 26px 26px 28px 1fr";
  return(
    <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:12,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1,margin:0}}>My History — This Hole</p>
        <span style={{fontSize:13,fontWeight:700,color:avgScore>0?"#c0392b":avgScore<0?"#27ae60":"#333"}}>
          avg {fmt0(avgScore)} · {history.length} rounds
        </span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:COLS,gap:"0 4px",marginBottom:4}}>
        {["Date","Sc","Club","Tee","Ap","Pu","Haz","Appr"].map(h=>(
          <span key={h} style={{fontSize:9,color:"#0f6e56",fontWeight:600,textTransform:"uppercase"}}>{h}</span>
        ))}
      </div>
      {history.map((h:any,i:number)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:COLS,gap:"0 4px",alignItems:"center",padding:"3px 0",borderTop:i>0?"1px solid #f0f0f0":"none"}}>
          <span style={{fontSize:10,color:"#0f6e56"}}>{h.date?.slice(2,10)||"—"}</span>
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
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home(){
  const [courses,setCourses]=useState<CourseRecord[]>([]);
  const [courseId,setCourseId]=useState("");
  const [holeNumber,setHoleNumber]=useState(1);
  const [result,setResult]=useState<any>(null);
  const [approachDist,setApproachDist]=useState<number|null>(null);
  const [approachDistOverride,setApproachDistOverride]=useState<number|null>(null);
  const [holeNotesOpen,setHoleNotesOpen]=useState(false);
  const [holeNotesText,setHoleNotesText]=useState("");
  const [savingNotes,setSavingNotes]=useState(false);
  const [notesSaved,setNotesSaved]=useState(false);
  const [loading,setLoading]=useState(false);
  const [loadingCourses,setLoadingCourses]=useState(true);
  const [error,setError]=useState("");
  const [filters,setFilters]=useState<StratFilters>(DEFAULT_FILTERS(0));
  const [totalRounds,setTotalRounds]=useState(0);
  const [hiAgs,setHiAgs]=useState<string>("");
  const [hiRating,setHiRating]=useState<string>("");
  const [hiSlope,setHiSlope]=useState<string>("");
  const [existingDiffs,setExistingDiffs]=useState<number[]|null>(null);

  useEffect(()=>{
    loadCourses().then(data=>{setCourses(data);if(data.length>0)setCourseId(data[0].id);setLoadingCourses(false);});
  },[]);

  useEffect(()=>{
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("rounds").select("holes_played,score_differential,holes,course_id").order("date",{ascending:true}).then(async({data})=>{
        if(!data)return;
        const courseIds=[...new Set(data.map((r:any)=>r.course_id).filter(Boolean))];
        let courseMap:Record<string,{rating:number|null;slope:number|null;hole_count:number|null}>={};
        if(courseIds.length>0){
          const {data:cs}=await supabase.from("courses").select("id,rating,slope,hole_count").in("id",courseIds);
          (cs??[]).forEach((c:any)=>{courseMap[c.id]={rating:c.rating,slope:c.slope,hole_count:c.hole_count};});
        }
        const diffs=data.map((r:any)=>{
          if(r.score_differential!=null) return r.holes_played<=9?r.score_differential*2:r.score_differential;
          const ci=courseMap[r.course_id];
          if(!ci?.rating||!ci?.slope)return null;
          const scored=(r.holes??[]).filter((h:any)=>h.score&&Number(h.score)>0);
          if(!scored.length)return null;
          const ags=scored.reduce((s:number,h:any)=>s+Math.min(Number(h.score)||0,(h.par||4)+2),0);
          const is9=(r.holes_played??scored.length)<=9;
          const is9C=(ci.hole_count??18)<=9;
          let rat=ci.rating;
          if(is9&&!is9C)rat/=2;else if(!is9&&is9C)rat*=2;
          const diff=is9?(113/ci.slope*(ags-rat))*2:(ags-rat)*113/ci.slope;
          return diff;
        }).filter((d:any):d is number=>d!==null);
        setExistingDiffs(diffs);
      });
    });
  },[]);

  const selectedCourse=courses.find(c=>c.id===courseId);
  const availableHoles=Array.from({length:selectedCourse?.holes.length??18},(_,i)=>i+1);
  const targetHole=selectedCourse?.holes.find((h:any)=>h.hole===holeNumber);
  const totalHoles=selectedCourse?.holes.length??18;

  const handleSubmit=async(apprOverride?:number, holeOverride?:number)=>{
    if(!selectedCourse)return;
    setLoading(true);setError("");setResult(null);
    const hNum = holeOverride ?? holeNumber;
    try{
      const body:any={courseId,hole:hNum};
      if(apprOverride!=null)body.approachDistance=apprOverride;
      const res=await fetch("/api/strategy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await res.json();
      if(!res.ok)setError(data.error??"Something went wrong.");
      else{
        setResult(data);
        if(apprOverride==null){setApproachDist(data.defaultApproachDist??null);setApproachDistOverride(null);}
        else{setApproachDist(apprOverride);}
        const rounds=new Set((data.enrichedHoles as EnrichedHole[]).map((e:EnrichedHole)=>e.roundDate));
        setTotalRounds(rounds.size);
        setFilters(DEFAULT_FILTERS(rounds.size));
        // Load hole notes fresh
        const { supabase: sbNotes } = await import("@/lib/supabase");
        const courseName = selectedCourse?.name ?? "";
        const { data: allTeeNotes } = await sbNotes.from("courses").select("hole_notes").eq("name", courseName);
        const mergedNotes: Record<string,string> = {};
        for (const row of allTeeNotes ?? []) {
          if (row.hole_notes) Object.assign(mergedNotes, row.hole_notes);
        }
        setHoleNotesText(mergedNotes[String(hNum)] ?? "");
        setHoleNotesOpen(false);
      }
    }catch{setError("Something went wrong. Please try again.");}
    setLoading(false);
  };

  async function saveHoleNotes() {
    if (!hole) return;
    setSavingNotes(true);
    const { supabase: sb } = await import("@/lib/supabase");
    const { data: allTees } = await sb.from("courses").select("id").eq("name", selectedCourse?.name ?? "");
    for (const tee of allTees ?? []) {
      await sb.rpc('upsert_hole_note', {
        p_course_id: tee.id,
        p_hole: hole.hole,
        p_note: holeNotesText,
      });
    }
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
    setSavingNotes(false);
  }

  async function goToHole(n: number) {
    setHoleNumber(n);
    setResult(null);
    setApproachDist(null);
    setApproachDistOverride(null);
    // Load hole notes fresh from Supabase
    const { supabase: sb } = await import("@/lib/supabase");
    const courseName = selectedCourse?.name ?? "";
    const { data: allTeeNotes } = await sb.from("courses").select("hole_notes").eq("name", courseName);
    const mergedNotes: Record<string,string> = {};
    for (const row of allTeeNotes ?? []) {
      if (row.hole_notes) Object.assign(mergedNotes, row.hole_notes);
    }
    setHoleNotesText(mergedNotes[String(n)] ?? "");
    handleSubmit(undefined, n);
  }

  const filteredEnriched=useMemo(()=>{
    if(!result?.enrichedHoles)return[];
    return applyFilters(result.enrichedHoles as EnrichedHole[],filters,targetHole,totalRounds);
  },[result,filters,targetHole,totalRounds]);

  const filteredTendencies=useMemo(()=>recomputeTendencies(filteredEnriched),[filteredEnriched]);

  const baseline=useMemo(()=>{
    if(!filteredEnriched.length)return 0;
    return wAvgGrid(filteredEnriched, e=>Number(e.roundHole.score)-e.roundHole.par);
  },[filteredEnriched]);

  const gridData=useMemo(()=>computeGridData(filteredEnriched,baseline),[filteredEnriched,baseline]);
  const hazardImpacts=useMemo(()=>computeHazardImpacts(filteredEnriched,result?.hole,baseline),[filteredEnriched,result?.hole,baseline]);

  const filterCount=
    (filters.useLastN?1:0)+filters.pars.size+
    (filters.siDelta?1:0)+(filters.yardsDelta?1:0)+
    filters.drivingClubs.size+Object.values(filters.teeHazards).filter(Boolean).length+
    filters.apprClubs.size+(filters.greenDepth?1:0)+
    (Object.values(filters.greensideFilter).some(v=>v!==0)?1:0);

  const selectStyle:React.CSSProperties={width:"100%",padding:"8px 12px",fontSize:15,border:"1px solid #ddd",borderRadius:8,background:"white",boxSizing:"border-box",color:"#0f6e56"};
  const labelStyle:React.CSSProperties={fontSize:13,color:"white",display:"block",marginBottom:4};
  const card=(bg:string):React.CSSProperties=>({background:bg,borderRadius:12,padding:"16px 20px"});
  const pct=(n:number)=>`${Math.round(n*100)}%`;
  const fmtSTP=(s:number)=>s>=0?`+${s.toFixed(2)}`:s.toFixed(2);

  const t=filteredTendencies;
  const hole=result?.hole;
  const strategy=result?.strategy;
  const course=result?.course;
  const conf=strategy?.confidence;
  const ds=strategy?.data_summary;
  const confidenceColor:Record<string,string>={high:"#27ae60",medium:"#e67e22",low:"#95a5a6"};
  const aimColors:Record<string,string>={left:"#2980b9",right:"#8e44ad",center:"#27ae60",short:"#e67e22",long:"#c0392b"};

  if(loadingCourses)return <main style={{maxWidth:480,margin:"60px auto",fontFamily:"sans-serif",padding:"0 24px"}}><p style={{color:"white"}}>Loading courses...</p></main>;
  if(!courses.length)return <main style={{maxWidth:480,margin:"60px auto",fontFamily:"sans-serif",padding:"0 24px"}}><h1 style={{fontSize:24,fontWeight:600,marginBottom:8,color:"#d0d0d0"}}>Golf Strategy Engine</h1><p style={{color:"white",marginBottom:24}}>No courses found. Add one first.</p><a href="/add-course" style={{padding:"10px 20px",fontSize:15,fontWeight:600,background:"#1a1a1a",color:"white",borderRadius:8,textDecoration:"none"}}>Add a course</a></main>;

  return(
    <main style={{maxWidth:520,margin:"40px auto",fontFamily:"sans-serif",padding:"0 24px"}}>
      <h1 style={{fontSize:22,fontWeight:600,marginBottom:4,color:"#d0d0d0"}}>Strategy Engine</h1>
      <p style={{color:"white",marginBottom:24,fontSize:13}}>Select a course and hole to get your personalised strategy.</p>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <label style={labelStyle}>Course</label>
          <select style={selectStyle} value={courseId} onChange={e=>{setCourseId(e.target.value);setHoleNumber(1);setResult(null);}}>
            {courses.map(c=><option key={c.id} value={c.id}>{c.name} — {c.tee_box} tees ({c.city}, {c.state})</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Hole</label>
          <select style={selectStyle} value={holeNumber} onChange={e=>{setHoleNumber(Number(e.target.value));setResult(null);setApproachDist(null);setApproachDistOverride(null);}}>
            {availableHoles.map(n=>{const hd=selectedCourse?.holes.find((h:any)=>h.hole===n);return<option key={n} value={n}>Hole {n}{hd?` — Par ${hd.par}, ${hd.yards} yds, SI ${hd.stroke_index}`:""}</option>;})}
          </select>
        </div>

        {/* Side-by-side buttons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={()=>handleSubmit()} disabled={loading} style={{padding:"12px",fontSize:15,fontWeight:600,background:"#0f6e56",color:"white",border:"none",borderRadius:8,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1}}>
            {loading?"Analysing...":"Get Strategy"}
          </button>
          <a href={courseId?`/rounds/play?courseId=${courseId}`:"#"}
            style={{padding:"12px",fontSize:15,fontWeight:600,background:"white",color:"#0f6e56",border:"2px solid #0f6e56",borderRadius:8,cursor:"pointer",textAlign:"center",textDecoration:"none",display:"block"}}>
            ⛳ Play Course
          </a>
        </div>
      </div>

      {error&&<p style={{color:"red",marginTop:20}}>{error}</p>}

      {result&&hole&&strategy&&(<div style={{marginTop:28,display:"flex",flexDirection:"column",gap:12}}>

        {/* Prev / Next hole buttons */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <button
            onClick={()=>goToHole(holeNumber-1)}
            disabled={holeNumber<=1}
            style={{padding:"6px 14px",fontSize:13,fontWeight:600,background:"white",color:holeNumber<=1?"#ccc":"#0f6e56",border:`1px solid ${holeNumber<=1?"#eee":"#0f6e56"}`,borderRadius:8,cursor:holeNumber<=1?"not-allowed":"pointer"}}>
            ← Prev Hole
          </button>
          <span style={{fontSize:13,fontWeight:600,color:"#0f6e56"}}>Hole {holeNumber}</span>
          <button
            onClick={()=>goToHole(holeNumber+1)}
            disabled={holeNumber>=totalHoles}
            style={{padding:"6px 14px",fontSize:13,fontWeight:600,background:"white",color:holeNumber>=totalHoles?"#ccc":"#0f6e56",border:`1px solid ${holeNumber>=totalHoles?"#eee":"#0f6e56"}`,borderRadius:8,cursor:holeNumber>=totalHoles?"not-allowed":"pointer"}}>
            Next Hole →
          </button>
        </div>

        {/* Confidence badge */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:1,color:confidenceColor[conf]??"#666",textTransform:"uppercase"}}>{conf} confidence</span>
          <span style={{fontSize:11,color:"white"}}>
            {filterCount>0?`${filteredEnriched.length} holes (filtered)`:(ds?.exact_hole_history>0?`${ds.exact_hole_history}× this hole · ${ds.similar_holes_used} similar`:`${ds?.similar_holes_used} similar holes`)}
          </span>
        </div>

        {/* Hole info */}
        <div style={card("#f0f0f0")}>
          <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 8px"}}>HOLE INFO</p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontSize:14,color:"#333"}}>Par {hole.par}</span>
            <span style={{fontSize:14,color:"#333"}}>{hole.yards} yds</span>
            <span style={{fontSize:14,color:"#333"}}>SI {hole.stroke_index}</span>
            {course?.rating&&<span style={{fontSize:14,color:"#666"}}>Rating {course.rating}</span>}
            {course?.slope&&<span style={{fontSize:14,color:"#666"}}>Slope {course.slope}</span>}
          </div>
          {hole.dogleg_direction&&<p style={{fontSize:13,color:"#555",margin:"4px 0 0"}}>Dogleg: {DOGLEG_LABELS[hole.dogleg_direction]??hole.dogleg_direction}</p>}
          {hole.approach_green_depth>0&&<p style={{fontSize:13,color:"#555",margin:"4px 0 0"}}>Green depth: {hole.approach_green_depth} yds</p>}
        </div>

        {/* Avg score */}
        <div style={{...card("#f0f0f0"),display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px"}}>
          <span style={{fontSize:13,color:"#0f6e56"}}>Avg on {filterCount>0?"filtered":"similar"} holes</span>
          <span style={{fontSize:20,fontWeight:700,color:(t?.avgScoreToPar??0)>0?"#c0392b":"#27ae60"}}>
            {t?fmtSTP(t.avgScoreToPar??0):ds?.avg_score_to_par}
          </span>
        </div>

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

        {/* Tee strategy — grid + hazards (par 4/5 only) */}
        {hole.par>=4&&(
          <div style={card("#f6f6f6")}>
            <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 12px"}}>TEE STRATEGY</p>

            {/* Tee Shot Hazards */}
            {hazardImpacts.length>0&&(
              <div style={{marginBottom:14}}>
                <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 6px"}}>TEE SHOT HAZARDS</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
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

            {/* Tee Shot Grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,marginBottom:3}}>
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
                  const isLeftCol=ci===0;
                  const isRightCol=ci===2;
                  const leftHazard=hole.tee_water_out_left||hole.tee_tree_hazard_left||hole.tee_bunkers_left;
                  const rightHazard=hole.tee_water_out_right||hole.tee_tree_hazard_right||hole.tee_bunkers_right;
                  const greyed=(isLeftCol&&!leftHazard)||(isRightCol&&!rightHazard);
                  return <GridCell key={ci} likelihood={col.likelihood} impact={col.impact} count={col.count} greyed={greyed}/>;
                })}
              </div>
            ))}
          </div>
        )}

        {/* Approach strategy */}
        <div style={card("#f6f6f6")}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:0}}>APPROACH</p>
            {approachDist!=null&&(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#0f6e56"}}>Distance (yds)</span>
                <input type="number" min={0} max={700}
                  value={approachDistOverride??approachDist}
                  onChange={e=>{setApproachDistOverride(Number(e.target.value));}}
                  onBlur={e=>{const v=Number(e.target.value);if(v!==(approachDistOverride??approachDist)){setApproachDistOverride(v);handleSubmit(v);}}}
                  onKeyDown={e=>{if(e.key==="Enter"){const v=Number((e.target as HTMLInputElement).value);setApproachDistOverride(v);handleSubmit(v);}}}
                  style={{width:64,padding:"3px 6px",fontSize:13,border:"1px solid #0f6e56",borderRadius:6,color:"#0f6e56",fontWeight:600,textAlign:"center"}}
                />
              </div>
            )}
          </div>
          <div style={{fontSize:22,fontWeight:700,color:"#0f6e56",marginBottom:8}}>
            {t?pct(t.girPct):"—"} <span style={{fontSize:14,color:"#0f6e56",fontWeight:400}}>GIR</span>
          </div>
          {t&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
              {[{label:"Hit",v:t.apprHitPct,c:"#27ae60"},{label:"Left",v:t.apprMissLeftPct,c:"#2980b9"},{label:"Right",v:t.apprMissRightPct,c:"#8e44ad"},{label:"Short",v:t.apprMissShortPct,c:"#e67e22"},{label:"Long",v:t.apprMissLongPct,c:"#c0392b"}].map(({label,v,c})=>(
                <div key={label} style={{background:"#eee",borderRadius:8,padding:"4px 10px",fontSize:12}}>
                  <span style={{color:"#0f6e56"}}>{label}: </span><span style={{fontWeight:600,color:c}}>{pct(v)}</span>
                </div>
              ))}
            </div>
          )}
          {t&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
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
        </div>

        {/* Warning */}
        {strategy.warning&&(
          <div style={{background:"#fff4e5",border:"1px solid #f0a500",borderRadius:12,padding:"14px 20px"}}>
            <p style={{fontSize:11,color:"#b37400",fontWeight:700,letterSpacing:1,margin:"0 0 6px"}}>⚠ WATCH OUT</p>
            <p style={{fontSize:13,color:"#7a4f00",margin:0}}>{strategy.warning}</p>
          </div>
        )}

        {/* Tendencies */}
        {ds?.insights?.length>0&&(
          <div style={card("#f0f9f6")}>
            <p style={{fontSize:11,color:"#0f6e56",fontWeight:700,letterSpacing:1,margin:"0 0 8px"}}>YOUR TENDENCIES ON SIMILAR HOLES</p>
            <ul style={{margin:0,paddingLeft:16}}>
              {ds.insights.map((ins:string,i:number)=><li key={i} style={{fontSize:13,color:"#333",marginBottom:4}}>{ins}</li>)}
            </ul>
          </div>
        )}

        {/* Hole History */}
        {result.holeHistory&&result.holeHistory.length>0&&<HoleHistorySection history={result.holeHistory}/>}

        {/* Hole Summary */}
        <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 14px"}}>
          <Section title="Hole Summary">
            {[
              {label:"Trees/Haz left",v:hole.tee_tree_hazard_left},{label:"Trees/Haz right",v:hole.tee_tree_hazard_right},
              {label:"Trees/Haz across",v:hole.tee_tree_hazard_across},{label:"Bunkers left",v:hole.tee_bunkers_left},
              {label:"Bunkers right",v:hole.tee_bunkers_right},{label:"Water/OB left",v:hole.tee_water_out_left},
              {label:"Water/OB right",v:hole.tee_water_out_right},{label:"Water/OB across",v:hole.tee_water_out_across},
            ].some(x=>x.v)&&(
              <div style={{marginBottom:12}}>
                <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 6px"}}>TEE SHOT HAZARDS</p>
                {[
                  {label:"Trees/Haz left",v:hole.tee_tree_hazard_left},{label:"Bunkers left",v:hole.tee_bunkers_left},{label:"Water/OB left",v:hole.tee_water_out_left},
                  {label:"Trees/Haz right",v:hole.tee_tree_hazard_right},{label:"Bunkers right",v:hole.tee_bunkers_right},{label:"Water/OB right",v:hole.tee_water_out_right},
                  {label:"Trees/Haz across",v:hole.tee_tree_hazard_across},{label:"Water/OB across",v:hole.tee_water_out_across},
                ].filter(x=>x.v).map(x=>(
                  <span key={x.label} style={{display:"inline-block",background:"#eee",borderRadius:6,padding:"2px 8px",fontSize:12,marginRight:4,marginBottom:4,color:"#555"}}>{x.label}</span>
                ))}
              </div>
            )}
            {[hole.approach_tree_hazard_left,hole.approach_tree_hazard_right,hole.approach_tree_hazard_long,hole.approach_water_out_left,hole.approach_water_out_right,hole.approach_water_out_short,hole.approach_water_out_long].some(Boolean)&&(
              <div style={{marginBottom:12}}>
                <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 6px"}}>APPROACH HAZARDS</p>
                {[
                  {label:"Trees/Haz left",v:hole.approach_tree_hazard_left},{label:"Water/OB left",v:hole.approach_water_out_left},
                  {label:"Trees/Haz right",v:hole.approach_tree_hazard_right},{label:"Water/OB right",v:hole.approach_water_out_right},
                  {label:"Trees/Haz long",v:hole.approach_tree_hazard_long},{label:"Water/OB short",v:hole.approach_water_out_short},
                  {label:"Water/OB long",v:hole.approach_water_out_long},
                ].filter(x=>x.v).map(x=>(
                  <span key={x.label} style={{display:"inline-block",background:"#eee",borderRadius:6,padding:"2px 8px",fontSize:12,marginRight:4,marginBottom:4,color:"#555"}}>{x.label}</span>
                ))}
              </div>
            )}
            <div>
              <p style={{fontSize:11,color:"#0f6e56",fontWeight:600,letterSpacing:1,margin:"0 0 6px"}}>GREENSIDE</p>
              <GreensideWidget readOnly value={{
                long_left:  hole.approach_bunker_long_left?2:hole.approach_green_long_left?1:0,
                long_middle:hole.approach_bunker_long_middle?2:hole.approach_green_long_middle?1:0,
                long_right: hole.approach_bunker_long_right?2:hole.approach_green_long_right?1:0,
                middle_left:hole.approach_bunker_middle_left?2:hole.approach_green_middle_left?1:0,
                middle_right:hole.approach_bunker_middle_right?2:hole.approach_green_middle_right?1:0,
                short_left: hole.approach_bunker_short_left?2:hole.approach_green_short_left?1:0,
                short_middle:hole.approach_bunker_short_middle?2:hole.approach_green_short_middle?1:0,
                short_right:hole.approach_bunker_short_right?2:hole.approach_green_short_right?1:0,
              }}/>
            </div>
          </Section>
        </div>

        {/* Filters */}
        <div style={{background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <p style={{fontSize:12,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1,margin:0}}>
              Filters {filterCount>0&&<span style={{fontSize:10,background:"#0f6e56",color:"#fff",borderRadius:10,padding:"1px 6px",marginLeft:6}}>{filterCount}</span>}
            </p>
            {filterCount>0&&<button onClick={()=>setFilters(DEFAULT_FILTERS(totalRounds))} style={{fontSize:12,color:"#0f6e56",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Reset</button>}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:12}}>
            <div style={{flex:"1 1 120px"}}>
              <p style={fl}>Rounds</p>
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <button style={pill(!filters.useLastN)} onClick={()=>setFilters(f=>({...f,useLastN:false}))}>All</button>
                <button style={pill(filters.useLastN)} onClick={()=>setFilters(f=>({...f,useLastN:true}))}>Last</button>
                {filters.useLastN&&(
                  <input type="number" min={1} max={totalRounds} value={filters.lastN}
                    onChange={e=>setFilters(f=>({...f,lastN:Math.max(1,Math.min(totalRounds,Number(e.target.value)))}))}
                    style={{width:44,padding:"4px 5px",borderRadius:8,border:"1px solid #0f6e56",fontSize:12,color:"#0f6e56",textAlign:"center"}}/>
                )}
              </div>
            </div>
            <div style={{flex:"0 0 auto"}}>
              <p style={fl}>Par</p>
              <div style={{display:"flex",gap:4}}>
                {["3","4","5"].map(p=>(
                  <button key={p} style={pill(filters.pars.has(p))} onClick={()=>setFilters(f=>({...f,pars:toggleSet(f.pars,p)}))}>Par {p}</button>
                ))}
              </div>
            </div>
          </div>
          <Section title="Hole Similarity" badge={(filters.siDelta?1:0)+(filters.yardsDelta?1:0)}>
            <div style={{marginBottom:10}}>
              <p style={fl}>Hole Handicap (vs SI {targetHole?.stroke_index})</p>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[{label:"±1",val:"pm1"},{label:"±2",val:"pm2"},{label:"±3",val:"pm3"}].map(({label,val})=>(
                  <button key={val} style={pill(filters.siDelta===val)} onClick={()=>setFilters(f=>({...f,siDelta:f.siDelta===val?"":val}))}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Hole Yards (vs {targetHole?.yards} yds)</p>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[{label:"±10 yds",val:"pm10"},{label:"±20 yds",val:"pm20"},{label:"±30 yds",val:"pm30"}].map(({label,val})=>(
                  <button key={val} style={pill(filters.yardsDelta===val)} onClick={()=>setFilters(f=>({...f,yardsDelta:f.yardsDelta===val?"":val}))}>{label}</button>
                ))}
              </div>
            </div>
          </Section>
          <Section title="Driving / Tee" badge={filters.drivingClubs.size+Object.values(filters.teeHazards).filter(Boolean).length}>
            <div style={{marginBottom:10}}>
              <p style={fl}>Driving Club</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {DRIVE_CLUBS.map(c=>(
                  <button key={c} style={pill(filters.drivingClubs.has(c))} onClick={()=>setFilters(f=>({...f,drivingClubs:toggleSet(f.drivingClubs,c)}))}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Tee Hazards</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {([
                  {label:"Trees L",key:"teeTreeLeft"},{label:"Trees R",key:"teeTreeRight"},
                  {label:"Bkr L",key:"teeBunkerLeft"},{label:"Bkr R",key:"teeBunkerRight"},
                  {label:"Water L",key:"teeWaterLeft"},{label:"Water R",key:"teeWaterRight"},
                ] as {label:string;key:keyof typeof filters.teeHazards}[]).map(({label,key})=>(
                  <button key={key} style={pill(filters.teeHazards[key])} onClick={()=>setFilters(f=>({...f,teeHazards:{...f.teeHazards,[key]:!f.teeHazards[key]}}))}>{label}</button>
                ))}
              </div>
            </div>
          </Section>
          <Section title="Approach / Greenside" badge={filters.apprClubs.size+(filters.greenDepth?1:0)+(Object.values(filters.greensideFilter).some(v=>v!==0)?1:0)}>
            <div style={{marginBottom:10}}>
              <p style={fl}>Approach Club</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {APPROACH_CLUBS.map(c=>(
                  <button key={c} style={pill(filters.apprClubs.has(c))} onClick={()=>setFilters(f=>({...f,apprClubs:toggleSet(f.apprClubs,c)}))}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <p style={fl}>Green Depth (yards)</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {[{label:"< 20",val:"lt20"},{label:"20-24",val:"20-24"},{label:"25-29",val:"25-29"},{label:"30-34",val:"30-34"},{label:"35-39",val:"35-39"},{label:"40+",val:"gt40"}].map(({label,val})=>(
                  <button key={val} style={pill(filters.greenDepth===val)} onClick={()=>setFilters(f=>({...f,greenDepth:f.greenDepth===val?"":val}))}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={fl}>Greenside Position</p>
              <p style={{fontSize:10,color:"#0f6e56",margin:"0 0 4px",fontStyle:"italic"}}>Tap to cycle: grey = any · teal = green side · sand = bunker</p>
              <GreensideWidget value={filters.greensideFilter} onChange={v=>setFilters(f=>({...f,greensideFilter:v}))}/>
              {Object.values(filters.greensideFilter).some(v=>v!==0)&&(
                <button onClick={()=>setFilters(f=>({...f,greensideFilter:defaultGS()}))} style={{marginTop:4,fontSize:11,color:"#0f6e56",background:"none",border:"none",cursor:"pointer",textDecoration:"underline",padding:0}}>Clear greenside</button>
              )}
            </div>
          </Section>
        </div>

        {conf==="low"&&(
          <p style={{fontSize:12,color:"white",textAlign:"center",margin:0}}>Limited data — strategy based on general tendencies. Play more rounds to improve accuracy.</p>
        )}
      </div>)}

      {/* HI Estimator */}
      {(()=>{
        const rating=selectedCourse?.rating??null;
        const slope=(selectedCourse?.slope??null)||113;
        const hiRatingNum=hiRating?parseFloat(hiRating):(rating??0);
        const hiSlopeNum=hiSlope?parseFloat(hiSlope):(slope??113);
        const hiAgsNum=parseFloat(hiAgs);
        const hiDiff=!isNaN(hiAgsNum)&&hiRatingNum&&hiSlopeNum
          ?(hiAgsNum-hiRatingNum)*113/hiSlopeNum:null;
        const projectedHI=(()=>{
          if(hiDiff===null||!existingDiffs)return null;
          const all=[...existingDiffs,hiDiff].slice(-20);
          if(all.length<3)return null;
          const sorted=[...all].sort((a,b)=>a-b);
          const count=all.length<=6?1:all.length<=8?2:all.length<=11?3:all.length<=14?4:all.length<=16?5:all.length<=18?6:all.length===19?7:8;
          const best=sorted.slice(0,count);
          return Math.floor(best.reduce((s,d)=>s+d,0)/best.length*10)/10;
        })();
        return(
          <div style={{marginTop:24,background:"#f9f9f9",border:"1px solid #eee",borderRadius:12,padding:"16px 20px"}}>
            <p style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1,margin:"0 0 12px"}}>HI Estimator</p>
            <p style={{fontSize:12,color:"#0f6e56",margin:"0 0 12px"}}>Enter a score to see what handicap index it would produce.</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={labelStyle}>AGS</label>
                <input type="number" placeholder="e.g. 88" value={hiAgs} onChange={e=>setHiAgs(e.target.value)} style={{...selectStyle,color:"#1a1a1a"}}/>
              </div>
              <div>
                <label style={labelStyle}>Rating</label>
                <input type="number" step="0.1" placeholder={rating?String(rating):"e.g. 71.4"} value={hiRating} onChange={e=>setHiRating(e.target.value)} style={{...selectStyle,color:"#1a1a1a"}}/>
              </div>
              <div>
                <label style={labelStyle}>Slope</label>
                <input type="number" placeholder={slope?String(slope):"e.g. 128"} value={hiSlope} onChange={e=>setHiSlope(e.target.value)} style={{...selectStyle,color:"#1a1a1a"}}/>
              </div>
            </div>
            {hiDiff!==null&&(
              <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                <div style={{background:"#eee",borderRadius:8,padding:"8px 14px"}}>
                  <span style={{fontSize:11,color:"#0f6e56"}}>Differential: </span>
                  <span style={{fontWeight:700,color:"#0f6e56",fontSize:15}}>{hiDiff.toFixed(1)}</span>
                </div>
                {projectedHI!==null&&(
                  <div style={{background:"#0f6e56",borderRadius:8,padding:"8px 14px"}}>
                    <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Projected HI: </span>
                    <span style={{fontWeight:700,color:"white",fontSize:15}}>{projectedHI.toFixed(1)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </main>
  );
}
