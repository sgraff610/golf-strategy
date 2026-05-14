"use client";
import { useState, useEffect } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const ROOT = {
  "--bg": "#eef1f4",
  "--paper": "#f7f9fb",
  "--paper-alt": "#e6ebf0",
  "--ink": "#131821",
  "--ink-soft": "#253041",
  "--ink-mute": "#5d6b7a",
  "--muted": "#5d6b7a",
  "--muted-2": "#8995a3",
  "--line": "#d7dde3",
  "--green": "#0f6e56",
  "--green-deep": "#084634",
  "--green-soft": "#d2e8df",
  "--accent": "#f29450",
  "--accent-deep": "#b85320",
  "--accent-soft": "#fde0c8",
  "--sand": "#c8a84b",
  "--flag": "#c94a2a",
  "--good": "#1e8449",
  "--font-display": "Georgia, 'Times New Roman', serif",
  "--font-ui": "system-ui, -apple-system, sans-serif",
  "--font-mono": "'Courier New', Courier, monospace",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
  minHeight: "100vh",
} as React.CSSProperties;

// ─── Sub-components ───────────────────────────────────────────────────────────
function Sparkline({ data, w, h, stroke, fill }: { data: number[]; w: number; h: number; stroke: string; fill: string }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map(v => pad + (1 - (v - min) / range) * (h - pad * 2));
  const linePts = xs.map((x, i) => `${x},${ys[i]}`).join(" L ");
  const fillPts = `M ${xs[0]},${ys[0]} L ${linePts.slice(2)} L ${xs[xs.length - 1]},${h} L ${xs[0]},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <path d={fillPts} fill={fill} />
      <path d={`M ${linePts}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const WX_ICONS: Record<string, string> = { sunny: "☀️", "partly-cloudy": "⛅", cloudy: "☁️", rainy: "🌧️", stormy: "⛈️", windy: "💨" };
function WxIcon({ kind, size }: { kind: string; size: number }) {
  return <span style={{ fontSize: size, lineHeight: 1, display: "block" }}>{WX_ICONS[kind] ?? "⛅"}</span>;
}

function ImpactBars({ data, width, height }: { data: Array<{ x: string; v: number; hi?: boolean }>; width: number; height: number }) {
  if (!data.length) return null;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.v)), 0.01);
  const rows = data.length;
  const barH = Math.max(14, Math.floor((height - (rows - 1) * 8) / rows));
  const labelW = 70;
  const barMaxW = width - labelW - 40;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const y = i * (barH + 8);
        const bw = Math.abs(d.v) / maxAbs * barMaxW;
        const col = d.hi ? "#f29450" : d.v > 0 ? "#c94a2a" : "#1e8449";
        const valStr = (d.v > 0 ? "+" : "") + d.v.toFixed(2);
        return (
          <g key={d.x}>
            <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end" fill="rgba(255,255,255,0.55)" fontSize={10}>{d.x}</text>
            <rect x={labelW} y={y} width={bw} height={barH} fill={col} rx={3} />
            <text x={labelW + bw + 5} y={y + barH / 2 + 4} fill={col} fontSize={10} fontWeight={700}>{valStr}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function computeHI(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1 : last20.length <= 8 ? 2 : last20.length <= 11 ? 3 : last20.length <= 14 ? 4 : last20.length <= 16 ? 5 : last20.length <= 18 ? 6 : last20.length === 19 ? 7 : 8;
  const hi = sorted.slice(0, count).reduce((s, d) => s + d, 0) / count;
  return Math.floor(hi * 10) / 10;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function issueDate(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
}

function issueNum(rounds: number): number {
  return Math.max(1, rounds);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [diffs, setDiffs] = useState<number[]>([]);
  const [lastRound, setLastRound] = useState<any>(null);
  const [lastCourse, setLastCourse] = useState<string>("");
  const [planPeek, setPlanPeek] = useState<Array<{ hole: number; par: number; club: string; aim: string; note: string }>>([]);
  const [leakData, setLeakData] = useState<Array<{ x: string; v: number; hi?: boolean }>>([]);
  const [leakTitle, setLeakTitle] = useState("—");
  const [leakImpact, setLeakImpact] = useState(0);
  const [leakCount, setLeakCount] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { supabase } = await import("@/lib/supabase");

      // Load rounds with full hole data
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id,course_id,course_name,date,holes_played,holes,score_differential,tee_box")
        .order("date", { ascending: true });

      if (!rounds?.length) { setLoading(false); return; }

      setTotalRounds(rounds.length);

      // Load course ratings/slopes for differential computation
      const courseIds = [...new Set(rounds.map((r: any) => r.course_id).filter(Boolean))];
      let courseMap: Record<string, { rating: number | null; slope: number | null; hole_count: number | null; name: string }> = {};
      if (courseIds.length) {
        const { data: cs } = await supabase.from("courses").select("id,rating,slope,hole_count,name").in("id", courseIds);
        (cs ?? []).forEach((c: any) => { courseMap[c.id] = { rating: c.rating, slope: c.slope, hole_count: c.hole_count, name: c.name }; });
      }

      // Compute differentials
      const allDiffs = rounds.map((r: any) => {
        if (r.score_differential != null) return r.holes_played <= 9 ? r.score_differential * 2 : r.score_differential;
        const ci = courseMap[r.course_id];
        if (!ci?.rating || !ci?.slope) return null;
        const scored = (r.holes ?? []).filter((h: any) => h.score && Number(h.score) > 0);
        if (!scored.length) return null;
        const ags = scored.reduce((s: number, h: any) => s + Math.min(Number(h.score) || 0, (h.par || 4) + 2), 0);
        const is9 = (r.holes_played ?? scored.length) <= 9;
        const is9C = (ci.hole_count ?? 18) <= 9;
        let rat = ci.rating;
        if (is9 && !is9C) rat /= 2; else if (!is9 && is9C) rat *= 2;
        return is9 ? (113 / ci.slope * (ags - rat)) * 2 : (ags - rat) * 113 / ci.slope;
      }).filter((d: any): d is number => d !== null);

      setDiffs(allDiffs);

      // Last completed round (has at least some scores)
      const completedRounds = [...rounds].reverse().find((r: any) =>
        (r.holes ?? []).some((h: any) => Number(h.score) > 0)
      );
      if (completedRounds) {
        setLastRound(completedRounds);
        setLastCourse(courseMap[completedRounds.course_id]?.name ?? completedRounds.course_name ?? "");
      }

      // Plan peek: most recent round where holes have aim data
      const planRound = [...rounds].reverse().find((r: any) =>
        (r.holes ?? []).some((h: any) => h.aim && h.aim.length)
      );
      if (planRound) {
        const peek = (planRound.holes ?? [])
          .filter((h: any) => h.aim)
          .slice(0, 4)
          .map((h: any) => ({
            hole: h.hole,
            par: h.par,
            club: h.plan_club || h.club || "—",
            aim: h.aim || "CF",
            note: h.note || "",
          }));
        setPlanPeek(peek);
      }

      // Biggest leak: compute score-to-par by category
      const allHoles: any[] = rounds.flatMap((r: any) => (r.holes ?? []).filter((h: any) => Number(h.score) > 0));
      if (allHoles.length > 10) {
        const baseline = allHoles.reduce((s: number, h: any) => s + (Number(h.score) - h.par), 0) / allHoles.length;

        const groups: Record<string, number[]> = {};
        const addSTP = (key: string, h: any) => {
          if (!groups[key]) groups[key] = [];
          groups[key].push(Number(h.score) - h.par);
        };

        allHoles.forEach((h: any) => {
          const par = h.par;
          addSTP(`Par ${par}`, h);
          if (par >= 4 && h.tee_accuracy) addSTP(`Drive ${h.tee_accuracy}`, h);
          if (h.appr_accuracy) addSTP(`Approach ${h.appr_accuracy}`, h);
        });

        const leaks = Object.entries(groups)
          .filter(([, vals]) => vals.length >= 5)
          .map(([key, vals]) => ({
            key,
            avg: vals.reduce((s, v) => s + v, 0) / vals.length,
            count: vals.length,
          }))
          .map(g => ({ ...g, impact: g.avg - baseline }))
          .sort((a, b) => b.impact - a.impact);

        if (leaks.length >= 2) {
          const worst = leaks[0];
          setLeakTitle(worst.key);
          setLeakImpact(worst.impact);
          setLeakCount(worst.count);
          // Build comparison bars
          const topLeaks = leaks.slice(0, 4);
          setLeakData(topLeaks.map((l, i) => ({ x: l.key, v: l.impact, hi: i === 0 })));
        }
      }

      setLoading(false);
    }
    load();
  }, []);

  const hi = computeHI(diffs);
  const last20 = diffs.slice(-20);
  const prev20 = diffs.slice(-40, -20);
  const trend30 = last20.length >= 4 && prev20.length >= 4
    ? (computeHI(prev20) ?? 0) - (hi ?? 0)
    : null;
  const sparkData = last20.map(d => -d); // invert so lower HI = up

  // Last round stats
  const lastHoles: any[] = lastRound?.holes ?? [];
  const scoredHoles = lastHoles.filter((h: any) => Number(h.score) > 0);
  const totalScore = scoredHoles.reduce((s: number, h: any) => s + Number(h.score), 0);
  const totalPar = scoredHoles.reduce((s: number, h: any) => s + (h.par || 4), 0);
  const fwyHit = scoredHoles.filter((h: any) => h.par >= 4 && h.tee_accuracy === "Hit").length;
  const fwyTotal = scoredHoles.filter((h: any) => h.par >= 4 && h.tee_accuracy).length;
  const totalPutts = scoredHoles.reduce((s: number, h: any) => s + (Number(h.putts) || 0), 0);
  const lastScoreToPar = totalScore - totalPar;

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();

  return (
    <div style={ROOT}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 32px 60px" }}>

        {/* ── Masthead ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, letterSpacing: 3, color: "var(--ink)" }}>
              GOLF STRATEGY
            </span>
            <span style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: 2.2, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
              VOL. I · ISSUE {issueNum(totalRounds)} · {today}
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            {[
              { label: "Plan", href: "/plan" },
              { label: "Courses", href: "/courses" },
              { label: "Coach", href: "/rounds/insights" },
              { label: "Clubhouse", href: "/clubhouse" },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500, letterSpacing: 0.5, cursor: "pointer" }}>
                {label}
              </a>
            ))}
            <a href="/rounds/play" style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", background: "var(--ink)", color: "var(--paper)", borderRadius: 999, letterSpacing: 0.4, cursor: "pointer" }}>
              + New round
            </a>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--ink)", marginBottom: 32 }} />

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 2 }}>
            LOADING YOUR SCORECARD…
          </div>
        ) : (
          <>
            {/* ── Cover hero ────────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 48, alignItems: "stretch", marginBottom: 40 }}>

              {/* Left: headline + lede */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.8, color: "var(--accent-deep)", textTransform: "uppercase" as const, display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                  The personal scoreboard · spring season
                </div>

                <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(72px, 9vw, 140px)", lineHeight: 0.92, letterSpacing: -4, margin: "0 0 28px", display: "flex", flexDirection: "column" as const }}>
                  <span style={{ color: "var(--ink)" }}>Today is for</span>
                  <em style={{
                    fontStyle: "italic", fontWeight: 500,
                    background: "linear-gradient(115deg, var(--green-deep) 0%, var(--green) 50%, var(--accent-deep) 100%)",
                    WebkitBackgroundClip: "text", backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>shaving</em>
                  <span style={{ color: "var(--ink)" }}>strokes.</span>
                </h1>

                <p style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18, lineHeight: 1.5, color: "var(--ink-soft)", maxWidth: 520, marginBottom: 24 }}>
                  {hi != null
                    ? `Your handicap is ${hi.toFixed(1)}${trend30 != null && trend30 > 0 ? `, down ${trend30.toFixed(1)} over the last 20 rounds` : ""}. Open a plan, sharpen your strategy, take it to the first tee.`
                    : "Track your rounds to unlock your personal strategy. Every hole tells a story — start writing yours."}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)", letterSpacing: 1.6, marginBottom: 24 }}>
                  <span style={{ fontWeight: 600 }}>STRATEGY BY</span>
                  <span style={{ color: "var(--ink)", fontWeight: 700, fontFamily: "var(--font-ui)", letterSpacing: 0.3, fontSize: 12 }}>Coach Vance</span>
                  <span style={{ color: "var(--line)" }}>·</span>
                  <span style={{ fontWeight: 600 }}>READ</span>
                  <span style={{ color: "var(--ink)", fontWeight: 700, fontFamily: "var(--font-ui)", letterSpacing: 0.3, fontSize: 12 }}>4 min</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                  <a href="/plan" style={{ background: "var(--ink)", color: "var(--paper)", padding: "14px 24px", borderRadius: 12, fontSize: 14, fontWeight: 600, letterSpacing: 0.2, cursor: "pointer" }}>
                    Open today's plan →
                  </a>
                  <a href="/rounds/insights" style={{ background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", padding: "14px 24px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Browse insights
                  </a>
                </div>
              </div>

              {/* Right: handicap hero card */}
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <div style={{ width: "100%", borderRadius: 24, overflow: "hidden", background: "var(--ink)", position: "relative", minHeight: 440, boxShadow: "0 24px 48px -24px rgba(8,70,52,0.45)" }}>
                  {/* SVG golf course illustration */}
                  <svg viewBox="0 0 300 280" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
                    <defs>
                      <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1a4530" />
                        <stop offset="100%" stopColor="#0a2418" />
                      </linearGradient>
                      <linearGradient id="gfairway" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3a7a52" />
                        <stop offset="100%" stopColor="#1a4530" />
                      </linearGradient>
                    </defs>
                    <rect width="300" height="280" fill="url(#gsky)" />
                    <path d="M 0 140 Q 80 90 160 130 T 300 110 L 300 280 L 0 280 Z" fill="#1a4530" opacity="0.65" />
                    <path d="M 0 175 Q 100 155 200 168 T 300 162 L 300 280 L 0 280 Z" fill="url(#gfairway)" />
                    <path d="M 80 280 Q 150 210 220 165 T 285 120" stroke="#a8d99a" strokeWidth="3" fill="none" opacity="0.45" strokeLinecap="round" />
                    <g transform="translate(230, 110)">
                      <line x1="0" y1="0" x2="0" y2="34" stroke="#fff" strokeWidth="1.5" />
                      <path d="M 0 0 L 16 5 L 10 9 L 16 14 L 0 16 Z" fill="#f29450" />
                      <circle cx="0" cy="36" r="2" fill="#fff" opacity="0.6" />
                    </g>
                    <circle cx="248" cy="42" r="22" fill="#f29450" opacity="0.18" />
                    <circle cx="248" cy="42" r="11" fill="#f5b478" opacity="0.7" />
                  </svg>

                  {/* Stat overlay */}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 30px", background: "linear-gradient(180deg, transparent 0%, rgba(8,36,24,0.85) 50%, rgba(8,36,24,0.97) 100%)", color: "var(--paper)" }}>
                    <div style={{ fontSize: 10, letterSpacing: 2.4, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>HANDICAP INDEX</div>
                    <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, fontSize: "clamp(72px, 10vw, 110px)", lineHeight: 0.9, letterSpacing: -4, marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>
                      {hi != null ? hi.toFixed(1) : "—"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.18)" }}>
                      <span style={{ color: "#aee0c4", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                        {trend30 != null && trend30 > 0 ? `▼ ${trend30.toFixed(1)} in 20 rounds` : trend30 != null && trend30 < 0 ? `▲ ${Math.abs(trend30).toFixed(1)} in 20 rounds` : `${totalRounds} rounds played`}
                      </span>
                      {sparkData.length >= 4 && (
                        <Sparkline data={sparkData.slice(-12)} w={90} h={26} stroke="#f29450" fill="rgba(242,148,80,0.18)" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--ink)", marginBottom: 0 }} />

            {/* ── Pull quote ────────────────────────────────────────────────── */}
            <div style={{ padding: "40px 0 36px", maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: 2.4, fontWeight: 600, display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <span style={{ background: "var(--ink)", color: "var(--paper)", padding: "4px 9px", borderRadius: 4, fontSize: 10, letterSpacing: 1.4 }}>01</span>
                FROM THE COACH'S DESK
              </div>
              <blockquote style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.08, letterSpacing: -1, color: "var(--ink)", margin: 0, maxWidth: 1020 }}>
                {leakImpact > 0.5 ? (
                  <>
                    <em>"{leakTitle} is bleeding you.</em>
                    <br />
                    You're +{leakImpact.toFixed(2)} strokes above baseline in {leakCount} holes. Find the pattern.{" "}
                    <em>Drill into it from the Coach page."</em>
                  </>
                ) : (
                  <>
                    <em>"Consistency is your edge.</em>
                    <br />
                    Track every hole, every club, every miss. The data will show you exactly where your round lives or dies.{" "}
                    <em>Start with your next tee shot."</em>
                  </>
                )}
              </blockquote>
              <div style={{ marginTop: 20, display: "flex", alignItems: "baseline", gap: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4, fontFamily: "var(--font-mono)", color: "var(--accent-deep)" }}>— COACH VANCE</span>
                <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>PGA Tour Pro · 14 yrs teaching</span>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--ink)", marginBottom: 0 }} />

            {/* ── Features grid ─────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28, marginBottom: 20 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "var(--ink-mute)" }}>INSIDE THIS WEEK</span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gridTemplateRows: "auto auto", gap: 16 }}>

              {/* Feature 1 — Pre-round plan (tall, col 1) */}
              <a href="/plan" style={{
                gridColumn: "1", gridRow: "1 / span 2",
                background: "linear-gradient(160deg, #0c4f3a 0%, #084634 60%, #0a614a 100%)",
                color: "var(--paper)",
                padding: "32px 32px 28px", borderRadius: 24,
                position: "relative", overflow: "hidden",
                display: "flex", flexDirection: "column",
                minHeight: 500, cursor: "pointer",
                textDecoration: "none",
              }}>
                <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, background: "radial-gradient(circle, rgba(242,148,80,0.4) 0%, transparent 65%)", pointerEvents: "none" }} />
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.4, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>FEATURE · PRE-ROUND PLAN</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 38, lineHeight: 1.05, letterSpacing: -0.8, color: "var(--paper)", margin: "0 0 14px" }}>
                  {planPeek.length > 0 ? <>Your strategy<br /><em style={{ color: "var(--accent)" }}>is ready.</em></> : <>Build your plan<br /><em style={{ color: "var(--accent)" }}>for today.</em></>}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.72)", margin: "0 0 4px" }}>
                  {planPeek.length > 0
                    ? `${planPeek.length} hole-by-hole adjustments from your strategy engine. Club, aim, and the note that matters most.`
                    : "Answer 4 questions. Get a personalised hole-by-hole strategy with club selection, aim points, and your biggest risk areas."}
                </p>

                {planPeek.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20 }}>
                    {planPeek.map(h => (
                      <div key={h.hole} style={{ background: "rgba(255,255,255,0.08)", padding: "10px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.88)" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontStyle: "italic", fontSize: 18, color: "var(--accent)", width: 24 }}>{h.hole}</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, width: 40 }}>Par {h.par}</span>
                        <span style={{ background: "var(--paper)", color: "var(--green-deep)", padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{h.club}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>aim {h.aim}</span>
                        {h.note && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginLeft: "auto", fontStyle: "italic", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {h.note}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, borderBottom: "1px solid currentColor", paddingBottom: 1 }}>
                    {planPeek.length > 0 ? "Open the full plan →" : "Build your plan →"}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.4, letterSpacing: 1.4 }}>P. 12</span>
                </div>
              </a>

              {/* Feature 2+3 — stacked col 2 */}
              <div style={{ gridColumn: "2", gridRow: "1 / span 2", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Last tee played */}
                <a href="/courses" style={{
                  flex: 1, background: "var(--paper)", border: "1px solid var(--line)",
                  borderRadius: 24, padding: "24px 26px",
                  display: "flex", flexDirection: "column", cursor: "pointer",
                  textDecoration: "none", color: "inherit",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.4, color: "var(--ink-mute)", marginBottom: 14 }}>NEXT TEE</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, lineHeight: 1.1, letterSpacing: -0.4, color: "var(--ink)", margin: 0 }}>
                    {lastCourse || "No course yet"}
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 8, lineHeight: 1.45 }}>
                    Plan a round to see your next tee time
                  </div>

                  {/* Mock weather forecast strip */}
                  <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
                    {[
                      { day: "MON", icon: "partly-cloudy", hi: 72, isTee: false },
                      { day: "TUE", icon: "cloudy", hi: 68, isTee: false },
                      { day: "WED", icon: "sunny", hi: 75, isTee: true },
                      { day: "THU", icon: "partly-cloudy", hi: 71, isTee: false },
                      { day: "FRI", icon: "rainy", hi: 64, isTee: false },
                    ].map(d => (
                      <div key={d.day} style={{
                        flex: 1, padding: "10px 4px", borderRadius: 10,
                        textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center",
                        background: d.isTee ? "var(--accent)" : "var(--paper-alt)",
                        border: d.isTee ? "1px solid var(--accent-deep)" : "1px solid var(--line)",
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: d.isTee ? "var(--ink)" : "var(--ink-mute)" }}>{d.day}</div>
                        <div style={{ margin: "3px 0" }}><WxIcon kind={d.icon} size={16} /></div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{d.hi}°</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, borderBottom: "1px solid currentColor", paddingBottom: 1, color: "var(--ink)" }}>Course detail →</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", opacity: 0.5, letterSpacing: 1.4 }}>P. 04</span>
                  </div>
                </a>

                {/* Last round recap */}
                <a href="/clubhouse" style={{
                  flex: 1, background: "var(--paper)", border: "1px solid var(--line)",
                  borderRadius: 24, padding: "24px 26px",
                  display: "flex", flexDirection: "column", cursor: "pointer",
                  textDecoration: "none", color: "inherit",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.4, color: "var(--ink-mute)", marginBottom: 14 }}>
                    LAST RECAP{lastRound ? ` · ${fmtDate(lastRound.date).toUpperCase()}` : ""}
                  </div>
                  {lastRound ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, lineHeight: 1.1, letterSpacing: -0.4, color: "var(--ink)", margin: 0 }}>
                            {totalScore} at {lastCourse || lastRound.course_name}
                          </h3>
                          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6, lineHeight: 1.45 }}>
                            {lastScoreToPar > 0 ? `+${lastScoreToPar}` : lastScoreToPar === 0 ? "E" : lastScoreToPar} to par
                            {fwyTotal > 0 ? ` · ${fwyHit}/${fwyTotal} fwy` : ""}
                            {totalPutts > 0 ? ` · ${totalPutts} putts` : ""}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 500, fontSize: 14, lineHeight: 1.4, color: "var(--ink-soft)", margin: "16px 0 0", paddingLeft: 12, borderLeft: "3px solid var(--accent)" }}>
                        "Every round is a lesson. Open your recap to find yours."
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 14, color: "var(--ink-mute)", margin: 0 }}>No completed rounds yet. Play your first round to see a recap here.</p>
                  )}
                  <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, borderBottom: "1px solid currentColor", paddingBottom: 1, color: "var(--ink)" }}>Read recap →</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", opacity: 0.5, letterSpacing: 1.4 }}>P. 23</span>
                  </div>
                </a>
              </div>

              {/* Feature 4 — Biggest leak (dark, col 3 top) */}
              <a href="/rounds/insights" style={{
                gridColumn: "3", gridRow: "1",
                background: "var(--ink)", color: "var(--paper)",
                padding: "24px 26px", borderRadius: 24,
                display: "flex", flexDirection: "column", cursor: "pointer",
                textDecoration: "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.4, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>FROM THE COACH · BIGGEST LEAK</div>
                <h3 style={{ margin: "0 0 4px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, fontSize: 64, color: "var(--accent)", lineHeight: 1, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
                    {leakImpact > 0 ? `+${leakImpact.toFixed(2)}` : leakData.length > 0 ? "—" : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500, marginLeft: 8 }}>strokes/round</span>
                </h3>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--paper)", marginTop: 4, marginBottom: 16 }}>
                  {leakTitle}
                </div>
                {leakData.length > 0 && (
                  <ImpactBars data={leakData} width={220} height={80} />
                )}
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, marginTop: 12 }}>
                  {leakCount > 0 ? `${leakCount} holes analyzed. Open the Coach page to drill in.` : "Play more rounds to unlock your biggest leak."}
                </p>
                <div style={{ marginTop: "auto", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, borderBottom: "1px solid currentColor", paddingBottom: 1 }}>Drill into it →</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.4, letterSpacing: 1.4 }}>P. 18</span>
                </div>
              </a>

              {/* Feature 5 — Trend sparkline (accent, col 3 bottom) */}
              <a href="/clubhouse" style={{
                gridColumn: "3", gridRow: "2",
                background: "var(--accent-soft)", border: "1px solid var(--accent)",
                padding: "24px 26px", borderRadius: 24,
                display: "flex", flexDirection: "column", cursor: "pointer",
                textDecoration: "none", color: "inherit",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.4, color: "var(--ink-mute)", marginBottom: 14 }}>THE TREND · LAST {Math.min(20, diffs.length)} DIFFERENTIALS</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 18px" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, fontSize: 52, color: "var(--green-deep)", lineHeight: 1, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
                      {trend30 != null ? (trend30 > 0 ? `−${trend30.toFixed(1)}` : `+${Math.abs(trend30).toFixed(1)}`) : (hi != null ? hi.toFixed(1) : "—")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-mute)", fontWeight: 500, marginTop: 4 }}>
                      {trend30 != null ? "vs 20 rounds ago" : "handicap index"}
                    </div>
                  </div>
                </div>
                {sparkData.length >= 4 && (
                  <Sparkline data={sparkData} w={220} h={56} stroke="var(--green-deep)" fill="rgba(15,110,86,0.12)" />
                )}
                <div style={{ marginTop: "auto", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, borderBottom: "1px solid currentColor", paddingBottom: 1, color: "var(--ink)" }}>Clubhouse →</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", opacity: 0.5, letterSpacing: 1.4 }}>P. 31</span>
                </div>
              </a>

            </div>

            <div style={{ height: 1, background: "var(--line)", margin: "36px 0 24px" }} />

            {/* ── Colophon ──────────────────────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--ink-mute)", letterSpacing: 0.4 }}>
              <span>An editorial reading of your last {totalRounds} rounds.</span>
              <div style={{ display: "flex", gap: 24 }}>
                {[
                  { label: "About", href: "/clubhouse" },
                  { label: "Add round", href: "/rounds/play" },
                  { label: "Coach", href: "/rounds/insights" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} style={{ color: "var(--ink-mute)", fontSize: 12, cursor: "pointer" }}>{label}</a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
