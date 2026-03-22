import { NextRequest, NextResponse } from "next/server";

type Hazard = "water" | "trees" | "bunker" | "none";

type Hole = {
  hole: number;
  par: number;
  yards: number;
  dogleg_direction?: "left" | "right" | "none";
  hazard_left?: Hazard;
  hazard_right?: Hazard;
  green_depth?: number;
};

type HoleHistory = Hole & {
  score: number;
  tee_miss_left: number;
  tee_miss_right: number;
  approach_long: number;
  approach_short: number;
  bunker_trouble: number;
};

type PlayerTendencies = {
  tee_miss_left_pct: number;
  tee_miss_right_pct: number;
  approach_long_pct: number;
  approach_short_pct: number;
  bunker_trouble_pct: number;
};

type TeeStrategy = {
  club: string;
  aim: "left" | "right" | "center";
  reason: string;
};

type ApproachStrategy = {
  aim: "short" | "long" | "center";
  reason: string;
};

type StrategyOutput = {
  tee_strategy: TeeStrategy;
  approach_strategy: ApproachStrategy;
  warning: string | null;
};

type Input = {
  targetHole: Hole;
  history: HoleHistory[];
};

function selectClub(yards: number): string {
  if (yards <= 125) return "Pitching Wedge";
  if (yards <= 135) return "9 Iron";
  if (yards <= 145) return "8 Iron";
  if (yards <= 155) return "7 Iron";
  if (yards <= 165) return "6 Iron";
  if (yards <= 175) return "5 Iron";
  if (yards <= 185) return "4 Iron";
  if (yards <= 195) return "7 Wood";
  if (yards <= 205) return "5 Wood";
  if (yards <= 223) return "3 Wood";
  return "Driver";
}

export function calculateSimilarity(a: Hole, b: Hole): number {
  let score = 0;
  if (a.par === b.par) score += 3;
  const yardDiff = Math.abs(a.yards - b.yards);
  if (yardDiff <= 20) score += 3;
  else if (yardDiff <= 50) score += 1;
  if (a.dogleg_direction && b.dogleg_direction && a.dogleg_direction === b.dogleg_direction) score += 2;
  if (a.hazard_left && b.hazard_left && a.hazard_left === b.hazard_left) score += 1;
  if (a.hazard_right && b.hazard_right && a.hazard_right === b.hazard_right) score += 1;
  return score;
}

export function findSimilarHoles(target: Hole, history: HoleHistory[]): HoleHistory[] {
  return [...history]
    .map((h) => ({ hole: h, score: calculateSimilarity(target, h) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.hole);
}

export function aggregateTendencies(holes: HoleHistory[]): PlayerTendencies {
  const count = holes.length;
  if (count === 0) {
    return {
      tee_miss_left_pct: 0,
      tee_miss_right_pct: 0,
      approach_long_pct: 0,
      approach_short_pct: 0,
      bunker_trouble_pct: 0,
    };
  }
  const sum = holes.reduce(
    (acc, h) => ({
      tee_miss_left: acc.tee_miss_left + h.tee_miss_left,
      tee_miss_right: acc.tee_miss_right + h.tee_miss_right,
      approach_long: acc.approach_long + h.approach_long,
      approach_short: acc.approach_short + h.approach_short,
      bunker_trouble: acc.bunker_trouble + h.bunker_trouble,
    }),
    { tee_miss_left: 0, tee_miss_right: 0, approach_long: 0, approach_short: 0, bunker_trouble: 0 }
  );
  return {
    tee_miss_left_pct: sum.tee_miss_left / count,
    tee_miss_right_pct: sum.tee_miss_right / count,
    approach_long_pct: sum.approach_long / count,
    approach_short_pct: sum.approach_short / count,
    bunker_trouble_pct: sum.bunker_trouble / count,
  };
}

export function generateStrategy(hole: Hole, tendencies: PlayerTendencies): StrategyOutput {
  const club = selectClub(hole.yards);
  const dominantMiss: "left" | "right" | "none" =
    tendencies.tee_miss_left_pct > tendencies.tee_miss_right_pct ? "left"
    : tendencies.tee_miss_right_pct > tendencies.tee_miss_left_pct ? "right"
    : "none";
  let teeAim: "left" | "right" | "center" = "center";
  let teeReason = "balanced miss tendency";
  if (dominantMiss === "left") { teeAim = "right"; teeReason = "miss tendency left"; }
  else if (dominantMiss === "right") { teeAim = "left"; teeReason = "miss tendency right"; }
  const hazardOnMissSide: Hazard | null =
    dominantMiss === "left" ? hole.hazard_left ?? null
    : dominantMiss === "right" ? hole.hazard_right ?? null
    : null;
  const hasActiveHazard = hazardOnMissSide !== null && hazardOnMissSide !== "none";
  let warning: string | null = null;
  if (hasActiveHazard && dominantMiss !== "none") {
    warning = `Avoid ${dominantMiss} side due to ${hazardOnMissSide} and miss tendency`;
  }
  let approachAim: "short" | "long" | "center" = "center";
  let approachReason = "balanced approach tendency";
  if (tendencies.approach_long_pct > tendencies.approach_short_pct) { approachAim = "short"; approachReason = "tendency to go long"; }
  else if (tendencies.approach_short_pct > tendencies.approach_long_pct) { approachAim = "long"; approachReason = "tendency to go short"; }
  return {
    tee_strategy: { club, aim: teeAim, reason: teeReason },
    approach_strategy: { aim: approachAim, reason: approachReason },
    warning,
  };
}

export async function POST(req: NextRequest) {
  let body: Partial<Input>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { targetHole, history } = body;
  if (!targetHole || !Array.isArray(history)) {
    return NextResponse.json({ error: "Missing required fields: targetHole and history" }, { status: 422 });
  }
  const similarHoles = findSimilarHoles(targetHole, history);
  const tendencies = aggregateTendencies(similarHoles);
  const strategy = generateStrategy(targetHole, tendencies);
  const similarityScores = similarHoles.map((h) => calculateSimilarity(targetHole, h));
  const averageSimilarityScore = similarityScores.length > 0
    ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length : 0;
  return NextResponse.json({
    strategy,
    meta: { matched_holes: similarHoles.length, average_similarity_score: Math.round(averageSimilarityScore * 100) / 100 },
  }, { status: 200 });
}
