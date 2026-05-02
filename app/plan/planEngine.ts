// app/plan/planEngine.ts
import type { HoleData } from "@/lib/types";
import type {
  PlayerForm, PlanAnswers, HoleStrategy,
  CourseHistorySummary, ClubDistances,
} from "@/lib/planTypes";
import { DEFAULT_CLUB_DISTANCES as DEFAULTS } from "@/lib/planTypes";

export function buildPosture(answers: PlanAnswers): string {
  if (answers.focus === "doubles")
    return "Pick Your Spots: go for it when history says you can par this hole, play it safe when the math says it's a bogey hole — let the course come to you.";
  if (answers.focus === "lowest")
    return "Go Low: driver is the default on par 4/5s, approaches attack pin-high, and par 5s are live for 2. Chase every birdie opportunity.";
  return "Course Manager: the plan prioritizes the club that gives you the best chance to hit the fairway. Approaches play to the safe, wide, penalty-free side of the green.";
}

export function targetScore(answers: PlanAnswers): number { return answers.goal ?? 90; }

/** Extra clubs to add on approaches based on wind score (0–10). */
export function windClubAdjust(windScore = 0): number {
  // 0 → 0 clubs, 5 → 0.5, 10 → 1.5 — rounded to nearest 0.5
  return Math.round(windScore * 0.15 * 2) / 2;
}

/** Yards of tee-shot roll lost due to soft fairways (wetness score 0–10). */
export function wetnessRollLoss(wetnessScore = 0): number {
  return Math.round(wetnessScore * 2); // 0–20 yds
}

export function leavesYardage(h: HoleData, club: string, distances?: ClubDistances): number {
  if (h.par === 3) return 0;
  const d = distances ?? DEFAULTS;
  const key = club === "Long Irons" ? "5i" : club === "Short Irons" ? "9i" : club === "Irons" ? "7i" : club;
  const dist = d[key] ?? DEFAULTS[key];
  const carry = dist ? (dist.min + dist.max) / 2 : 200;
  return Math.max(0, h.yards - carry);
}

function isTrouble(h: HoleData, history?: CourseHistorySummary): boolean {
  if (history?.trouble?.some((t) => t.hole === h.hole)) return true;
  const hazards = [
    h.tee_water_out_left, h.tee_water_out_right, h.tee_water_out_across,
    h.approach_water_out_left, h.approach_water_out_right,
    h.approach_tree_hazard_left, h.approach_tree_hazard_right,
  ].filter(Boolean).length;
  return hazards >= 3;
}

function isStronghold(h: HoleData, history?: CourseHistorySummary): boolean {
  return !!history?.strongholds?.some((s) => s.hole === h.hole);
}

export function strategyFor(
  h: HoleData, form: PlayerForm, answers: PlanAnswers,
  history?: CourseHistorySummary, distances?: ClubDistances
): HoleStrategy {
  const driverHot  = form.Driver >= 70;
  const driverCold = form.Driver < 45;
  const trouble    = isTrouble(h, history);
  const stronghold = isStronghold(h, history);

  let pref    = h.preferred_club ?? (h.par === 3 ? "6i" : h.par === 5 ? "3W" : "Driver");
  let note: string | null    = null;
  let insight: string | null = null;
  let why = "Standard plan — play to hole shape and leave a full-swing wedge distance.";
  let sample: string | null  = null;

  const troubleItem    = history?.trouble?.find((t) => t.hole === h.hole);
  const strongholdItem = history?.strongholds?.find((s) => s.hole === h.hole);

  if (troubleItem)    { insight = troubleItem.note.split("—")[0].trim(); why = troubleItem.note; sample = troubleItem.sample; }
  else if (strongholdItem) { insight = "You own this hole"; why = strongholdItem.note; sample = strongholdItem.sample; }

  // Form-driven adjustments
  if (driverHot  && h.par >= 4 && pref !== "Driver" && !trouble) { pref = "Driver"; note = "engine bumped ↑ — driver is hot"; }
  if (driverCold && pref === "Driver")                            { pref = "3W";     note = "engine dialed ↓ — driver cold today"; }

  // Focus-driven adjustments
  if (answers.focus === "doubles" && trouble && pref === "Driver")                    { pref = "3W"; note = "engine dialed ↓ — protect against doubles"; }
  if (answers.focus === "lowest"  && h.par === 5 && pref !== "Driver" && form.Driver >= 55) { pref = "Driver"; note = "engine bumped ↑ — going for lowest score"; }

  // Weather adjustments (continuous scores)
  const clubs = windClubAdjust(answers.windScore);
  const roll  = wetnessRollLoss(answers.wetnessScore);
  if (clubs >= 0.5) why += ` Wind adds ~${clubs} club${clubs === 1 ? "" : "s"} on approaches.`;
  if (roll  >= 5)   why += ` Soft fairways — expect ~${roll} fewer yards of roll off the tee.`;

  const aim       = (h.preferred_landing ?? "CF") as HoleStrategy["aim"];
  const remaining = leavesYardage(h, pref, distances);

  return { hole: h.hole, pref, aim, remaining, note, insight, why, sample, trouble, stronghold };
}

export function buildStrategies(
  holes: HoleData[], form: PlayerForm, answers: PlanAnswers,
  history?: CourseHistorySummary, distances?: ClubDistances
): Record<number, HoleStrategy> {
  const out: Record<number, HoleStrategy> = {};
  for (const h of holes) out[h.hole] = strategyFor(h, form, answers, history, distances);
  return out;
}
