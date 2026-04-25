// app/rounds/recap/page.tsx
// Post-Round Recap — 2-stage flow: Your Recap → Caddie's Analysis
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Club dial config ──────────────────────────────────────────────────────────

const DIAL_CLUBS = [
  { key: "Driver",  label: "Driver" },
  { key: "3W",      label: "3-wood" },
  { key: "5W",      label: "5-wood" },
  { key: "7W",      label: "7-wood" },
  { key: "4i-7i",   label: "4i – 7i" },
  { key: "8i-PW",   label: "8i – PW" },
  { key: "SW-LW",   label: "SW – LW / Chip" },
  { key: "Putter",  label: "Putter" },
] as const;

type DialKey = typeof DIAL_CLUBS[number]["key"];
type Dials = Record<DialKey, number>;

const DEFAULT_DIALS: Dials = {
  Driver: 50, "3W": 50, "5W": 50, "7W": 50,
  "4i-7i": 50, "8i-PW": 50, "SW-LW": 50, Putter: 50,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SavedRecap = {
  dials: Record<string, number>;
  overall: string;
  favs: string;
  wish: string;
  group_notes: Record<string, string>;
};

type RoundRow = {
  id: string;
  course_name: string;
  date: string;
  holes: any[];
  holes_played: number;
  recap?: SavedRecap | null;
};

type RoundFacts = {
  course: string;
  date: string;
  score: number;
  par: number;
  toPar: number;
  fairwaysHit: number;
  fairwayTotal: number;
  gir: number;
  girTotal: number;
  totalPutts: number;
  avgFirstPutt: number | null;
  missLeftTee: number;
  missRightTee: number;
  missLeftAppr: number;
  missRightAppr: number;
  threePutts: number;
  chipCount: number;
};

type Win     = { title: string; body: string };
type Cost    = { title: string; cost: string; headline: string; body: string; drill: string };
type Pattern = { body: string };
type Analysis = { verdict: string; facts: RoundFacts; wins: Win[]; costs: Cost[]; patterns: Pattern[] };

// ─── Round facts ──────────────────────────────────────────────────────────────

function computeRoundFacts(round: RoundRow): RoundFacts {
  const holes: any[] = round.holes ?? [];
  const par   = holes.reduce((s: number, h: any) => s + (h.par ?? 0), 0);
  const score = holes.reduce((s: number, h: any) => s + (Number(h.score) || 0), 0);
  const totalPutts = holes.reduce((s: number, h: any) => s + (Number(h.putts) || 0), 0);
  const driving = holes.filter((h: any) => h.par === 4 || h.par === 5);
  const fairwaysHit  = driving.filter((h: any) => h.tee_accuracy === "Hit").length;
  const missLeftTee  = driving.filter((h: any) => h.tee_accuracy === "Left").length;
  const missRightTee = driving.filter((h: any) => h.tee_accuracy === "Right").length;
  const gir = holes.filter((h: any) => h.gir).length;
  const missLeftAppr  = holes.filter((h: any) => h.appr_accuracy === "Left").length;
  const missRightAppr = holes.filter((h: any) => h.appr_accuracy === "Right").length;
  const threePutts = holes.filter((h: any) => Number(h.putts) >= 3).length;
  const chipCount  = holes.reduce((s: number, h: any) => s + (Number(h.chips) || 0), 0);

  const distMap: Record<string, number> = {
    inside3: 2, "3to6": 4.5, "6to10": 8, "10to20": 15, "20plus": 25,
  };
  const puttDists = holes
    .map((h: any) => distMap[h.first_putt_distance] ?? null)
    .filter((d): d is number => d !== null);
  const avgFirstPutt = puttDists.length > 0
    ? puttDists.reduce((a, b) => a + b, 0) / puttDists.length
    : null;

  return {
    course: round.course_name,
    date: round.date,
    score, par, toPar: score - par,
    fairwaysHit, fairwayTotal: driving.length,
    gir, girTotal: holes.length,
    totalPutts, avgFirstPutt,
    missLeftTee, missRightTee,
    missLeftAppr, missRightAppr,
    threePutts, chipCount,
  };
}

// ─── Analysis engine ──────────────────────────────────────────────────────────

function heatTier(v: number) {
  if (v >= 75) return "hot";
  if (v >= 55) return "solid";
  if (v >= 35) return "neutral";
  return "cold";
}

function analyze(
  dials: Dials,
  groupNotes: Record<string, string>,
  overall: string,
  favs: string,
  wish: string,
  facts: RoundFacts,
): Analysis {
  const wins: Win[]     = [];
  const costs: Cost[]   = [];
  const patterns: Pattern[] = [];

  const combined = [overall, favs, wish, ...Object.values(groupNotes)].join(" ").toLowerCase();
  const hotCount  = Object.values(dials).filter(v => heatTier(v) === "hot").length;
  const coldCount = Object.values(dials).filter(v => heatTier(v) === "cold").length;

  // ── Verdict ──────────────────────────────────────────────────────────────
  const tp = facts.toPar;
  const scoreStr =
    tp <= 0 ? "shot under par" :
    tp <= 3 ? `came in ${tp} over par` :
    tp <= 8 ? `posted a ${tp}-over` :
    `battled to a ${tp}-over`;
  const formStr =
    hotCount >= 3 ? "with the sticks feeling sharp" :
    coldCount >= 3 ? "grinding through a tough feel day" :
    "with a mixed bag in the bag";
  const verdict = `You ${scoreStr} ${formStr}.`;

  // ── Wins ─────────────────────────────────────────────────────────────────
  const avgPPH = facts.totalPutts / Math.max(facts.girTotal, 1);
  if (dials.Putter >= 65 && avgPPH <= 1.8 && facts.threePutts <= 1) {
    wins.push({
      title: "Flat stick showed up",
      body: `${facts.totalPutts} total putts and only ${facts.threePutts} three-putt${facts.threePutts !== 1 ? "s" : ""}. When the putter is working this well it papers over a lot of mistakes elsewhere.`,
    });
  }

  const fwPct = facts.fairwayTotal > 0 ? facts.fairwaysHit / facts.fairwayTotal : 0;
  if (fwPct >= 0.6 && dials.Driver >= 55) {
    wins.push({
      title: "Off the tee — controlled",
      body: `${facts.fairwaysHit} of ${facts.fairwayTotal} fairways kept you in position. That kind of accuracy turns bogeys into pars.`,
    });
  }

  const girPct = facts.girTotal > 0 ? facts.gir / facts.girTotal : 0;
  if (girPct >= 0.4 && (dials["4i-7i"] >= 65 || dials["8i-PW"] >= 65)) {
    wins.push({
      title: "Ball-striking held up",
      body: `${facts.gir} greens in regulation gave you looks at par and birdie. That's a ball-striking rate that adds up over a season.`,
    });
  }

  if (facts.chipCount > 0 && dials["SW-LW"] >= 65 && girPct < 0.4) {
    wins.push({
      title: "Short game bailed you out",
      body: `Your wedges kept the scorecard clean when the irons weren't finding greens. Scrambling at a high rate is a skill that travels to every course.`,
    });
  }

  if (wins.length === 0 && tp <= 5) {
    wins.push({
      title: "Solid scorecard",
      body: `${tp <= 0 ? "Under par" : `${tp} over`} is a real result. The card doesn't always reflect how it felt — this one does.`,
    });
  }

  if (wins.length === 0) {
    wins.push({
      title: "You stayed in it",
      body: "Tough day with the sticks, but finishing the round with a score you can build on is its own kind of win.",
    });
  }

  // ── Costs ────────────────────────────────────────────────────────────────
  if (facts.totalPutts >= 34 || facts.threePutts >= 3) {
    const extra = Math.max(0, facts.totalPutts - 30);
    const distNote = facts.avgFirstPutt ? ` — avg first putt ~${facts.avgFirstPutt.toFixed(0)} ft` : "";
    costs.push({
      title: "Putting",
      cost: `~${facts.threePutts + Math.ceil(extra / 2)} shots`,
      headline: `${facts.totalPutts} putts, ${facts.threePutts} three-putt${facts.threePutts !== 1 ? "s" : ""}${distNote}`,
      body: `Three-putts are one of the easiest ways to give back a good round. Each one costs a stroke outright; a run of them changes momentum and compounds pressure on every subsequent hole.`,
      drill: `3-putt elimination. Place 6 balls at 6, 8, 10, 12, 15, and 20 feet. Goal: zero 3-putts in a complete circuit. If you 3-putt, start over. Focus on pace from distance — most 3-putts start with a poor first-putt speed, not direction.`,
    });
  }

  if (fwPct < 0.45 && facts.fairwayTotal >= 5) {
    const bias = facts.missLeftTee > facts.missRightTee ? "left"
               : facts.missRightTee > facts.missLeftTee ? "right"
               : "both sides";
    costs.push({
      title: "Off the tee",
      cost: `~${Math.round((facts.fairwayTotal - facts.fairwaysHit) * 0.4)} shots`,
      headline: `${facts.fairwaysHit}/${facts.fairwayTotal} fairways, missing ${bias}`,
      body: `Missed fairways force chip-outs, longer approaches, and higher short-game pressure. A consistent miss to the ${bias === "both sides" ? "same side" : bias} suggests a repeatable path issue worth a few focused range sessions.`,
      drill: `Corridor driving. On the range, place two alignment sticks 20 yards apart and commit to keeping every ball inside. When you miss ${bias}, note your ball shape and check trail-elbow position at the top — one shape off every tee, committed pre-shot routine.`,
    });
  }

  if (girPct < 0.33 && facts.girTotal >= 9) {
    const apprBias = facts.missLeftAppr >= facts.missRightAppr ? "left" : "right";
    costs.push({
      title: "Approach play",
      cost: `~${Math.max(1, Math.round((facts.girTotal * 0.45 - facts.gir) * 0.35))} shots`,
      headline: `${facts.gir}/${facts.girTotal} GIR, missing ${apprBias}`,
      body: `Low GIR days grind you down — every missed green means a chip or pitch, a hard two-putt par at best. A consistent ${apprBias}-miss pattern usually points to face angle at impact rather than swing path.`,
      drill: `Gate drill. Set two tees 2 ball-widths apart, 6 inches in front of the ball. Hit 20 7-irons through the gate without touching either tee. Misses ${apprBias} mean the face is open/closed at impact — the gate forces you to feel true center contact.`,
    });
  }

  if (combined.includes("thud") || combined.includes("chunk") || combined.includes("fat") ||
      (dials["SW-LW"] < 40 && facts.chipCount >= 3)) {
    costs.push({
      title: "Short game",
      cost: "~2–3 shots",
      headline: "Wedges and chips weren't sharp",
      body: `Chunked chips and poor contact from around the green are almost always a setup issue — weight drifting back, ball position too far forward. Easy to groove in 20 minutes.`,
      drill: `Towel drill. Lay a towel 4 inches behind the ball. Hit 20 chip shots without touching the towel. This forces you to strike down and forward rather than scoop — keep weight left (for right-handers) through the entire motion.`,
    });
  }

  // ── Smaller patterns ──────────────────────────────────────────────────────
  if (combined.includes("pulled") || combined.includes("pull")) {
    patterns.push({ body: `Repeated pull pattern in your notes. Pulls usually mean the path is too steep coming down — try flattening the backswing slightly or delaying the downswing hip turn by half a beat.` });
  }
  if (combined.includes("push") || combined.includes("pushed")) {
    patterns.push({ body: `Push pattern noted. Pushes usually mean the path is too far inside-out — check your trail elbow position at the top of the backswing and whether you're firing the hips too early.` });
  }
  if (combined.includes("short") && !combined.includes("short game") && !combined.includes("shorts")) {
    patterns.push({ body: `Came up short on approaches. In firm or windy conditions, take one extra club and swing at 80% — you'll compress it better and the distance evens out.` });
  }
  if (combined.includes("wet sand") || (combined.includes("sand") && combined.includes("thin"))) {
    patterns.push({ body: `Sand play mentioned. For wet or firm sand, close the face slightly and take less bounce — the standard open-face technique produces a thin in these conditions.` });
  }
  if (combined.includes("heel") || combined.includes("hosel")) {
    patterns.push({ body: `Heel/hosel contact noted — usually means you're standing too close or your weight is falling onto your toes through impact. Check address distance and stay centered.` });
  }

  const coldKeys = (Object.keys(dials) as DialKey[]).filter(k => dials[k] < 35);
  for (const k of coldKeys) {
    const covered =
      (k === "Putter" && costs.some(c => c.title === "Putting")) ||
      (k === "Driver" && costs.some(c => c.title === "Off the tee")) ||
      ((k === "4i-7i" || k === "8i-PW") && costs.some(c => c.title === "Approach play")) ||
      (k === "SW-LW" && costs.some(c => c.title === "Short game"));
    if (!covered && patterns.length < 3) {
      patterns.push({ body: `Your ${DIAL_CLUBS.find(c => c.key === k)?.label ?? k} was cold today — even one focused 20-minute session can reset a club group before your next round.` });
    }
  }

  if (favs.trim().length > 10 && patterns.length < 3) {
    patterns.push({ body: `Hold onto those favorite shots — note the feel and your pre-shot routine so you can replicate them next time out.` });
  }

  return {
    verdict,
    facts,
    wins: wins.slice(0, 3),
    costs: costs.slice(0, 3),
    patterns: patterns.slice(0, 2),
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const TOKENS = `
  .recap-root {
    --bg:#f4efe6; --paper:#fbf7ef; --paper-alt:#f0eadc;
    --ink:#1d2a24; --ink-soft:#2e3d35; --muted:#6a6356; --muted-2:#8e8778;
    --line:#d9d1bf; --line-soft:#e6ddca;
    --green:#0f6e56; --green-deep:#0a4d3c; --green-soft:#d8e7df;
    --accent:#b5733a; --accent-soft:#f0dcc5; --sand:#c8a84b; --flag:#a63a2a;
    --good:#2f7a52; --bad:#a63a2a;
    --cold:#3a6ea8; --cold-bg:#dde7f2;
    --font-display: Georgia, 'Times New Roman', serif;
    --font-ui: var(--font-geist-sans, system-ui), sans-serif;
    --font-mono: var(--font-geist-mono, ui-monospace), monospace;
    background: var(--bg); color: var(--ink); font-family: var(--font-ui);
    min-height: calc(100vh - 36px);
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heatLabel(v: number): string {
  if (v >= 75) return "🔥 on fire";
  if (v >= 55) return "✓ solid";
  if (v >= 35) return "~ neutral";
  return "❄ cold";
}
function heatFg(v: number): string {
  if (v >= 75) return "var(--flag)";
  if (v >= 55) return "var(--green)";
  if (v >= 35) return "var(--muted)";
  return "var(--cold)";
}
function heatBg(v: number): string {
  if (v >= 75) return "#f6e4d6";
  if (v >= 55) return "var(--green-soft)";
  if (v >= 35) return "var(--paper-alt)";
  return "var(--cold-bg)";
}
function heatBd(v: number): string {
  if (v >= 75) return "var(--bad)";
  if (v >= 55) return "var(--green)";
  if (v >= 35) return "var(--line)";
  return "var(--cold)";
}
function toParStr(n: number): string {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ children, tone = "default" }: {
  children: React.ReactNode;
  tone?: "default" | "green" | "clay" | "warn" | "ghost";
}) {
  const tones: Record<string, { bg: string; bd: string; fg: string }> = {
    default: { bg: "var(--paper-alt)", bd: "var(--line)",   fg: "var(--ink-soft)" },
    green:   { bg: "var(--green-soft)", bd: "var(--green)", fg: "var(--green-deep)" },
    clay:    { bg: "var(--accent-soft)", bd: "var(--accent)", fg: "#6a3f1a" },
    warn:    { bg: "#f6e4d6", bd: "var(--bad)",             fg: "var(--bad)" },
    ghost:   { bg: "transparent", bd: "var(--line)",        fg: "var(--muted)" },
  };
  const t = tones[tone] ?? tones.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
      padding: "3px 9px", borderRadius: 999,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
    }}>
      {children}
    </span>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ stage, onBack }: { stage: "input" | "analysis"; onBack: () => void }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: "1px solid var(--line)" }}>
      {(["input", "analysis"] as const).map((id, i) => {
        const label = id === "input" ? "01  Your recap" : "02  Caddie's analysis";
        const active = stage === id;
        const done   = id === "input" && stage === "analysis";
        return (
          <button
            key={id}
            onClick={id === "input" ? onBack : undefined}
            disabled={id === "analysis" && stage === "input"}
            style={{
              flex: 1, padding: "14px 0", border: "none", background: "transparent",
              borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
              cursor: done ? "pointer" : id === "analysis" && stage === "input" ? "default" : "default",
              fontSize: 12, fontWeight: active ? 700 : 500,
              color: active ? "var(--ink)" : done ? "var(--green)" : "var(--muted-2)",
              letterSpacing: 1, textTransform: "uppercase",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Dial row ─────────────────────────────────────────────────────────────────

function DialRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 130px", alignItems: "center", gap: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>

      {/* Track */}
      <div style={{ position: "relative", height: 44 }}>
        <div style={{
          position: "absolute", top: 16, left: 0, right: 0, height: 6, borderRadius: 3,
          background: "var(--paper-alt)", border: "1px solid var(--line)",
        }} />
        <div style={{
          position: "absolute", top: 16, left: 0, height: 6, borderRadius: 3,
          width: `${value}%`,
          background: "linear-gradient(90deg, var(--cold) 0%, var(--sand) 40%, var(--green) 80%)",
          border: "1px solid var(--line)",
        }} />
        <input
          type="range" min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%" }}
        />
        {/* Thumb */}
        <div style={{
          position: "absolute", top: 10, left: `calc(${value}% - 9px)`,
          width: 18, height: 18, borderRadius: "50%",
          background: "var(--paper)", border: "2px solid var(--ink)",
          boxShadow: "0 2px 6px rgba(0,0,0,.1)", pointerEvents: "none",
        }} />
        {/* Scale labels */}
        <div style={{
          position: "absolute", top: 30, left: 0, right: 0,
          display: "flex", justifyContent: "space-between",
          fontSize: 9, color: "var(--muted-2)", letterSpacing: 1, textTransform: "uppercase",
        }}>
          <span>cold</span><span>neutral</span><span>hot</span>
        </div>
      </div>

      {/* Heat label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <span style={{
          display: "inline-block", padding: "3px 9px", borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
          color: heatFg(value), background: heatBg(value), border: `1px solid ${heatBd(value)}`,
        }}>
          {heatLabel(value)}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted-2)", fontFamily: "var(--font-mono)", minWidth: 24, textAlign: "right" }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function Notes({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 6 }}>
        {label}
      </div>
      <textarea
        value={value} rows={rows}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "10px 12px", fontSize: 14, lineHeight: 1.5,
          border: `1px solid ${focused ? "var(--ink)" : "var(--line)"}`,
          borderRadius: 8, resize: "vertical",
          background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-ui)",
          outline: "none", transition: "border-color .15s ease",
        }}
      />
    </div>
  );
}

// ─── Stage 1 ──────────────────────────────────────────────────────────────────

function StageInput({
  rounds, roundId, onRoundId,
  dials, onDial,
  overall, onOverall,
  favs, onFavs,
  wish, onWish,
  groupNotes, onGroupNote,
  onSubmit,
}: {
  rounds: RoundRow[];
  roundId: string;
  onRoundId: (id: string) => void;
  dials: Dials;
  onDial: (k: DialKey, v: number) => void;
  overall: string; onOverall: (v: string) => void;
  favs: string;    onFavs:    (v: string) => void;
  wish: string;    onWish:    (v: string) => void;
  groupNotes: Record<string, string>;
  onGroupNote: (k: string, v: string) => void;
  onSubmit: () => void;
}) {
  const round = rounds.find(r => r.id === roundId);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Round picker */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 10 }}>
          Select round to recap
        </div>
        <select
          value={roundId}
          onChange={e => onRoundId(e.target.value)}
          style={{
            width: "100%", padding: "9px 12px", fontSize: 14,
            border: "1px solid var(--line)", borderRadius: 8,
            background: "var(--paper-alt)", color: "var(--ink)",
            appearance: "none", WebkitAppearance: "none", cursor: "pointer",
          }}
        >
          {rounds.length === 0 && <option value="">No rounds recorded yet</option>}
          {rounds.map(r => {
            const h   = r.holes ?? [];
            const par = h.reduce((s: number, x: any) => s + (x.par ?? 0), 0);
            const sc  = h.reduce((s: number, x: any) => s + (Number(x.score) || 0), 0);
            const tp  = sc - par;
            return (
              <option key={r.id} value={r.id}>
                {r.course_name} — {r.date} ({toParStr(tp)}, {r.holes_played ?? h.length}H)
              </option>
            );
          })}
        </select>

        {round && (() => {
          const h   = round.holes ?? [];
          const par = h.reduce((s: number, x: any) => s + (x.par ?? 0), 0);
          const sc  = h.reduce((s: number, x: any) => s + (Number(x.score) || 0), 0);
          const tp  = sc - par;
          const drv = h.filter((x: any) => x.par === 4 || x.par === 5);
          const fw  = drv.filter((x: any) => x.tee_accuracy === "Hit").length;
          const gir = h.filter((x: any) => x.gir).length;
          const pt  = h.reduce((s: number, x: any) => s + (Number(x.putts) || 0), 0);
          return (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Score",    value: String(sc) },
                { label: "To par",   value: toParStr(tp) },
                { label: "Fairways", value: `${fw}/${drv.length}` },
                { label: "GIR",      value: `${gir}/${h.length}` },
                { label: "Putts",    value: String(pt) },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  textAlign: "center", padding: "8px 16px",
                  background: "var(--paper-alt)", borderRadius: 8, border: "1px solid var(--line)",
                  flex: "1 1 60px",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{value}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Club-feel dials */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>How'd the clubs feel?</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 22 }}>Rate each group — this shapes the analysis.</div>
        <div style={{ display: "grid", gap: 20 }}>
          {DIAL_CLUBS.map(({ key, label }) => (
            <DialRow key={key} label={label} value={dials[key]} onChange={v => onDial(key, v)} />
          ))}
        </div>
      </div>

      {/* Overall notes */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>The round in your words</div>
        <div style={{ display: "grid", gap: 16 }}>
          <Notes label="Overall notes" value={overall} onChange={onOverall} rows={4}
            placeholder="How did it feel overall? Anything stick out?" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Notes label="Favorite shots" value={favs} onChange={onFavs} rows={2}
              placeholder="What would you love to bottle up?" />
            <Notes label="Wish I had them back" value={wish} onChange={onWish} rows={2}
              placeholder="The shots that still sting a little…" />
          </div>
        </div>
      </div>

      {/* Per-club notes */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Notes by club group</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Anything specific about how each group was behaving?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {DIAL_CLUBS.map(({ key, label }) => {
            const v = dials[key];
            return (
              <div key={key}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>{label}</span>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 999,
                    fontSize: 10, fontWeight: 700,
                    color: heatFg(v), background: heatBg(v), border: `1px solid ${heatBd(v)}`,
                  }}>
                    {heatLabel(v)}
                  </span>
                </div>
                <textarea
                  value={groupNotes[key] ?? ""}
                  onChange={e => onGroupNote(key, e.target.value)}
                  rows={2}
                  placeholder="Any notes…"
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 12, lineHeight: 1.5,
                    border: "1px solid var(--line)", borderRadius: 6, resize: "vertical",
                    background: "var(--paper-alt)", color: "var(--ink)", fontFamily: "var(--font-ui)",
                    outline: "none",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--ink)")}
                  onBlur={e => (e.target.style.borderColor = "var(--line)")}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onSubmit}
        disabled={!roundId}
        style={{
          width: "100%", padding: "16px", fontSize: 15, fontWeight: 700,
          background: roundId ? "var(--ink)" : "var(--paper-alt)",
          color: roundId ? "var(--paper)" : "var(--muted)",
          border: "1px solid var(--line)", borderRadius: 10,
          cursor: roundId ? "pointer" : "default", letterSpacing: 0.5,
        }}
      >
        Analyze my round →
      </button>
    </div>
  );
}

// ─── Stage 2 ──────────────────────────────────────────────────────────────────

function StageAnalysis({ analysis, onBack, onSave, saving, saved, saveError }: {
  analysis: Analysis;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveError?: string | null;
}) {
  const { verdict, facts, wins, costs, patterns } = analysis;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Headline */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 8 }}>
          Caddie's read
        </div>
        <div style={{
          fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 500,
          fontSize: 26, lineHeight: 1.35, color: "var(--ink)",
        }}>
          {verdict}
        </div>
      </div>

      {/* Round facts strip */}
      <div style={{
        display: "flex", gap: 0, flexWrap: "wrap",
        background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 28,
        overflow: "hidden",
      }}>
        {[
          { label: "Posted",    value: String(facts.score) },
          { label: "To par",    value: toParStr(facts.toPar) },
          { label: "Fairways",  value: `${facts.fairwaysHit}/${facts.fairwayTotal}` },
          { label: "GIR",       value: `${facts.gir}/${facts.girTotal}` },
          { label: "Putts",     value: String(facts.totalPutts) },
        ].map(({ label, value }, i, arr) => (
          <div key={label} style={{
            textAlign: "center", flex: "1 1 80px", padding: "14px 8px",
            borderRight: i < arr.length - 1 ? "1px solid var(--line)" : "none",
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* What went well */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--green-deep)", marginBottom: 12 }}>
          What went well
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {wins.map((w, i) => (
            <div key={i} style={{ background: "var(--green-soft)", border: "1px solid var(--green)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, fontSize: 16, color: "var(--green-deep)", marginBottom: 6 }}>
                {w.title}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>{w.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* What cost you */}
      {costs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--bad)", marginBottom: 12 }}>
            What cost you today
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {costs.map((c, i) => (
              <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--accent)", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, fontSize: 17, color: "var(--ink)" }}>
                    {c.title}
                  </span>
                  <Chip tone="warn">{c.cost}</Chip>
                </div>
                <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{c.headline}</div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 14 }}>{c.body}</div>
                <div style={{
                  background: "var(--paper-alt)", border: "1px solid var(--line)",
                  borderRadius: 6, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 5 }}>
                    DRILL
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.65 }}>{c.drill}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smaller patterns */}
      {patterns.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 12 }}>
            Smaller patterns worth noting
          </div>
          <div style={{ background: "var(--paper)", border: "1px dashed var(--line)", borderRadius: 10, padding: "16px 20px" }}>
            {patterns.map((p, i) => (
              <div key={i} style={{
                fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6,
                paddingBottom: i < patterns.length - 1 ? 14 : 0,
                marginBottom:  i < patterns.length - 1 ? 14 : 0,
                borderBottom:  i < patterns.length - 1 ? "1px dashed var(--line-soft)" : "none",
              }}>
                {p.body}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {saveError && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: "#f6e4d6", border: "1px solid var(--bad)",
          fontSize: 12, color: "var(--bad)", lineHeight: 1.5,
        }}>
          <strong>Save failed:</strong> {saveError}
          {saveError.includes("column") && (
            <span> — the <code>recap</code> column may not exist in your database yet. Add it as a <code>jsonb</code> column on the <code>rounds</code> table in Supabase.</span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{
            padding: "12px 20px", fontSize: 14, fontWeight: 600,
            background: "var(--paper)", color: "var(--ink)",
            border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
          }}
        >
          ← Edit recap
        </button>
        <button
          onClick={onSave}
          disabled={saving || saved}
          style={{
            flex: 1, padding: "12px 20px", fontSize: 14, fontWeight: 700,
            background: saved ? "var(--green)" : saving ? "var(--paper-alt)" : "var(--ink)",
            color: saved || saving ? (saved ? "white" : "var(--muted)") : "white",
            border: "1px solid transparent", borderRadius: 8,
            cursor: saving || saved ? "default" : "pointer",
          }}
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save recap →"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecapPage() {
  const [stage, setStage]   = useState<"input" | "analysis">("input");
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [roundId, setRoundId] = useState("");
  const [dials, setDials]   = useState<Dials>({ ...DEFAULT_DIALS });
  const [overall, setOverall] = useState("");
  const [favs, setFavs]     = useState("");
  const [wish, setWish]     = useState("");
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>(
    Object.fromEntries(DIAL_CLUBS.map(c => [c.key, ""]))
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const urlId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("roundId") ?? ""
      : "";
    const load = async () => {
      // Try fetching with recap column; fall back if the column doesn't exist yet
      let { data, error } = await supabase
        .from("rounds")
        .select("id, course_name, date, holes, holes_played, recap")
        .order("date", { ascending: false })
        .limit(200);
      if (error || !data) {
        const fallback = await supabase
          .from("rounds")
          .select("id, course_name, date, holes, holes_played")
          .order("date", { ascending: false })
          .limit(200);
        data = fallback.data as any;
      }
      if (data) {
        setRounds(data as RoundRow[]);
        const initial = urlId && data.find((r: any) => r.id === urlId) ? urlId : (data[0]?.id ?? "");
        setRoundId(initial);
      }
    };
    load();
  }, []);

  const round  = rounds.find(r => r.id === roundId) ?? null;

  // Pre-populate from saved recap whenever the selected round changes
  useEffect(() => {
    const saved = round?.recap;
    if (saved) {
      setDials({ ...DEFAULT_DIALS, ...saved.dials } as Dials);
      setOverall(saved.overall ?? "");
      setFavs(saved.favs ?? "");
      setWish(saved.wish ?? "");
      setGroupNotes({ ...Object.fromEntries(DIAL_CLUBS.map(c => [c.key, ""])), ...(saved.group_notes ?? {}) });
    } else if (round) {
      // No saved recap — reset to defaults
      setDials({ ...DEFAULT_DIALS });
      setOverall(""); setFavs(""); setWish("");
      setGroupNotes(Object.fromEntries(DIAL_CLUBS.map(c => [c.key, ""])));
    }
    setStage("input");
    setSaved(false);
  }, [roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const facts  = useMemo(() => round ? computeRoundFacts(round) : null, [round]);
  const analysis = useMemo(
    () => facts ? analyze(dials, groupNotes, overall, favs, wish, facts) : null,
    [facts, dials, groupNotes, overall, favs, wish],
  );

  function handleSubmit() {
    setStage("analysis");
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSave() {
    if (!round || !analysis) return;
    setSaving(true);
    setSaveError(null);
    const recapPayload: SavedRecap = {
      dials: dials as unknown as Record<string, number>,
      overall,
      favs,
      wish,
      group_notes: groupNotes,
    };
    const { error } = await supabase.from("rounds").update({ recap: recapPayload }).eq("id", roundId);
    setSaving(false);
    if (error) {
      console.error("Recap save error:", error);
      setSaveError(error.message);
    } else {
      setRounds(prev => prev.map(r => r.id === roundId ? { ...r, recap: recapPayload } : r));
      setSaved(true);
    }
  }

  return (
    <div className="recap-root">
      <style>{TOKENS}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px" }}>
        <div ref={topRef} />

        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 6 }}>
            Post-round
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 500, fontSize: 34, color: "var(--ink)", lineHeight: 1.1 }}>
            Recap
          </div>
        </div>

        <Stepper stage={stage} onBack={() => setStage("input")} />

        {stage === "input" && (
          <StageInput
            rounds={rounds}
            roundId={roundId}
            onRoundId={id => { setRoundId(id); setSaved(false); }}
            dials={dials}
            onDial={(k, v) => setDials(d => ({ ...d, [k]: v }))}
            overall={overall} onOverall={setOverall}
            favs={favs}       onFavs={setFavs}
            wish={wish}       onWish={setWish}
            groupNotes={groupNotes}
            onGroupNote={(k, v) => setGroupNotes(n => ({ ...n, [k]: v }))}
            onSubmit={handleSubmit}
          />
        )}

        {stage === "analysis" && analysis && (
          <StageAnalysis
            analysis={analysis}
            onBack={() => setStage("input")}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            saveError={saveError}
          />
        )}
      </div>
    </div>
  );
}
