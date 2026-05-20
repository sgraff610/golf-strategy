"use client";
import type { CSSProperties, ReactNode } from "react";

type Tone = "paper" | "ink" | "accent" | "green";

const toneStyles: Record<Tone, CSSProperties> = {
  paper:  { background: "var(--paper)",       color: "var(--ink)",   border: "1px solid var(--line)" },
  ink:    { background: "var(--ink)",         color: "var(--paper)", border: "1px solid var(--ink)" },
  accent: { background: "var(--accent-soft)", color: "var(--ink)",   border: "1px solid var(--accent)" },
  green:  { background: "linear-gradient(160deg,#0c4f3a 0%,#084634 100%)", color: "var(--paper)", border: "1px solid var(--green-deep)" },
};

export function Card({
  tone = "paper",
  padding,
  style,
  children,
}: {
  tone?: Tone;
  padding?: number | string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: "var(--r-card)",
        padding: padding ?? "var(--pad-card)",
        ...toneStyles[tone],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children, tone = "paper" }: { children: ReactNode; tone?: Tone }) {
  const color =
    tone === "ink"    ? "var(--accent)"      :
    tone === "accent" ? "var(--accent-deep)" :
    tone === "green"  ? "var(--accent)"      :
                        "var(--ink-mute)";
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: "var(--t-label)",
      letterSpacing: 1.8,
      fontWeight: 600,
      color,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, size = 3, italic = false }: { children: ReactNode; size?: 2 | 3; italic?: boolean }) {
  const px = size === 2 ? "var(--t-title-2)" : "var(--t-title-3)";
  return (
    <div style={{
      fontFamily: "var(--font-display)",
      fontWeight: 600,
      fontStyle: italic ? "italic" : "normal",
      fontSize: px,
      lineHeight: 1.1,
      letterSpacing: -0.4,
      marginTop: 8,
    }}>
      {children}
    </div>
  );
}
