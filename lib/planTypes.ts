// lib/planTypes.ts
// New types for the Pre-Round Planner. Extends your existing lib/types.ts
// without modifying it — import from both as needed.

import type { HoleData } from "./types";

export type ClubKey = "Driver" | "3W" | "5W" | "7W" | "Long Irons" | "Short Irons";

/** 0–100 self-rated feel per club group. 75+ hot, 55+ solid, 35+ neutral, <35 cold */
export type PlayerForm = Record<ClubKey, number>;

export type FeelingAnswer = "dialed" | "steady" | "rusty";
export type FocusAnswer = "doubles" | "pace" | "lowest";
export type WeatherAnswer = "calm" | "windy" | "wet";
/** Target gross score for the round (replaces the old break80/sub90/practice enum) */
export type GoalAnswer = number;

export type PlanAnswers = {
  how_feeling?: FeelingAnswer;
  focus?: FocusAnswer;
  weather?: WeatherAnswer;
  goal?: GoalAnswer;
};

/** Per-club carry distance range (yards), stored in player_data.club_distances */
export type ClubDistance = { min: number; max: number };
export type ClubDistances = Record<string, ClubDistance>;

export const DEFAULT_CLUB_DISTANCES: ClubDistances = {
  Driver: { min: 220, max: 240 },
  "3W":   { min: 205, max: 215 },
  "5W":   { min: 190, max: 200 },
  "7W":   { min: 175, max: 185 },
  "4i":   { min: 170, max: 180 },
  "5i":   { min: 160, max: 170 },
  "6i":   { min: 150, max: 160 },
  "7i":   { min: 140, max: 150 },
  "8i":   { min: 130, max: 140 },
  "9i":   { min: 120, max: 130 },
  PW:     { min: 110, max: 120 },
  SW:     { min: 80,  max: 90  },
  LW:     { min: 60,  max: 70  },
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

/** Per similar-hole record returned by /api/plan-enriched, used for tee strategy grid. */
export type PlanEnrichedHole = {
  club: string;
  teeAccuracy: string;
  stp: number;        // score − par
  simScore: number;
  isExact: boolean;
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
