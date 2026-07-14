"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { topMiss, sgTone, sgColor, type Club, type Disp } from "./clubData";
import { HeatGrid } from "./HeatGrid";

type ApproachHole = {
  appr_distance: string;
  appr_accuracy: string;
  putts: number;
  score: number;
  par: number;
  roundIndex: number;
};

type RoundSummarySlim = { idx: number; date: string; courseName: string };

function ironGrade(delta: number): { letter: string; color: string; bg: string } {
  if (delta >= 2.0) return { letter: "A+", color: "#fff", bg: "#0f6e56" };
  if (delta >= 1.0) return { letter: "A",  color: "#fff", bg: "#27ae60" };
  if (delta >= 0)   return { letter: "B",  color: "#fff", bg: "#2980b9" };
  if (delta >= -1.0) return { letter: "C", color: "#333", bg: "#f5c842" };
  if (delta >= -2.0) return { letter: "D", color: "#fff", bg: "#e67e22" };
  return                    { letter: "F",  color: "#fff", bg: "#c0392b" };
}

const SCORING_CLUBS = ["4i","5i","6i","7i","8i","9i","PW","GW","SW","LW"];

const CLUB_META: Record<string, { loft: string; yards: number }> = {
  "4i": { loft: "21°", yards: 185 },
  "5i": { loft: "25°", yards: 175 },
  "6i": { loft: "28°", yards: 165 },
  "7i": { loft: "32°", yards: 155 },
  "8i": { loft: "36°", yards: 144 },
  "9i": { loft: "40°", yards: 132 },
  "PW": { loft: "45°", yards: 118 },
  "GW": { loft: "50°", yards: 102 },
  "SW": { loft: "54°", yards: 86  },
  "LW": { loft: "58°", yards: 68  },
};

function computeRows(holes: ApproachHole[]): Club[] {
  if (!holes.length) return [];
  const baseline = holes.reduce((s, h) => s + (h.score - h.par), 0) / holes.length;
  const result: Club[] = [];
  for (const club of SCORING_CLUBS) {
    const shots = holes.filter(h => h.appr_distance === club);
    if (shots.length < 1) continue;
    const n = shots.length;
    // only shots with accuracy logged contribute to dispersion
    const withAcc = shots.filter(h => h.appr_accuracy && h.appr_accuracy !== "");
    const na = withAcc.length;
    const counts = { on: 0, long: 0, short: 0, left: 0, right: 0 };
    for (const h of withAcc) {
      if      (h.appr_accuracy === "Hit")   counts.on++;
      else if (h.appr_accuracy === "Long")  counts.long++;
      else if (h.appr_accuracy === "Short") counts.short++;
      else if (h.appr_accuracy === "Left")  counts.left++;
      else if (h.appr_accuracy === "Right") counts.right++;
    }
    const disp: Disp = na > 0 ? {
      on:    Math.round(counts.on    / na * 100),
      long:  Math.round(counts.long  / na * 100),
      short: Math.round(counts.short / na * 100),
      left:  Math.round(counts.left  / na * 100),
      right: Math.round(counts.right / na * 100),
    } : { on: 0, long: 0, short: 0, left: 0, right: 0 };
    const girHoles = shots.filter(h => h.appr_accuracy === "Hit" && h.putts > 0);
    const avgPutts = girHoles.length > 0
      ? Math.round(girHoles.reduce((s, h) => s + h.putts, 0) / girHoles.length * 10) / 10
      : 0;
    const avgSTP = shots.reduce((s, h) => s + (h.score - h.par), 0) / n;
    const sg = Math.round((baseline - avgSTP) * 100) / 100;
    const meta = CLUB_META[club] ?? { loft: "", yards: 0 };
    result.push({ club, loft: meta.loft, yards: meta.yards, n, prox: avgPutts, sg, disp });
  }
  return result;
}

type Props = {
  holes: ApproachHole[];
  totalRounds: number;
  onShowFactors: (club: string) => void;
  roundSummaries?: RoundSummarySlim[];
};

export default function IronsWedges({ holes, totalRounds, onShowFactors, roundSummaries = [] }: Props) {
  const [range, setRange] = useState<"all" | "l20">("all");
  const [sel, setSel] = useState<{ club: string; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const l20Indexes = useMemo(() => {
    const indexes = [...new Set(holes.map(h => h.roundIndex))].sort((a, b) => b - a);
    return new Set(indexes.slice(0, 20));
  }, [holes]);

  const activeHoles = useMemo(
    () => range === "l20" ? holes.filter(h => l20Indexes.has(h.roundIndex)) : holes,
    [holes, range, l20Indexes]
  );

  const rows = useMemo(() => computeRows(activeHoles), [activeHoles]);

  // ── Per-club baseline hit rate across ALL rounds (used for grading) ──────────
  const baselineHitRate = useMemo(() => {
    const result: Record<string, number> = {};
    for (const club of SCORING_CLUBS) {
      const shots = holes.filter(h => h.appr_distance === club && h.appr_accuracy && h.appr_accuracy !== "");
      if (shots.length >= 3) {
        result[club] = shots.filter(h => h.appr_accuracy === "Hit").length / shots.length;
      }
    }
    return result;
  }, [holes]);

  // ── Round-by-round iron grade ─────────────────────────────────────────────────
  const roundIronData = useMemo(() => {
    const byRound: Record<number, ApproachHole[]> = {};
    for (const h of holes) {
      if (!byRound[h.roundIndex]) byRound[h.roundIndex] = [];
      byRound[h.roundIndex].push(h);
    }
    const rows2 = Object.entries(byRound).map(([idxStr, hs]) => {
      const idx = Number(idxStr);
      const summary = roundSummaries.find(s => s.idx === idx);
      const ironShots = hs.filter(h =>
        SCORING_CLUBS.includes(h.appr_distance) &&
        h.appr_accuracy && h.appr_accuracy !== "" &&
        baselineHitRate[h.appr_distance] != null
      );
      if (ironShots.length < 3) return null;
      const expected = ironShots.reduce((s, h) => s + (baselineHitRate[h.appr_distance] ?? 0), 0);
      const actual = ironShots.filter(h => h.appr_accuracy === "Hit").length;
      const delta = Math.round((actual - expected) * 10) / 10;
      return {
        idx,
        date: summary?.date ?? "",
        name: summary?.date ?? "",
        courseName: summary?.courseName ?? "",
        delta,
        actual,
        expected: Math.round(expected * 10) / 10,
        shots: ironShots.length,
        ...ironGrade(delta),
      };
    }).filter(Boolean).sort((a: any, b: any) => a.date > b.date ? 1 : -1) as any[];

    return rows2.map((r, i) => {
      const window = rows2.slice(Math.max(0, i - 4), i + 1);
      const roll = window.length ? Math.round(window.reduce((s: number, x: any) => s + x.delta, 0) / window.length * 10) / 10 : null;
      return { ...r, rollingAvg: roll };
    });
  }, [holes, roundSummaries, baselineHitRate]);

  const ironGradeRows = [
    { letter: "A+", desc: "2+ greens above your avg",     bg: "#0f6e56", color: "#fff" },
    { letter: "A",  desc: "1–2 greens above your avg",    bg: "#27ae60", color: "#fff" },
    { letter: "B",  desc: "0–1 greens above your avg",    bg: "#2980b9", color: "#fff" },
    { letter: "C",  desc: "0–1 greens below your avg",    bg: "#f5c842", color: "#333" },
    { letter: "D",  desc: "1–2 greens below your avg",    bg: "#e67e22", color: "#fff" },
    { letter: "F",  desc: "2+ greens below your avg",     bg: "#c0392b", color: "#fff" },
  ];

  const totalShots = rows.reduce((s, c) => s + c.n, 0);
  const wAvgGir = totalShots > 0
    ? Math.round(rows.reduce((s, c) => s + c.disp.on * c.n, 0) / totalShots)
    : 0;
  const best  = rows.length ? [...rows].sort((a, b) => b.sg - a.sg)[0] : null;
  const worst = rows.length ? [...rows].sort((a, b) => a.sg - b.sg)[0] : null;
  const maxGir = rows.length ? Math.max(...rows.map(c => c.disp.on)) : 1;

  useEffect(() => {
    if (!sel) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".iw-pop") || t.closest(".iw-row")) return;
      setSel(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sel]);

  useEffect(() => { setSel(null); }, [range]);

  const pickRow = (club: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (sel?.club === club) { setSel(null); return; }
    const row = e.currentTarget;
    setSel({ club, top: row.offsetTop + row.offsetHeight / 2 });
  };

  const selData = sel ? rows.find(c => c.club === sel.club) ?? null : null;

  if (!holes.length) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-mute)", fontStyle: "italic" }}>
        Loading round data…
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", fontFamily: "var(--font-ui)", color: "var(--ink)" }}>

      {/* Header + range toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: -0.5, margin: 0 }}>
            Approach accuracy by club
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-mute)", marginTop: 8, marginBottom: 0 }}>
            Greens hit, avg putts and strokes gained for every scoring club.{" "}
            <strong style={{ color: "var(--ink-soft)" }}>Click a club to see its shot pattern — click the grid to drill into factors.</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--paper-alt)", borderRadius: 12, padding: 4, flexShrink: 0 }}>
          {(["all", "l20"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: range === r ? "var(--ink)" : "transparent",
              color: range === r ? "var(--paper)" : "var(--ink-mute)",
              fontFamily: "var(--font-ui)",
            }}>
              {r === "all" ? `All rounds (${totalRounds})` : "Last 20"}
            </button>
          ))}
        </div>
      </div>

      {/* Rollup strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Bag avg GIR", val: `${wAvgGir}%` },
          { label: "Best club", val: best ? `${best.club} +${best.sg.toFixed(2)}` : "—" },
          { label: "Needs work", val: worst ? `${worst.club} ${worst.sg > 0 ? "+" : ""}${worst.sg.toFixed(2)}` : "—" },
          { label: "Total shots", val: String(totalShots) },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14,
            padding: "12px 16px", flex: "1 1 120px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>{s.label}</div>
            <div className="tnum" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-mute)", fontStyle: "italic" }}>
          Not enough approach shots logged yet — keep adding rounds with approach club data.
        </div>
      ) : (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: "6px 24px 10px" }}>
          {/* Column headers */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 6px", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ flex: "0 0 158px", ...COL_HDR }}>Club</div>
            <div className="tnum" style={{ flex: "0 0 70px", textAlign: "right", ...COL_HDR }}>Avg yds</div>
            <div className="tnum" style={{ flex: "0 0 60px", textAlign: "right", ...COL_HDR }}>Shots</div>
            <div style={{ flex: 1, ...COL_HDR }}>Greens hit</div>
            <div className="tnum" style={{ flex: "0 0 90px", textAlign: "right", ...COL_HDR }}>Putts/GIR</div>
            <div style={{ flex: "0 0 90px", textAlign: "center", ...COL_HDR }}>Miss</div>
            <div className="tnum" style={{ flex: "0 0 96px", textAlign: "right", ...COL_HDR }}>Approach SG</div>
          </div>

          {rows.map((c, i) => {
            const tone = sgTone(c.sg);
            const gir = c.disp.on;
            const hasAcc = Object.values(c.disp).some(v => v > 0);
            const [miss] = hasAcc ? topMiss(c.disp) : ["—", 0];
            const missBad = miss !== "On" && miss !== "—";
            const isSel = sel?.club === c.club;
            const barCol = tone === "good"
              ? "var(--green)"
              : tone === "bad"
              ? "linear-gradient(90deg,var(--accent),var(--accent-deep))"
              : "var(--ink-mute)";

            return (
              <div
                key={c.club}
                className="iw-row"
                onClick={(e) => pickRow(c.club, e)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "15px 0", cursor: "pointer",
                  borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line-soft)",
                  background: isSel ? "var(--paper-alt)" : "transparent",
                  boxShadow: isSel ? "inset 3px 0 0 var(--accent)" : "none",
                }}
              >
                <div style={{ flex: "0 0 158px", paddingLeft: isSel ? 10 : 0 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{c.club}</span>{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>{c.loft}</span>
                </div>
                <div className="tnum" style={{ flex: "0 0 70px", textAlign: "right", fontWeight: 600, color: "var(--ink-soft)" }}>{c.yards}</div>
                <div className="tnum" style={{ flex: "0 0 60px", textAlign: "right", color: "var(--ink-mute)" }}>{c.n}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--paper-alt)", overflow: "hidden" }}>
                    <div style={{ width: `${(gir / maxGir) * 100}%`, height: "100%", borderRadius: 999, background: barCol }} />
                  </div>
                  <span className="tnum" style={{
                    width: 40, textAlign: "right", fontWeight: 700,
                    color: tone === "good" ? "var(--green-deep)" : tone === "bad" ? "var(--accent-deep)" : "var(--ink-soft)",
                  }}>{gir}%</span>
                </div>
                <div className="tnum" style={{ flex: "0 0 90px", textAlign: "right", fontWeight: 600, color: "var(--ink-soft)" }}>
                  {c.prox > 0 ? c.prox.toFixed(1) : "—"}
                </div>
                <div style={{ flex: "0 0 90px", textAlign: "center" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase",
                    color: missBad ? "var(--accent-deep)" : "var(--green-deep)",
                    background: missBad ? "var(--accent-soft)" : "var(--green-soft)",
                  }}>{miss}</span>
                </div>
                <div className="tnum" style={{ flex: "0 0 96px", textAlign: "right", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: sgColor(c.sg) }}>
                  {c.sg > 0 ? "+" : ""}{c.sg.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Anchored popover */}
      {selData && sel && (
        <div className="iw-pop" style={{
          position: "absolute", right: 26, top: sel.top, transform: "translateY(-50%)",
          width: 286, background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 16, padding: "18px 20px",
          boxShadow: "0 30px 60px -22px rgba(19,24,33,0.5)", zIndex: 40,
        }}>
          <div style={{
            position: "absolute", left: -9, top: "50%", marginTop: -9,
            width: 16, height: 16, background: "var(--paper)",
            borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)",
            transform: "rotate(45deg)",
          }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>{selData.club}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", marginTop: 5 }}>
                {selData.loft} · {selData.yards}y · {selData.n} shots
              </div>
            </div>
            <div className="tnum" style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 600, color: sgColor(selData.sg) }}>
              {selData.disp.on}%
            </div>
          </div>

          {/* Clickable heat grid → Factor Correlations */}
          <div
            onClick={() => { onShowFactors(selData.club); setSel(null); }}
            title="Click to see factor correlations for this club"
            style={{ display: "flex", justifyContent: "center", margin: "4px 0 2px", cursor: "pointer", borderRadius: 10, transition: "opacity 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            <HeatGrid disp={selData.disp} size={150} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-mute)", textAlign: "center", marginBottom: 6 }}>
            ↑ long&nbsp;&nbsp;↓ short&nbsp;&nbsp;← left&nbsp;&nbsp;right →
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-mute)", textAlign: "center",
            letterSpacing: 0.5, padding: "6px 10px", background: "var(--paper-alt)", borderRadius: 8,
            cursor: "pointer",
          }}
            onClick={() => { onShowFactors(selData.club); setSel(null); }}
          >
            TAP GRID TO VIEW FACTOR CORRELATIONS →
          </div>
        </div>
      )}

      {/* ── Iron Grade by Round ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 40, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Iron Performance Grade by Round</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 18px" }}>
          Greens hit vs your historical average hit rate for each club, weighted by the clubs you used that round. C = hit exactly as many greens as your average. A+ = 2+ greens above your norm. Line = 5-round average.
        </p>

        {roundIronData.length < 2 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: 13 }}>Need more rounds with approach accuracy logged (at least 3 iron/wedge shots per round).</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={roundIronData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" height={36} tick={(props: any) => {
                const { x, y, payload } = props;
                const d: string = payload.value ?? "";
                const idx2 = roundIronData.findIndex((r: any) => r.name === d);
                const isYearStart = idx2 === 0 ||
                  (idx2 > 0 && d.slice(0, 4) !== (roundIronData[idx2 - 1]?.name ?? "").slice(0, 4));
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                      {d ? `${d.slice(5, 7)}/${d.slice(8)}` : ""}
                    </text>
                    {isYearStart && (
                      <text x={0} y={0} dy={22} textAnchor="middle" fill="#555" fontSize={8} fontWeight={700}>
                        {d.slice(0, 4)}
                      </text>
                    )}
                  </g>
                );
              }} />
              <YAxis tickFormatter={(v: number) => v >= 0 ? `+${v}` : `${v}`} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 2" />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const g = ironGrade(d.delta);
                  return (
                    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.date} · {d.courseName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ background: g.bg, color: g.color, borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 13 }}>{g.letter}</span>
                        <span style={{ color: d.delta >= 0 ? "var(--green)" : "var(--bad)", fontWeight: 700 }}>
                          {d.delta >= 0 ? "+" : ""}{d.delta} greens vs expected
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)" }}>{d.actual} hit / {d.expected} expected · {d.shots} shots logged</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="delta" name="Iron Grade" radius={[4, 4, 0, 0]}>
                {roundIronData.map((r: any, i: number) => (
                  <Cell key={i} fill={r.bg} fillOpacity={0.9} />
                ))}
              </Bar>
              <Line dataKey="rollingAvg" type="monotone" stroke="#f29450" strokeWidth={2.5} dot={false} name="5-rnd avg" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Grade legend */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
          {ironGradeRows.map(g => (
            <div key={g.letter} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ background: g.bg, color: g.color, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{g.letter}</span>
              <span style={{ fontSize: 10, color: "var(--muted-2)" }}>{g.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const COL_HDR = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1,
  textTransform: "uppercase" as const, color: "var(--ink-mute)", fontWeight: 700,
};
