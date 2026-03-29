import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type HoleData = {
  hole: number;
  par: 3 | 4 | 5;
  yards: number;
  stroke_index: number;
  dogleg_direction?: string | null;
  approach_green_depth?: number;
  tee_tree_hazard_left?: boolean;
  tee_tree_hazard_right?: boolean;
  tee_tree_hazard_across?: boolean;
  tee_bunkers_left?: boolean;
  tee_bunkers_right?: boolean;
  tee_water_out_left?: boolean;
  tee_water_out_right?: boolean;
  tee_water_out_across?: boolean;
  approach_tree_hazard_left?: boolean;
  approach_tree_hazard_right?: boolean;
  approach_tree_hazard_long?: boolean;
  approach_water_out_left?: boolean;
  approach_water_out_right?: boolean;
  approach_water_out_short?: boolean;
  approach_water_out_long?: boolean;
  approach_bunker_short_left?: boolean;
  approach_bunker_short_middle?: boolean;
  approach_bunker_short_right?: boolean;
  approach_bunker_middle_left?: boolean;
  approach_bunker_middle_right?: boolean;
  approach_bunker_long_left?: boolean;
  approach_bunker_long_middle?: boolean;
  approach_bunker_long_right?: boolean;
  approach_green_short_left?: boolean;
  approach_green_short_middle?: boolean;
  approach_green_short_right?: boolean;
  approach_green_middle_left?: boolean;
  approach_green_middle_right?: boolean;
  approach_green_long_left?: boolean;
  approach_green_long_middle?: boolean;
  approach_green_long_right?: boolean;
};

type RoundHole = {
  hole: number;
  par: number;
  yards: number;
  stroke_index: number;
  score: number | "";
  putts: number | "";
  chips: number | "";
  club: string;
  tee_accuracy: string;
  appr_accuracy: string;
  appr_distance: string;
  water_penalty: number | "";
  drop_or_out: number | "";
  tree_haz: number | "";
  fairway_bunker: number | "";
  greenside_bunker: number | "";
  gir: boolean;
  first_putt_distance: string;
};

export type EnrichedRoundHole = {
  roundHole: RoundHole;
  courseHole: HoleData | null;
  courseRating: number | null;
  courseSlope: number | null;
  similarityScore: number;
  roundDate: string;
  courseId: string;
};

const CLUB_DISTANCES: Record<string, number> = {
  Driver: 230, "3W": 210, "5W": 195, "7W": 180,
  "4i": 185, "5i": 175, "6i": 165, "7i": 155,
  "8i": 145, "9i": 130, PW: 120, SW: 100, LW: 80,
};
const APPROACH_CLUBS = ["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];

function bestApproachClub(yards: number): string {
  let best = APPROACH_CLUBS[0]; let bestDiff = Infinity;
  for (const club of APPROACH_CLUBS) {
    const diff = Math.abs((CLUB_DISTANCES[club] ?? 0) - yards);
    if (diff < bestDiff) { bestDiff = diff; best = club; }
  }
  return best;
}

function selectDriveClub(yards: number, par: number): string {
  if (par === 3) return bestApproachClub(yards);
  if (yards > 350) return "Driver";
  if (yards > 280) return "3W";
  return "5W";
}

const BASE_SLOPE = 113, BASE_RATING = 72;

function effectiveDifficulty(si: number, totalHoles: number, slope: number | null, rating: number | null): number {
  const holeCount = totalHoles || 18;
  const siNorm = 1 - (si - 1) / (holeCount - 1);
  const slopeAdj  = slope  ? (slope  - BASE_SLOPE)  / 40 : 0;
  const ratingAdj = rating ? (rating - BASE_RATING) / 6  : 0;
  const courseMult = 1 + (slopeAdj + ratingAdj) / 2;
  return Math.min(1, Math.max(0, siNorm * courseMult));
}

function hazardProfile(h: HoleData) {
  return {
    teeLeft:    !!(h.tee_tree_hazard_left || h.tee_water_out_left || h.tee_bunkers_left),
    teeRight:   !!(h.tee_tree_hazard_right || h.tee_water_out_right || h.tee_bunkers_right),
    teeAcross:  !!(h.tee_water_out_across || h.tee_tree_hazard_across),
    apprLeft:   !!(h.approach_tree_hazard_left || h.approach_water_out_left || h.approach_bunker_middle_left || h.approach_bunker_long_left),
    apprRight:  !!(h.approach_tree_hazard_right || h.approach_water_out_right || h.approach_bunker_middle_right || h.approach_bunker_long_right),
    apprShort:  !!(h.approach_water_out_short || h.approach_bunker_short_left || h.approach_bunker_short_middle || h.approach_bunker_short_right),
    apprLong:   !!(h.approach_tree_hazard_long || h.approach_water_out_long || h.approach_bunker_long_left || h.approach_bunker_long_middle || h.approach_bunker_long_right),
    hasDogleg:  !!(h.dogleg_direction && h.dogleg_direction !== "straight"),
    doglegLeft: !!(h.dogleg_direction?.includes("left")),
    doglegRight:!!(h.dogleg_direction?.includes("right")),
  };
}

function computeSimilarity(
  targetHole: HoleData, targetRating: number | null, targetSlope: number | null,
  candidateHole: HoleData, candidateRating: number | null, candidateSlope: number | null,
  totalHoles: number, isExactHole: boolean
): number {
  let score = 0;
  if (isExactHole) score += 40;
  if (targetHole.par === candidateHole.par) score += 15; else score -= 20;
  const yardDiff = Math.abs((targetHole.yards || 0) - (candidateHole.yards || 0));
  score += 10 * Math.exp(-yardDiff / 60);
  const targetDiff    = effectiveDifficulty(targetHole.stroke_index || 9,    totalHoles, targetSlope,    targetRating);
  const candidateDiff = effectiveDifficulty(candidateHole.stroke_index || 9, totalHoles, candidateSlope, candidateRating);
  score += 12 * Math.exp(-Math.abs(targetDiff - candidateDiff) / 0.2);
  const th = hazardProfile(targetHole); const ch = hazardProfile(candidateHole);
  const hazardKeys = Object.keys(th) as (keyof typeof th)[];
  score += 8 * (hazardKeys.filter(k => th[k] === ch[k]).length / hazardKeys.length);
  if (th.hasDogleg === ch.hasDogleg) score += 3;
  if (th.doglegLeft === ch.doglegLeft && th.doglegRight === ch.doglegRight) score += 2;
  if (targetHole.approach_green_depth && candidateHole.approach_green_depth) {
    score += 3 * Math.exp(-Math.abs(targetHole.approach_green_depth - candidateHole.approach_green_depth) / 8);
  }
  return Math.max(0, score);
}

type WeightedTendencies = {
  sampleSize: number; totalWeight: number; avgScoreToPar: number;
  scoringByDifficulty: { easy: number; medium: number; hard: number };
  driveHitPct: number; driveMissLeftPct: number; driveMissRightPct: number;
  driveWaterPct: number; driveTreePct: number; driveBunkerPct: number;
  driveClubFreq: Record<string, number>;
  apprHitPct: number; apprMissLeftPct: number; apprMissRightPct: number;
  apprMissShortPct: number; apprMissLongPct: number; girPct: number;
  avgPutts: number; avgChips: number; gsBunkerPct: number; avgFirstPuttCategory: string;
  avgScoreEasyCourses: number; avgScoreHardCourses: number;
  leftHazardImpact: number; rightHazardImpact: number;
  insights: string[];
};

function resolveChips(h: RoundHole): number | null {
  if (h.appr_accuracy === "Hit") return 0;
  if (h.chips !== "" && h.chips !== undefined && h.chips !== null) return Number(h.chips);
  return null;
}

function aggregateTendencies(enriched: EnrichedRoundHole[]): WeightedTendencies {
  const valid = enriched.filter(e => e.roundHole.score !== "" && e.similarityScore > 0);
  if (!valid.length) return emptyTendencies();
  const wAvg = (fn: (e: EnrichedRoundHole) => number | null) => {
    let n = 0, d = 0;
    for (const e of valid) { const v = fn(e); if (v !== null && !isNaN(v)) { n += v*e.similarityScore; d += e.similarityScore; } }
    return d > 0 ? n/d : 0;
  };
  const wPct = (pred: (e: EnrichedRoundHole) => boolean, denom?: (e: EnrichedRoundHole) => boolean) => {
    let n = 0, d = 0;
    for (const e of valid) { const ok = denom ? denom(e) : true; if (ok) { d += e.similarityScore; if (pred(e)) n += e.similarityScore; } }
    return d > 0 ? n/d : 0;
  };
  const stp = (e: EnrichedRoundHole) => Number(e.roundHole.score) - e.roundHole.par;
  const drv = (e: EnrichedRoundHole) => e.roundHole.par >= 4;
  const driveClubFreq: Record<string, number> = {};
  for (const e of valid) if (e.roundHole.par >= 4 && e.roundHole.club) driveClubFreq[e.roundHole.club] = (driveClubFreq[e.roundHole.club]||0)+e.similarityScore;
  const puttBuckets: Record<string, number> = {};
  for (const e of valid) if (e.roundHole.first_putt_distance) puttBuckets[e.roundHole.first_putt_distance] = (puttBuckets[e.roundHole.first_putt_distance]||0)+e.similarityScore;
  const tierAvg = (pool: EnrichedRoundHole[]) => { if (!pool.length) return 0; const tw = pool.reduce((s,e)=>s+e.similarityScore,0); return tw>0?pool.reduce((s,e)=>s+stp(e)*e.similarityScore,0)/tw:0; };
  const easyH  = valid.filter(e => (e.courseSlope??113) < 115);
  const hardH  = valid.filter(e => (e.courseSlope??113) >= 125);
  const medH   = valid.filter(e => { const s=e.courseSlope??113; return s>=115&&s<125; });
  const lhH    = valid.filter(e => e.courseHole?.tee_tree_hazard_left || e.courseHole?.tee_water_out_left);
  const rhH    = valid.filter(e => e.courseHole?.tee_tree_hazard_right || e.courseHole?.tee_water_out_right);
  const lmH    = lhH.filter(e => e.roundHole.tee_accuracy === "Left");
  const rmH    = rhH.filter(e => e.roundHole.tee_accuracy === "Right");
  const knownChips = valid.filter(e => resolveChips(e.roundHole) !== null);
  const avgChips = knownChips.length > 0 ? knownChips.reduce((s,e)=>s+(resolveChips(e.roundHole)??0)*e.similarityScore,0)/knownChips.reduce((s,e)=>s+e.similarityScore,0) : 0;
  const driveHitPct = wPct(e=>e.roundHole.tee_accuracy==="Hit",drv);
  const driveMissLeftPct = wPct(e=>e.roundHole.tee_accuracy==="Left",drv);
  const driveMissRightPct = wPct(e=>e.roundHole.tee_accuracy==="Right",drv);
  const girPct = wPct(e=>!!e.roundHole.gir);
  const avgPutts = wAvg(e=>e.roundHole.putts!==""?Number(e.roundHole.putts):null);
  const avgScoreEasyCourses = tierAvg(easyH);
  const avgScoreHardCourses = tierAvg(hardH);
  const leftHazardImpact  = lmH.length > 0 ? tierAvg(lmH) - tierAvg(lhH) : 0;
  const rightHazardImpact = rmH.length > 0 ? tierAvg(rmH) - tierAvg(rhH) : 0;
  const insights: string[] = [];
  if (Math.abs(leftHazardImpact)  > 0.3) insights.push(`Left hazard costs you +${leftHazardImpact.toFixed(2)} strokes when missed left`);
  if (Math.abs(rightHazardImpact) > 0.3) insights.push(`Right hazard costs you +${rightHazardImpact.toFixed(2)} strokes when missed right`);
  if (driveHitPct > 0.6) insights.push(`Strong driver accuracy (${Math.round(driveHitPct*100)}% fairways)`);
  if (driveHitPct < 0.4) insights.push(`Inconsistent off the tee (${Math.round(driveHitPct*100)}% fairways)`);
  if (girPct > 0.55) insights.push(`Strong iron play (${Math.round(girPct*100)}% GIR)`);
  if (avgPutts > 2.2) insights.push(`Putting is costing strokes (avg ${avgPutts.toFixed(1)} putts)`);
  if (avgPutts < 1.8) insights.push(`Strong putter (avg ${avgPutts.toFixed(1)} putts)`);
  if (hardH.length > 2 && easyH.length > 2) {
    const dc = avgScoreHardCourses - avgScoreEasyCourses;
    if (dc > 0.5) insights.push(`Struggles on harder courses (+${dc.toFixed(2)} on hard vs easy)`);
    if (dc < -0.3) insights.push(`Performs well on harder courses`);
  }
  return {
    sampleSize: valid.length, totalWeight: valid.reduce((s,e)=>s+e.similarityScore,0),
    avgScoreToPar: wAvg(stp),
    scoringByDifficulty: { easy: tierAvg(easyH), medium: tierAvg(medH), hard: tierAvg(hardH) },
    driveHitPct, driveMissLeftPct, driveMissRightPct,
    driveWaterPct: wPct(e=>(Number(e.roundHole.water_penalty)||0)+(Number(e.roundHole.drop_or_out)||0)>0,drv),
    driveTreePct:  wPct(e=>(Number(e.roundHole.tree_haz)||0)>0,drv),
    driveBunkerPct:wPct(e=>(Number(e.roundHole.fairway_bunker)||0)>0,drv),
    driveClubFreq,
    apprHitPct:       wPct(e=>e.roundHole.appr_accuracy==="Hit"),
    apprMissLeftPct:  wPct(e=>e.roundHole.appr_accuracy==="Left"),
    apprMissRightPct: wPct(e=>e.roundHole.appr_accuracy==="Right"),
    apprMissShortPct: wPct(e=>e.roundHole.appr_accuracy==="Short"),
    apprMissLongPct:  wPct(e=>e.roundHole.appr_accuracy==="Long"),
    girPct,
    avgPutts, avgChips,
    gsBunkerPct: wPct(e=>(Number(e.roundHole.greenside_bunker)||0)>0),
    avgFirstPuttCategory: Object.entries(puttBuckets).sort((a,b)=>b[1]-a[1])[0]?.[0]??"",
    avgScoreEasyCourses, avgScoreHardCourses,
    leftHazardImpact, rightHazardImpact, insights,
  };
}

function emptyTendencies(): WeightedTendencies {
  return {
    sampleSize:0,totalWeight:0,avgScoreToPar:0,
    scoringByDifficulty:{easy:0,medium:0,hard:0},
    driveHitPct:0.5,driveMissLeftPct:0.25,driveMissRightPct:0.25,
    driveWaterPct:0,driveTreePct:0,driveBunkerPct:0,driveClubFreq:{},
    apprHitPct:0.5,apprMissLeftPct:0.2,apprMissRightPct:0.2,apprMissShortPct:0.3,apprMissLongPct:0.1,
    girPct:0.4,avgPutts:2.0,avgChips:0.5,gsBunkerPct:0.1,avgFirstPuttCategory:"",
    avgScoreEasyCourses:0,avgScoreHardCourses:0,
    leftHazardImpact:0,rightHazardImpact:0,insights:[],
  };
}

function generateStrategy(
  targetHole: HoleData, targetSlope: number|null, targetRating: number|null,
  tendencies: WeightedTendencies, allEnriched: EnrichedRoundHole[]
) {
  const hp = hazardProfile(targetHole);
  const exactCount = allEnriched.filter(e=>e.similarityScore>=40).length;
  const confidence = exactCount>=3?"high":tendencies.sampleSize>=8?"medium":"low";
  const missLeftPct=tendencies.driveMissLeftPct, missRightPct=tendencies.driveMissRightPct;
  const leftHazardSeverity=(hp.teeLeft?2:0)+(targetHole.tee_water_out_left?2:0)+(targetHole.tee_tree_hazard_left?1:0)+(targetHole.tee_bunkers_left?1:0);
  const rightHazardSeverity=(hp.teeRight?2:0)+(targetHole.tee_water_out_right?2:0)+(targetHole.tee_tree_hazard_right?1:0)+(targetHole.tee_bunkers_right?1:0);
  const leftRisk=missLeftPct*(leftHazardSeverity+1)*(1+Math.max(0,tendencies.leftHazardImpact));
  const rightRisk=missRightPct*(rightHazardSeverity+1)*(1+Math.max(0,tendencies.rightHazardImpact));
  let teeAim:"left"|"right"|"center"="center"; const teeReasons:string[]=[];
  if (leftRisk>rightRisk*1.2){teeAim="right";if(hp.teeLeft)teeReasons.push("hazard left");if(missLeftPct>0.35)teeReasons.push(`${Math.round(missLeftPct*100)}% miss left`);}
  else if(rightRisk>leftRisk*1.2){teeAim="left";if(hp.teeRight)teeReasons.push("hazard right");if(missRightPct>0.35)teeReasons.push(`${Math.round(missRightPct*100)}% miss right`);}
  else teeReasons.push("balanced risk both sides");
  if(hp.hasDogleg){const d=hp.doglegLeft?"left":"right";const opp=d==="left"?"right":"left";if(teeAim==="center"){teeAim=opp as"left"|"right";teeReasons.push(`dogleg ${d} — aim ${opp}`);}else teeReasons.push(`dogleg ${d}`);}
  if(hp.teeAcross)teeReasons.push("carry hazard across");
  let teeClub=targetHole.par===3?bestApproachClub(targetHole.yards):(Object.entries(tendencies.driveClubFreq).sort((a,b)=>b[1]-a[1])[0]?.[0]??selectDriveClub(targetHole.yards,targetHole.par));
  let apprAim:"short"|"long"|"left"|"right"|"center"="center"; const apprReasons:string[]=[];
  const sp=tendencies.apprMissShortPct,lp=tendencies.apprMissLongPct;
  if(sp>lp&&hp.apprShort){apprAim="long";apprReasons.push(`miss short (${Math.round(sp*100)}%) + short hazard`);}
  else if(lp>sp&&hp.apprLong){apprAim="short";apprReasons.push(`miss long (${Math.round(lp*100)}%) + long hazard`);}
  else if(sp>lp+0.1){apprAim="long";apprReasons.push(`${Math.round(sp*100)}% miss short`);}
  else if(lp>sp+0.1){apprAim="short";apprReasons.push(`${Math.round(lp*100)}% miss long`);}
  if(hp.apprLeft&&tendencies.apprMissLeftPct>0.25){if(apprAim==="center")apprAim="right";apprReasons.push("approach hazard left");}
  else if(hp.apprRight&&tendencies.apprMissRightPct>0.25){if(apprAim==="center")apprAim="left";apprReasons.push("approach hazard right");}
  if(targetHole.approach_green_depth&&targetHole.approach_green_depth>0){
    if(targetHole.approach_green_depth<20)apprReasons.push(`shallow green (${targetHole.approach_green_depth} yds)`);
    else if(targetHole.approach_green_depth>=35)apprReasons.push(`deep green (${targetHole.approach_green_depth} yds)`);
  }
  if(!apprReasons.length)apprReasons.push("balanced tendencies");
  const warnings:string[]=[];
  if(targetSlope&&targetSlope>=125){const d=tendencies.avgScoreHardCourses-tendencies.avgScoreEasyCourses;if(d>0.4&&tendencies.sampleSize>4)warnings.push(`You average +${d.toFixed(1)} more on hard courses — play conservatively`);}
  if(hp.teeAcross&&targetHole.par===4)warnings.push("Carry hazard required off tee");
  if(targetHole.tee_water_out_left&&missLeftPct>0.35)warnings.push(`OB left — ${Math.round(missLeftPct*100)}% left miss is a risk`);
  if(targetHole.tee_water_out_right&&missRightPct>0.35)warnings.push(`OB right — ${Math.round(missRightPct*100)}% right miss is a risk`);
  if(tendencies.gsBunkerPct>0.2)warnings.push(`Frequent GS bunker (${Math.round(tendencies.gsBunkerPct*100)}%)`);
  if(tendencies.avgPutts>2.3)warnings.push(`Putting pressure — avg ${tendencies.avgPutts.toFixed(1)} putts`);
  return {
    tee_strategy:{club:teeClub,aim:teeAim,reason:teeReasons.join("; ")},
    approach_strategy:{aim:apprAim,reason:apprReasons.join("; ")},
    warning:warnings.length>0?warnings.join(" · "):null,
    confidence,
    data_summary:{
      similar_holes_used:tendencies.sampleSize,
      exact_hole_history:exactCount,
      avg_score_to_par:tendencies.avgScoreToPar>=0?`+${tendencies.avgScoreToPar.toFixed(2)}`:tendencies.avgScoreToPar.toFixed(2),
      insights:tendencies.insights,
    },
  };
}

// ─── Approach distance helpers ────────────────────────────────────────────────

function topClub(freq: Record<string,number>, fallback: string): string {
  const entries = Object.entries(freq).sort((a,b) => {
    if (b[1] !== a[1]) return b[1]-a[1];
    return (CLUB_DISTANCES[b[0]]??0)-(CLUB_DISTANCES[a[0]]??0);
  });
  return entries[0]?.[0] ?? fallback;
}

function computeDefaultApproachDist(hole: HoleData, driveClubFreq: Record<string,number>): number {
  if (hole.par === 3) return hole.yards;
  const primaryClub = topClub(driveClubFreq, "Driver");
  const primaryDist = CLUB_DISTANCES[primaryClub] ?? 230;
  if (hole.par === 4) return Math.max(0, hole.yards - primaryDist);
  const secondClub = primaryClub === "Driver" ? "3W" : primaryClub;
  const secondDist = CLUB_DISTANCES[secondClub] ?? 210;
  return Math.max(0, hole.yards - primaryDist - secondDist);
}

function slimCourseHole(h: HoleData): HoleData {
  return {
    hole: h.hole, par: h.par, stroke_index: h.stroke_index, yards: h.yards,
    approach_green_depth: h.approach_green_depth,
    tee_tree_hazard_left: h.tee_tree_hazard_left, tee_tree_hazard_right: h.tee_tree_hazard_right,
    tee_bunkers_left: h.tee_bunkers_left, tee_bunkers_right: h.tee_bunkers_right,
    tee_water_out_left: h.tee_water_out_left, tee_water_out_right: h.tee_water_out_right,
    approach_bunker_short_left: h.approach_bunker_short_left, approach_bunker_short_middle: h.approach_bunker_short_middle, approach_bunker_short_right: h.approach_bunker_short_right,
    approach_bunker_middle_left: h.approach_bunker_middle_left, approach_bunker_middle_right: h.approach_bunker_middle_right,
    approach_bunker_long_left: h.approach_bunker_long_left, approach_bunker_long_middle: h.approach_bunker_long_middle, approach_bunker_long_right: h.approach_bunker_long_right,
    approach_green_short_left: h.approach_green_short_left, approach_green_short_middle: h.approach_green_short_middle, approach_green_short_right: h.approach_green_short_right,
    approach_green_middle_left: h.approach_green_middle_left, approach_green_middle_right: h.approach_green_middle_right,
    approach_green_long_left: h.approach_green_long_left, approach_green_long_middle: h.approach_green_long_middle, approach_green_long_right: h.approach_green_long_right,
  };
}

function computePar3ApproachSimilarity(
  targetHole: HoleData, approachDist: number,
  par3Hole: HoleData, par3RoundHole: RoundHole, driveToGreen: boolean
): number {
  let score = 0;
  if (driveToGreen) {
    if (par3RoundHole.club === "Driver" || par3RoundHole.club === "3W") score += 15;
    else return 0;
  }
  const yardDiff = Math.abs((par3Hole.yards||0) - approachDist);
  const yardSim = 12 * Math.exp(-yardDiff / 40);
  if (yardSim < 2) return 0;
  score += yardSim;
  const tL = !!(targetHole.approach_tree_hazard_left  || targetHole.approach_water_out_left  || targetHole.approach_bunker_middle_left  || targetHole.approach_bunker_long_left);
  const tR = !!(targetHole.approach_tree_hazard_right || targetHole.approach_water_out_right || targetHole.approach_bunker_middle_right || targetHole.approach_bunker_long_right);
  const pL = !!(par3Hole.tee_tree_hazard_left  || par3Hole.tee_water_out_left  || par3Hole.tee_bunkers_left);
  const pR = !!(par3Hole.tee_tree_hazard_right || par3Hole.tee_water_out_right || par3Hole.tee_bunkers_right);
  if (tL === pL) score += 3;
  if (tR === pR) score += 3;
  const gsKeys: (keyof HoleData)[] = [
    "approach_bunker_short_left","approach_bunker_short_middle","approach_bunker_short_right",
    "approach_bunker_middle_left","approach_bunker_middle_right",
    "approach_bunker_long_left","approach_bunker_long_middle","approach_bunker_long_right",
    "approach_green_short_left","approach_green_short_middle","approach_green_short_right",
    "approach_green_middle_left","approach_green_middle_right",
    "approach_green_long_left","approach_green_long_middle","approach_green_long_right",
  ];
  let gsMatches = 0;
  for (const k of gsKeys) if (!!targetHole[k] === !!par3Hole[k]) gsMatches++;
  score += 5 * (gsMatches / gsKeys.length);
  if (targetHole.approach_green_depth && par3Hole.approach_green_depth) {
    score += 3 * Math.exp(-Math.abs(targetHole.approach_green_depth - par3Hole.approach_green_depth) / 8);
  }
  return score > 4 ? score : 0;
}

export async function POST(req: NextRequest) {
  let body: { courseId?: string; hole?: number; approachDistance?: number };
  try { body = await req.json(); } catch { return NextResponse.json({error:"Invalid JSON body"},{status:400}); }
  const { courseId, hole: holeNumber, approachDistance: overrideApproachDist } = body;
  if (!courseId || !holeNumber) return NextResponse.json({error:"Missing courseId and hole"},{status:422});
  const { data: courseRow, error: courseErr } = await supabase.from("courses").select("*").eq("id",courseId).single();
  if (courseErr || !courseRow) return NextResponse.json({error:"Course not found"},{status:404});
  const targetHole: HoleData = courseRow.holes.find((h:any)=>h.hole===holeNumber);
  if (!targetHole) return NextResponse.json({error:"Hole not found"},{status:404});
  const targetRating:number|null = courseRow.rating??null;
  const targetSlope:number|null  = courseRow.slope??null;
  const totalHoles = courseRow.holes.length||18;
  const { data: rounds } = await supabase.from("rounds").select("*");
  if (!rounds||!rounds.length) {
    const apprDist = overrideApproachDist ?? computeDefaultApproachDist(targetHole, {});
    const strategy = generateStrategy(targetHole,targetSlope,targetRating,emptyTendencies(),[]);
    return NextResponse.json({hole:targetHole,strategy,course:{rating:targetRating,slope:targetSlope,name:courseRow.name},enrichedHoles:[],defaultApproachDist:apprDist});
  }
  const courseCache: Record<string,any> = {};
  const allEnriched: EnrichedRoundHole[] = [];
  // First pass: collect all holes to compute drive club frequency for this target hole
  const exactHoleRoundHoles: RoundHole[] = [];
  for (const round of rounds) {
    const cId = round.course_id;
    if (!courseCache[cId]) { const {data:c}=await supabase.from("courses").select("*").eq("id",cId).single(); courseCache[cId]=c??null; }
    if (round.course_id===courseId) {
      for (const rh of (round.holes??[])) {
        if (rh.hole===holeNumber&&rh.score) exactHoleRoundHoles.push(rh);
      }
    }
  }
  // Compute drive club freq from exact hole history
  const driveClubFreq: Record<string,number> = {};
  for (const rh of exactHoleRoundHoles) if (rh.club) driveClubFreq[rh.club]=(driveClubFreq[rh.club]||0)+1;

  // Compute default approach distance
  const defaultApproachDist = overrideApproachDist ?? computeDefaultApproachDist(targetHole, driveClubFreq);
  const effectiveApproachDist = defaultApproachDist;

  // Whether to include par 3 approach comparisons
  const driveToGreen = targetHole.par===4 && targetHole.yards - (CLUB_DISTANCES[topClub(driveClubFreq,"Driver")] ?? 230) < 30;

  for (const round of rounds) {
    const cId = round.course_id;
    const rc = courseCache[cId];
    const roundRating:number|null = rc?.rating??null;
    const roundSlope:number|null  = rc?.slope??null;
    const roundTotalHoles = rc?.holes?.length||18;
    for (const rh of (round.holes??[])) {
      if (!rh.score||!rh.par) continue;
      const candidateCourseHole:HoleData|null = rc?.holes?.find((h:any)=>h.hole===rh.hole)??null;
      if (!candidateCourseHole) continue;
      const isExact = round.course_id===courseId&&rh.hole===holeNumber;

      // Standard similarity (same-par holes)
      const sim = computeSimilarity(targetHole,targetRating,targetSlope,candidateCourseHole,roundRating,roundSlope,roundTotalHoles,isExact);

      // Par 3 approach similarity — compare approach profile & greenside of par 3 to target hole's approach
      let par3ApproachSim = 0;
      if (candidateCourseHole.par===3 && targetHole.par!==3) {
        par3ApproachSim = computePar3ApproachSimilarity(
          targetHole, effectiveApproachDist,
          candidateCourseHole, rh,
          driveToGreen
        );
      }

      const finalSim = Math.max(sim, par3ApproachSim);
      if (finalSim>2) allEnriched.push({
        roundHole: rh,
        courseHole: slimCourseHole(candidateCourseHole),
        courseRating:roundRating, courseSlope:roundSlope,
        similarityScore:finalSim, roundDate:round.date??"", courseId:round.course_id??"",
      });
    }
  }
  allEnriched.sort((a,b)=>b.similarityScore-a.similarityScore);
  const tendencies = aggregateTendencies(allEnriched);
  const strategy = generateStrategy(targetHole,targetSlope,targetRating,tendencies,allEnriched);
  return NextResponse.json({
    hole:targetHole,
    strategy,
    course:{rating:targetRating,slope:targetSlope,name:courseRow.name},
    enrichedHoles: allEnriched,
    defaultApproachDist,
  });
}
