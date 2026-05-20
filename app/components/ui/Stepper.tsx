"use client";
type Step = { id: string; label: string };

export function Stepper({
  steps, current, onJump,
}: {
  steps: Step[];
  current: number;
  onJump?: (i: number) => void;
}) {
  return (
    <div style={{ width: "100%", padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {steps.map((s, i) => {
          const done = i < current;
          const now  = i === current;
          const clickable = i < current && !!onJump;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? "0 0 auto" : 1 }}>
              <button
                onClick={clickable ? () => onJump!(i) : undefined}
                disabled={!clickable}
                aria-current={now ? "step" : undefined}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "1.5px solid",
                  borderColor: done ? "var(--green)" : now ? "var(--ink)" : "var(--line)",
                  background: done ? "var(--green)" : now ? "var(--ink)" : "var(--paper)",
                  color:      done ? "var(--paper)" : now ? "var(--accent)" : "var(--ink-mute)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12, fontWeight: 700,
                  display: "grid", placeItems: "center",
                  cursor: clickable ? "pointer" : "default",
                  flexShrink: 0,
                  lineHeight: 1,
                }}>
                {done ? "✓" : i + 1}
              </button>
              {i < steps.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 8px",
                  background: i < current ? "var(--green)" : "var(--line)",
                }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingRight: 28 }}>
        {steps.map((s, i) => {
          const done = i < current, now = i === current;
          return (
            <div key={s.id} style={{
              fontSize: "var(--t-meta)",
              fontWeight: 600,
              color: done ? "var(--green)" : now ? "var(--ink)" : "var(--ink-mute)",
              letterSpacing: 0.3,
            }}>{s.label}</div>
          );
        })}
      </div>
    </div>
  );
}
