// app/plan/FormRanger.tsx
"use client";
import type { PlayerForm, ClubKey } from "@/lib/planTypes";
import { FORM_CLUBS } from "./questions";

type Props = {
  values: PlayerForm;
  setValues: (v: PlayerForm) => void;
};

export function FormRanger({ values, setValues }: Props) {
  const update = (k: ClubKey, v: number) =>
    setValues({ ...values, [k]: Math.max(0, Math.min(100, v)) });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {FORM_CLUBS.map((c) => {
        const v = values[c.k] ?? c.default;
        const heat = v >= 75 ? "hot" : v >= 55 ? "ok" : v >= 35 ? "mid" : "cold";
        const heatLabel = { hot: "🔥 hot", ok: "✓ solid", mid: "~ neutral", cold: "❄ cold" }[heat];
        const heatColor = {
          hot: "var(--flag)",
          ok: "var(--green)",
          mid: "var(--muted)",
          cold: "#2e6db4",
        }[heat];

        return (
          <div
            key={c.k}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 100px",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.k}</div>
            <div style={{ position: "relative", height: 38 }}>
              <div
                style={{
                  position: "absolute", top: 16, left: 0, right: 0,
                  height: 6, borderRadius: 3,
                  background: "var(--paper-alt)", border: "1px solid var(--line)",
                }}
              />
              <div
                style={{
                  position: "absolute", top: 16, left: 0,
                  height: 6, borderRadius: 3, width: `${v}%`,
                  background:
                    "linear-gradient(90deg, var(--accent) 0%, var(--sand) 40%, var(--green) 80%)",
                  border: "1px solid var(--line)",
                }}
              />
              <input
                type="range" min={0} max={100} value={v}
                onChange={(e) => update(c.k, Number(e.target.value))}
                style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer" }}
              />
              <div
                style={{
                  position: "absolute", top: 10, left: `calc(${v}% - 9px)`,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "var(--paper)", border: "2px solid var(--ink)",
                  boxShadow: "0 2px 6px rgba(0,0,0,.1)", pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute", top: 30, left: 0, right: 0,
                  display: "flex", justifyContent: "space-between",
                  fontSize: 9, color: "var(--muted-2)",
                  letterSpacing: 1, textTransform: "uppercase",
                }}
              >
                <span>cold</span><span>neutral</span><span>hot</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: heatColor }}>{heatLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
