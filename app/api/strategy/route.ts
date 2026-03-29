import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type EnrichedRoundHole = {
  roundHole: RoundHole;
  courseHole: HoleData | null;
  courseRating: number | null;
  courseSlope: number | null;
  similarityScore: number;
};

// ─── Club distances ───────────────────────────────────────────────────────────

const CLUB_DISTANCES: Record<string, number> = {
  Driver: 230, "3W": 210, "5W": 195, "7W": 180,
  "4i": 185, "5i": 175, "6i": 165, "7i": 155,
  "8i": 145, "9i": 130, PW: 120, SW: 100, LW: 80,
};

const APPROACH_CLUBS = ["3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"];

function selectDriveClub(yards: number, par: number): string {
  if (par === 3) {
    // Par 3: pick approach club by distance
    return bestApproachClub(yards);
  }
  if (yards > 350) return "Driver";
  if (yards > 280) return "3W";
  return "5W";
}

function bestApproachClub(yards: number): string {
  let best = APPROACH_CLUBS[0];
  let bestDiff = Infinity;
  for (const club of APPROACH_CLUBS) {
    const diff = Math.abs((CLUB_DISTANCES[club] ?? 0) - yards);
    if (diff < bestDiff) { bestDiff = diff; best = club; }
  }
  return best;
}

// ─── Difficulty adjustment ────────────────────────────────────────────────────

// Normalise stroke_index against course difficulty.
// A SI-3 hole on a slope-135/rating-74 course is harder than SI-1 on slope-110/rating-69.
// We compute an "effective difficulty" score 0–1 where higher = harder.
const BASE_SLOPE = 113; // USGA neutral slope
const BASE_RATING = 72;

function effectiveDifficulty(si: number, totalHoles: number, slope: number | null, rating: number | null): number {
  const holeCount = totalHoles || 18;
  // Normalise SI: 0 = easiest hole (highest SI number), 1 = hardest (SI 1)
  const siNorm = 1 - (si - 1) / (holeCount - 1);
  // Course difficulty multiplier centred on 1.0
  const slopeAdj  = slope  ? (slope  - BASE_SLOPE)  / 40 : 0;  // ±1 range roughly
  const ratingAdj = rating ? (rating - BASE_RATING) / 6  : 0;
  const courseMult = 1 + (slopeAdj + ratingAdj) / 2;
  return Math.min(1, Math.max(0, siNorm * courseMult));
}

// ─── Similarity scoring ───────────────────────────────────────────────────────

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
  targetHole: HoleData,
  targetRating: number | null,
  targetSlope: number | null,
  candidateHole: HoleData,
  candidateRating: number | null,
  candidateSlope: number | null,
  totalHoles: number,
  isExactHole: boolean
): number {
  let score = 0;

  // Exact same hole on same course — highest weight
  if (isExactHole) score += 40;

  // Par match (mandatory-ish — heavily penalise mismatch)
  if (targetHole.par === candidateHole.par) score += 15;
  else score -= 20;

  // Yardage proximity — gaussian decay, ±50 yds = half weight
  const yardDiff = Math.abs((targetHole.yards || 0) - (candidateHole.yards || 0));
  score += 10 * Math.exp(-yardDiff / 60);

  // Effective difficulty proximity
  const targetDiff    = effectiveDifficulty(targetHole.stroke_index || 9,    totalHoles, targetSlope,    targetRating);
  const candidateDiff = effectiveDifficulty(candidateHole.stroke_index || 9, totalHoles, candidateSlope, candidateRating);
  const diffDelta = Math.abs(targetDiff - candidateDiff);
  score += 12 * Math.exp(-diffDelta / 0.2);

  // Hazard profile similarity
  const th = hazardProfile(targetHole);
  const ch = hazardProfile(candidateHole);
  const hazardKeys = Object.keys(th) as (keyof typeof th)[];
  const hazardMatches = hazardKeys.filter(k => th[k] === ch[k]).length;
  score += 8 * (hazardMatches / hazardKeys.length);

  // Dogleg direction match
  if (th.hasDogleg === ch.hasDogleg) score += 3;
  if (th.doglegLeft === ch.doglegLeft && th.doglegRight === ch.doglegRight) score += 2;

  // Green depth proximity (if both have it)
  if (targetHole.approach_green_depth && candidateHole.approach_green_depth) {
    const depthDiff = Math.abs(targetHole.approach_green_depth - candidateHole.approach_green_depth);
    score += 3 * Math.exp(-depthDiff / 8);
  }

  return Math.max(0, score);
}

// ─── Weighted tendency aggregation ───────────────────────────────────────────

type WeightedTendencies = {
  // Sample size
  sampleSize: number;
  totalWeight: number;

  // Scoring
  avgScoreToPar: number;
  scoringByDifficulty: { easy: number; medium: number; hard: number }; // avg score to par by difficulty tier

  // Tee
  driveHitPct: number;
  driveMissLeftPct: number;
  driveMissRightPct: number;
  driveWaterPct: number;     // drove into water/OB
  driveTreePct: number;      // drove into trees
  driveBunkerPct: number;    // drove into fairway bunker
  driveClubFreq: Record<string, number>; // weighted frequency of clubs used

  // Approach
  apprHitPct: number;
  apprMissLeftPct: number;
  apprMissRightPct: number;
  apprMissShortPct: number;
  apprMissLongPct: number;
  girPct: number;

  // Greenside
  avgPutts: number;
  avgChips: number; // known chips only
  gsBunkerPct: number;
  avgFirstPuttCategory: string; // most common first putt distance bucket

  // Course difficulty correlation
  avgScoreEasyCourses: number;  // slope < 120
  avgScoreHardCourses: number;  // slope >= 120

  // Hazard impact (how much worse when hazards are present on the miss side)
  leftHazardImpact: number;     // avg score delta when tee hazard left and missed left
  rightHazardImpact: number;

  // Key insights — top factors that most affect score (for weighting recommendations)
  insights: string[];
};

function resolveChips(h: RoundHole): number | null {
  if (h.appr_accuracy === "Hit") return 0;
  if (h.chips !== "" && h.chips !== undefined && h.chips !== null) return Number(h.chips);
  return null;
}

function aggregateTendencies(enriched: EnrichedRoundHole[]): WeightedTendencies {
  const valid = enriched.filter(e => e.roundHole.score !== "" && e.similarityScore > 0);
  if (valid.length === 0) {
    return emptyTendencies();
  }

  const totalWeight = valid.reduce((s, e) => s + e.similarityScore, 0);

  // Helpers
  const wAvg = (getValue: (e: EnrichedRoundHole) => number | null): number => {
    let num = 0, den = 0;
    for (const e of valid) {
      const v = getValue(e);
      if (v !== null && !isNaN(v)) { num += v * e.similarityScore; den += e.similarityScore; }
    }
    return den > 0 ? num / den : 0;
  };

  const wPct = (pred: (e: EnrichedRoundHole) => boolean, denom?: (e: EnrichedRoundHole) => boolean): number => {
    let num = 0, den = 0;
    for (const e of valid) {
      const inDenom = denom ? denom(e) : true;
      if (inDenom) {
        den += e.similarityScore;
        if (pred(e)) num += e.similarityScore;
      }
    }
    return den > 0 ? num / den : 0;
  };

  const scoreToPar = (e: EnrichedRoundHole) => Number(e.roundHole.score) - e.roundHole.par;

  // Drive accuracy — par 4/5 only
  const drivingHoles = (e: EnrichedRoundHole) => e.roundHole.par >= 4;
  const driveHitPct       = wPct(e => e.roundHole.tee_accuracy === "Hit", drivingHoles);
  const driveMissLeftPct  = wPct(e => e.roundHole.tee_accuracy === "Left", drivingHoles);
  const driveMissRightPct = wPct(e => e.roundHole.tee_accuracy === "Right", drivingHoles);

  // Hazard encounters
  const driveWaterPct  = wPct(e => (Number(e.roundHole.water_penalty)||0) + (Number(e.roundHole.drop_or_out)||0) > 0, drivingHoles);
  const driveTreePct   = wPct(e => (Number(e.roundHole.tree_haz)||0) > 0, drivingHoles);
  const driveBunkerPct = wPct(e => (Number(e.roundHole.fairway_bunker)||0) > 0, drivingHoles);

  // Drive club frequency
  const driveClubFreq: Record<string, number> = {};
  for (const e of valid) {
    if (e.roundHole.par >= 4 && e.roundHole.club) {
      driveClubFreq[e.roundHole.club] = (driveClubFreq[e.roundHole.club] || 0) + e.similarityScore;
    }
  }

  // Approach
  const apprHitPct       = wPct(e => e.roundHole.appr_accuracy === "Hit");
  const apprMissLeftPct  = wPct(e => e.roundHole.appr_accuracy === "Left");
  const apprMissRightPct = wPct(e => e.roundHole.appr_accuracy === "Right");
  const apprMissShortPct = wPct(e => e.roundHole.appr_accuracy === "Short");
  const apprMissLongPct  = wPct(e => e.roundHole.appr_accuracy === "Long");
  const girPct           = wPct(e => !!e.roundHole.gir);

  // Greenside
  const avgPutts = wAvg(e => e.roundHole.putts !== "" ? Number(e.roundHole.putts) : null);
  const knownChips = valid.filter(e => resolveChips(e.roundHole) !== null);
  const avgChips = knownChips.length > 0
    ? knownChips.reduce((s, e) => s + (resolveChips(e.roundHole) ?? 0) * e.similarityScore, 0) /
      knownChips.reduce((s, e) => s + e.similarityScore, 0)
    : 0;
  const gsBunkerPct = wPct(e => (Number(e.roundHole.greenside_bunker)||0) > 0);

  // First putt distance — find most common weighted bucket
  const puttBuckets: Record<string, number> = {};
  for (const e of valid) {
    if (e.roundHole.first_putt_distance) {
      puttBuckets[e.roundHole.first_putt_distance] = (puttBuckets[e.roundHole.first_putt_distance] || 0) + e.similarityScore;
    }
  }
  const avgFirstPuttCategory = Object.entries(puttBuckets).sort((a,b) => b[1]-a[1])[0]?.[0] ?? "";

  // Average score to par
  const avgScoreToPar = wAvg(scoreToPar);

  // Scoring by difficulty tier
  const easyHoles   = valid.filter(e => (e.courseSlope ?? 113) < 115);
  const hardHoles   = valid.filter(e => (e.courseSlope ?? 113) >= 125);
  const mediumHoles = valid.filter(e => {
    const s = e.courseSlope ?? 113;
    return s >= 115 && s < 125;
  });

  const tierAvg = (pool: EnrichedRoundHole[]) => {
    if (!pool.length) return 0;
    const tw = pool.reduce((s,e) => s+e.similarityScore, 0);
    return tw > 0 ? pool.reduce((s,e) => s + scoreToPar(e)*e.similarityScore, 0) / tw : 0;
  };

  const avgScoreEasyCourses = tierAvg(easyHoles);
  const avgScoreHardCourses = tierAvg(hardHoles);

  // Course difficulty performance correlation
  const scoringByDifficulty = {
    easy:   tierAvg(easyHoles),
    medium: tierAvg(mediumHoles),
    hard:   tierAvg(hardHoles),
  };

  // Hazard impact — how much worse when hazard is on miss side
  const leftHazardHoles  = valid.filter(e => e.courseHole?.tee_tree_hazard_left || e.courseHole?.tee_water_out_left);
  const rightHazardHoles = valid.filter(e => e.courseHole?.tee_tree_hazard_right || e.courseHole?.tee_water_out_right);
  const leftMissOnHazard  = leftHazardHoles.filter(e => e.roundHole.tee_accuracy === "Left");
  const rightMissOnHazard = rightHazardHoles.filter(e => e.roundHole.tee_accuracy === "Right");
  const leftHazardImpact  = leftMissOnHazard.length  > 0 ? tierAvg(leftMissOnHazard)  - tierAvg(leftHazardHoles)  : 0;
  const rightHazardImpact = rightMissOnHazard.length > 0 ? tierAvg(rightMissOnHazard) - tierAvg(rightHazardHoles) : 0;

  // Build insights
  const insights: string[] = [];
  if (Math.abs(leftHazardImpact) > 0.3)  insights.push(`Left hazard costs you +${leftHazardImpact.toFixed(2)} strokes when missed left`);
  if (Math.abs(rightHazardImpact) > 0.3) insights.push(`Right hazard costs you +${rightHazardImpact.toFixed(2)} strokes when missed right`);
  if (driveHitPct > 0.6)   insights.push(`Strong driver accuracy (${Math.round(driveHitPct*100)}% fairways)`);
  if (driveHitPct < 0.4)   insights.push(`Inconsistent off the tee (${Math.round(driveHitPct*100)}% fairways)`);
  if (girPct > 0.55)        insights.push(`Strong iron play (${Math.round(girPct*100)}% GIR)`);
  if (avgPutts > 2.2)       insights.push(`Putting is costing strokes (avg ${avgPutts.toFixed(1)} putts)`);
  if (avgPutts < 1.8)       insights.push(`Strong putter (avg ${avgPutts.toFixed(1)} putts)`);
  if (hardHoles.length > 2 && easyHoles.length > 2) {
    const diffCorr = avgScoreHardCourses - avgScoreEasyCourses;
    if (diffCorr > 0.5) insights.push(`Struggles on harder courses (+${diffCorr.toFixed(2)} on hard vs easy)`);
    if (diffCorr < -0.3) insights.push(`Performs well on harder courses`);
  }

  return {
    sampleSize: valid.length,
    totalWeight,
    avgScoreToPar,
    scoringByDifficulty,
    driveHitPct, driveMissLeftPct, driveMissRightPct,
    driveWaterPct, driveTreePct, driveBunkerPct,
    driveClubFreq,
    apprHitPct, apprMissLeftPct, apprMissRightPct, apprMissShortPct, apprMissLongPct,
    girPct,
    avgPutts, avgChips, gsBunkerPct, avgFirstPuttCategory,
    avgScoreEasyCourses, avgScoreHardCourses,
    leftHazardImpact, rightHazardImpact,
    insights,
  };
}

function emptyTendencies(): WeightedTendencies {
  return {
    sampleSize: 0, totalWeight: 0,
    avgScoreToPar: 0,
    scoringByDifficulty: { easy: 0, medium: 0, hard: 0 },
    driveHitPct: 0.5, driveMissLeftPct: 0.25, driveMissRightPct: 0.25,
    driveWaterPct: 0, driveTreePct: 0, driveBunkerPct: 0,
    driveClubFreq: {},
    apprHitPct: 0.5, apprMissLeftPct: 0.2, apprMissRightPct: 0.2, apprMissShortPct: 0.3, apprMissLongPct: 0.1,
    girPct: 0.4,
    avgPutts: 2.0, avgChips: 0.5, gsBunkerPct: 0.1, avgFirstPuttCategory: "",
    avgScoreEasyCourses: 0, avgScoreHardCourses: 0,
    leftHazardImpact: 0, rightHazardImpact: 0,
    insights: [],
  };
}

// ─── Strategy generation ──────────────────────────────────────────────────────

type StrategyOutput = {
  tee_strategy: {
    club: string;
    aim: "left" | "right" | "center";
    reason: string;
  };
  approach_strategy: {
    aim: "short" | "long" | "left" | "right" | "center";
    reason: string;
  };
  warning: string | null;
  confidence: "high" | "medium" | "low";
  data_summary: {
    similar_holes_used: number;
    exact_hole_history: number;
    avg_score_to_par: string;
    insights: string[];
  };
};

function generateStrategy(
  targetHole: HoleData,
  targetSlope: number | null,
  targetRating: number | null,
  tendencies: WeightedTendencies,
  allEnriched: EnrichedRoundHole[]
): StrategyOutput {
  const hp = hazardProfile(targetHole);

  // Confidence based on sample size and similarity
  const exactCount = allEnriched.filter(e => e.similarityScore >= 40).length;
  const confidence: "high" | "medium" | "low" =
    exactCount >= 3 ? "high" :
    tendencies.sampleSize >= 8 ? "medium" : "low";

  // ── Tee strategy ──────────────────────────────────────────────────────────

  // Determine dominant miss direction
  const missLeftPct  = tendencies.driveMissLeftPct;
  const missRightPct = tendencies.driveMissRightPct;

  // Base aim: aim away from dominant miss
  let teeAim: "left" | "right" | "center" = "center";
  let teeReasons: string[] = [];

  // How much worse is each side given this hole's hazards
  const leftHazardSeverity = (
    (hp.teeLeft ? 2 : 0) +
    (targetHole.tee_water_out_left ? 2 : 0) +  // water is worse than trees
    (targetHole.tee_tree_hazard_left ? 1 : 0) +
    (targetHole.tee_bunkers_left ? 1 : 0)
  );
  const rightHazardSeverity = (
    (hp.teeRight ? 2 : 0) +
    (targetHole.tee_water_out_right ? 2 : 0) +
    (targetHole.tee_tree_hazard_right ? 1 : 0) +
    (targetHole.tee_bunkers_right ? 1 : 0)
  );

  // Effective risk = miss probability × hazard severity × personal hazard impact
  const leftRisk  = missLeftPct  * (leftHazardSeverity  + 1) * (1 + Math.max(0, tendencies.leftHazardImpact));
  const rightRisk = missRightPct * (rightHazardSeverity + 1) * (1 + Math.max(0, tendencies.rightHazardImpact));

  if (leftRisk > rightRisk * 1.2) {
    teeAim = "right";
    if (hp.teeLeft) teeReasons.push(`hazard left`);
    if (missLeftPct > 0.35) teeReasons.push(`${Math.round(missLeftPct*100)}% miss left tendency`);
  } else if (rightRisk > leftRisk * 1.2) {
    teeAim = "left";
    if (hp.teeRight) teeReasons.push(`hazard right`);
    if (missRightPct > 0.35) teeReasons.push(`${Math.round(missRightPct*100)}% miss right tendency`);
  } else {
    teeAim = "center";
    teeReasons.push("balanced risk both sides");
  }

  // Dogleg adjustment
  if (hp.hasDogleg) {
    const doglegDir = hp.doglegLeft ? "left" : "right";
    const oppSide   = doglegDir === "left" ? "right" : "left";
    // Aim to the outside of the dogleg for better angle
    if (teeAim === "center") {
      teeAim = oppSide as "left" | "right";
      teeReasons.push(`dogleg ${doglegDir} — aim ${oppSide} for angle`);
    } else {
      teeReasons.push(`dogleg ${doglegDir}`);
    }
  }

  // Across/middle water
  if (hp.teeAcross) {
    teeReasons.push("carry hazard across fairway");
  }

  // Club selection — use most common club from similar holes, or calculate
  let teeClub: string;
  if (targetHole.par === 3) {
    teeClub = bestApproachClub(targetHole.yards);
    teeReasons.push(`${targetHole.yards} yard par 3`);
  } else {
    const freqEntries = Object.entries(tendencies.driveClubFreq).sort((a,b) => b[1]-a[1]);
    teeClub = freqEntries.length > 0 ? freqEntries[0][0] : selectDriveClub(targetHole.yards, targetHole.par);
    if (freqEntries.length > 0) teeReasons.push(`most common club on similar holes`);
  }

  // ── Approach strategy ─────────────────────────────────────────────────────

  let apprAim: "short" | "long" | "left" | "right" | "center" = "center";
  const apprReasons: string[] = [];

  // Short/long tendency
  const shortPct = tendencies.apprMissShortPct;
  const longPct  = tendencies.apprMissLongPct;

  // Approach hazard severity per direction
  const apprShortSeverity = hp.apprShort ? 2 : 0;
  const apprLongSeverity  = hp.apprLong  ? 2 : 0;
  const apprLeftSeverity  = hp.apprLeft  ? 2 : 0;
  const apprRightSeverity = hp.apprRight ? 2 : 0;

  // Primary aim axis: short/long
  if (shortPct > longPct && apprShortSeverity > apprLongSeverity) {
    apprAim = "long";
    apprReasons.push(`miss short tendency (${Math.round(shortPct*100)}%) + short hazard`);
  } else if (longPct > shortPct && apprLongSeverity > apprShortSeverity) {
    apprAim = "short";
    apprReasons.push(`miss long tendency (${Math.round(longPct*100)}%) + long hazard`);
  } else if (shortPct > longPct + 0.1) {
    apprAim = "long";
    apprReasons.push(`${Math.round(shortPct*100)}% miss short — take more club`);
  } else if (longPct > shortPct + 0.1) {
    apprAim = "short";
    apprReasons.push(`${Math.round(longPct*100)}% miss long — take less club`);
  }

  // Left/right approach — if both are different severity, note it
  if (apprLeftSeverity > apprRightSeverity && tendencies.apprMissLeftPct > 0.25) {
    if (apprAim === "center") apprAim = "right";
    apprReasons.push(`approach hazard left`);
  } else if (apprRightSeverity > apprLeftSeverity && tendencies.apprMissRightPct > 0.25) {
    if (apprAim === "center") apprAim = "left";
    apprReasons.push(`approach hazard right`);
  }

  // Green depth consideration
  if (targetHole.approach_green_depth && targetHole.approach_green_depth > 0) {
    if (targetHole.approach_green_depth < 20) {
      apprReasons.push(`shallow green (${targetHole.approach_green_depth} yds) — precision required`);
    } else if (targetHole.approach_green_depth >= 35) {
      apprReasons.push(`deep green (${targetHole.approach_green_depth} yds) — middle is safe`);
    }
  }

  if (apprReasons.length === 0) apprReasons.push("balanced approach tendencies on similar holes");

  // GIR note
  if (tendencies.girPct > 0) {
    apprReasons.push(`${Math.round(tendencies.girPct*100)}% GIR on similar holes`);
  }

  // ── Warning ───────────────────────────────────────────────────────────────

  let warning: string | null = null;
  const warnings: string[] = [];

  // Course difficulty warning
  if (targetSlope && targetSlope >= 125) {
    const diff = tendencies.avgScoreHardCourses - tendencies.avgScoreEasyCourses;
    if (diff > 0.4 && tendencies.sampleSize > 4) {
      warnings.push(`You average +${diff.toFixed(1)} more on hard courses — play conservatively`);
    }
  }

  // Specific hole hazard warnings
  if (hp.teeAcross && targetHole.par === 4) warnings.push("Carry hazard required off the tee");
  if (targetHole.tee_water_out_left && missLeftPct > 0.35) warnings.push(`Water left — ${Math.round(missLeftPct*100)}% left miss is a risk`);
  if (targetHole.tee_water_out_right && missRightPct > 0.35) warnings.push(`Water right — ${Math.round(missRightPct*100)}% right miss is a risk`);
  if (tendencies.gsBunkerPct > 0.2) warnings.push(`Frequent GS bunker on similar holes (${Math.round(tendencies.gsBunkerPct*100)}%)`);
  if (tendencies.avgPutts > 2.3) warnings.push(`Putting pressure — avg ${tendencies.avgPutts.toFixed(1)} putts on similar holes`);

  if (warnings.length > 0) warning = warnings.join(" · ");

  return {
    tee_strategy: {
      club: teeClub,
      aim: teeAim,
      reason: teeReasons.join("; "),
    },
    approach_strategy: {
      aim: apprAim,
      reason: apprReasons.join("; "),
    },
    warning,
    confidence,
    data_summary: {
      similar_holes_used: tendencies.sampleSize,
      exact_hole_history: exactCount,
      avg_score_to_par: tendencies.avgScoreToPar >= 0
        ? `+${tendencies.avgScoreToPar.toFixed(2)}`
        : tendencies.avgScoreToPar.toFixed(2),
      insights: tendencies.insights,
    },
  };
}

// ─── API handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { courseId?: string; hole?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { courseId, hole: holeNumber } = body;
  if (!courseId || !holeNumber) {
    return NextResponse.json({ error: "Missing required fields: courseId and hole" }, { status: 422 });
  }

  // Load target course
  const { data: courseRow, error: courseErr } = await supabase
    .from("courses").select("*").eq("id", courseId).single();
  if (courseErr || !courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const targetHole: HoleData = courseRow.holes.find((h: any) => h.hole === holeNumber);
  if (!targetHole) {
    return NextResponse.json({ error: "Hole not found" }, { status: 404 });
  }

  const targetRating: number | null = courseRow.rating ?? null;
  const targetSlope:  number | null = courseRow.slope  ?? null;
  const totalHoles = courseRow.holes.length || 18;

  // Load all rounds + their courses
  const { data: rounds } = await supabase.from("rounds").select("*");
  if (!rounds || rounds.length === 0) {
    // No round data — return basic strategy
    const basicTendencies = emptyTendencies();
    const strategy = generateStrategy(targetHole, targetSlope, targetRating, basicTendencies, []);
    return NextResponse.json({ hole: targetHole, strategy, course: { rating: targetRating, slope: targetSlope } });
  }

  // Build course lookup cache
  const courseCache: Record<string, any> = {};

  // Enrich all round holes with similarity scores
  const allEnriched: EnrichedRoundHole[] = [];

  for (const round of rounds) {
    const cId = round.course_id;
    if (!courseCache[cId]) {
      const { data: c } = await supabase.from("courses").select("*").eq("id", cId).single();
      courseCache[cId] = c ?? null;
    }
    const roundCourse = courseCache[cId];
    const roundRating: number | null = roundCourse?.rating ?? null;
    const roundSlope:  number | null = roundCourse?.slope  ?? null;
    const roundTotalHoles = roundCourse?.holes?.length || 18;

    for (const rh of (round.holes ?? [])) {
      if (!rh.score || !rh.par) continue;

      const candidateCourseHole: HoleData | null = roundCourse?.holes?.find((h: any) => h.hole === rh.hole) ?? null;
      if (!candidateCourseHole) continue;

      const isExactHole = round.course_id === courseId && rh.hole === holeNumber;

      const similarity = computeSimilarity(
        targetHole, targetRating, targetSlope,
        candidateCourseHole, roundRating, roundSlope,
        roundTotalHoles, isExactHole
      );

      // Only include holes with meaningful similarity
      if (similarity > 2) {
        allEnriched.push({
          roundHole: rh,
          courseHole: candidateCourseHole,
          courseRating: roundRating,
          courseSlope: roundSlope,
          similarityScore: similarity,
        });
      }
    }
  }

  // Sort by similarity descending
  allEnriched.sort((a, b) => b.similarityScore - a.similarityScore);

  // Aggregate weighted tendencies
  const tendencies = aggregateTendencies(allEnriched);

  // Generate strategy
  const strategy = generateStrategy(targetHole, targetSlope, targetRating, tendencies, allEnriched);

  return NextResponse.json({
    hole: targetHole,
    strategy,
    course: { rating: targetRating, slope: targetSlope, name: courseRow.name },
  });
}
