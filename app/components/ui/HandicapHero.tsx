"use client";
import type { ReactNode } from "react";
import { Card, CardLabel } from "./Card";

export function HandicapHero({
  handicap,
  delta30d,
  spark,
}: {
  handicap: number;
  delta30d: number;
  spark?: ReactNode;
}) {
  return (
    <Card tone="green" padding={28} style={{ minHeight: 260, display: "flex", flexDirection: "column", boxShadow: "var(--shadow-hero)" }}>
      <CardLabel tone="green">USGA Handicap Index</CardLabel>

      <div className="tnum" style={{
        fontFamily: "var(--font-display)",
        fontStyle: "italic", fontWeight: 600,
        fontSize: "clamp(72px, 12vw, 124px)",
        lineHeight: 0.88, letterSpacing: -4,
        color: "var(--paper)",
        marginTop: 12,
      }}>{handicap.toFixed(1)}</div>

      <div style={{
        display: "inline-flex", alignSelf: "flex-start",
        marginTop: 12,
        background: "rgba(240,201,137,0.18)",
        color: "#f0c989",
        padding: "5px 12px", borderRadius: "var(--r-pill)",
        fontFamily: "var(--font-mono)",
        fontSize: 12, fontWeight: 700,
      }}>
        {delta30d < 0 ? "▼" : "▲"} {Math.abs(delta30d).toFixed(1)} · 30 days
      </div>

      <div style={{ marginTop: "auto", paddingTop: 18 }}>{spark}</div>
    </Card>
  );
}
