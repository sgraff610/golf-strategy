"use client";
import type { CSSProperties } from "react";

export function Skeleton({ w, h, radius = 6, style }: { w?: number | string; h?: number | string; radius?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: w ?? "100%",
        height: h ?? 12,
        borderRadius: radius,
        background: "linear-gradient(90deg,#e3e8ee 0%,#eef2f6 50%,#e3e8ee 100%)",
        backgroundSize: "200% 100%",
        animation: "gl-shimmer 1.6s linear infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonStyles() {
  return (
    <style>{`@keyframes gl-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
  );
}
