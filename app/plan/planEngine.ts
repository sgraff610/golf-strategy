// app/plan/planEngine.ts
// The core recommendation function. Takes hole data + player form + answers +
// history, returns a HoleStrategy. Start simple; add tiers of logic over time.

import type { HoleData } from "@/lib/types";
import type {
  PlayerForm,
  PlanAnswers,
  HoleStrategy,
  CourseInsight,
  CourseHistorySummary,
} from "@/lib/planTypes";

export function buildPosture(answers: PlanAnswers): string {
  if (answers.focus === "doubles" && answers.how_feeling === "rusty") {
    return "Conservative posture: the plan leans toward 3W/5W off the tee and plays the fat side of greens. We're trading distance for fewer big numbers.";
  }
  if (answers.focus === "lowest" && answers.how_feeling === "dialed") {
    return "Aggressive posture: driver is the default on par 4/5s, approaches attack middle-of-green, and par 5s are live for 2.";
  }
  return "Balanced posture: driver stays in play when hazards are one-sided, we lay up where math says layup, and approaches aim for the fat quadrant.";
}

export function targetScore(answers: PlanAnswers): number {
  if (answers.goal === "break80") return 79;
  if (answers.goal === "sub90") return 89;
  return 84;
}

/** Rough yardage-to-green after a stock drive from this tee club.
 * Replace with real player distances from profile.
 */
function leavesYardage(h: HoleData, club: string): number {
  if (h.par === 3) return 0;
  const carry: Record<string, number> = {
    Driver: 230, "3W": 210, "5W": 195, "3i": 180, "5i": 165, "7i": 150, "9i": 130,
  };
  const c = carry[club] ?? 200;
  return Math.max(0, h.yards - c);
}

/** Does this hole look like trouble for this player? We use historical trouble
 * first, then hazard density as a fallback.
 */
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

/** The main engine. Given everything we know, recommend a strategy. */
export function strategyFor(
  h: HoleData,
  form: PlayerForm,
  answers: PlanAnswers,
  history?: CourseHistorySummary
): HoleStrategy {
  const driverHot = form.Driver >= 70;
  const driverCold = form.Driver < 45;
  const trouble = isTrouble(h, history);
  const stronghold = isStronghold(h, history);

  let pref = h.preferred_club ?? (h.par === 3 ? "6i" : h.par === 5 ? "3W" : "Driver");
  let note: string | null = null;
  let insight: string | null = null;
  let why = "Standard plan — play to hole shape and leave a full-swing wedge distance.";
  let sample: string | null = null;

  const troubleItem = history?.trouble?.find((t) => t.hole === h.hole);
  const stronghold_item = history?.strongholds?.find((s) => s.hole === h.hole);

  if (troubleItem) {
    insight = troubleItem.note.split("—")[0].trim();
    why = troubleItem.note;
    sample = troubleItem.sample;
  } else if (stronghold_item) {
    insight = "You own this hole";
    why = stronghold_item.note;
    sample = stronghold_item.sample;
  }

  // Form-driven adjustments (the "quiet engine")
  if (driverHot && h.par >= 4 && pref !== "Driver" && !trouble) {
    pref = "Driver";
    note = "engine bumped ↑ — driver is hot";
  }
  if (driverCold && pref === "Driver") {
    pref = "3W";
    note = "engine dialed ↓ — driver cold today";
  }

  // Focus-driven adjustments
  if (answers.focus === "doubles" && trouble && pref === "Driver") {
    pref = "3W";
    note = "engine dialed ↓ — protect against doubles";
  }
  if (answers.focus === "lowest" && h.par === 5 && pref !== "Driver" && form.Driver >= 55) {
    pref = "Driver";
    note = "engine bumped ↑ — going for lowest score";
  }

  // Weather
  if (answers.weather === "windy") {
    why += " Wind is up, so we're committing to one extra club on approaches.";
  }

  const aim = (h.preferred_landing ?? "CF") as HoleStrategy["aim"];
  const remaining = leavesYardage(h, pref);

  return {
    hole: h.hole,
    pref,
    aim,
    remaining,
    note,
    insight,
    why,
    sample,
    trouble,
    stronghold,
  };
}

/** Build strategies for all 18 holes. */
export function buildStrategies(
  holes: HoleData[],
  form: PlayerForm,
  answers: PlanAnswers,
  history?: CourseHistorySummary
): Record<number, HoleStrategy> {
  const out: Record<number, HoleStrategy> = {};
  for (const h of holes) out[h.hole] = strategyFor(h, form, answers, history);
  return out;
}
