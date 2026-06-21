"use client";
import { useState, useRef, useEffect, useMemo } from "react";
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
    const shots = holes.filter(h => h.appr_distance === club && h.appr_accuracy && h.appr_accuracy !== "");
    if (shots.length < 3) continue;
    const n = shots.length;
    const counts = { on: 0, long: 0, short: 0, left: 0, right: 0 };
    for (const h of shots) {
      if      (h.appr_accuracy === "Hit")   counts.on++;
      else if (h.appr_accuracy === "Long")  counts.long++;
      else if (h.appr_accuracy === "Short") counts.short++;
      else if (h.appr_accuracy === "Left")  counts.left++;
      else if (h.appr_accuracy === "Right") counts.right++;
    }
    const disp: Disp = {
      on:    Math.round(counts.on    / n * 100),
      long:  Math.round(counts.long  / n * 100),
      short: Math.round(counts.short / n * 100),
      left:  Math.round(counts.left  / n * 100),
      right: Math.round(counts.right / n * 100),
    };
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
};

export default function IronsWedges({ holes, totalRounds, onShowFactors }: Props) {
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
            const [miss] = topMiss(c.disp);
            const missBad = miss !== "On";
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
    </div>
  );
}

const COL_HDR = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1,
  textTransform: "uppercase" as const, color: "var(--ink-mute)", fontWeight: 700,
};
