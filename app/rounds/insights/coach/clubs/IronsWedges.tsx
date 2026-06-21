"use client";
import { useState, useRef, useEffect } from "react";
import { CLUBS_ALL, CLUBS_L20, topMiss, sgTone, sgColor } from "./clubData";
import { HeatGrid } from "./HeatGrid";

const TOTAL_ROUNDS = 34;

export default function IronsWedges() {
  const [range, setRange] = useState<"all" | "l20">("all");
  const [sel, setSel] = useState<{ club: string; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const rows = range === "all" ? CLUBS_ALL : CLUBS_L20;
  const totalShots = rows.reduce((s, c) => s + c.n, 0);
  const wAvgGir = Math.round(rows.reduce((s, c) => s + c.disp.on * c.n, 0) / totalShots);
  const best  = [...rows].sort((a, b) => b.sg - a.sg)[0];
  const worst = [...rows].sort((a, b) => a.sg - b.sg)[0];
  const maxGir = Math.max(...rows.map(c => c.disp.on));

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

  return (
    <div ref={wrapRef} style={{ position: "relative", fontFamily: "var(--font-ui)", color: "var(--ink)" }}>

      {/* Header + range toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: -0.5, margin: 0 }}>
            Approach accuracy by club
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-mute)", marginTop: 8, marginBottom: 0 }}>
            Greens hit, proximity and strokes gained for every scoring club.{" "}
            <strong style={{ color: "var(--ink-soft)" }}>Click a club to see its shot pattern.</strong>
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
              {r === "all" ? `All rounds (${TOTAL_ROUNDS})` : "Last 20"}
            </button>
          ))}
        </div>
      </div>

      {/* Rollup strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Bag avg GIR", val: `${wAvgGir}%` },
          { label: "Best club", val: `${best.club} +${best.sg.toFixed(2)}` },
          { label: "Needs work", val: `${worst.club} ${worst.sg.toFixed(2)}` },
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

      {/* Ledger */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: "6px 24px 10px" }}>
        {/* Column headers */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 6px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ flex: "0 0 158px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Club</div>
          <div className="tnum" style={{ flex: "0 0 70px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Avg yds</div>
          <div className="tnum" style={{ flex: "0 0 60px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Shots</div>
          <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Greens hit</div>
          <div className="tnum" style={{ flex: "0 0 90px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Proximity</div>
          <div style={{ flex: "0 0 90px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Miss</div>
          <div className="tnum" style={{ flex: "0 0 96px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700 }}>Approach SG</div>
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
            : "var(--line)";

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
              <div className="tnum" style={{ flex: "0 0 90px", textAlign: "right", fontWeight: 600, color: "var(--ink-soft)" }}>{c.prox} ft</div>
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

      {/* Anchored popover — centers on the selected row */}
      {selData && sel && (
        <div className="iw-pop" style={{
          position: "absolute", right: 26, top: sel.top, transform: "translateY(-50%)",
          width: 286, background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 16, padding: "18px 20px",
          boxShadow: "0 30px 60px -22px rgba(19,24,33,0.5)", zIndex: 40,
        }}>
          {/* Caret aligned to row center */}
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
          <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 6px" }}>
            <HeatGrid disp={selData.disp} size={150} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-mute)", textAlign: "center" }}>
            ↑ long&nbsp;&nbsp;↓ short&nbsp;&nbsp;← left&nbsp;&nbsp;right →
          </div>
        </div>
      )}
    </div>
  );
}
