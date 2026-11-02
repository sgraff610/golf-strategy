import type { SupabaseClient } from "@supabase/supabase-js";

// ─── WHS calculations ─────────────────────────────────────────────────────────

export function computeHandicapIndexAtDate(allRounds: any[], beforeDate: string): number {
  // Get rounds before this date, sorted chronologically
  const prior = allRounds
    .filter(r => r.date < beforeDate && r.score_differential != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build list of differentials — pad with 14.0 if fewer than 20
  const diffs = prior.map(r => r.score_differential as number);
  while (diffs.length < 20) diffs.unshift(14.0);
  const last20 = diffs.slice(-20);

  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1
    : last20.length <= 8 ? 2
    : last20.length <= 11 ? 3
    : last20.length <= 14 ? 4
    : last20.length <= 16 ? 5
    : last20.length <= 18 ? 6
    : last20.length === 19 ? 7
    : 8;
  const best = sorted.slice(0, count);
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return Math.floor(avg * 10) / 10;
}

// Course rating scaled to the number of holes actually played
export function adjustedRating(rating: number, holesPlayed: number, courseHoleCount: number = 18): number {
  const is9Course = courseHoleCount <= 9;
  const is9Round = holesPlayed <= 9;
  if (!is9Round && is9Course) return rating * 2;
  if (is9Round && !is9Course) return rating / 2;
  return rating;
}

export function computeCourseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
  holesPlayed: number,
  courseHoleCount: number = 18
): number {
  const adjRating = adjustedRating(rating, holesPlayed, courseHoleCount);
  if (holesPlayed <= 9) {
    const halfHI = Math.round(handicapIndex / 2 * 10) / 10;
    return Math.round(halfHI * (slope / 113) + (adjRating - par));
  }
  return Math.round(handicapIndex * (slope / 113) + (adjRating - par));
}

export function handicapStrokesOnHole(courseHandicap: number, strokeIndex: number): number {
  // strokes = floor(courseHandicap / 18), plus 1 if strokeIndex <= (courseHandicap % 18)
  const base = Math.floor(courseHandicap / 18);
  const extra = courseHandicap % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

export function netDoubleBogey(par: number, handicapStrokes: number): number {
  return par + 2 + handicapStrokes;
}

export function adjustedScore(actualScore: number | "", par: number, handicapStrokes: number): number | "" {
  if (actualScore === "") return "";
  const ndb = netDoubleBogey(par, handicapStrokes);
  return Math.min(Number(actualScore), ndb);
}

export function computeAdjustedGrossScore(holes: any[], courseHandicap: number): number {
  return holes.reduce((sum, h) => {
    const strokes = handicapStrokesOnHole(courseHandicap, h.stroke_index);
    const adj = adjustedScore(h.score, h.par, strokes);
    return sum + (adj === "" ? 0 : Number(adj));
  }, 0);
}

export function computeScoreDifferential(ags: number, rating: number, slope: number): number {
  return Math.round(((ags - rating) * (113 / slope)) * 10) / 10;
}

// ─── Persisted recalculation ──────────────────────────────────────────────────

// Recomputes and stores handicap_index, course_handicap, adjusted_gross_score
// and score_differential for a round. Only writes once every hole has a score,
// so partially entered rounds never store a differential.
export async function recomputeRoundHandicap(client: SupabaseClient, roundId: string): Promise<void> {
  const { data: round } = await client
    .from("rounds")
    .select("id, course_id, date, holes, holes_played")
    .eq("id", roundId)
    .single();
  if (!round) return;

  const holes: any[] = round.holes ?? [];
  const complete = holes.length > 0 && holes.every(h => Number(h.score) > 0);
  if (!complete) return;

  const { data: course } = await client
    .from("courses")
    .select("rating, slope, holes")
    .eq("id", round.course_id)
    .single();
  if (!course?.rating || !course?.slope) return;

  const { data: others } = await client
    .from("rounds")
    .select("date, score_differential")
    .neq("id", round.id);

  const holesPlayed = round.holes_played ?? 18;
  const courseHoleCount = course.holes?.length ?? 18;
  const hi = computeHandicapIndexAtDate(others ?? [], round.date ?? "");
  const totalPar = holes.reduce((s, h) => s + (h.par || 0), 0);
  const ch = computeCourseHandicap(hi, course.slope, course.rating, totalPar, holesPlayed, courseHoleCount);
  const ags = computeAdjustedGrossScore(holes, ch);
  const sd = computeScoreDifferential(ags, adjustedRating(course.rating, holesPlayed, courseHoleCount), course.slope);

  await client.from("rounds").update({
    handicap_index: hi,
    course_handicap: ch,
    adjusted_gross_score: ags,
    score_differential: sd,
  }).eq("id", round.id);
}
