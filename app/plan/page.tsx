"use client";
// app/plan/page.tsx
// Pre-Round Planner — 4-stage flow (Setup → Questions → Review → Plan).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CourseRecord } from "@/lib/types";
import type {
  PlayerForm,
  PlanAnswers,
  CourseHistorySummary,
  CourseInsight,
  Correlation,
  RoundPlan,
  ClubDistances,
  PlanEnrichedHole,
} from "@/lib/planTypes";
import { supabase } from "@/lib/supabase";
import { loadCourses, getCourse, getClubDistances, getClubForm, saveClubForm } from "@/lib/storage";
import { FORM_CLUBS, QUESTIONS } from "./questions";
import { FormRanger } from "./FormRanger";
import { PlanHoleCard } from "./PlanHoleCard";
import { buildPosture, buildStrategies, targetScore, leavesYardage, windClubAdjust, wetnessRollLoss } from "./planEngine";

export type HoleClubStat = { club: string; count: number; avgOverPar: number };
export type HoleHistEntry = { date: string; score: number; par: number; club: string; tee_accuracy: string };
export type { PlanEnrichedHole } from "@/lib/planTypes";
const PLAN_CLUBS = ["Driver", "3W", "5W", "7W", "Irons"] as const;
function clubGroup(club: string): string {
  if (!club) return "";
  if (club === "Driver") return "Driver";
  if (club === "3W") return "3W";
  if (club === "5W") return "5W";
  if (["4i","5i","6i","7i","8i","9i","PW","SW","LW"].includes(club)) return "Irons";
  return "";
}

export type HolesMode = "all" | "front9" | "back9" | "loop18";

// ─── History aggregation ──────────────────────────────────────────────────────

/** Fetch all rounds for a course once; recompute history locally when mode changes. */
async function fetchRawRounds(courseId: string): Promise<any[]> {
  const { data } = await supabase
    .from("rounds")
    .select("*")
    .eq("course_id", courseId)
    .order("date", { ascending: false });
  return data ?? [];
}

/** Pure: build a CourseHistorySummary from cached rounds filtered to the selected holes mode. */
function buildHistory(
  courseId: string,
  allRounds: any[],
  courseHoleCount: number,
  holesMode: HolesMode
): CourseHistorySummary {
  const empty: CourseHistorySummary = {
    course_id: courseId, rounds_played: 0,
    best_score: null, best_to_par: null, best_date: null,
    avg_score: null, avg_to_par: null,
    strongholds: [], trouble: [], correlations: [],
  };
  if (allRounds.length === 0) return empty;

  // Determine which holes_played value to match
  const targetHolesPlayed: number =
    holesMode === "loop18" ? 18
    : (holesMode === "front9" || holesMode === "back9") ? 9
    : courseHoleCount; // "all" → native course count (9 or 18)

  const rounds = allRounds.filter((r: any) => (r.holes_played ?? courseHoleCount) === targetHolesPlayed);

  if (rounds.length === 0) return { ...empty, course_id: courseId };

  const scores = rounds
    .map((r: any) => (r.holes ?? []).reduce((s: number, h: any) => s + (Number(h.score) || 0), 0))
    .filter((s: number) => s > 0);

  const bestScore = scores.length ? Math.min(...scores) : null;
  const avgScore = scores.length
    ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
    : null;

  // Par from first matching round
  const sampleHoles: any[] = rounds[0]?.holes ?? [];
  const totalPar = sampleHoles.reduce((s: number, h: any) => s + (Number(h.par) || 4), 0) || (targetHolesPlayed === 9 ? 36 : 72);

  const toParStr = (score: number | null) => {
    if (score === null) return null;
    const d = Math.round(score - totalPar);
    return d >= 0 ? `+${d}` : `${d}`;
  };

  const bestRoundIdx = bestScore !== null ? scores.indexOf(bestScore) : -1;
  const bestDate =
    bestScore !== null && rounds[bestRoundIdx]?.date
      ? new Date(rounds[bestRoundIdx].date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : null;

  // Per-hole avg over par — only from matching rounds
  const holeSums: Record<number, { totalOverPar: number; count: number }> = {};
  for (const round of rounds) {
    for (const h of round.holes ?? []) {
      const holeNum = Number(h.hole);
      const score = Number(h.score) || 0;
      const par = Number(h.par) || 4;
      if (score > 0 && holeNum) {
        if (!holeSums[holeNum]) holeSums[holeNum] = { totalOverPar: 0, count: 0 };
        holeSums[holeNum].totalOverPar += score - par;
        holeSums[holeNum].count++;
      }
    }
  }

  const trouble: CourseInsight[] = [];
  const strongholds: CourseInsight[] = [];

  for (const [holeStr, { totalOverPar, count }] of Object.entries(holeSums)) {
    if (count < 2) continue;
    const holeNum = Number(holeStr);
    const avg = totalOverPar / count;
    const conf: CourseInsight["confidence"] = count >= 4 ? "high" : count >= 3 ? "medium" : "low";
    const sample = `${count} of ${rounds.length} rounds`;
    if (avg > 1.1) {
      trouble.push({ hole: holeNum, note: `Avg +${avg.toFixed(1)} over par — this hole costs you strokes`, confidence: conf, sample });
    } else if (avg <= 0.2) {
      strongholds.push({ hole: holeNum, note: `Avg ${avg <= 0 ? avg.toFixed(1) : "E"} here — you manage this hole well`, confidence: conf, sample });
    }
  }

  trouble.sort((a, b) => holeSums[b.hole].totalOverPar / holeSums[b.hole].count - holeSums[a.hole].totalOverPar / holeSums[a.hole].count);
  strongholds.sort((a, b) => holeSums[a.hole].totalOverPar / holeSums[a.hole].count - holeSums[b.hole].totalOverPar / holeSums[b.hole].count);

  // Correlations
  const correlations: Correlation[] = [];
  let girHit = 0, girTotal = 0, puttSum = 0, puttCount = 0;
  for (const round of rounds) {
    for (const h of round.holes ?? []) {
      if (h.gir != null) { girTotal++; if (h.gir) girHit++; }
      if (h.putts != null && Number(h.putts) > 0) { puttSum += Number(h.putts); puttCount++; }
    }
  }
  if (girTotal >= 9) {
    const pct = Math.round((girHit / girTotal) * 100);
    correlations.push({ key: "Greens in regulation", value: `${pct}% GIR rate here`, sample: `${girTotal} holes sampled`, direction: pct >= 40 ? "good" : "bad" });
  }
  if (puttCount >= 9) {
    const avg = (puttSum / puttCount).toFixed(1);
    correlations.push({ key: "Avg putts per hole", value: `${avg} putts/hole`, sample: `${puttCount} holes sampled`, direction: Number(avg) <= 2.0 ? "good" : "bad" });
  }

  return {
    course_id: courseId,
    rounds_played: rounds.length,
    best_score: bestScore, best_to_par: toParStr(bestScore), best_date: bestDate,
    avg_score: avgScore, avg_to_par: toParStr(avgScore),
    strongholds: strongholds.slice(0, 3),
    trouble: trouble.slice(0, 3),
    correlations,
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const TOKENS = `
  .plan-root {
    --bg:#eef1f4; --paper:#f7f9fb; --paper-alt:#e6ebf0;
    --ink:#131821; --ink-soft:#253041; --muted:#5d6b7a; --muted-2:#8995a3;
    --line:#d7dde3; --line-soft:#e5eaef;
    --green:#0f6e56; --green-deep:#084634; --green-soft:#d2e8df;
    --accent:#f29450; --accent-soft:#fde0c8;
    --sand:#c8a84b; --sand-soft:#f5ecd0; --sand-deep:#8c6a26;
    --flag:#c94a2a; --good:#1e8449; --bad:#c94a2a;
    --font-display: Georgia, 'Times New Roman', serif;
    --font-ui: var(--font-geist-sans, system-ui), sans-serif;
    --font-mono: var(--font-geist-mono, ui-monospace), monospace;
    background: var(--bg); color: var(--ink); font-family: var(--font-ui);
    min-height: calc(100vh - 36px);
  }
`;

// ─── Stages ───────────────────────────────────────────────────────────────────

const STAGES = ["setup", "questions", "review", "plan"] as const;
type Stage = typeof STAGES[number];

export default function PlanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("setup");
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const [form, setForm] = useState<PlayerForm>(
    Object.fromEntries(FORM_CLUBS.map((c) => [c.k, c.default])) as PlayerForm
  );

  const [courseList, setCourseList] = useState<CourseRecord[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [rawRounds, setRawRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [holesMode, setHolesMode] = useState<HolesMode>("all");
  const [overrides, setOverrides] = useState<Record<number, { pref?: string; aim?: import("@/lib/planTypes").HoleStrategy["aim"] }>>({});
  const [clubDistances, setClubDistances] = useState<ClubDistances | undefined>(undefined);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [planEnrichedMap, setPlanEnrichedMap] = useState<Record<number, PlanEnrichedHole[]>>({});
  const [planEnrichedReady, setPlanEnrichedReady] = useState(false);
  const [latestRecap, setLatestRecap] = useState<Record<string, any> | null>(null);
  const [recapHistory, setRecapHistory] = useState<Record<string, any>[]>([]);
  const [allCourseRounds, setAllCourseRounds] = useState<any[]>([]);
  const [selectedCourseName, setSelectedCourseName] = useState("");
  const [roundDate, setRoundDate] = useState<string>("");
  const [teeTime, setTeeTime] = useState<string>("08:00");

  useEffect(() => {
    // Set date on client only — avoids SSR/UTC vs local-timezone hydration mismatch
    setRoundDate(new Date().toLocaleDateString("en-CA")); // "YYYY-MM-DD" in local time
    loadCourses().then(setCourseList);
    getClubDistances().then(setClubDistances);
    // Load most recent recap dials as form defaults; fall back to saved form
    Promise.all([
      getClubForm(),
      supabase.from("rounds").select("id, course_name, date, recap").not("recap", "is", null)
        .order("date", { ascending: false }).limit(2),
    ]).then(([saved, { data }]) => {
      const row = data?.[0];
      const recap = row?.recap as Record<string, any> | null;
      const d = recap?.dials as Record<string, number> | undefined;
      if (d) {
        setForm(prev => ({
          ...prev,
          Driver: d["Driver"] ?? prev.Driver,
          "3W": d["3W"] ?? prev["3W"],
          "5W": d["5W"] ?? prev["5W"],
          "7W": d["7W"] ?? prev["7W"],
          "Long Irons": d["4i-7i"] ?? prev["Long Irons"],
          "Short Irons": d["8i-PW"] ?? prev["Short Irons"],
        }));
      } else if (saved) {
        setForm(saved);
      }
      if (recap) {
        setLatestRecap({ ...recap, course_name: row?.course_name, date: row?.date });
      }
      if (data?.length) {
        setRecapHistory(data.map((r: any) => ({ ...r.recap, course_name: r.course_name, date: r.date })));
      }
    });
    // Compute handicap index from all rounds
    supabase.from("rounds").select("score_differential, holes_played").order("date", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const diffs = data
          .filter((r: any) => r.score_differential != null)
          .map((r: any) => (r.holes_played ?? 18) <= 9 ? r.score_differential * 2 : r.score_differential);
        if (diffs.length < 3) return;
        const last20 = diffs.slice(-20);
        const count = last20.length <= 6 ? 1 : last20.length <= 8 ? 2 : last20.length <= 11 ? 3
          : last20.length <= 14 ? 4 : last20.length <= 16 ? 5 : last20.length <= 18 ? 6
          : last20.length === 19 ? 7 : 8;
        const best = [...last20].sort((a, b) => a - b).slice(0, count);
        setHandicapIndex(Math.floor(best.reduce((s, d) => s + d, 0) / best.length * 10) / 10);
      });
  }, []);

  // Fetch allCourseRounds by name as soon as a course name is picked (before tee box selection)
  useEffect(() => {
    if (!selectedCourseName || courseId) return;
    supabase.from("rounds")
      .select("id, course_name, date, holes, holes_played, score_differential")
      .eq("course_name", selectedCourseName)
      .order("date", { ascending: false })
      .then(({ data }) => setAllCourseRounds(data ?? []));
  }, [selectedCourseName, courseId]);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setCourse(null);
    setRawRounds([]);
    setAllCourseRounds([]);
    setHolesMode("all");
    setOverrides({});
    Promise.all([getCourse(courseId), fetchRawRounds(courseId)]).then(([courseData, rounds]) => {
      setCourse(courseData);
      setRawRounds(rounds);
      if (courseData?.name) {
        supabase.from("rounds")
          .select("id, course_name, date, holes, holes_played, score_differential")
          .eq("course_name", courseData.name)
          .order("date", { ascending: false })
          .then(({ data }) => setAllCourseRounds(data ?? []));
      }
      setLoading(false);
    });
  }, [courseId]);

  const history = useMemo<CourseHistorySummary | null>(() => {
    if (!course || loading) return null;
    return buildHistory(courseId, rawRounds, course.holes.length, holesMode);
  }, [courseId, rawRounds, course, holesMode, loading]);

  const planHoles = useMemo(() => {
    if (!course) return [];
    if (holesMode === "front9") return course.holes.slice(0, 9);
    if (holesMode === "back9") return course.holes.slice(9);
    return course.holes; // "all" or "loop18" — same 9 holes, strategy repeats
  }, [course, holesMode]);

  // Expected score and differential for this course given player's HI
  const defaultGoalScore = useMemo(() => {
    const par = course?.holes.reduce((s, h) => s + h.par, 0) ?? 72;
    if (handicapIndex === null) return par + 18;
    const slope = course?.slope ?? 113;
    const rating = course?.rating ?? par;
    const ch = Math.round(handicapIndex * (slope / 113) + (rating - par));
    return par + Math.max(0, ch);
  }, [course, handicapIndex]);

  const defaultGoalDiff = useMemo(() => {
    if (handicapIndex !== null) return handicapIndex;
    if (!course) return 20;
    const par = course.holes.reduce((s, h) => s + h.par, 0);
    const rating = course.rating ?? par;
    const slope = course.slope ?? 113;
    return Math.round((defaultGoalScore - rating) * 113 / slope * 10) / 10;
  }, [handicapIndex, course, defaultGoalScore]);

  const strategies = useMemo(() => {
    if (!course) return {};
    const base = buildStrategies(planHoles, form, answers, history ?? undefined, clubDistances);
    const out: typeof base = {};
    for (const h of planHoles) {
      const ov = overrides[h.hole];
      if (!ov) { out[h.hole] = base[h.hole]; continue; }
      const merged = { ...base[h.hole], ...ov };
      if (ov.pref) merged.remaining = leavesYardage(h, ov.pref, clubDistances);
      out[h.hole] = merged;
    }
    return out;
  }, [planHoles, form, answers, history, overrides, course, clubDistances]);

  // Per-hole club stats from raw rounds (filtered to current holesMode)
  const holeHistMap = useMemo<Record<number, HoleClubStat[]>>(() => {
    if (!course) return {};
    const courseHoleCount = course.holes.length;
    const targetHolesPlayed =
      holesMode === "loop18" ? 18
      : (holesMode === "front9" || holesMode === "back9") ? 9
      : courseHoleCount;
    const rounds = rawRounds.filter((r: any) => (r.holes_played ?? courseHoleCount) === targetHolesPlayed);
    const sums: Record<number, Record<string, { total: number; count: number }>> = {};
    for (const round of rounds) {
      for (const h of round.holes ?? []) {
        const holeNum = Number(h.hole);
        const score = Number(h.score) || 0;
        const par = Number(h.par) || 4;
        const grp = clubGroup(h.club ?? "");
        if (!score || !holeNum || !grp) continue;
        if (!sums[holeNum]) sums[holeNum] = {};
        if (!sums[holeNum][grp]) sums[holeNum][grp] = { total: 0, count: 0 };
        sums[holeNum][grp].total += score - par;
        sums[holeNum][grp].count++;
      }
    }
    const result: Record<number, HoleClubStat[]> = {};
    for (const [holeStr, clubs] of Object.entries(sums)) {
      result[Number(holeStr)] = PLAN_CLUBS.map(club => {
        const d = clubs[club];
        return d ? { club, count: d.count, avgOverPar: d.total / d.count } : { club, count: 0, avgOverPar: NaN };
      });
    }
    return result;
  }, [rawRounds, holesMode, course]);
  // Per-hole recent score history (date, score, club, tee_accuracy) for plan card display
  const holeHistEntries = useMemo<Record<number, HoleHistEntry[]>>(() => {
    if (!course) return {};
    const courseHoleCount = course.holes.length;
    const targetHolesPlayed =
      holesMode === "loop18" ? 18
      : (holesMode === "front9" || holesMode === "back9") ? 9
      : courseHoleCount;
    const rounds = rawRounds.filter((r: any) => (r.holes_played ?? courseHoleCount) === targetHolesPlayed);
    const result: Record<number, HoleHistEntry[]> = {};
    for (const round of rounds) {
      for (const h of round.holes ?? []) {
        const holeNum = Number(h.hole);
        const score = Number(h.score) || 0;
        if (!holeNum || !score) continue;
        if (!result[holeNum]) result[holeNum] = [];
        result[holeNum].push({
          date: round.date ?? "",
          score,
          par: Number(h.par) || 4,
          club: h.club ?? "",
          tee_accuracy: h.tee_accuracy ?? "",
        });
      }
    }
    return result;
  }, [rawRounds, holesMode, course]);

  const posture = useMemo(() => buildPosture(answers), [answers]);
  const target = useMemo(() => targetScore(answers), [answers]);

  const onTeeItUp = useCallback(async () => {
    if (!course) return;
    const id = `round_${Date.now()}`;
    const holes = planHoles.map((h) => {
      const strat = strategies[h.hole];
      return {
        hole: h.hole,
        par: h.par,
        yards: h.yards,
        stroke_index: h.stroke_index,
        score: "",
        chips: "",
        putts: "",
        tee_accuracy: "",
        appr_accuracy: "",
        appr_distance: "",
        water_penalty: "",
        drop_or_out: "",
        tree_haz: "",
        fairway_bunker: "",
        greenside_bunker: "",
        gir: false,
        grints: false,
        first_putt_distance: "",
        club: strat?.pref ?? "",
        aim: strat?.aim ?? "",
      };
    });
    const { error } = await supabase.from("rounds").insert({
      id,
      course_id: course.id,
      course_name: course.name,
      tee_box: course.tee_box,
      date: roundDate,
      tee_time: teeTime,
      holes_played: planHoles.length,
      starting_hole: planHoles[0]?.hole ?? 1,
      holes,
    });
    if (error) {
      alert("Failed to create round. Please try again.");
      return;
    }
    router.push(`/rounds/play?roundId=${id}&courseId=${course.id}`);
  }, [course, planHoles, strategies, router]);

  function prefetchEnriched(cId: string) {
    setPlanEnrichedReady(false);
    setPlanEnrichedMap({});
    fetch("/api/plan-enriched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: cId }),
    })
      .then(r => r.json())
      .then(data => { setPlanEnrichedMap(data ?? {}); setPlanEnrichedReady(true); })
      .catch(() => setPlanEnrichedReady(true));
  }

  const answered =
    !!answers.focus &&
    answers.windScore !== undefined && answers.wetnessScore !== undefined &&
    answers.goal !== undefined;
  const courseReady = !!course && !!history;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      <div className="plan-root">
        <div style={{ padding: "0 40px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <StageNav stage={stage} setStage={setStage} answered={answered} courseReady={courseReady} />
            <div style={{ padding: "40px 0 60px" }}>
              {stage === "setup" && (
                <StageSetup
                  courseList={courseList}
                  courseId={courseId}
                  setCourseId={setCourseId}
                  course={course}
                  history={history}
                  loading={loading}
                  holesMode={holesMode}
                  setHolesMode={setHolesMode}
                  allCourseRounds={allCourseRounds}
                  onCourseNameChange={setSelectedCourseName}
                  roundDate={roundDate}
                  setRoundDate={setRoundDate}
                  teeTime={teeTime}
                  setTeeTime={setTeeTime}
                  onNext={() => { setStage("questions"); if (courseId) prefetchEnriched(courseId); }}
                />
              )}
              {stage === "questions" && (
                <StageQuestions
                  answers={answers} setAnswers={setAnswers}
                  form={form} setForm={setForm}
                  defaultGoalScore={defaultGoalScore}
                  defaultGoalDiff={defaultGoalDiff}
                  course={course}
                  allCourseRounds={allCourseRounds}
                  onSaveForm={saveClubForm}
                  recapHistory={recapHistory}
                  roundDate={roundDate}
                  teeTime={teeTime}
                  onNext={() => setStage("review")}
                />
              )}
              {stage === "review" && (
                <StageReview
                  answers={answers} form={form} posture={posture}
                  onNext={() => setStage("plan")}
                />
              )}
              {stage === "plan" && course && (
                <StagePlan
                  course={course} planHoles={planHoles} strategies={strategies} form={form}
                  answers={answers} target={target}
                  holeHistMap={holeHistMap}
                  holeHistEntries={holeHistEntries}
                  planEnrichedMap={planEnrichedMap}
                  planEnrichedReady={planEnrichedReady}
                  latestRecap={latestRecap}
                  onClubChange={(hole, club) => setOverrides(prev => ({ ...prev, [hole]: { ...prev[hole], pref: club } }))}
                  onAimChange={(hole, aim) => setOverrides(prev => ({ ...prev, [hole]: { ...prev[hole], aim } }))}
                  onTeeItUp={onTeeItUp}
                  onRestart={() => { setStage("setup"); setAnswers({}); }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Stage nav ────────────────────────────────────────────────────────────────

function StageNav({ stage, setStage, answered, courseReady }: {
  stage: Stage; setStage: (s: Stage) => void; answered: boolean; courseReady: boolean;
}) {
  const labels: { k: Stage; n: string; t: string }[] = [
    { k: "setup", n: "01", t: "Setup" },
    { k: "questions", n: "02", t: "Questions" },
    { k: "review", n: "03", t: "Review" },
    { k: "plan", n: "04", t: "Plan" },
  ];
  const idx = STAGES.indexOf(stage);
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
      {labels.map((l, i) => {
        const active = l.k === stage;
        const done = i < idx;
        const reachable =
          i === 0 ||
          (i <= idx) ||
          (i === 1 && courseReady) ||
          (i === 2 && courseReady && answered) ||
          (i === 3 && courseReady && answered);
        return (
          <button key={l.k} onClick={() => reachable && setStage(l.k)} disabled={!reachable}
            style={{
              background: "transparent", border: "none",
              borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
              padding: "14px 22px 14px 0", marginRight: 28,
              cursor: reachable ? "pointer" : "default",
              opacity: reachable ? 1 : 0.35, textAlign: "left",
            }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: done ? "var(--green)" : "var(--muted-2)", fontWeight: 600 }}>
              {done ? "✓" : l.n}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, fontStyle: "italic", color: active ? "var(--ink)" : "var(--muted)" }}>
              {l.t}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Weather grid widget ──────────────────────────────────────────────────────

function WeatherGrid({ windScore, wetnessScore, onChange }: {
  windScore: number;
  wetnessScore: number;
  onChange: (wind: number, wet: number) => void;
}) {
  // Snap 0–10 scores to the nearest of 4 grid steps
  const selRow = Math.round((1 - windScore / 10) * 3);   // 0=strong(top) → 3=calm(bottom)
  const selCol = Math.round(wetnessScore / 10 * 3);       // 0=dry(left)   → 3=wet(right)

  const clubs = windClubAdjust(windScore);
  const roll  = wetnessRollLoss(wetnessScore);

  // Bilinear corner colours — aligned to existing CSS vars where possible
  // Corners: [row=0 windy][row=3 calm] × [col=0 dry][col=3 wet]
  const C_WINDY_DRY: [number,number,number] = [245, 236, 208]; // --sand-soft  #f5ecd0  tan
  const C_WINDY_WET: [number,number,number] = [197, 223, 240]; // light blue   #c5dff0
  const C_CALM_DRY:  [number,number,number] = [254, 249, 195]; // light yellow #fef9c3
  const C_CALM_WET:  [number,number,number] = [210, 232, 223]; // --green-soft #d2e8df  green

  function lerpRGB(a: [number,number,number], b: [number,number,number], t: number): [number,number,number] {
    return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];
  }
  function cellBg(row: number, col: number): string {
    const u = col / 3; // wetness  0→1
    const v = row / 3; // windiness 0=strong → 1=calm
    const [r,g,b] = lerpRGB(lerpRGB(C_WINDY_DRY, C_WINDY_WET, u), lerpRGB(C_CALM_DRY, C_CALM_WET, u), v);
    return `rgb(${r},${g},${b})`;
  }

  const WIND_ROWS = [
    { label: "Strong", sub: "15+ mph" },
    { label: "Windy",  sub: "10 mph"  },
    { label: "Breezy", sub: "5 mph"   },
    { label: "Calm",   sub: ""        },
  ];
  const WET_COLS = ["Firm", "Slightly\nSoft", "Soft", "Very\nWet"];

  const CELL_W = 70, CELL_H = 56, ROW_LABEL_W = 68, GAP = 4;
  const gridWidth = ROW_LABEL_W + 4 * CELL_W + 3 * GAP;

  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ marginBottom: 8, fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase" }}>
        Tap to set conditions
      </div>

      {/* Column headers */}
      <div style={{ display: "flex", marginLeft: ROW_LABEL_W, gap: GAP, marginBottom: 4 }}>
        {WET_COLS.map((lbl, i) => (
          <div key={i} style={{ width: CELL_W, textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--muted-2)", letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1.3 }}>
            {lbl.split("\n").map((l, j) => <span key={j} style={{ display: "block" }}>{l}</span>)}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {WIND_ROWS.map((row, rowIdx) => (
        <div key={rowIdx} style={{ display: "flex", alignItems: "stretch", gap: GAP, marginBottom: GAP }}>
          {/* Row label */}
          <div style={{ width: ROW_LABEL_W, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", paddingRight: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>{row.label}</span>
            {row.sub && <span style={{ fontSize: 9, color: "var(--muted-2)", marginTop: 1 }}>{row.sub}</span>}
          </div>

          {/* 4 cells */}
          {[0,1,2,3].map(colIdx => {
            const isSelected = rowIdx === selRow && colIdx === selCol;
            return (
              <button
                key={colIdx}
                onClick={() => onChange(((3 - rowIdx) / 3) * 10, (colIdx / 3) * 10)}
                style={{
                  width: CELL_W, height: CELL_H, flexShrink: 0,
                  background: cellBg(rowIdx, colIdx),
                  border: isSelected ? "2.5px solid var(--ink)" : "1.5px solid rgba(0,0,0,0.10)",
                  borderRadius: 7, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isSelected ? "inset 0 0 0 1px var(--ink)" : "none",
                  transition: "border-color 0.1s, box-shadow 0.1s",
                }}
              >
                {isSelected && (
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <polyline points="1,4 4,7 9,1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* X-axis label */}
      <div style={{ marginLeft: ROW_LABEL_W, width: 4 * CELL_W + 3 * GAP, textAlign: "center", fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>
        ← Dry · Wetness · Wet →
      </div>

      {/* Adjustment summary */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, width: gridWidth }}>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", flex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Wind adjustment</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: windScore > 3 ? "var(--accent)" : "var(--ink)" }}>
            {clubs > 0 ? `+${clubs} club${clubs === 1 ? "" : "s"} on approach` : "No adjustment"}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Wind {windScore.toFixed(1)} / 10</div>
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", flex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--muted-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Course firmness</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: wetnessScore > 3 ? "var(--accent)" : "var(--green)" }}>
            {roll > 0 ? `−${roll} yds roll` : "Normal roll"}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Wetness {wetnessScore.toFixed(1)} / 10</div>
        </div>
      </div>
    </div>
  );
}

// ─── Setup stage ──────────────────────────────────────────────────────────────

function StageSetup({ courseList, courseId, setCourseId, course, history, loading, holesMode, setHolesMode, allCourseRounds, onCourseNameChange, roundDate, setRoundDate, teeTime, setTeeTime, onNext }: {
  courseList: CourseRecord[];
  courseId: string;
  setCourseId: (id: string) => void;
  course: CourseRecord | null;
  history: CourseHistorySummary | null;
  loading: boolean;
  holesMode: HolesMode;
  setHolesMode: (m: HolesMode) => void;
  allCourseRounds: any[];
  onCourseNameChange: (name: string) => void;
  roundDate: string;
  setRoundDate: (d: string) => void;
  teeTime: string;
  setTeeTime: (t: string) => void;
  onNext: () => void;
}) {
  const [selectedName, setSelectedName] = useState("");

  // Unique course names in alphabetical order
  const uniqueNames = Array.from(new Set(courseList.map((c) => c.name))).sort();

  // All records matching the selected name
  const teeOptions = courseList.filter((c) => c.name === selectedName);

  const handleNameChange = (name: string) => {
    setSelectedName(name);
    onCourseNameChange(name);
    setCourseId(""); // clear until tee box chosen (or auto-select below)
    const matches = courseList.filter((c) => c.name === name);
    if (matches.length === 1) setCourseId(matches[0].id);
  };

  const selectStyle = {
    width: "100%", maxWidth: 480,
    padding: "12px 14px", fontSize: 15, fontWeight: 500,
    background: "var(--paper)", color: "var(--ink)",
    border: "1px solid var(--line)", borderRadius: 8,
    appearance: "none" as const, cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 56, alignItems: "start", minHeight: 520 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 56, lineHeight: 1.02, margin: "0 0 16px", color: "var(--ink)" }}>
          Let&apos;s build <em style={{ fontStyle: "italic", color: "var(--green-deep)" }}>your</em> strategy
          <br />for today&apos;s round.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, color: "var(--ink-soft)", maxWidth: 520, margin: "0 0 28px" }}>
          Pick your course, answer a few questions, and we&apos;ll hand you an 18-hole plan.
        </p>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Where are you playing?
          </div>
          {courseList.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading courses…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
              <select value={selectedName} onChange={(e) => handleNameChange(e.target.value)} style={selectStyle}>
                <option value="">— Select a course —</option>
                {uniqueNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              {teeOptions.length > 1 && (
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— Select tee box —</option>
                  {teeOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.tee_box} tees</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            When are you playing?
          </div>
          <div style={{ display: "flex", gap: 10, maxWidth: 480 }}>
            <input
              type="date"
              value={roundDate}
              onChange={(e) => setRoundDate(e.target.value)}
              style={{
                flex: "1 1 auto", padding: "12px 14px",
                fontSize: 15, fontWeight: 500, background: "var(--paper)",
                color: "var(--ink)", border: "1px solid var(--line)",
                borderRadius: 8, cursor: "pointer",
              }}
            />
            <input
              type="time"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              style={{
                flex: "0 0 140px", padding: "12px 14px",
                fontSize: 15, fontWeight: 500, background: "var(--paper)",
                color: "var(--ink)", border: "1px solid var(--line)",
                borderRadius: 8, cursor: "pointer",
              }}
            />
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", marginBottom: 24 }}>Loading course data…</div>
        )}
        {course && !loading && (
          <>
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", maxWidth: 480, marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, fontStyle: "italic" }}>{course.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {course.tee_box} tees · {course.city}, {course.state}
                {course.rating && course.slope ? ` · Rating ${course.rating} / Slope ${course.slope}` : ""}
              </div>
            </div>

            {/* Holes picker */}
            {(() => {
              const holeCount = course.holes.length;
              const opts: { value: HolesMode; label: string }[] =
                holeCount >= 18
                  ? [
                      { value: "all", label: "18 holes" },
                      { value: "front9", label: "Front 9 (1–9)" },
                      { value: "back9", label: "Back 9 (10–18)" },
                    ]
                  : [
                      { value: "all", label: "9 holes" },
                      { value: "loop18", label: "18 holes (2 loops)" },
                    ];

              return (
                <div style={{ maxWidth: 480, marginBottom: 28 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                    How many holes?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {opts.map((o) => {
                      const active = holesMode === o.value;
                      return (
                        <button
                          key={o.value}
                          onClick={() => setHolesMode(o.value)}
                          style={{
                            flex: 1, padding: "10px 14px", fontSize: 13, fontWeight: 600,
                            border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
                            background: active ? "var(--ink)" : "var(--paper)",
                            color: active ? "var(--paper)" : "var(--ink)",
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        <button
          onClick={onNext}
          disabled={!course}
          style={{
            background: course ? "var(--ink)" : "var(--line)",
            color: "var(--paper)", border: "none", borderRadius: 8,
            padding: "14px 28px", fontSize: 15, fontWeight: 600,
            cursor: course ? "pointer" : "default",
          }}
        >
          Start planning →
        </button>
      </div>

      {/* History panel */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", fontWeight: 600, marginBottom: 14 }}>
          What we know about you here
        </div>
        {!selectedName && !loading && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 24, color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>
            Select a course to see your history.
          </div>
        )}
        {loading && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 24, color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>
            Loading history…
          </div>
        )}
        {!loading && selectedName && (history || allCourseRounds.length > 0) && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 24 }}>
            {history && history.rounds_played === 0 && allCourseRounds.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>
                No rounds recorded here yet — we&apos;ll build your plan from course data.
              </div>
            )}
            {history && history.rounds_played > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingBottom: 18, borderBottom: "1px dashed var(--line)", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Best here</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, fontStyle: "italic", color: "var(--green-deep)" }}>{history.best_score ?? "—"}</div>
                    {history.best_date && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{history.best_to_par} · {history.best_date}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Avg here</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, fontStyle: "italic", color: "var(--ink)" }}>{history.avg_score ?? "—"}</div>
                    {history.avg_to_par && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{history.avg_to_par} avg · {history.rounds_played} rounds</div>}
                  </div>
                </div>

                {history.trouble.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Trouble spots</div>
                    {history.trouble.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontStyle: "italic", fontSize: 20, color: "var(--bad)", width: 30, textAlign: "center" }}>{s.hole}</div>
                        <div style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.4 }}>
                          {s.note}
                          <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{s.sample}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {history.strongholds.length > 0 && (
                  <div style={{ marginTop: history.trouble.length > 0 ? 16 : 0 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Your strongholds</div>
                    {history.strongholds.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontStyle: "italic", fontSize: 20, color: "var(--good)", width: 30, textAlign: "center" }}>{s.hole}</div>
                        <div style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.4 }}>
                          {s.note}
                          <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{s.sample}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {history.correlations.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--line)" }}>
                    {history.correlations.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "6px 0" }}>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.key}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: c.direction === "good" ? "var(--good)" : "var(--bad)", whiteSpace: "nowrap" }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {allCourseRounds.length > 0 && (
              <div style={{ marginTop: history && history.rounds_played > 0 ? 16 : 0, paddingTop: history && history.rounds_played > 0 ? 16 : 0, borderTop: history && history.rounds_played > 0 ? "1px dashed var(--line)" : "none" }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>All rounds here</div>
                {allCourseRounds.map((r, i) => {
                  const score = (r.holes ?? []).reduce((s: number, h: any) => s + (Number(h.score) || 0), 0);
                  const diff = r.score_differential != null
                    ? ((r.holes_played ?? 18) <= 9 ? r.score_differential * 2 : r.score_differential)
                    : null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.date}</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        {score > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{score}</span>}
                        {diff !== null && <span style={{ fontSize: 11, color: "var(--muted)" }}>{diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score dial ───────────────────────────────────────────────────────────────

function ScoreDial({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--line)", background: "var(--paper)", fontSize: 24, fontWeight: 700, cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >−</button>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 96, fontWeight: 500, fontStyle: "italic", color: "var(--ink)", lineHeight: 1, minWidth: 160, textAlign: "center" }}>
          {value}
        </div>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--line)", background: "var(--paper)", fontSize: 24, fontWeight: 700, cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >+</button>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", maxWidth: 400, accentColor: "var(--ink)" }}
      />
      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
        {min} — {max}
      </div>
    </div>
  );
}

// ─── Diff dial ────────────────────────────────────────────────────────────────

function DiffDial({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const step = 0.5;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <button
          onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}
          style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--line)", background: "var(--paper)", fontSize: 24, fontWeight: 700, cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >−</button>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 88, fontWeight: 500, fontStyle: "italic", color: "var(--ink)", lineHeight: 1, minWidth: 160, textAlign: "center" }}>
          {value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
        </div>
        <button
          onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))}
          style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--line)", background: "var(--paper)", fontSize: 24, fontWeight: 700, cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >+</button>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", maxWidth: 400, accentColor: "var(--ink)" }}
      />
      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
        {min >= 0 ? `+${min.toFixed(1)}` : min.toFixed(1)} — +{max.toFixed(1)}
      </div>
    </div>
  );
}

// ─── Range recap history drawer ───────────────────────────────────────────────

const RANGE_DIAL_GROUPS = [
  { key: "Driver", label: "Driver" },
  { key: "3W",     label: "3W" },
  { key: "5W",     label: "5W" },
  { key: "7W",     label: "7W" },
  { key: "4i-7i",  label: "4i–7i" },
  { key: "8i-PW",  label: "8i–PW" },
  { key: "SW-LW",  label: "SW–LW" },
  { key: "Putter", label: "Putter" },
];

function heatLabel(v: number) {
  if (v >= 75) return { text: "🔥 hot",     color: "var(--flag)" };
  if (v >= 55) return { text: "✓ solid",    color: "var(--green)" };
  if (v >= 35) return { text: "~ neutral",  color: "var(--muted)" };
  return              { text: "❄ cold",     color: "#2e6db4" };
}

function RangeRecapHistory({ recaps }: { recaps: Record<string, any>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--muted)", fontWeight: 600,
          padding: "6px 0", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
          {open ? "▲" : "▼"} Last {recaps.length} recap{recaps.length > 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: recaps.length > 1 ? "1fr 1fr" : "1fr", gap: 12, marginTop: 4 }}>
          {recaps.map((r, i) => {
            const dials = (r.dials ?? {}) as Record<string, number>;
            const groupNotes = (r.group_notes ?? {}) as Record<string, string>;
            return (
              <div key={i} style={{ background: "var(--paper-alt)", border: "1px solid var(--line-soft)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>
                  {r.course_name} <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {r.date}</span>
                </div>

                {/* Per-club rows: heat label inline after club name */}
                <div style={{ display: "grid", gap: 4, marginBottom: r.overall?.trim() ? 8 : 0 }}>
                  {RANGE_DIAL_GROUPS.map(g => {
                    const v = dials[g.key];
                    const note = groupNotes[g.key]?.trim();
                    if (v === undefined && !note) return null;
                    const h = v !== undefined ? heatLabel(v) : null;
                    return (
                      <div key={g.key} style={{ fontSize: 11, lineHeight: 1.4, color: "var(--ink-soft)" }}>
                        <span style={{ fontWeight: 700, color: "var(--green-deep)" }}>{g.label}</span>
                        {h && <span style={{ color: h.color, fontWeight: 700 }}>{" "}{h.text}</span>}
                        {note && <span style={{ color: "var(--ink-soft)" }}>{" — "}{note}</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Overall */}
                {r.overall?.trim() && (
                  <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, fontStyle: "italic", borderTop: "1px solid var(--line-soft)", paddingTop: 6, marginTop: 6 }}>
                    {r.overall}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Questions stage ──────────────────────────────────────────────────────────

type WeatherFetch = {
  loading: boolean; error: boolean;
  windMph: number | null; precipIn: number | null; temp: number | null;
  moistureScore: number;
  wetReason: string | null;
  windScore: number;    // 0–10 derived from windMph
  wetnessScore: number; // 0–10 derived from moisture + precip
};

// Compute a ground-moisture index from the 7 days before roundDate.
// Applies exponential recency decay, then divides by per-day drying rate
// (hot + dry = faster drying = less moisture retained).
function computeMoisture(
  dailyDates: string[], dailyPrecip: number[],
  dailyTemp: number[], dailyHumidity: number[],
  roundDate: string
): { score: number; wetReason: string | null } {
  const pastDays: { precip: number; temp: number; humidity: number }[] = [];
  for (let i = 0; i < dailyDates.length; i++) {
    if (dailyDates[i] < roundDate)
      pastDays.push({ precip: dailyPrecip[i] ?? 0, temp: dailyTemp[i] ?? 65, humidity: dailyHumidity[i] ?? 60 });
  }
  const recent = pastDays.slice(-7).reverse(); // most recent first
  if (!recent.length) return { score: 0, wetReason: null };

  const decayWeights = [1.0, 0.70, 0.49, 0.34, 0.24, 0.17, 0.12];
  let score = 0;
  let totalPrecip = 0;
  let rainyDays = 0;
  for (let i = 0; i < recent.length; i++) {
    const { precip, temp, humidity } = recent[i];
    totalPrecip += precip;
    if (precip > 0.05) rainyDays++;
    // Hot + dry → fast drying → less retained. Cool + humid → slow drying.
    const tempFactor  = temp     > 80 ? 1.5 : temp     > 65 ? 1.0 : temp     > 50 ? 0.65 : 0.40;
    const humFactor   = humidity > 75 ? 0.7 : humidity > 55 ? 1.0 : 1.30;
    score += (precip * decayWeights[i]) / (tempFactor * humFactor);
  }

  // Build a plain-language reason string when ground is soft from history
  let wetReason: string | null = null;
  if (score > 0.25) {
    const p3 = recent.slice(0, 3).reduce((s, d) => s + d.precip, 0);
    const avgTemp = recent.slice(0, 3).reduce((s, d) => s + d.temp, 0) / Math.min(3, recent.length);
    if (p3 > 0.5)           wetReason = `${p3.toFixed(2)}" fell in the past 3 days`;
    else if (rainyDays >= 3) wetReason = `${rainyDays} rainy days in the past week`;
    else if (totalPrecip > 0.5) wetReason = `${totalPrecip.toFixed(2)}" over the past ${recent.length} days`;
    if (wetReason && avgTemp < 60)
      wetReason += ` · slow to dry (${Math.round(avgTemp)}°F)`;
  }
  return { score, wetReason };
}

function StageQuestions({ answers, setAnswers, form, setForm, defaultGoalScore, defaultGoalDiff, course, allCourseRounds, onSaveForm, recapHistory, roundDate, teeTime, onNext }: {
  answers: PlanAnswers; setAnswers: (a: PlanAnswers) => void;
  form: PlayerForm; setForm: (f: PlayerForm) => void;
  defaultGoalScore: number;
  defaultGoalDiff: number;
  course: import("@/lib/types").CourseRecord | null;
  allCourseRounds: any[];
  onSaveForm: (f: PlayerForm) => void;
  recapHistory: Record<string, any>[];
  roundDate: string;
  teeTime: string;
  onNext: () => void;
}) {
  const [step, setStep] = useState(0);
  const [goalMode, setGoalMode] = useState<"score" | "diff">("score");
  const [goalDiff, setGoalDiff] = useState(defaultGoalDiff);
  const [wx, setWx] = useState<WeatherFetch>({ loading: false, error: false, windMph: null, precipIn: null, temp: null, moistureScore: 0, wetReason: null, windScore: 0, wetnessScore: 0 });

  const q = QUESTIONS[step];

  useEffect(() => { setGoalDiff(defaultGoalDiff); }, [defaultGoalDiff]);

  // Auto-initialize goal to expected score when player reaches that step
  useEffect(() => {
    if (q.id === "goal" && answers.goal === undefined) {
      setAnswers({ ...answers, goal: defaultGoalScore });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Auto-fetch weather when reaching the weather question.
  // One API call returns both hourly (tee-time conditions) and daily (7-day history).
  useEffect(() => {
    if (q.id !== "weather" || !course?.city) return;
    setWx({ loading: true, error: false, windMph: null, precipIn: null, temp: null, moistureScore: 0, wetReason: null, windScore: 0, wetnessScore: 0 });
    const teeHour = parseInt(teeTime.split(":")[0], 10) || 8;
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(course.city)}&count=1&language=en&format=json`)
      .then(r => r.json())
      .then(geo => {
        const loc = geo?.results?.[0];
        if (!loc) { setWx(w => ({ ...w, loading: false, error: true })); return; }
        const { latitude, longitude } = loc;
        // Single call: hourly for tee-time data + daily for 7-day moisture history
        return fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&hourly=temperature_2m,windspeed_10m,precipitation` +
          `&daily=precipitation_sum,temperature_2m_mean,relative_humidity_2m_mean` +
          `&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch` +
          `&timezone=auto&past_days=7&forecast_days=14`
        ).then(r => r.json());
      })
      .then(data => {
        if (!data?.hourly || !data?.daily) { setWx(w => ({ ...w, loading: false, error: true })); return; }

        // ── Tee-time conditions (hourly) ──────────────────────────────────────
        const h = data.hourly;
        const idx = (h.time as string[]).findIndex(
          t => t.startsWith(roundDate) && parseInt(t.slice(11, 13), 10) === teeHour
        );
        const i = idx >= 0 ? idx : 0;
        const windMph  = h.windspeed_10m?.[i]  ?? null;
        const precipIn = h.precipitation?.[i]   ?? null;
        const temp     = h.temperature_2m?.[i]  ?? null;

        // ── Ground moisture from past 7 days (daily) ──────────────────────────
        const d = data.daily;
        const { score: moistureScore, wetReason } = computeMoisture(
          d.time, d.precipitation_sum, d.temperature_2m_mean, d.relative_humidity_2m_mean, roundDate
        );

        // Derive 0–10 scores from raw data
        const windScore    = Math.min(10, (windMph ?? 0) / 2.5);
        const wetnessScore = Math.min(10,
          Math.min(8, moistureScore * 16.67) +
          Math.min(2, (precipIn ?? 0) * 10)
        );
        setWx({ loading: false, error: false, windMph, precipIn, temp, moistureScore, wetReason, windScore, wetnessScore });

        // Auto-set scores if not already overridden by user
        if (answers.windScore === undefined && answers.wetnessScore === undefined) {
          setAnswers({ ...answers, windScore, wetnessScore } as PlanAnswers);
        }
      })
      .catch(() => setWx(w => ({ ...w, loading: false, error: true })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, course?.city, roundDate, teeTime]);

  const rating = course?.rating ?? (course?.holes.reduce((s, h) => s + h.par, 0) ?? 72);
  const slope = course?.slope ?? 113;
  const scoreFromDiff = (d: number) => Math.round(rating + d * slope / 113);
  const diffFromScore = (s: number) => Math.round((s - rating) * 113 / slope * 10) / 10;

  const handleScoreChange = (v: number) => {
    setAnswers({ ...answers, goal: v });
    setGoalDiff(diffFromScore(v));
  };
  const handleDiffChange = (d: number) => {
    setGoalDiff(d);
    setAnswers({ ...answers, goal: scoreFromDiff(d) });
  };

  const isLast = step === QUESTIONS.length - 1;

  function advance() {
    if (q.id === "form") onSaveForm(form);
    if (isLast) { onNext(); } else { setStep(step + 1); }
  }
  const canAdvance =
    q.kind === "form" ||
    q.kind === "score_dial" ||
    q.kind === "weather_grid" ||
    !!(answers as Record<string, string | undefined>)[q.id];

  return (
    <div style={{ maxWidth: q.id === "goal" ? 1100 : 740, margin: "20px auto 0" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 40 }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--ink)" : "var(--line)" }} />
        ))}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2, color: "var(--muted-2)", marginBottom: 10, fontWeight: 600 }}>
        QUESTION {String(step + 1).padStart(2, "0")} / {String(QUESTIONS.length).padStart(2, "0")}
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 500, lineHeight: 1.1, margin: "0 0 14px", color: "var(--ink)" }}>{q.q}</h2>
      <p style={{ fontSize: 15, color: "var(--muted)", margin: "0 0 36px", maxWidth: 560 }}>{q.sub}</p>

      {/* Strategy step: show selected target above the choices */}
      {q.id === "focus" && answers.goal !== undefined && (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 18px", marginBottom: 28, display: "inline-flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--font-mono)", letterSpacing: 1, textTransform: "uppercase" }}>Your target:</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{answers.goal}</span>
          {goalMode === "diff" && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              ({goalDiff >= 0 ? `+${goalDiff.toFixed(1)}` : goalDiff.toFixed(1)} diff)
            </span>
          )}
        </div>
      )}

      {/* Weather question: 2D grid widget */}
      {q.id === "weather" && (
        <div style={{ marginBottom: 28 }}>
          {/* Round info strip */}
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, maxWidth: 520, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Round</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                {roundDate ? new Date(roundDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
                {" · "}
                {new Date(`1970-01-01T${teeTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
            {wx.temp !== null && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Temp</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{Math.round(wx.temp)}°F</div>
              </div>
            )}
            {wx.windMph !== null && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Wind</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{Math.round(wx.windMph)} mph</div>
              </div>
            )}
            {wx.precipIn !== null && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>Precip</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{wx.precipIn.toFixed(2)}"</div>
              </div>
            )}
          </div>

          {wx.wetReason && (
            <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 14px", marginBottom: 14, maxWidth: 520, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700 }}>Course likely soft</span> — {wx.wetReason}
            </div>
          )}

          {wx.loading && (
            <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", marginBottom: 16 }}>Fetching forecast…</div>
          )}
          {!wx.loading && wx.error && (
            <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", marginBottom: 16 }}>Forecast unavailable — position the marker manually.</div>
          )}

          <WeatherGrid
            windScore={answers.windScore ?? wx.windScore}
            wetnessScore={answers.wetnessScore ?? wx.wetnessScore}
            onChange={(windScore, wetnessScore) => setAnswers({ ...answers, windScore, wetnessScore } as PlanAnswers)}
          />
        </div>
      )}

      {q.kind === "choice" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${q.opts.length},1fr)`, gap: 14 }}>
          {q.opts.map((o) => {
            const active = (answers as Record<string, string | undefined>)[q.id] === o.v;
            return (
              <button key={o.v}
                onClick={() => setAnswers({ ...answers, [q.id]: o.v } as PlanAnswers)}
                style={{
                  background: active ? "var(--ink)" : "var(--paper)",
                  border: active ? "1px solid var(--ink)" : "1px solid var(--line)",
                  color: active ? "var(--paper)" : "var(--ink)",
                  borderRadius: 12, padding: "22px 20px", cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{o.emoji}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, marginBottom: 6, fontStyle: "italic" }}>{o.label}</div>
                <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>{o.sub}</div>
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "form" && (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "28px 30px" }}>
          <FormRanger values={form} setValues={setForm} />
        </div>
      )}

      {q.kind === "form" && recapHistory.length > 0 && (
        <RangeRecapHistory recaps={recapHistory} />
      )}

      {q.kind === "score_dial" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
          <div>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 32, justifyContent: "center" }}>
              {(["score", "diff"] as const).map(mode => (
                <button key={mode}
                  onClick={() => setGoalMode(mode)}
                  style={{
                    padding: "8px 20px", fontSize: 13, fontWeight: 600,
                    border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
                    background: goalMode === mode ? "var(--ink)" : "var(--paper)",
                    color: goalMode === mode ? "var(--paper)" : "var(--ink)",
                  }}>
                  {mode === "score" ? "Target Score" : "Target Differential"}
                </button>
              ))}
            </div>

            {goalMode === "score" ? (
              <ScoreDial
                value={answers.goal ?? defaultGoalScore}
                min={defaultGoalScore - 20}
                max={defaultGoalScore + 20}
                onChange={handleScoreChange}
              />
            ) : (
              <DiffDial
                value={goalDiff}
                min={Math.max(-5, defaultGoalDiff - 15)}
                max={defaultGoalDiff + 15}
                onChange={handleDiffChange}
              />
            )}
          </div>

          {/* Historical rounds panel */}
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 22px" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
              Your history here
            </div>
            {allCourseRounds.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>No rounds recorded for this course yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, padding: "4px 0 8px", borderBottom: "1px solid var(--line)", marginBottom: 2 }}>
                  <div style={{ fontSize: 10, color: "var(--muted-2)", fontWeight: 600, letterSpacing: 1 }}>DATE</div>
                  <div style={{ fontSize: 10, fontWeight: goalMode === "score" ? 800 : 500, color: goalMode === "score" ? "var(--ink)" : "var(--muted-2)", letterSpacing: 1, textAlign: "right" }}>SCORE</div>
                  <div style={{ fontSize: 10, fontWeight: goalMode === "diff" ? 800 : 500, color: goalMode === "diff" ? "var(--ink)" : "var(--muted-2)", letterSpacing: 1, textAlign: "right" }}>DIFF</div>
                </div>
                {allCourseRounds.map((r, i) => {
                  const score = (r.holes ?? []).reduce((s: number, h: any) => s + (Number(h.score) || 0), 0);
                  const diff = r.score_differential != null
                    ? ((r.holes_played ?? 18) <= 9 ? r.score_differential * 2 : r.score_differential)
                    : null;
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "baseline", padding: "6px 0", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.date}</div>
                      <div style={{ fontSize: goalMode === "score" ? 15 : 13, fontWeight: goalMode === "score" ? 700 : 400, color: goalMode === "score" ? "var(--ink)" : "var(--muted)", textAlign: "right" }}>
                        {score > 0 ? score : "—"}
                      </div>
                      <div style={{ fontSize: goalMode === "diff" ? 15 : 13, fontWeight: goalMode === "diff" ? 700 : 400, color: goalMode === "diff" ? "var(--ink)" : "var(--muted)", textAlign: "right" }}>
                        {diff !== null ? (diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40 }}>
        <button onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}
          style={{ background: "transparent", border: "none", color: step === 0 ? "var(--line)" : "var(--muted)", cursor: step === 0 ? "default" : "pointer", fontSize: 14, fontWeight: 600 }}>
          ← Back
        </button>
        <button onClick={advance} disabled={!canAdvance}
          style={{
            background: canAdvance ? "var(--ink)" : "var(--line)",
            color: "var(--paper)", border: "none", borderRadius: 8,
            padding: "14px 28px", fontSize: 15, fontWeight: 600,
            cursor: canAdvance ? "pointer" : "default",
          }}>
          {isLast ? "Build my plan →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ─── Review stage ─────────────────────────────────────────────────────────────

function StageReview({ answers, form, posture, onNext }: {
  answers: PlanAnswers; form: PlayerForm; posture: string; onNext: () => void;
}) {
  const focus = { doubles: "Pick Your Spots", pace: "Course Manager", lowest: "Go Low" }[answers.focus!];
  const windScore    = answers.windScore    ?? 0;
  const wetnessScore = answers.wetnessScore ?? 0;
  const windLabel    = windScore < 2 ? "Calm" : windScore < 5 ? "Light breeze" : windScore < 7 ? "Breezy" : "Windy";
  const wetLabel     = wetnessScore < 2 ? "Firm & dry" : wetnessScore < 5 ? "Slightly soft" : wetnessScore < 8 ? "Soft" : "Very wet";
  const goal = answers.goal !== undefined ? String(answers.goal) : "—";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 500, fontStyle: "italic", margin: "0 0 10px", color: "var(--ink)" }}>
        Here&apos;s what we heard.
      </h2>
      <p style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 32px" }}>A quick recap before we lock in the plan.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        {[{ k: "Strategy", v: focus }, { k: "Wind", v: windLabel }, { k: "Course", v: wetLabel }, { k: "Goal", v: goal }].map((x, i) => (
          <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>{x.k}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, fontStyle: "italic" }}>{x.v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Club form today</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {FORM_CLUBS.map((c) => {
            const v = form[c.k];
            const color = v >= 75 ? "var(--flag)" : v >= 55 ? "var(--ink-soft)" : v >= 35 ? "var(--muted)" : "#2e6db4";
            const label = v >= 75 ? "hot" : v >= 55 ? "solid" : v >= 35 ? "neutral" : "cold";
            return (
              <div key={c.k} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 2 }}>{c.k}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "var(--green-soft)", border: "1px solid var(--green)", borderRadius: 12, padding: "22px 26px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--green-deep)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Plan posture</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, fontStyle: "italic", color: "var(--green-deep)", lineHeight: 1.35 }}>{posture}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onNext} style={{
          background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8,
          padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>
          Show me the plan →
        </button>
      </div>
    </div>
  );
}

// ─── Recap advice panel ───────────────────────────────────────────────────────

const RECAP_GROUPS = [
  { key: "Driver",  label: "Driver" },
  { key: "3W",      label: "3-wood" },
  { key: "5W",      label: "5-wood" },
  { key: "7W",      label: "7-wood" },
  { key: "4i-7i",   label: "4i – 7i" },
  { key: "8i-PW",   label: "8i – PW" },
  { key: "SW-LW",   label: "SW – LW / Chip" },
  { key: "Putter",  label: "Putter" },
];

function ByClubSection({ filledGroups, groupNotes }: { filledGroups: typeof RECAP_GROUPS; groupNotes: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0 6px", display: "flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700, color: "var(--green-deep)", textTransform: "uppercase" }}>By club</span>
        <span style={{ fontSize: 10, color: "var(--green-deep)", opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", maxWidth: "100%", gap: 8 }}>
          {filledGroups.map(g => (
            <div key={g.key} style={{ background: "var(--paper)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green-deep)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{g.label}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 }}>{groupNotes[g.key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecapAdvicePanel({ recap }: { recap: Record<string, any> }) {
  const [open, setOpen] = useState(true);
  const groupNotes = (recap.group_notes ?? {}) as Record<string, string>;
  const filledGroups = RECAP_GROUPS.filter(g => groupNotes[g.key]?.trim());
  const hasContent = recap.overall?.trim() || recap.favs?.trim() || recap.wish?.trim() || filledGroups.length > 0;
  if (!hasContent) return null;

  return (
    <div style={{ background: "var(--green-soft)", border: "1px solid var(--green)", borderRadius: 12, marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--green-deep)", textTransform: "uppercase", fontWeight: 700 }}>Last Recap · Advice for Today</div>
          {recap.course_name && (
            <div style={{ fontSize: 11, color: "var(--green-deep)", marginTop: 2, opacity: 0.75 }}>{recap.course_name} · {recap.date}</div>
          )}
        </div>
        <span style={{ fontSize: 13, color: "var(--green-deep)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {recap.overall?.trim() && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700, color: "var(--green-deep)", textTransform: "uppercase", marginBottom: 4 }}>Overall</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{recap.overall}</div>
            </div>
          )}
          {(recap.favs?.trim() || recap.wish?.trim()) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              {recap.favs?.trim() && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700, color: "var(--good)", textTransform: "uppercase", marginBottom: 4 }}>Keep doing</div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{recap.favs}</div>
                </div>
              )}
              {recap.wish?.trim() && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700, color: "var(--bad)", textTransform: "uppercase", marginBottom: 4 }}>Watch out for</div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{recap.wish}</div>
                </div>
              )}
            </div>
          )}
          {filledGroups.length > 0 && (
            <ByClubSection filledGroups={filledGroups} groupNotes={groupNotes} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Plan stage ───────────────────────────────────────────────────────────────

function StagePlan({ course, planHoles, strategies, form, answers, target, holeHistMap, holeHistEntries, planEnrichedMap, planEnrichedReady, latestRecap, onClubChange, onAimChange, onTeeItUp, onRestart }: {
  course: CourseRecord;
  planHoles: import("@/lib/types").HoleData[];
  strategies: Record<number, import("@/lib/planTypes").HoleStrategy>;
  form: PlayerForm; answers: PlanAnswers; target: number;
  holeHistMap: Record<number, HoleClubStat[]>;
  holeHistEntries: Record<number, HoleHistEntry[]>;
  planEnrichedMap: Record<number, PlanEnrichedHole[]>;
  planEnrichedReady: boolean;
  latestRecap: Record<string, any> | null;
  onClubChange: (hole: number, club: string) => void;
  onAimChange: (hole: number, aim: import("@/lib/planTypes").HoleStrategy["aim"]) => void;
  onTeeItUp: () => void; onRestart: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const totalYards = planHoles.reduce((s, h) => s + h.yards, 0);
  const totalPar = planHoles.reduce((s, h) => s + h.par, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, alignItems: "end", marginBottom: 30 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 500, fontStyle: "italic", margin: "0 0 6px", color: "var(--ink)", lineHeight: 1.05 }}>
            Your plan for <span style={{ color: "var(--green-deep)" }}>{course.name}</span>
          </h2>
          <div style={{ fontSize: 14, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
            {course.tee_box.toUpperCase()} · {totalYards.toLocaleString()} YDS · PAR {totalPar}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Target today</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 500, fontStyle: "italic", color: "var(--ink)", lineHeight: 1 }}>{target}</div>
        </div>
      </div>

      {latestRecap && <RecapAdvicePanel recap={latestRecap} />}

      <div style={{ display: "grid", gap: 8 }}>
        {planHoles.map((h) => (
          <PlanHoleCard key={h.hole} hole={h} strategy={strategies[h.hole]}
            expanded={expanded.has(h.hole)} highlight={strategies[h.hole]?.trouble}
            clubStats={holeHistMap[h.hole]}
            holeHistory={holeHistEntries[h.hole] ?? []}
            enriched={planEnrichedReady ? (planEnrichedMap[h.hole] ?? []) : undefined}
            onClubChange={(club) => onClubChange(h.hole, club)}
            onAimChange={(aim) => onAimChange(h.hole, aim)}
            onToggle={() => {
              const n = new Set(expanded);
              n.has(h.hole) ? n.delete(h.hole) : n.add(h.hole);
              setExpanded(n);
            }} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40, padding: "24px 0", borderTop: "1px solid var(--line)" }}>
        <button onClick={onRestart} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          ← Start a new plan
        </button>
        <button onClick={onTeeItUp} style={{
          background: "var(--green)", color: "var(--paper)", border: "none", borderRadius: 8,
          padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>
          Tee it up ⛳ →
        </button>
      </div>
    </div>
  );
}
