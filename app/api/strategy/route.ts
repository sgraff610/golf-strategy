import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Hazard = "water" | "trees" | "bunker" | "none";

type Hole = {
  hole: number;
  par: 3 | 4 | 5;
  yards: number;
  dogleg_direction?: string | null;
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

export function generateStrategy(
  hole: Hole,
  tendencies: PlayerTendencies
): StrategyOutput {
  const club = selectClub(hole.yards);

  const dominantMiss: "left" | "right" | "none" =
    tendencies.tee_miss_left_pct > tendencies.tee_miss_right_pct
      ? "left"
      : tendencies.tee_miss_right_pct > tendencies.tee_miss_left_pct
      ? "right"
      : "none";

  let teeAim: "left" | "right" | "center" = "center";
  let teeReason = "balanced miss tendency";
  if (dominantMiss === "left") { teeAim = "right"; teeReason = "miss tendency left"; }
  else if (dominantMiss === "right") { teeAim = "left"; teeReason = "miss tendency right"; }

  let warning: string | null = null;
  if (dominantMiss !== "none") {
    warning = `Tendency to miss ${dominantMiss} — aim ${teeAim}`;
  }

  let approachAim: "short" | "long" | "center" = "center";
  let approachReason = "balanced approach tendency";
  if (tendencies.approach_long_pct > tendencies.approach_short_pct) {
    approachAim = "short"; approachReason = "tendency to go long";
  } else if (tendencies.approach_short_pct > tendencies.approach_long_pct) {
    approachAim = "long"; approachReason = "tendency to go short";
  }

  return {
    tee_strategy: { club, aim: teeAim, reason: teeReason },
    approach_strategy: { aim: approachAim, reason: approachReason },
    warning,
  };
}

export async function POST(req: NextRequest) {
  let body: { course?: string; hole?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { course, hole } = body;
  if (!course || !hole) {
    return NextResponse.json(
      { error: "Missing required fields: course and hole" },
      { status: 422 }
    );
  }

  const { data: courseRow, error: dbError } = await supabase
    .from("courses")
    .select("*")
    .eq("name", course)
    .single();

  if (dbError || !courseRow) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const holeData = courseRow.holes.find((h: any) => h.hole === hole);
  if (!holeData) {
    return NextResponse.json({ error: "Hole not found" }, { status: 404 });
  }

  const tendencies: PlayerTendencies = {
    tee_miss_left_pct: 0.6,
    tee_miss_right_pct: 0.4,
    approach_long_pct: 0.55,
    approach_short_pct: 0.45,
    bunker_trouble_pct: 0.3,
  };

  const strategy = generateStrategy(holeData, tendencies);

  return NextResponse.json({ hole: holeData, strategy }, { status: 200 });
}
