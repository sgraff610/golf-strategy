"use client";
import type { CSSProperties } from "react";

type Tone = "default" | "mono" | "light";

export function Mark({
  size = 32,
  tone = "default",
  style,
}: {
  size?: number;
  tone?: Tone;
  style?: CSSProperties;
}) {
  if (size < 24 && tone === "default") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" style={style} aria-label="greenlight" role="img">
        <rect width="48" height="48" rx="11" fill="#f7f9fb"/>
        <circle cx="24" cy="19" r="11" fill="#16a34a"/>
        <circle cx="24" cy="38" r="3"  fill="#084634"/>
      </svg>
    );
  }

  if (tone === "mono") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" style={style} aria-label="greenlight" role="img">
        <g fill="currentColor">
          <circle cx="24" cy="20"   r="9"/>
          <circle cx="24" cy="32"   r="2.2"/>
          <circle cx="24" cy="37.5" r="1.4"/>
          <circle cx="24" cy="42.5" r="0.8"/>
        </g>
      </svg>
    );
  }

  if (tone === "light") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" style={style} aria-label="greenlight" role="img">
        <circle cx="24" cy="20" r="18" fill="#34d399" opacity="0.22"/>
        <circle cx="24" cy="20" r="13" fill="#34d399" opacity="0.38"/>
        <circle cx="24" cy="20" r="9"  fill="#4ade80"/>
        <ellipse cx="21" cy="17" rx="2.8" ry="2" fill="#d1fae5" opacity="0.85"/>
        <circle cx="24" cy="32"   r="2.2" fill="#ebdec6"/>
        <circle cx="24" cy="37.5" r="1.4" fill="#ebdec6"/>
        <circle cx="24" cy="42.5" r="0.8" fill="#ebdec6"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style} aria-label="greenlight" role="img">
      <rect width="48" height="48" rx="13" fill="#f7f9fb"/>
      <circle cx="24" cy="20" r="18" fill="#34d399" opacity="0.18"/>
      <circle cx="24" cy="20" r="13" fill="#34d399" opacity="0.32"/>
      <circle cx="24" cy="20" r="9"  fill="#16a34a"/>
      <ellipse cx="21" cy="17" rx="2.8" ry="2" fill="#bbf7d0" opacity="0.85"/>
      <circle cx="24" cy="32"   r="2.2" fill="#084634"/>
      <circle cx="24" cy="37.5" r="1.4" fill="#084634"/>
      <circle cx="24" cy="42.5" r="0.8" fill="#084634"/>
    </svg>
  );
}

export function Wordmark({
  size = 20,
  color = "#131821",
  style,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span style={{ lineHeight: 1, color, ...style }}>
      <span style={{
        fontFamily: "var(--font-lobster-two, 'Lobster Two', Georgia, serif)",
        fontWeight: 700,
        fontStyle: "italic",
        fontSize: size * 1.2,
        letterSpacing: 0,
        verticalAlign: "-0.12em",
        display: "inline-block",
        transform: "skewX(-7deg)",
      }}>G</span>
      <span style={{
        fontFamily: "var(--font-fraunces, Georgia, serif)",
        fontWeight: 600,
        fontStyle: "italic",
        fontSize: size,
        letterSpacing: -0.4,
      }}>reenlight</span>
    </span>
  );
}
