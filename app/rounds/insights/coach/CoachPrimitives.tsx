"use client";
import React from "react";
import type { Bar, Goal, Fix } from "./leaks";

export function Bars({ data, height = 90 }: { data: Bar[]; height?: number }) {
  const max = Math.max(...data.map(d => Math.abs(d.v))) * 1.12 || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height }}>
      {data.map((d, i) => {
        const h = Math.max(6, (Math.abs(d.v) / max) * (height - 34));
        const neg = d.v < 0;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className="tnum" style={{
              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
              color: d.hi ? "var(--accent-deep)" : neg ? "var(--green)" : "var(--ink-mute)",
            }}>
              {d.v > 0 ? "+" : ""}{d.v.toFixed(2)}
            </div>
            <div style={{
              width: "100%", height: h, borderRadius: 5,
              background: d.hi
                ? "linear-gradient(180deg,var(--accent) 0%,var(--accent-deep) 100%)"
                : neg ? "var(--green-soft)" : "var(--line)",
            }} />
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-mute)", textAlign: "center" }}>{d.x}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CatTag({ cat }: { cat: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.4, fontWeight: 600,
      textTransform: "uppercase", color: "var(--ink-mute)",
    }}>{cat}</span>
  );
}

export function ImpactPill({ v }: { v: number }) {
  return (
    <span className="tnum" style={{
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18,
      color: "var(--accent-deep)", lineHeight: 1,
    }}>
      +{v.toFixed(2)}
      <span style={{
        fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
        fontWeight: 600, marginLeft: 3,
      }}>/rd</span>
    </span>
  );
}

export function ProjPill({ v }: { v: number }) {
  return (
    <span className="tnum" style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "var(--green-soft)", color: "var(--green-deep)",
      borderRadius: 999, padding: "3px 9px",
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
    }}>
      ▼ −{v.toFixed(1)} / rd
    </span>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--accent)" }} />
    </div>
  );
}

export function GoalOption({
  kind, goal, active, onPick,
}: {
  kind: "frequency" | "impact";
  goal: Goal;
  active: boolean;
  onPick: () => void;
}) {
  const isFreq = kind === "frequency";
  const fmtV = (v: number) => goal.unit === "%" ? `${Math.round(v)}%` : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
  return (
    <button onClick={onPick} style={{
      flex: 1, textAlign: "left", cursor: "pointer",
      background: active ? "var(--ink)" : "var(--paper)",
      color: active ? "var(--paper)" : "var(--ink)",
      border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
      borderRadius: 14, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
      fontFamily: "var(--font-ui)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.4, fontWeight: 600,
          textTransform: "uppercase", color: active ? "var(--accent)" : "var(--ink-mute)",
        }}>
          {isFreq ? "Reduce frequency" : "Reduce impact"}
        </span>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
          background: active ? "var(--accent)" : "transparent",
          display: "grid", placeItems: "center",
          fontSize: 11, color: "var(--ink)", fontWeight: 700,
          flexShrink: 0,
        } as React.CSSProperties}>
          {active ? "✓" : ""}
        </span>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 500,
        color: active ? "#cfd6de" : "var(--ink-soft)", lineHeight: 1.35,
      }}>{goal.note}</div>
      <div className="tnum" style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
          color: active ? "var(--paper)" : "var(--ink-mute)",
        }}>{fmtV(goal.current)}</span>
        <span style={{ color: active ? "var(--accent)" : "var(--ink-mute)", fontSize: 14 }}>→</span>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
          color: active ? "var(--accent)" : "var(--green)",
        }}>{fmtV(goal.target)}</span>
      </div>
      <div style={{
        fontSize: 10, color: active ? "#8a93a0" : "var(--ink-mute)",
        fontFamily: "var(--font-mono)", letterSpacing: 0.3,
      }}>{goal.metric}</div>
    </button>
  );
}

export function FixCard({ fix, picked, onToggle }: { fix: Fix; picked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: "100%", textAlign: "left", cursor: "pointer",
      background: picked ? "var(--green-soft)" : "var(--paper)",
      border: `1.5px solid ${picked ? "var(--green)" : "var(--line)"}`,
      borderRadius: 14, padding: "14px 16px",
      display: "flex", gap: 12, alignItems: "flex-start",
      fontFamily: "var(--font-ui)",
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 2,
        border: `1.5px solid ${picked ? "var(--green)" : "var(--line)"}`,
        background: picked ? "var(--green)" : "transparent",
        display: "grid", placeItems: "center",
        fontSize: 12, color: "#fff", fontWeight: 700,
      } as React.CSSProperties}>{picked ? "✓" : ""}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
            textTransform: "uppercase", color: "var(--ink-mute)",
            background: "var(--paper-alt)", padding: "2px 7px", borderRadius: 999,
          }}>{fix.tag}</span>
          {fix.recommended && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
              textTransform: "uppercase", color: "var(--accent-deep)",
              background: "var(--accent-soft)", padding: "2px 7px", borderRadius: 999,
            }}>★ Best fit</span>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 3 }}>{fix.title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4, marginBottom: 8 }}>{fix.body}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ProjPill v={fix.proj} />
          <span style={{ fontSize: 11, color: "var(--ink-mute)", lineHeight: 1.4, flex: 1, minWidth: 180 }}>{fix.stat}</span>
        </div>
      </div>
    </button>
  );
}
