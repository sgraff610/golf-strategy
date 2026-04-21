// lib/planTypes.ts
// New types for the Pre-Round Planner. Extends your existing lib/types.ts
// without modifying it — import from both as needed.

import type { HoleData } from "./types";

export type ClubKey = "Driver" | "3W" | "Irons" | "Wedges" | "Putter";

/** 0–100 self-rated feel per club group. 75+ hot, 55+ solid, 35+ neutral, <35 cold */
export type PlayerForm = Record<ClubKey, number>;

export type FeelingAnswer = "dialed" | "steady" | "rusty";
export type FocusAnswer = "doubles" | "pace" | "lowest";
export type WeatherAnswer = "calm" | "windy" | "wet";
export type GoalAnswer = "break80" | "sub90" | "practice";

export type PlanAnswers = {
  how_feeling?: FeelingAnswer;
  focus?: FocusAnswer;
  weather?: WeatherAnswer;
  goal?: GoalAnswer;
};

/** A single hole's strategy recommendation, derived from form + answers + history. */
export type HoleStrategy = {
  hole: number;
  /** recommended tee club (may differ from hole.preferred_club after engine adjusts) */
  pref: string;
  /** recommended aim: L / LF / CF / RF / R */
  aim: "L" | "LF" | "CF" | "RF" | "R";
  /** remaining yardage to green after this tee shot */
  remaining: number;
  /** short one-line engine note, e.g. "engine bumped ↑ — driver is hot" */
  note: string | null;
  /** pill copy, e.g. "You own this hole" or "OB right costs you here" */
  insight: string | null;
  /** full explainer shown on expand */
  why: string;
  /** provenance, e.g. "4 of 4 rounds" */
  sample: string | null;
  /** true if this hole historically trouble for this player */
  trouble: boolean;
  /** true if this hole historically a stronghold */
  stronghold: boolean;
};

/** Aggregated insights about a player's history at a specific course. */
export type CourseInsight = {
  hole: number;
  note: string;
  confidence: "high" | "medium" | "low";
  sample: string;
};

export type Correlation = {
  key: string;
  value: string;
  sample: string;
  direction: "good" | "bad";
};

export type CourseHistorySummary = {
  course_id: string;
  rounds_played: number;
  best_score: number | null;
  best_to_par: string | null;
  best_date: string | null;
  avg_score: number | null;
  avg_to_par: string | null;
  strongholds: CourseInsight[];
  trouble: CourseInsight[];
  correlations: Correlation[];
};

/** Final plan saved to DB. One per (user, course, round_date). */
export type RoundPlan = {
  id?: string;
  user_id?: string;
  course_id: string;
  round_date: string; // ISO date
  answers: PlanAnswers;
  form: PlayerForm;
  /** posture sentence shown on Review and header of Play */
  posture: string;
  /** per-hole strategy, keyed by hole number (1..18) */
  strategies: Record<number, HoleStrategy>;
  /** target score for the day, derived from goal */
  target_score: number;
  created_at?: string;
};
