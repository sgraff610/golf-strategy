"use client";
import { useRouter } from "next/navigation";

export default function GrintAddScore() {
  const router = useRouter();
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "10px 16px", background: "#0f6e56", color: "#fff",
        display: "flex", alignItems: "center", gap: 14, flexShrink: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "#fff", fontSize: 14, cursor: "pointer", padding: 0 }}
        >
          ← Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>TheGrint — Add Score</span>
      </div>
      <iframe
        src="https://thegrint.com/score/add_full_score/"
        style={{ flex: 1, border: "none", width: "100%" }}
        title="TheGrint Add Score"
      />
    </div>
  );
}
