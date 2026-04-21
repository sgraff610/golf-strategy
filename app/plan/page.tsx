"use client";
// app/plan/page.tsx
// Pre-Round Planner — 4-stage flow (Setup → Questions → Review → Plan).
//
// TODO(data):
//   - Load real course via supabase (see commented block in useEffect)
//   - Load real CourseHistorySummary (aggregation; see HANDOFF.md §5)
//   - Save resulting RoundPlan on "Tee it up" (see HANDOFF.md §4)

import { useEffect, useMemo, useState } from "react";
import type { HoleData, CourseRecord } from "@/lib/types";
import type {
  PlayerForm,
  PlanAnswers,
  CourseHistorySummary,
  RoundPlan,
} from "@/lib/planTypes";
import { FORM_CLUBS, QUESTIONS } from "./questions";
import { FormRanger } from "./FormRanger";
import { PlanHoleCard } from "./PlanHoleCard";
import { buildPosture, buildStrategies, targetScore } from "./planEngine";

// ─── Mock course + history — replace with Supabase fetches ───────────────────
const MOCK_COURSE: CourseRecord = {
  id: "mock-pebble-creek",
  name: "Pebble Creek Golf Club",
  tee_box: "Blue",
  city: "Cardiff",
  state: "CA",
  rating: 71.2,
  slope: 129,
  holes: Array.from({ length: 18 }, (_, i): HoleData => {
    const hole = i + 1;
    const pars = [4, 3, 5, 4, 3, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4] as const;
    const yds = [398, 168, 522, 412, 204, 538, 372, 148, 434, 408, 548, 132, 422, 368, 512, 182, 444, 458];
    const prefClubs = ["3W","6i","Driver","Driver","4i","3W","5W","8i","3W","Driver","3W","9i","5W","3W","Driver","5i","Driver","3W"];
    return {
      hole,
      par: pars[i],
      yards: yds[i],
      stroke_index: [9,15,3,5,13,1,11,17,7,10,4,18,6,12,2,14,8,16][i],
      dogleg_direction: null,
      tee_tree_hazard_left: hole === 13,
      tee_tree_hazard_right: false,
      tee_tree_hazard_across: false,
      tee_bunkers_left: false,
      tee_bunkers_right: hole === 1 || hole === 14,
      tee_water_out_left: hole === 6,
      tee_water_out_right: hole === 11 || hole === 17,
      tee_water_out_across: false,
      approach_tree_hazard_left: false,
      approach_tree_hazard_right: false,
      approach_tree_hazard_long: false,
      approach_tree_hazard_across: false,
      approach_bunkers_left: false,
      approach_bunkers_right: false,
      approach_water_out_left: false,
      approach_water_out_right: false,
      approach_water_out_short: hole === 16,
      approach_water_out_long: hole === 2,
      approach_bunker_short_middle: false,
      approach_bunker_short_left: false,
      approach_bunker_middle_left: false,
      approach_bunker_long_left: false,
      approach_bunker_long_middle: false,
      approach_bunker_long_right: false,
      approach_bunker_middle_right: false,
      approach_bunker_short_right: hole === 8,
      approach_green_short_middle: false,
      approach_green_short_left: false,
      approach_green_middle_left: false,
      approach_green_long_left: false,
      approach_green_long_middle: false,
      approach_green_long_right: false,
      approach_green_middle_right: false,
      approach_green_short_right: false,
      approach_green_depth: 28,
      preferred_club: prefClubs[i],
      preferred_landing: "CF",
    };
  }),
};

const MOCK_HISTORY: CourseHistorySummary = {
  course_id: "mock-pebble-creek",
  rounds_played: 4,
  best_score: 79, best_to_par: "+7", best_date: "Jun 2025",
  avg_score: 84.5, avg_to_par: "+12.5",
  strongholds: [
    { hole: 12, note: "3/4 pars here — your short-iron accuracy shows up", confidence: "high",   sample: "4 of 4 rounds" },
    { hole: 4,  note: "Driver + wedge = consistent 2-putt pars",            confidence: "medium", sample: "3 of 4 rounds" },
  ],
  trouble: [
    { hole: 6,  note: "Avg +1.75 on this par 5 — laying up to 100y scored 0.6 better than going for green", confidence: "medium", sample: "4 rounds · 3 layups vs 1 go" },
    { hole: 9,  note: "OB right costs you here (2 of 4). Tee shot left of center is your pattern",           confidence: "high",   sample: "4 of 4 rounds" },
    { hole: 13, note: "Severe left dogleg — Driver hasn't worked (0/3 fairways). 5W is new territory",      confidence: "high",   sample: "3 of 3 driver attempts" },
  ],
  correlations: [
    { key: "Fairway hit → score",           value: "−0.8/hole when you hit",                       sample: "18 fairways sampled",     direction: "good" },
    { key: "Bogey on hole 1 → front 9",     value: "+2.4 front when you open w/ bogey",            sample: "3 of 4 rounds",           direction: "bad"  },
    { key: "Putts from 6–10 ft",            value: "52% made (vs 38% tour avg for your handicap)", sample: "24 attempts",             direction: "good" },
    { key: "Par 5s — going for it in 2",    value: "avg +0.8 vs layup",                            sample: "6 attempts",              direction: "bad"  },
  ],
};

// ─── Design tokens injected once (scoped to /plan) ───────────────────────────
const TOKENS = `
  .plan-root {
    --bg:#f4efe6; --paper:#fbf7ef; --paper-alt:#f0eadc;
    --ink:#1d2a24; --ink-soft:#2e3d35; --muted:#6a6356; --muted-2:#8e8778;
    --line:#d9d1bf; --line-soft:#e6ddca;
    --green:#0f6e56; --green-deep:#0a4d3c; --green-soft:#d8e7df;
    --accent:#b5733a; --accent-soft:#f0dcc5; --sand:#c8a84b; --flag:#a63a2a;
    --good:#2f7a52; --bad:#a63a2a;
    --font-display: Georgia, 'Times New Roman', serif;
    --font-ui: var(--font-geist-sans, system-ui), sans-serif;
    --font-mono: var(--font-geist-mono, ui-monospace), monospace;
    background: var(--bg); color: var(--ink); font-family: var(--font-ui);
    min-height: calc(100vh - 36px);
  }
`;

// ─── Stages ──────────────────────────────────────────────────────────────────
const STAGES = ["setup","questions","review","plan"] as const;
type Stage = typeof STAGES[number];

export default function PlanPage() {
  const [stage, setStage] = useState<Stage>("setup");
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const [form, setForm] = useState<PlayerForm>(
    Object.fromEntries(FORM_CLUBS.map((c) => [c.k, c.default])) as PlayerForm
  );

  // TODO: replace with real fetches
  const [course] = useState<CourseRecord>(MOCK_COURSE);
  const [history] = useState<CourseHistorySummary>(MOCK_HISTORY);

  // ─── replace block below with real Supabase fetch ──────────────────────────
  // useEffect(() => {
  //   (async () => {
  //     const { data } = await supabase
  //       .from("courses").select("*").eq("id", courseId).single();
  //     setCourse(data as CourseRecord);
  //     const history = await fetchCourseHistory(courseId);  // HANDOFF §5
  //     setHistory(history);
  //   })();
  // }, [courseId]);

  const strategies = useMemo(
    () => buildStrategies(course.holes, form, answers, history),
    [course.holes, form, answers, history]
  );
  const posture = useMemo(() => buildPosture(answers), [answers]);
  const target = useMemo(() => targetScore(answers), [answers]);

  const onTeeItUp = async () => {
    const plan: RoundPlan = {
      course_id: course.id,
      round_date: new Date().toISOString().slice(0, 10),
      answers, form, posture,
      strategies,
      target_score: target,
    };
    // TODO (HANDOFF §4): persist plan
    // await supabase.from("round_plans").insert(plan);
    // router.push(`/rounds/play?plan=${inserted.id}`);
    console.log("Ready to save plan:", plan);
    alert("Plan ready — wire up supabase insert in page.tsx onTeeItUp()");
  };

  const answered = (["how_feeling","focus","weather","goal"] as const)
    .every((k) => answers[k]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      <div className="plan-root">
        <div style={{ padding: "0 40px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <StageNav stage={stage} setStage={setStage} answered={answered} />
            <div style={{ padding: "40px 0 60px" }}>
              {stage === "setup" && (
                <StageSetup course={course} history={history} onNext={() => setStage("questions")} />
              )}
              {stage === "questions" && (
                <StageQuestions
                  answers={answers} setAnswers={setAnswers}
                  form={form} setForm={setForm}
                  onNext={() => setStage("review")}
                />
              )}
              {stage === "review" && (
                <StageReview
                  answers={answers} form={form} posture={posture}
                  onNext={() => setStage("plan")}
                />
              )}
              {stage === "plan" && (
                <StagePlan
                  course={course} strategies={strategies} form={form}
                  answers={answers} target={target}
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

// ─── Stage nav, setup, questions, review, plan ────────────────────────────────

function StageNav({ stage, setStage, answered }: { stage: Stage; setStage: (s: Stage) => void; answered: boolean }) {
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
        const reachable = i <= idx || (i === idx + 1 && answered);
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

function StageSetup({ course, history, onNext }: { course: CourseRecord; history: CourseHistorySummary; onNext: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 56, alignItems: "start", minHeight: 520 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 56, lineHeight: 1.02, margin: "0 0 16px", color: "var(--ink)" }}>
          Let&apos;s build <em style={{ fontStyle: "italic", color: "var(--green-deep)" }}>your</em> strategy
          <br />for today&apos;s round.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, color: "var(--ink-soft)", maxWidth: 520, margin: "0 0 32px" }}>
          We&apos;ll ask a few quick questions, look at what&apos;s worked for you here, and hand you an 18-hole plan.
        </p>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", maxWidth: 480, marginBottom: 28 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, fontStyle: "italic" }}>{course.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {course.tee_box} tees · {course.city}, {course.state} · Rating {course.rating} / Slope {course.slope}
          </div>
        </div>
        <button onClick={onNext} style={{
          background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8,
          padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>
          Start planning →
        </button>
      </div>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", fontWeight: 600, marginBottom: 14 }}>
          What we know about you here
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingBottom: 18, borderBottom: "1px dashed var(--line)", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Best here</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, fontStyle: "italic", color: "var(--green-deep)" }}>{history.best_score ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Avg here</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, fontStyle: "italic", color: "var(--ink)" }}>{history.avg_score ?? "—"}</div>
            </div>
          </div>
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
        </div>
      </div>
    </div>
  );
}

function StageQuestions({ answers, setAnswers, form, setForm, onNext }: {
  answers: PlanAnswers; setAnswers: (a: PlanAnswers) => void;
  form: PlayerForm; setForm: (f: PlayerForm) => void;
  onNext: () => void;
}) {
  const [step, setStep] = useState(0);
  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const canAdvance = q.kind === "form" || !!(answers as Record<string, string | undefined>)[q.id];

  return (
    <div style={{ maxWidth: 740, margin: "20px auto 0" }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40 }}>
        <button onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}
          style={{ background: "transparent", border: "none", color: step === 0 ? "var(--line)" : "var(--muted)", cursor: step === 0 ? "default" : "pointer", fontSize: 14, fontWeight: 600 }}>
          ← Back
        </button>
        <button onClick={() => (isLast ? onNext() : setStep(step + 1))} disabled={!canAdvance}
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

function StageReview({ answers, form, posture, onNext }: {
  answers: PlanAnswers; form: PlayerForm; posture: string; onNext: () => void;
}) {
  const feeling = { dialed: "Dialed in", steady: "Steady", rusty: "A bit rusty" }[answers.how_feeling!];
  const focus = { doubles: "No doubles", pace: "Steady pace", lowest: "Lowest score" }[answers.focus!];
  const weather = { calm: "Calm & dry", windy: "Breezy", wet: "Wet / soft" }[answers.weather!];
  const goal = { break80: "Break 80", sub90: "Post under 90", practice: "Practice round" }[answers.goal!];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 500, fontStyle: "italic", margin: "0 0 10px", color: "var(--ink)" }}>
        Here&apos;s what we heard.
      </h2>
      <p style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 32px" }}>A quick recap before we lock in the plan.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        {[{k:"Feeling",v:feeling},{k:"Protect",v:focus},{k:"Weather",v:weather},{k:"Goal",v:goal}].map((x,i) => (
          <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>{x.k}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, fontStyle: "italic" }}>{x.v}</div>
          </div>
        ))}
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

function StagePlan({ course, strategies, form, answers, target, onTeeItUp, onRestart }: {
  course: CourseRecord;
  strategies: Record<number, import("@/lib/planTypes").HoleStrategy>;
  form: PlayerForm; answers: PlanAnswers; target: number;
  onTeeItUp: () => void; onRestart: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const totalYards = course.holes.reduce((s, h) => s + h.yards, 0);
  const totalPar = course.holes.reduce((s, h) => s + h.par, 0);

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

      <div style={{ display: "grid", gap: 8 }}>
        {course.holes.map((h) => (
          <PlanHoleCard key={h.hole} hole={h} strategy={strategies[h.hole]}
            expanded={expanded.has(h.hole)} highlight={strategies[h.hole].trouble}
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
