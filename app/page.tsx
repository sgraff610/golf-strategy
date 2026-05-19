"use client";
import { useState, useEffect } from "react";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const ROOT = {
  "--bg": "#eef1f4",
  "--paper": "#f7f9fb",
  "--paper-alt": "#e6ebf0",
  "--ink": "#131821",
  "--ink-soft": "#253041",
  "--ink-mute": "#5d6b7a",
  "--muted": "#5d6b7a",
  "--muted-2": "#8995a3",
  "--line": "#d7dde3",
  "--green": "#0f6e56",
  "--green-deep": "#084634",
  "--green-soft": "#d2e8df",
  "--accent": "#f29450",
  "--accent-deep": "#b85320",
  "--accent-soft": "#fde0c8",
  "--sand": "#c8a84b",
  "--flag": "#c94a2a",
  "--good": "#1e8449",
  "--font-display": "Georgia, 'Times New Roman', serif",
  "--font-ui": "system-ui, -apple-system, sans-serif",
  "--font-mono": "'Courier New', Courier, monospace",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
  minHeight: "100vh",
} as React.CSSProperties;

// ─── Sub-components ────────────────────────────────────────────────────────────
function Sparkline({ data, w, h, stroke, fill }: { data: number[]; w: number; h: number; stroke: string; fill: string }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1, pad = 2;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map(v => pad + (1 - (v - min) / range) * (h - pad * 2));
  const linePts = xs.map((x, i) => `${x},${ys[i]}`).join(" L ");
  const fillPts = `M ${xs[0]},${ys[0]} L ${linePts.slice(2)} L ${xs[xs.length-1]},${h} L ${xs[0]},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block", overflow:"visible" }}>
      <path d={fillPts} fill={fill} />
      <path d={`M ${linePts}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const WX_ICONS: Record<string,string> = { sunny:"☀️","partly-cloudy":"⛅",cloudy:"☁️",rainy:"🌧️",stormy:"⛈️",windy:"💨" };
function WxIcon({ kind, size }: { kind: string; size: number }) {
  return <span style={{ fontSize:size, lineHeight:1, display:"block" }}>{WX_ICONS[kind] ?? "⛅"}</span>;
}

function CoachGlyph({ size }: { size: number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:"linear-gradient(135deg, var(--green) 0%, var(--green-deep) 100%)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:Math.round(size*0.45) }}>
      ⛳
    </div>
  );
}

function ImpactBars({ data, width, height, labelColor = "rgba(255,255,255,0.55)" }: { data: Array<{x:string;v:number;hi?:boolean}>; width:number; height:number; labelColor?: string }) {
  if (!data.length) return null;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.v)), 0.01);
  const rows = data.length, barH = Math.max(14, Math.floor((height-(rows-1)*8)/rows));
  const labelW = 70, barMaxW = width - labelW - 40;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow:"visible" }}>
      {data.map((d,i) => {
        const y = i*(barH+8), bw = Math.abs(d.v)/maxAbs*barMaxW;
        const col = d.hi?"#f29450":d.v>0?"#c94a2a":"#1e8449";
        return (
          <g key={d.x}>
            <text x={labelW-6} y={y+barH/2+4} textAnchor="end" fill={labelColor} fontSize={10}>{d.x}</text>
            <rect x={labelW} y={y} width={bw} height={barH} fill={col} rx={3}/>
            <text x={labelW+bw+5} y={y+barH/2+4} fill={col} fontSize={10} fontWeight={700}>{(d.v>0?"+":"")+d.v.toFixed(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function computeHI(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a,b)=>a-b);
  const count = last20.length<=6?1:last20.length<=8?2:last20.length<=11?3:last20.length<=14?4:last20.length<=16?5:last20.length<=18?6:last20.length===19?7:8;
  return Math.floor(sorted.slice(0,count).reduce((s,d)=>s+d,0)/count*10)/10;
}
function fmtDate(iso: string): string {
  try { return new Date(iso+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  catch { return iso; }
}
function fmtDateShort(iso: string): string {
  try { return new Date(iso+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
  catch { return iso; }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [diffs, setDiffs] = useState<number[]>([]);
  const [lastRound, setLastRound] = useState<any>(null);
  const [lastCourse, setLastCourse] = useState("");
  const [planPeek, setPlanPeek] = useState<Array<{hole:number;par:number;club:string;aim:string;note:string}>>([]);
  const [leakData, setLeakData] = useState<Array<{x:string;v:number;hi?:boolean}>>([]);
  const [leakTitle, setLeakTitle] = useState("—");
  const [leakImpact, setLeakImpact] = useState(0);
  const [leakCount, setLeakCount] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [recentRoundsData, setRecentRoundsData] = useState<Array<{date:string;weekday:string;course:string;score:number;diff:number;badges:string[]}>>([]);
  const [bestScore, setBestScore] = useState<number|null>(null);
  const [bestCourse, setBestCourse] = useState("");
  const [streak, setStreak] = useState(0);
  // Next upcoming round
  const [nextRound, setNextRound] = useState<any>(null);
  const [nextRoundCourse, setNextRoundCourse] = useState<any>(null);
  const [nextRoundPlan, setNextRoundPlan] = useState<any>(null);
  const [planAdders, setPlanAdders] = useState<Array<{hole:number;par:number;avg:number;count:number}>>([]);
  const [planSavers, setPlanSavers] = useState<Array<{hole:number;par:number;avg:number;count:number}>>([]);
  const [loading, setLoading] = useState(true);
  // Responsive
  const [windowWidth, setWindowWidth] = useState(1440);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    async function load() {
      const { supabase } = await import("@/lib/supabase");

      const { data: rounds } = await supabase
        .from("rounds")
        .select("id,course_id,course_name,date,holes_played,holes,score_differential,tee_box")
        .order("date", { ascending: true });

      if (!rounds?.length) { setLoading(false); return; }
      setTotalRounds(rounds.length);

      const courseIds = [...new Set(rounds.map((r:any)=>r.course_id).filter(Boolean))];
      let courseMap: Record<string,any> = {};
      if (courseIds.length) {
        const { data: cs } = await supabase.from("courses").select("id,rating,slope,hole_count,name").in("id", courseIds);
        (cs??[]).forEach((c:any) => { courseMap[c.id] = c; });
      }

      // Differentials
      const allDiffs = rounds.map((r:any) => {
        if (r.score_differential!=null) return r.holes_played<=9?r.score_differential*2:r.score_differential;
        const ci = courseMap[r.course_id];
        if (!ci?.rating||!ci?.slope) return null;
        const scored=(r.holes??[]).filter((h:any)=>h.score&&Number(h.score)>0);
        if (!scored.length) return null;
        const ags=scored.reduce((s:number,h:any)=>s+Math.min(Number(h.score)||0,(h.par||4)+2),0);
        const is9=(r.holes_played??scored.length)<=9,is9C=(ci.hole_count??18)<=9;
        let rat=ci.rating;
        if(is9&&!is9C) rat/=2; else if(!is9&&is9C) rat*=2;
        return is9?(113/ci.slope*(ags-rat))*2:(ags-rat)*113/ci.slope;
      }).filter((d:any):d is number=>d!==null);
      setDiffs(allDiffs);

      // Last completed round
      const completedAll=[...rounds].reverse().filter((r:any)=>(r.holes??[]).some((h:any)=>Number(h.score)>0));
      if (completedAll.length) {
        setLastRound(completedAll[0]);
        setLastCourse(courseMap[completedAll[0].course_id]?.name??completedAll[0].course_name??"");
      }

      // Plan peek
      const planRound=completedAll.find((r:any)=>(r.holes??[]).some((h:any)=>h.aim&&h.aim.length));
      if (planRound) {
        setPlanPeek((planRound.holes??[]).filter((h:any)=>h.aim).slice(0,4).map((h:any)=>({
          hole:h.hole,par:h.par,club:h.plan_club||h.club||"—",aim:h.aim||"CF",note:h.note||"",
        })));
      }

      // Biggest leak
      const allHoles:any[]=rounds.flatMap((r:any)=>(r.holes??[]).filter((h:any)=>Number(h.score)>0));
      if (allHoles.length>10) {
        const baseline=allHoles.reduce((s:number,h:any)=>s+(Number(h.score)-h.par),0)/allHoles.length;
        const groups:Record<string,number[]>={};
        const add=(k:string,h:any)=>{if(!groups[k])groups[k]=[];groups[k].push(Number(h.score)-h.par);};
        allHoles.forEach((h:any)=>{
          add(`Par ${h.par}`,h);
          if(h.par>=4&&h.tee_accuracy) add(`Drive ${h.tee_accuracy}`,h);
          if(h.appr_accuracy) add(`Approach ${h.appr_accuracy}`,h);
        });
        const leaks=Object.entries(groups).filter(([,v])=>v.length>=5)
          .map(([key,vals])=>({key,avg:vals.reduce((s,v)=>s+v,0)/vals.length,count:vals.length}))
          .map(g=>({...g,impact:g.avg-baseline})).sort((a,b)=>b.impact-a.impact);
        if(leaks.length>=2){
          setLeakTitle(leaks[0].key);setLeakImpact(leaks[0].impact);setLeakCount(leaks[0].count);
          setLeakData(leaks.slice(0,4).map((l,i)=>({x:l.key,v:l.impact,hi:i===0})));
        }
      }

      // Recent rounds for activity rail
      const recentArr=completedAll.slice(0,4).map((r:any)=>{
        const holes=(r.holes??[]).filter((h:any)=>Number(h.score)>0);
        const score=holes.reduce((s:number,h:any)=>s+Number(h.score),0);
        const ci=courseMap[r.course_id];
        let diff=0;
        if(r.score_differential!=null) diff=r.holes_played<=9?r.score_differential*2:r.score_differential;
        else if(ci?.rating&&ci?.slope){const is9=(r.holes_played??holes.length)<=9;const rat=is9&&(ci.hole_count??18)>9?ci.rating/2:ci.rating;diff=is9?(113/ci.slope*(score-rat))*2:(score-rat)*113/ci.slope;}
        const d=new Date(r.date+"T12:00:00");
        return{date:d.toLocaleDateString("en-US",{month:"short",day:"numeric"}),weekday:d.toLocaleDateString("en-US",{weekday:"short"}),course:ci?.name??r.course_name??"Unknown",score,diff,badges:[] as string[]};
      });
      setRecentRoundsData(recentArr);

      // Best score + streak
      let best:number|null=null,bCourse="",s=0,sDone=false;
      for(const r of completedAll){
        const holes=(r.holes??[]).filter((h:any)=>Number(h.score)>0);
        const score=holes.reduce((sum:number,h:any)=>sum+Number(h.score),0);
        if(holes.length>=9){
          if(best===null||score<best){best=score;bCourse=courseMap[r.course_id]?.name??r.course_name??"";}
          if(!sDone){if(score<90)s++;else sDone=true;}
        }
      }
      setBestScore(best);setBestCourse(bCourse);setStreak(s);

      // ── Next upcoming round (date >= today) ──────────────────────────────
      const todayStr=new Date().toISOString().split("T")[0];
      const{data:nr}=await supabase.from("rounds").select("id,course_id,course_name,date,tee_box,holes_played")
        .gte("date",todayStr).order("date",{ascending:true}).limit(1).maybeSingle();
      if(nr){
        setNextRound(nr);
        let nrCourse=courseMap[nr.course_id]??null;
        if(!nrCourse&&nr.course_id){
          const{data:nc}=await supabase.from("courses").select("id,name,rating,slope,hole_count").eq("id",nr.course_id).maybeSingle();
          if(nc) nrCourse=nc;
        }
        setNextRoundCourse(nrCourse);
        const{data:np}=await supabase.from("round_plans").select("posture,target_score,answers")
          .eq("course_id",nr.course_id).eq("round_date",nr.date).maybeSingle();
        setNextRoundPlan(np??null);
      }

      // Per-hole performance for pre-round plan card
      const holeMap: Record<number, {stps:number[];par:number}> = {};
      const sourceRounds = nr
        ? completedAll.filter((r:any) => r.course_id === nr.course_id)
        : completedAll;
      const fallback = sourceRounds.length === 0;
      const finalSource = fallback ? completedAll : sourceRounds;
      for (const r of finalSource) {
        for (const h of (r.holes ?? [])) {
          const s = Number(h.score);
          if (!s || !h.par) continue;
          if (!holeMap[h.hole]) holeMap[h.hole] = {stps:[], par:h.par};
          holeMap[h.hole].stps.push(s - h.par);
        }
      }
      const holeAvg = Object.entries(holeMap).map(([hole, v]) => ({
        hole: Number(hole), par: v.par,
        avg: v.stps.reduce((a,b)=>a+b,0) / v.stps.length,
        count: v.stps.length,
      }));
      setPlanAdders([...holeAvg].sort((a,b) => b.avg - a.avg).slice(0, 2));
      setPlanSavers([...holeAvg].sort((a,b) => a.avg - b.avg).slice(0, 2));

      setLoading(false);
    }
    load();
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const hi=computeHI(diffs);
  const last20=diffs.slice(-20),prev20=diffs.slice(-40,-20);
  const trend30=last20.length>=4&&prev20.length>=4?(computeHI(prev20)??0)-(hi??0):null;
  const sparkData=last20.map(d=>-d);

  const lastHoles:any[]=lastRound?.holes??[];
  const scoredHoles=lastHoles.filter((h:any)=>Number(h.score)>0);
  const totalScore=scoredHoles.reduce((s:number,h:any)=>s+Number(h.score),0);
  const totalPar=scoredHoles.reduce((s:number,h:any)=>s+(h.par||4),0);
  const fwyHit=scoredHoles.filter((h:any)=>h.par>=4&&h.tee_accuracy==="Hit").length;
  const fwyTotal=scoredHoles.filter((h:any)=>h.par>=4&&h.tee_accuracy).length;
  const totalPutts=scoredHoles.reduce((s:number,h:any)=>s+(Number(h.putts)||0),0);
  const lastSTP=totalScore-totalPar;
  const lastDiff=diffs.length>0?diffs[diffs.length-1]:null;

  // Next tee data
  const nrCourseName=nextRound?(nextRoundCourse?.name??nextRound.course_name??"Unknown Course"):(lastCourse||"No course yet");
  const nrDate=nextRound?fmtDateShort(nextRound.date):null;
  const nrTeeBox=nextRound?.tee_box??null;
  const nrRating=nextRoundCourse?.rating??null;
  const nrSlope=nextRoundCourse?.slope??null;
  const nrGoal=nextRoundPlan?.target_score??null;

  // 5-day forecast: shift window so the last day shown is the golf day if it's > 4 days out
  const todayMs = new Date().setHours(0,0,0,0);
  const nrDaysOut = nextRound
    ? Math.round((new Date(nextRound.date + "T12:00:00").getTime() - todayMs) / 86400000)
    : 0;
  const forecastStart = nextRound && nrDaysOut > 4 ? nrDaysOut - 4 : 0;
  const wxIcons = ["sunny","partly-cloudy","partly-cloudy","cloudy","rainy","sunny","partly-cloudy"];
  const wxTemps = [74,71,73,68,66,72,70];
  const forecastDays = Array.from({length:5}, (_,i) => {
    const offset = forecastStart + i;
    const d = new Date(); d.setDate(d.getDate() + offset);
    return {
      day: d.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase().slice(0,3),
      icon: wxIcons[offset % wxIcons.length],
      hi: wxTemps[offset % wxTemps.length],
      isTee: nextRound?.date === d.toISOString().split("T")[0],
    };
  });

  const briefDate=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}).toUpperCase();

  // ── Responsive breakpoints ──────────────────────────────────────────────────
  const isMobile=windowWidth<768;
  const isTablet=windowWidth>=768&&windowWidth<1100;

  const containerPad=isMobile?"16px 16px 32px":isTablet?"20px 24px 40px":"20px 48px 40px";
  const statCols=isMobile?"1fr":isTablet?"1.4fr 1fr":"1.6fr 1fr 1fr";
  const mainCols=isMobile?"1fr":isTablet?"1fr 1fr":"1.1fr 1.1fr 1fr";
  const actCols=isMobile?"1fr 1fr":"repeat(4, 1fr)";
  const bigNumSize=isMobile?58:90;
  const smallNumSize=isMobile?28:38;

  return (
    <div style={ROOT}>
      <div style={{ maxWidth:1440, margin:"0 auto", padding:containerPad }}>

        {loading ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"var(--ink-mute)", fontFamily:"var(--font-mono)", fontSize:12, letterSpacing:2 }}>
            LOADING YOUR SCORECARD…
          </div>
        ) : (
          <>
            {/* ── Stat row ───────────────────────────────────────────────────── */}
            <div style={{ display:"grid", gridTemplateColumns:statCols, gap:14, marginBottom:24 }}>
              {/* Big HI */}
              <div style={B.statBig}>
                <div style={B.statLabel}><span style={B.statDot}/> USGA HANDICAP INDEX</div>
                <div style={{...B.statBigNum, fontSize:bigNumSize, fontVariantNumeric:"tabular-nums"}}>
                  {hi!=null?hi.toFixed(1):"—"}
                </div>
                <div style={B.statBigFoot}>
                  {trend30!=null&&trend30>0&&<span style={B.statDeltaGood}>▼ {trend30.toFixed(1)}</span>}
                  <span style={B.statBigSub}>{trend30!=null&&trend30>0?"vs 30 days ago · ":""}best 8 of 20</span>
                </div>
                {sparkData.length>=4&&(
                  <div style={{ marginTop:16 }}>
                    <Sparkline data={sparkData} w={isMobile?260:300} h={42} stroke="var(--green-deep)" fill="rgba(15,110,86,0.14)"/>
                  </div>
                )}
              </div>

              {/* Small stats — 2×2 grid on mobile/tablet, two separate cols on desktop */}
              {(isMobile||isTablet) ? (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, alignContent:"start" }}>
                  {[
                    {label:"LAST ROUND",val:totalScore||"—",sub:totalScore>0?`${lastSTP>0?"+":""}${lastSTP===0?"E":lastSTP} at ${lastCourse}`:"No rounds yet"},
                    {label:"STREAK",val:streak,sub:"sub-90, current",suffix:" rounds"},
                    {label:"ROUNDS LOGGED",val:totalRounds,sub:"season 2026"},
                    {label:"CAREER BEST",val:bestScore??("—" as any),sub:bestCourse||"No rounds yet"},
                  ].map(({label,val,sub,suffix})=>(
                    <div key={label} style={{...B.statSmall, padding:"14px 16px"}}>
                      <div style={B.statLabel}><span style={B.statDot}/> {label}</div>
                      <div style={{...B.statSmallNum, fontSize:smallNumSize, fontVariantNumeric:"tabular-nums"}}>
                        {val}{suffix&&<span style={B.streakUnit}>{suffix}</span>}
                      </div>
                      <div style={B.statSmallSub}>{sub}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={B.statCol}>
                    <div style={B.statSmall}>
                      <div style={B.statLabel}><span style={B.statDot}/> LAST ROUND</div>
                      <div style={{...B.statSmallNum, fontVariantNumeric:"tabular-nums"}}>{totalScore||"—"}</div>
                      <div style={B.statSmallSub}>{totalScore>0?`${lastSTP>0?"+":""}${lastSTP===0?"E":lastSTP} at ${lastCourse}`:"No rounds yet"}</div>
                    </div>
                    <div style={B.statSmall}>
                      <div style={B.statLabel}><span style={B.statDot}/> STREAK</div>
                      <div style={{...B.statSmallNum, fontVariantNumeric:"tabular-nums"}}>{streak}<span style={B.streakUnit}> rounds</span></div>
                      <div style={B.statSmallSub}>sub-90, current</div>
                    </div>
                  </div>
                  <div style={B.statCol}>
                    <div style={B.statSmall}>
                      <div style={B.statLabel}><span style={B.statDot}/> ROUNDS LOGGED</div>
                      <div style={{...B.statSmallNum, fontVariantNumeric:"tabular-nums"}}>{totalRounds}</div>
                      <div style={B.statSmallSub}>season 2026</div>
                    </div>
                    <div style={B.statSmall}>
                      <div style={B.statLabel}><span style={B.statDot}/> CAREER BEST</div>
                      <div style={{...B.statSmallNum, fontVariantNumeric:"tabular-nums"}}>{bestScore??("—" as any)}</div>
                      <div style={B.statSmallSub}>{bestCourse||"No rounds yet"}</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── Briefing banner ───────────────────────────────────────────── */}
            <div style={{...B.briefHeader, flexDirection:isMobile?"column":"row", alignItems:isMobile?"flex-start":"center", gap:isMobile?10:16}}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <CoachGlyph size={isMobile?32:42}/>
                <div>
                  <div style={B.briefKicker}>TODAY'S BRIEFING · {briefDate}</div>
                  <div style={{...B.briefHeadline, fontSize:isMobile?17:22}}>
                    {totalRounds} rounds in the books.{" "}
                    <em style={B.briefEm}>{leakImpact>0.3&&leakTitle!=="—"?`${leakTitle} is the leak.`:"Find your pattern."}</em>
                  </div>
                </div>
              </div>
              {!isMobile&&<div style={B.briefSpacer}/>}
              <a href="/rounds/insights" style={{...B.briefCTA, marginTop:isMobile?4:0}}>Drill into leaks →</a>
            </div>

            {/* ── Main grid ─────────────────────────────────────────────────── */}
            <div style={{ display:"grid", gridTemplateColumns:mainCols, gap:14, marginBottom:26 }}>

              {/* 01 NEXT TEE */}
              <a href="/courses" style={{...B.card, textDecoration:"none", color:"inherit", cursor:"pointer"}}>
                <div style={B.cardHead}>
                  <span style={B.cardLabel}>01 · NEXT TEE</span>
                  <span style={B.cardArrow}>↗</span>
                </div>
                <div style={B.cardTitle}>{nrCourseName}</div>
                <div style={B.cardMetaRow}>
                  {nextRound ? (
                    <>
                      <span style={B.cardMetaStrong}>{nrDate}</span>
                      {nrTeeBox&&<><span style={B.cardMetaDot}>·</span><span>{nrTeeBox} tees</span></>}
                    </>
                  ) : (
                    <span style={B.cardMetaStrong}>No upcoming round planned</span>
                  )}
                </div>
                <div style={{ display:"flex", gap:6, marginTop:16 }}>
                  {forecastDays.map(d=>(
                    <div key={d.day} style={{...B.wxCell, background:d.isTee?"var(--accent)":"var(--bg)", borderColor:d.isTee?"var(--accent-deep)":"var(--line)"}}>
                      <div style={B.wxDay}>{d.day}</div>
                      <div style={B.wxIcon}><WxIcon kind={d.icon} size={isMobile?16:20}/></div>
                      <div style={{...B.wxTemp, fontVariantNumeric:"tabular-nums"}}>{d.hi}°</div>
                    </div>
                  ))}
                </div>
                <div style={B.cardFoot}>
                  {nrGoal&&<span style={B.cardFootK}>Goal · <strong style={{color:"var(--ink)"}}>{nrGoal}</strong></span>}
                  {nrRating&&nrSlope ? (
                    <span style={B.cardFootK}>Rating <strong style={{color:"var(--ink)"}}>{nrRating}</strong> / Slope <strong style={{color:"var(--ink)"}}>{nrSlope}</strong></span>
                  ) : (
                    <span style={B.cardFootK}>{nextRound?"Open plan →":"Start a plan →"}</span>
                  )}
                </div>
              </a>

              {/* 02 PRE-ROUND PLAN */}
              <a
                href={nextRound ? `/rounds/play?roundId=${nextRound.id}` : "/plan"}
                style={{...B.cardDark, textDecoration:"none", cursor:"pointer"}}
              >
                <div style={B.cardHead}>
                  <span style={B.cardLabelDk}>02 · PRE-ROUND PLAN</span>
                  <span style={B.cardArrowDk}>↗</span>
                </div>

                {nextRound ? (
                  <>
                    <div style={B.cardTitleDk}>{nrCourseName}</div>
                    <div style={B.cardMetaDk}>
                      {nrDate}{nrTeeBox ? ` · ${nrTeeBox} tees` : ""}
                      {nextRoundPlan?.posture ? ` · ${nextRoundPlan.posture}` : ""}
                    </div>

                    {(planAdders.length > 0 || planSavers.length > 0) && (
                      <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:10 }}>
                        {planAdders.length > 0 && (
                          <div>
                            <div style={{ fontSize:9, fontWeight:700, letterSpacing:1.8, color:"rgba(255,140,100,0.85)", marginBottom:5 }}>TOUGH HOLES</div>
                            {planAdders.map(h => (
                              <div key={`a${h.hole}`} style={B.planRow}>
                                <span style={B.planRowHole}>{h.hole}</span>
                                <span style={B.planRowMeta}>P{h.par}</span>
                                <span style={{...B.planRowAim, color:"#ffaa88"}}>+{h.avg.toFixed(2)} avg</span>
                                <span style={{...B.planRowNote, marginLeft:"auto"}}>{h.count}r</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {planSavers.length > 0 && (
                          <div>
                            <div style={{ fontSize:9, fontWeight:700, letterSpacing:1.8, color:"rgba(100,220,160,0.85)", marginBottom:5 }}>SCORING HOLES</div>
                            {planSavers.map(h => (
                              <div key={`s${h.hole}`} style={B.planRow}>
                                <span style={B.planRowHole}>{h.hole}</span>
                                <span style={B.planRowMeta}>P{h.par}</span>
                                <span style={{...B.planRowAim, color:"#7deba5"}}>{h.avg >= 0 ? "+" : ""}{h.avg.toFixed(2)} avg</span>
                                <span style={{...B.planRowNote, marginLeft:"auto"}}>{h.count}r</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={B.cardTitleDk}>Build Your Gameplan</div>
                    <div style={B.cardMetaDk}>No upcoming round found. Set up a pre-round plan to get hole-by-hole strategy, target scores, and course insights.</div>
                  </>
                )}

                <div style={B.cardFootDk}>
                  <span>{nextRound ? `${nrCourseName.split(" ")[0]} · ${nextRound.holes_played || 18} holes` : "Plan your next round"}</span>
                  <span style={B.cardCTADk}>{nextRound ? "Start round →" : "Build plan →"}</span>
                </div>
              </a>

              {/* 03 BIGGEST LEAK */}
              <a href="/rounds/insights" style={{...B.cardAccent, textDecoration:"none", color:"inherit", cursor:"pointer"}}>
                <div style={B.cardHead}>
                  <span style={B.cardLabelLk}>03 · BIGGEST LEAK</span>
                  <span style={B.cardArrow}>↗</span>
                </div>
                <div style={B.leakHead}>
                  <div>
                    <div style={{...B.leakBigNum, fontSize:isMobile?40:56, fontVariantNumeric:"tabular-nums"}}>
                      {leakImpact>0?`+${leakImpact.toFixed(2)}`:"—"}
                    </div>
                    <div style={B.leakBigSub}>strokes/round · {leakCount} holes</div>
                  </div>
                  {leakImpact>0&&<div style={B.leakBadge}>RANK 1</div>}
                </div>
                <div style={B.leakTitle}>{leakTitle}</div>
                {leakData.length>0&&<ImpactBars data={leakData} width={isMobile?220:240} height={70} labelColor="var(--ink-soft)"/>}
                <div style={B.leakCoach}>
                  <em style={B.leakCoachQ}>{leakImpact>0.5?`"One more club. Aim center. Stop pin-hunting at distance."`:`"Track every club, every miss. The data shows you where your round lives."`}</em>
                  <div style={B.leakCoachA}>— Coach Vance</div>
                </div>
              </a>

              {/* 04 LAST RECAP */}
              <a href="/clubhouse" style={{...B.card, textDecoration:"none", color:"inherit", cursor:"pointer"}}>
                <div style={B.cardHead}>
                  <span style={B.cardLabel}>04 · LAST RECAP{lastRound?` · ${fmtDate(lastRound.date).toUpperCase()}`:""}</span>
                  <span style={B.cardArrow}>↗</span>
                </div>
                <div style={B.recapHead}>
                  <div>
                    <div style={B.cardTitle}>{totalScore?`${totalScore} at ${lastCourse}`:"No rounds yet"}</div>
                    <div style={B.cardMetaRow}>
                      {totalScore>0&&<>
                        <span>{lastSTP>0?`+${lastSTP}`:lastSTP===0?"E":lastSTP}</span>
                        {fwyTotal>0&&<><span style={B.cardMetaDot}>·</span><span>{fwyHit}/{fwyTotal} fwy</span></>}
                        {totalPutts>0&&<><span style={B.cardMetaDot}>·</span><span>{totalPutts} putts</span></>}
                        {lastDiff!=null&&<><span style={B.cardMetaDot}>·</span><span>diff {lastDiff.toFixed(1)}</span></>}
                      </>}
                    </div>
                  </div>
                  {bestScore!==null&&totalScore===bestScore&&<div style={B.prBadge}>PR</div>}
                </div>
                <div style={B.recapQuote}>"Every round is a lesson. Open your recap to find yours."</div>
              </a>
            </div>

            {/* ── Activity rail ─────────────────────────────────────────────── */}
            <div style={B.activityHead}>
              <div style={B.activityLabel}>05 · RECENT ROUNDS</div>
              <a href="/clubhouse" style={B.activityAll}>All {totalRounds} rounds →</a>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:actCols, gap:12, marginBottom:24 }}>
              {recentRoundsData.length>0?recentRoundsData.map((r,i)=>(
                <div key={i} style={B.actCard}>
                  <div style={B.actDate}>{r.date} · {r.weekday}</div>
                  <div style={B.actWhere}>{r.course}</div>
                  <div style={B.actScoreRow}>
                    <div style={{...B.actScore, fontSize:isMobile?24:30, fontVariantNumeric:"tabular-nums"}}>{r.score}</div>
                    {r.badges.includes("pr")&&<div style={B.actPR}>PR</div>}
                  </div>
                  <div style={B.actDiff}>diff {r.diff.toFixed(1)}</div>
                </div>
              )):(
                <div style={{...B.actCard, color:"var(--ink-mute)", fontSize:13, gridColumn:"1/-1"}}>
                  No completed rounds yet. Start your first round to see activity here.
                </div>
              )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <div style={{...B.footer, flexDirection:isMobile?"column":"row", gap:isMobile?12:0}}>
              <span>Press box · {totalRounds} rounds logged</span>
              <span style={{ display:"flex", gap:24 }}>
                <a href="/rounds/play" style={B.footLink}>Add round</a>
                <a href="/add-course" style={B.footLink}>Add course</a>
                <a href="/clubhouse" style={B.footLink}>Settings</a>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const B: Record<string, React.CSSProperties> = {
  statBig: { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:16, padding:22, display:"flex", flexDirection:"column" },
  statCol: { display:"flex", flexDirection:"column", gap:14 },
  statSmall: { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:16, padding:"18px 20px", flex:1, display:"flex", flexDirection:"column", justifyContent:"center" },
  statLabel: { fontSize:10, letterSpacing:1.8, fontWeight:700, color:"var(--ink-mute)", display:"flex", alignItems:"center", gap:6 },
  statDot: { width:5, height:5, borderRadius:99, background:"var(--accent)", display:"inline-block" },
  statBigNum: { fontFamily:"var(--font-display)", fontStyle:"italic", fontWeight:600, fontSize:90, lineHeight:0.9, color:"var(--green-deep)", letterSpacing:-3, marginTop:12 },
  statBigFoot: { display:"flex", alignItems:"center", gap:10, marginTop:8 },
  statDeltaGood: { fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--green)" },
  statBigSub: { fontSize:12, color:"var(--ink-mute)" },
  statSmallNum: { fontFamily:"var(--font-display)", fontStyle:"italic", fontWeight:600, fontSize:38, lineHeight:1, color:"var(--ink)", letterSpacing:-1, marginTop:8 },
  streakUnit: { fontSize:14, color:"var(--ink-mute)", marginLeft:6, fontStyle:"normal", fontFamily:"var(--font-ui)", fontWeight:500 },
  statSmallSub: { fontSize:11, color:"var(--ink-mute)", marginTop:4 },

  briefHeader: { display:"flex", alignItems:"center", gap:16, padding:"16px 22px", borderRadius:16, background:"var(--ink)", color:"var(--paper)", marginBottom:18 },
  briefKicker: { fontSize:10, fontWeight:700, letterSpacing:2.4, color:"var(--accent)" },
  briefHeadline: { fontFamily:"var(--font-display)", fontWeight:600, fontSize:22, letterSpacing:-0.4, marginTop:4 },
  briefEm: { fontStyle:"italic", color:"var(--accent)", fontWeight:500 },
  briefSpacer: { flex:1 },
  briefCTA: { fontSize:13, fontWeight:600, color:"var(--accent)", borderBottom:"1px solid var(--accent)", paddingBottom:1, textDecoration:"none" },

  card: { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:16, padding:"20px 22px", display:"flex", flexDirection:"column", minHeight:280 },
  cardDark: { background:"linear-gradient(160deg, #0c4f3a 0%, #084634 100%)", color:"var(--paper)", borderRadius:16, padding:"20px 22px", display:"flex", flexDirection:"column", minHeight:280, position:"relative", overflow:"hidden" },
  cardAccent: { background:"var(--accent-soft)", border:"1px solid var(--accent)", borderRadius:16, padding:"20px 22px", display:"flex", flexDirection:"column", minHeight:280 },
  cardHead: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  cardLabel: { fontSize:10, fontWeight:700, letterSpacing:1.8, color:"var(--ink-mute)" },
  cardLabelDk: { fontSize:10, fontWeight:700, letterSpacing:1.8, color:"var(--accent)" },
  cardLabelLk: { fontSize:10, fontWeight:700, letterSpacing:1.8, color:"var(--accent-deep)" },
  cardArrow: { color:"var(--ink-mute)", fontSize:16 },
  cardArrowDk: { color:"var(--accent)", fontSize:16 },
  cardTitle: { fontFamily:"var(--font-display)", fontWeight:600, fontSize:22, lineHeight:1.15, letterSpacing:-0.3, color:"var(--ink)" },
  cardTitleDk: { fontFamily:"var(--font-display)", fontWeight:600, fontSize:22, lineHeight:1.15, letterSpacing:-0.3, color:"var(--paper)" },
  cardMetaRow: { fontSize:12, color:"var(--ink-mute)", marginTop:6, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" },
  cardMetaStrong: { fontWeight:600, color:"var(--ink)" },
  cardMetaDot: { color:"var(--line)" },
  cardMetaDk: { fontSize:12, color:"rgba(255,255,255,0.65)", marginTop:6 },
  cardFoot: { marginTop:"auto", paddingTop:16, borderTop:"1px dashed var(--line)", display:"flex", justifyContent:"space-between" },
  cardFootDk: { marginTop:"auto", paddingTop:14, borderTop:"1px solid rgba(255,255,255,0.12)", display:"flex", justifyContent:"space-between", fontSize:11, color:"rgba(255,255,255,0.55)" },
  cardCTADk: { color:"var(--accent)", fontWeight:600 },
  cardFootK: { fontSize:11, color:"var(--ink-mute)" },

  wxCell: { flex:1, padding:"8px 4px", borderRadius:8, textAlign:"center", border:"1px solid", display:"flex", flexDirection:"column", alignItems:"center", gap:2 },
  wxDay: { fontSize:9, fontWeight:700, letterSpacing:1.2 },
  wxIcon: { margin:"2px 0" },
  wxTemp: { fontSize:12, fontWeight:700, fontFamily:"var(--font-mono)" },

  planRows: { display:"flex", flexDirection:"column", gap:6, marginTop:14 },
  planRow: { background:"rgba(255,255,255,0.08)", padding:"9px 12px", borderRadius:8, display:"flex", alignItems:"center", gap:10, fontSize:12 },
  planRowHole: { fontFamily:"var(--font-display)", fontWeight:600, fontStyle:"italic", fontSize:18, color:"var(--accent)", width:22 },
  planRowMeta: { fontSize:10, color:"rgba(255,255,255,0.55)" },
  planRowClub: { background:"var(--paper)", color:"var(--green-deep)", padding:"2px 8px", borderRadius:5, fontSize:10, fontWeight:700 },
  planRowAim: { fontSize:11, color:"rgba(255,255,255,0.7)" },
  planRowNote: { fontSize:11, color:"rgba(255,255,255,0.45)", marginLeft:"auto", fontStyle:"italic" },

  leakHead: { display:"flex", justifyContent:"space-between", alignItems:"flex-start" },
  leakBigNum: { fontFamily:"var(--font-display)", fontWeight:600, fontStyle:"italic", fontSize:56, color:"var(--accent-deep)", lineHeight:0.95, letterSpacing:-2 },
  leakBigSub: { fontSize:11, color:"var(--ink-soft)", marginTop:4 },
  leakBadge: { background:"var(--accent)", color:"var(--ink)", padding:"4px 10px", borderRadius:6, fontSize:10, fontWeight:700, letterSpacing:1.2 },
  leakTitle: { fontFamily:"var(--font-display)", fontWeight:600, fontSize:16, color:"var(--ink)", marginTop:14, marginBottom:14 },
  leakCoach: { marginTop:"auto", paddingTop:14, borderTop:"1px dashed rgba(180,95,34,0.3)" },
  leakCoachQ: { fontFamily:"var(--font-display)", fontStyle:"italic", fontWeight:500, fontSize:13, lineHeight:1.4, color:"var(--ink)" },
  leakCoachA: { fontSize:11, color:"var(--accent-deep)", marginTop:6, fontWeight:600 },

  recapHead: { display:"flex", justifyContent:"space-between", alignItems:"flex-start" },
  prBadge: { width:36, height:36, borderRadius:"50%", background:"radial-gradient(circle at 30% 30%, #ffe6a3, var(--sand), var(--accent-deep))", color:"var(--ink)", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(180,95,34,0.25)", flexShrink:0 },
  recapQuote: { fontFamily:"var(--font-display)", fontStyle:"italic", fontWeight:500, fontSize:14, lineHeight:1.45, color:"var(--ink-soft)", marginTop:18, paddingLeft:14, borderLeft:"3px solid var(--accent)" },

  activityHead: { display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 },
  activityLabel: { fontSize:10, fontWeight:700, letterSpacing:1.8, color:"var(--ink-mute)" },
  activityAll: { fontSize:12, fontWeight:600, color:"var(--green-deep)", borderBottom:"1px solid var(--green)", paddingBottom:1, textDecoration:"none" },
  actCard: { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"16px 18px", display:"flex", flexDirection:"column", gap:4 },
  actDate: { fontSize:10, color:"var(--ink-mute)", fontFamily:"var(--font-mono)", fontWeight:600, letterSpacing:1 },
  actWhere: { fontSize:13, fontWeight:600, color:"var(--ink)", marginTop:2 },
  actScoreRow: { display:"flex", alignItems:"center", gap:8, marginTop:10 },
  actScore: { fontFamily:"var(--font-display)", fontStyle:"italic", fontWeight:600, fontSize:30, color:"var(--green-deep)", lineHeight:1, letterSpacing:-1 },
  actPR: { background:"linear-gradient(135deg, var(--sand), var(--accent-deep))", color:"var(--paper)", padding:"2px 7px", borderRadius:4, fontSize:9, fontWeight:700, letterSpacing:1 },
  actDiff: { fontSize:11, color:"var(--ink-mute)" },

  footer: { paddingTop:20, borderTop:"1px solid var(--line)", display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--ink-mute)" },
  footLink: { color:"var(--ink-mute)", textDecoration:"none" },
};
