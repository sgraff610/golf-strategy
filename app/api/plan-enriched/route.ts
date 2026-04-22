import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Minimal types ─────────────────────────────────────────────────────────────

type HD = {
  hole: number; par: number; yards: number; stroke_index: number;
  dogleg_direction?: string | null; approach_green_depth?: number;
  tee_tree_hazard_left?: boolean; tee_tree_hazard_right?: boolean; tee_tree_hazard_across?: boolean;
  tee_bunkers_left?: boolean; tee_bunkers_right?: boolean;
  tee_water_out_left?: boolean; tee_water_out_right?: boolean; tee_water_out_across?: boolean;
  approach_tree_hazard_left?: boolean; approach_tree_hazard_right?: boolean;
  approach_tree_hazard_long?: boolean;
  approach_water_out_left?: boolean; approach_water_out_right?: boolean;
  approach_water_out_short?: boolean; approach_water_out_long?: boolean;
  approach_bunker_short_left?: boolean; approach_bunker_short_middle?: boolean; approach_bunker_short_right?: boolean;
  approach_bunker_middle_left?: boolean; approach_bunker_middle_right?: boolean;
  approach_bunker_long_left?: boolean; approach_bunker_long_middle?: boolean; approach_bunker_long_right?: boolean;
  approach_green_short_left?: boolean; approach_green_short_middle?: boolean; approach_green_short_right?: boolean;
  approach_green_middle_left?: boolean; approach_green_middle_right?: boolean;
  approach_green_long_left?: boolean; approach_green_long_middle?: boolean; approach_green_long_right?: boolean;
};

type SimpleHole = {
  score: number; par: number; yards: number; stroke_index: number;
  dogleg: string; teeLeft: boolean; teeRight: boolean; teeAcross: boolean;
  apprLeft: boolean; apprRight: boolean; apprShort: boolean; apprLong: boolean;
  greenDepth: number; greensideProfile: string; courseSlope: number | null;
};

type FW = {
  yardsSensitivity: number; difficultySensitivity: number; doglegSensitivity: number;
  teeHazardSensitivity: number; apprHazardSensitivity: number;
  greensideSensitivity: number; greenDepthSensitivity: number;
};

// ─── Shared computation (mirrors strategy/route.ts) ────────────────────────────

const BASE_SLOPE = 113, BASE_RATING = 72, MIN_FACTOR_HOLES = 20;

function hazardProfile(h: HD) {
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

function encodeGreensideProfile(h: HD): string {
  const keys = [
    "approach_bunker_short_left","approach_bunker_short_middle","approach_bunker_short_right",
    "approach_bunker_middle_left","approach_bunker_middle_right",
    "approach_bunker_long_left","approach_bunker_long_middle","approach_bunker_long_right",
    "approach_green_short_left","approach_green_short_middle","approach_green_short_right",
    "approach_green_middle_left","approach_green_middle_right",
    "approach_green_long_left","approach_green_long_middle","approach_green_long_right",
  ] as (keyof HD)[];
  return keys.map(k => h[k] ? "1" : "0").join("");
}

function effectiveDifficulty(si: number, totalHoles: number, slope: number | null, rating: number | null): number {
  const holeCount = totalHoles || 18;
  const siNorm = 1 - (si - 1) / (holeCount - 1);
  const slopeAdj  = slope  ? (slope  - BASE_SLOPE)  / 40 : 0;
  const ratingAdj = rating ? (rating - BASE_RATING) / 6  : 0;
  return Math.min(1, Math.max(0, siNorm * (1 + (slopeAdj + ratingAdj) / 2)));
}

function calcGroupAvgImpact(group: SimpleHole[], baseline: number): number {
  if (!group.length) return 0;
  return group.reduce((s, h) => s + (h.score - h.par), 0) / group.length - baseline;
}

function computeFactorWeights(allHoles: SimpleHole[]): FW {
  if (allHoles.length < MIN_FACTOR_HOLES) {
    return { yardsSensitivity:0.5, difficultySensitivity:0.5, doglegSensitivity:0.3, teeHazardSensitivity:0.3, apprHazardSensitivity:0.3, greensideSensitivity:0.3, greenDepthSensitivity:0.2 };
  }
  const baseline = allHoles.reduce((s, h) => s + (h.score - h.par), 0) / allHoles.length;

  const yardGroups: Record<string, SimpleHole[]> = {};
  for (const h of allHoles) { const b = `${Math.floor(h.yards/25)*25}`; if (!yardGroups[b]) yardGroups[b]=[]; yardGroups[b].push(h); }
  const yardImpacts = Object.values(yardGroups).filter(g=>g.length>=MIN_FACTOR_HOLES).map(g=>Math.abs(calcGroupAvgImpact(g,baseline)));
  const yardsSensitivity = yardImpacts.length>0 ? Math.min(1, Math.max(...yardImpacts)/1.5) : 0.3;

  const siGroups: Record<string, SimpleHole[]> = {};
  for (const h of allHoles) { const t=h.stroke_index<=4?"1-4":h.stroke_index<=9?"5-9":h.stroke_index<=14?"10-14":"15-18"; if(!siGroups[t])siGroups[t]=[]; siGroups[t].push(h); }
  const siImpacts = Object.values(siGroups).filter(g=>g.length>=MIN_FACTOR_HOLES).map(g=>Math.abs(calcGroupAvgImpact(g,baseline)));
  const difficultySensitivity = siImpacts.length>0 ? Math.min(1, Math.max(...siImpacts)/1.5) : 0.3;

  const dlGroups: Record<string, SimpleHole[]> = {};
  for (const h of allHoles) { const d=h.dogleg||"none"; if(!dlGroups[d])dlGroups[d]=[]; dlGroups[d].push(h); }
  const dlImpacts = Object.values(dlGroups).filter(g=>g.length>=MIN_FACTOR_HOLES).map(g=>Math.abs(calcGroupAvgImpact(g,baseline)));
  const doglegSensitivity = dlImpacts.length>1 ? Math.min(1,(Math.max(...dlImpacts)-Math.min(...dlImpacts))/1.0) : 0.2;

  const teeHazImpacts: number[] = [];
  for (const key of ["teeLeft","teeRight","teeAcross"] as const) {
    const w=allHoles.filter(h=>h[key]); const wo=allHoles.filter(h=>!h[key]);
    if(w.length>=MIN_FACTOR_HOLES&&wo.length>=MIN_FACTOR_HOLES) teeHazImpacts.push(Math.abs(calcGroupAvgImpact(w,baseline)-calcGroupAvgImpact(wo,baseline)));
  }
  const teeHazardSensitivity = teeHazImpacts.length>0 ? Math.min(1,Math.max(...teeHazImpacts)/1.0) : 0.2;

  const apprHazImpacts: number[] = [];
  for (const key of ["apprLeft","apprRight","apprShort","apprLong"] as const) {
    const w=allHoles.filter(h=>h[key]); const wo=allHoles.filter(h=>!h[key]);
    if(w.length>=MIN_FACTOR_HOLES&&wo.length>=MIN_FACTOR_HOLES) apprHazImpacts.push(Math.abs(calcGroupAvgImpact(w,baseline)-calcGroupAvgImpact(wo,baseline)));
  }
  const apprHazardSensitivity = apprHazImpacts.length>0 ? Math.min(1,Math.max(...apprHazImpacts)/1.0) : 0.2;

  const gdGroups: Record<string, SimpleHole[]> = {};
  for (const h of allHoles.filter(h=>h.greenDepth>0)) { const b=`${Math.floor(h.greenDepth/5)*5}`; if(!gdGroups[b])gdGroups[b]=[]; gdGroups[b].push(h); }
  const gdImpacts = Object.values(gdGroups).filter(g=>g.length>=MIN_FACTOR_HOLES).map(g=>Math.abs(calcGroupAvgImpact(g,baseline)));
  const greenDepthSensitivity = gdImpacts.length>1 ? Math.min(1,(Math.max(...gdImpacts)-Math.min(...gdImpacts))/1.0) : 0.15;

  const gsGroups: Record<string, SimpleHole[]> = {};
  for (const h of allHoles) { if(!gsGroups[h.greensideProfile])gsGroups[h.greensideProfile]=[]; gsGroups[h.greensideProfile].push(h); }
  const gsImpacts = Object.values(gsGroups).filter(g=>g.length>=MIN_FACTOR_HOLES).map(g=>Math.abs(calcGroupAvgImpact(g,baseline)));
  const greensideSensitivity = gsImpacts.length>1 ? Math.min(1,(Math.max(...gsImpacts)-Math.min(...gsImpacts))/1.0) : 0.15;

  return { yardsSensitivity, difficultySensitivity, doglegSensitivity, teeHazardSensitivity, apprHazardSensitivity, greensideSensitivity, greenDepthSensitivity };
}

function computeSimilarity(
  targetHole: HD, targetRating: number|null, targetSlope: number|null,
  candidateHole: HD, candidateRating: number|null, candidateSlope: number|null,
  totalHoles: number, isExactHole: boolean, weights: FW
): number {
  if (isExactHole) return 50;
  if (targetHole.par !== candidateHole.par) return -99;

  let score = 0;
  const yardSigma = Math.max(20, 55 * (1 - weights.yardsSensitivity * 0.6));
  const yardDiff = Math.abs((targetHole.yards||0) - (candidateHole.yards||0));
  score += weights.yardsSensitivity * 14 * Math.exp(-yardDiff / yardSigma);

  const tDiff = effectiveDifficulty(targetHole.stroke_index||9, totalHoles, targetSlope, targetRating);
  const cDiff = effectiveDifficulty(candidateHole.stroke_index||9, totalHoles, candidateSlope, candidateRating);
  const diffSigma = Math.max(0.08, 0.28 * (1 - weights.difficultySensitivity * 0.5));
  score += weights.difficultySensitivity * 14 * Math.exp(-Math.abs(tDiff-cDiff) / diffSigma);

  const th = hazardProfile(targetHole); const ch = hazardProfile(candidateHole);
  const doglegMatch = (th.hasDogleg===ch.hasDogleg?1:0) + (th.doglegLeft===ch.doglegLeft&&th.doglegRight===ch.doglegRight?0.5:0);
  score += weights.doglegSensitivity * 6 * (doglegMatch / 1.5);
  if (weights.doglegSensitivity > 0.4 && th.hasDogleg !== ch.hasDogleg) score -= weights.doglegSensitivity * 4;

  const teeKeys = ["teeLeft","teeRight","teeAcross"] as const;
  const teeMatch = teeKeys.filter(k=>th[k]===ch[k]).length / teeKeys.length;
  score += weights.teeHazardSensitivity * 9 * teeMatch;
  for (const k of teeKeys) if (th[k] && !ch[k]) score -= weights.teeHazardSensitivity * 2.5;

  const apprKeys = ["apprLeft","apprRight","apprShort","apprLong"] as const;
  const apprMatch = apprKeys.filter(k=>th[k]===ch[k]).length / apprKeys.length;
  score += weights.apprHazardSensitivity * 9 * apprMatch;
  for (const k of apprKeys) if (th[k] && !ch[k]) score -= weights.apprHazardSensitivity * 2;

  const gsKeys = [
    "approach_bunker_short_left","approach_bunker_short_middle","approach_bunker_short_right",
    "approach_bunker_middle_left","approach_bunker_middle_right",
    "approach_bunker_long_left","approach_bunker_long_middle","approach_bunker_long_right",
    "approach_green_short_left","approach_green_short_middle","approach_green_short_right",
    "approach_green_middle_left","approach_green_middle_right",
    "approach_green_long_left","approach_green_long_middle","approach_green_long_right",
  ] as (keyof HD)[];
  const gsMatch = gsKeys.filter(k=>!!targetHole[k]===!!candidateHole[k]).length / gsKeys.length;
  score += weights.greensideSensitivity * 8 * gsMatch;

  if (targetHole.approach_green_depth && candidateHole.approach_green_depth) {
    score += weights.greenDepthSensitivity * 5 * Math.exp(-Math.abs(targetHole.approach_green_depth-candidateHole.approach_green_depth)/8);
  }
  return score;
}

function getAdaptiveThreshold(scores: number[], targetMin: number, targetMax: number): number {
  if (scores.length === 0) return 3;
  const sorted = [...scores].sort((a,b) => b - a);
  const floor = 1;
  if (sorted.length <= targetMin) return floor;
  const atMax = sorted[Math.min(targetMax - 1, sorted.length - 1)];
  const threshold = Math.max(atMax, floor);
  const countAtThreshold = sorted.filter(s => s > threshold).length;
  if (countAtThreshold < targetMin) return Math.max(sorted[Math.min(targetMin - 1, sorted.length - 1)], floor);
  return threshold;
}

// ─── Public type (defined in lib/planTypes.ts) ─────────────────────────────────
import type { PlanEnrichedHole } from "@/lib/planTypes";

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { courseId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({}, { status: 400 }); }
  const { courseId } = body;
  if (!courseId) return NextResponse.json({}, { status: 400 });

  const { data: courseRow } = await supabase.from("courses").select("*").eq("id", courseId).single();
  if (!courseRow) return NextResponse.json({}, { status: 404 });

  const { data: rounds } = await supabase.from("rounds").select("*");
  if (!rounds?.length) return NextResponse.json({});

  // Cache all referenced courses
  const courseCache: Record<string, any> = {};
  for (const round of rounds) {
    if (!courseCache[round.course_id]) {
      const { data: c } = await supabase.from("courses").select("*").eq("id", round.course_id).single();
      courseCache[round.course_id] = c ?? null;
    }
  }

  // Build simple holes for factor weight computation
  const allSimple: SimpleHole[] = [];
  for (const round of rounds) {
    const rc = courseCache[round.course_id];
    for (const rh of round.holes ?? []) {
      if (!rh.score || !rh.par) continue;
      const ch: HD | null = rc?.holes?.find((h: any) => h.hole === rh.hole) ?? null;
      if (!ch) continue;
      const hp = hazardProfile(ch);
      allSimple.push({
        score: Number(rh.score), par: rh.par,
        yards: ch.yards ?? rh.yards ?? 0,
        stroke_index: ch.stroke_index ?? rh.stroke_index ?? 9,
        dogleg: ch.dogleg_direction ?? "",
        teeLeft: hp.teeLeft, teeRight: hp.teeRight, teeAcross: hp.teeAcross,
        apprLeft: hp.apprLeft, apprRight: hp.apprRight, apprShort: hp.apprShort, apprLong: hp.apprLong,
        greenDepth: ch.approach_green_depth ?? 0,
        greensideProfile: encodeGreensideProfile(ch),
        courseSlope: rc?.slope ?? null,
      });
    }
  }

  const weights = computeFactorWeights(allSimple);
  const targetRating: number | null = courseRow.rating ?? null;
  const targetSlope: number | null = courseRow.slope ?? null;
  const totalHoles = courseRow.holes?.length || 18;

  const result: Record<number, PlanEnrichedHole[]> = {};

  for (const targetHole of (courseRow.holes ?? []) as HD[]) {
    if (targetHole.par < 4) continue; // skip par 3s

    const scored: { rh: any; sim: number; isExact: boolean }[] = [];
    for (const round of rounds) {
      const rc = courseCache[round.course_id];
      const roundRating: number | null = rc?.rating ?? null;
      const roundSlope: number | null = rc?.slope ?? null;
      const roundTotalHoles = rc?.holes?.length || 18;
      for (const rh of round.holes ?? []) {
        if (!rh.score || !rh.par) continue;
        const ch: HD | null = rc?.holes?.find((h: any) => h.hole === rh.hole) ?? null;
        if (!ch) continue;
        const isExact = round.course_id === courseId && Number(rh.hole) === Number(targetHole.hole);
        const sim = computeSimilarity(targetHole, targetRating, targetSlope, ch, roundRating, roundSlope, roundTotalHoles, isExact, weights);
        if (sim > 0) scored.push({ rh, sim, isExact });
      }
    }

    const threshold = getAdaptiveThreshold(scored.map(s => s.sim), 40, 100);
    result[targetHole.hole] = scored
      .filter(s => s.sim > threshold)
      .map(({ rh, sim, isExact }) => ({
        club: rh.club ?? "",
        teeAccuracy: rh.tee_accuracy ?? "",
        stp: Number(rh.score) - Number(rh.par),
        simScore: sim,
        isExact,
      }));
  }

  return NextResponse.json(result);
}
