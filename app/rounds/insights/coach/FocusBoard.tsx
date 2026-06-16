"use client";
import React, { useState } from "react";
import { PLAYER, COACH, LEAKS, STRENGTHS, CATS, fmt, type Cat } from "./leaks";
import { Bars, CatTag, ImpactPill, GoalOption, FixCard, ProgressBar } from "./CoachPrimitives";
import { useIsMobile } from "@/app/hooks/useIsMobile";

type LeakState = {
  expanded: boolean;
  goalType: "frequency" | "impact" | null;
  picks: Set<number>;
  committed: boolean;
};

const defaultLeakState = (): LeakState => ({
  expanded: false, goalType: null, picks: new Set<number>(), committed: false,
});

export default function FocusBoard() {
  const isMobile = useIsMobile();
  const [plan, setPlan] = useState<Record<string, LeakState>>({});

  const stOf = (id: string): LeakState => plan[id] ?? defaultLeakState();
  const set = (id: string, patch: Partial<LeakState>) =>
    setPlan(p => {
      const cur = p[id] ?? defaultLeakState();
      return { ...p, [id]: { ...cur, ...patch } };
    });

  const committed = LEAKS.filter(l => stOf(l.id).committed);
  const projTotal = committed.reduce((sum, l) => {
    const st = stOf(l.id);
    return sum + l.fixes.reduce((s, f, i) => s + (st.picks.has(i) ? f.proj : 0), 0);
  }, 0);

  return (
    <div style={{ fontFamily: "var(--font-ui)", color: "var(--ink)" }}>

      {/* HERO */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "300px 1fr",
        gap: 20, marginBottom: 24,
      }}>
        <div style={{
          background: "linear-gradient(160deg,#0c4f3a 0%,#084634 100%)",
          color: "var(--paper)", borderRadius: 18, padding: "20px 24px",
          boxShadow: "var(--shadow-hero)",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.4,
            textTransform: "uppercase", color: "var(--accent)", fontWeight: 700,
          }}>USGA Handicap</div>
          <div className="tnum" style={{
            fontFamily: "var(--font-display)", fontStyle: "italic",
            fontSize: 76, fontWeight: 600, lineHeight: 0.9,
            letterSpacing: -3, marginTop: 6,
          }}>{PLAYER.handicap}</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
            color: "#f0c989", marginTop: 10,
          }}>▼ {Math.abs(PLAYER.trend30d).toFixed(1)} · last 30 days</div>
        </div>

        <div style={{
          background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 18, padding: "24px 28px",
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <div style={{
            fontFamily: "var(--font-display)", fontStyle: "italic",
            fontSize: isMobile ? 20 : 26, fontWeight: 500, lineHeight: 1.3,
          }}>&ldquo;{COACH.line}&rdquo;</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 0.5,
            color: "var(--ink-mute)", marginTop: 12, fontWeight: 600,
          }}>— {COACH.name}, {COACH.title}</div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 360px",
        gap: 20, alignItems: "start",
      }}>

        {/* LEAK CARDS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={MONO10}>Top 5 leaks · ranked by impact</div>

          {LEAKS.map(l => {
            const st = stOf(l.id);
            const open = st.expanded || st.committed;
            return (
              <div key={l.id} style={{
                background: "var(--paper)",
                border: `1px solid ${st.committed ? "var(--green)" : "var(--line)"}`,
                borderRadius: 16, padding: 18,
              }}>
                {/* Card header row */}
                <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16 }}>
                  <div className="tnum" style={{
                    fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
                    color: "var(--ink-mute)", width: 20, flexShrink: 0,
                  }}>{l.rank}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <CatTag cat={l.cat} />
                      {st.committed && (
                        <span style={BADGE}>✓ ACTIVE FOCUS</span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: isMobile ? 18 : 22,
                      fontWeight: 600, letterSpacing: -0.3, margin: "3px 0 4px",
                    }}>{l.label}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>
                      <span className="tnum">{l.holes}</span> holes · <span className="tnum">{l.freqPct}%</span> {l.freqLabel}
                    </div>
                  </div>

                  {!isMobile && (
                    <div style={{ width: 150, flexShrink: 0 }}>
                      <Bars data={l.chart} height={70} />
                    </div>
                  )}

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <ImpactPill v={l.impact} />
                    <div style={{ ...MONO9, marginTop: 3 }}>lost / round</div>
                  </div>
                </div>

                {isMobile && (
                  <div style={{ marginTop: 12 }}>
                    <Bars data={l.chart} height={60} />
                  </div>
                )}

                {!open && (
                  <button
                    onClick={() => set(l.id, { expanded: true })}
                    style={{
                      marginTop: 14, background: "var(--ink)", color: "var(--paper)",
                      border: "none", borderRadius: 11, padding: "11px 18px",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >Decide together →</button>
                )}

                {open && (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 12,
                    marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line-soft)",
                  }}>
                    {/* Coach diagnosis */}
                    <div style={{
                      fontSize: 13, lineHeight: 1.5, color: "var(--ink-soft)",
                      background: "var(--green-soft)", borderLeft: "3px solid var(--green)",
                      borderRadius: "0 10px 10px 0", padding: "10px 14px",
                    }}>
                      <span style={{ fontWeight: 700, color: "var(--green-deep)" }}>{COACH.name}: </span>
                      {l.diagnosis}
                    </div>

                    {/* Step 1: Goal */}
                    <div style={STEP_HEAD}>
                      <span style={STEP_NUM as React.CSSProperties}>1</span> Set the goal
                    </div>
                    <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                      <GoalOption
                        kind="frequency" goal={l.goals.frequency}
                        active={st.goalType === "frequency"}
                        onPick={() => set(l.id, { goalType: "frequency" })}
                      />
                      <GoalOption
                        kind="impact" goal={l.goals.impact}
                        active={st.goalType === "impact"}
                        onPick={() => set(l.id, { goalType: "impact" })}
                      />
                    </div>

                    {/* Step 2: Plays (only after goal is chosen) */}
                    {st.goalType && (
                      <>
                        <div style={STEP_HEAD}>
                          <span style={STEP_NUM as React.CSSProperties}>2</span> Pick the coach&rsquo;s plays
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {l.fixes.map((f, i) => (
                            <FixCard
                              key={i} fix={f}
                              picked={st.picks.has(i)}
                              onToggle={() => {
                                const next = new Set(st.picks);
                                next.has(i) ? next.delete(i) : next.add(i);
                                set(l.id, { picks: next });
                              }}
                            />
                          ))}
                        </div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          {!st.committed ? (
                            <button
                              onClick={() => set(l.id, { committed: true })}
                              disabled={st.picks.size === 0}
                              style={{
                                background: "var(--accent)", color: "var(--ink)",
                                border: "none", borderRadius: 11, padding: "11px 20px",
                                fontSize: 14, fontWeight: 700, cursor: "pointer",
                                opacity: st.picks.size === 0 ? 0.45 : 1,
                                fontFamily: "var(--font-ui)",
                              }}
                            >Add to game plan</button>
                          ) : (
                            <button
                              onClick={() => set(l.id, { committed: false })}
                              style={{
                                background: "transparent", color: "var(--bad)",
                                border: "1px solid var(--line)", borderRadius: 11,
                                padding: "11px 18px", fontSize: 13, fontWeight: 600,
                                cursor: "pointer", fontFamily: "var(--font-ui)",
                              }}
                            >Remove from plan</button>
                          )}
                          {!st.committed && (
                            <button
                              onClick={() => set(l.id, { expanded: false, goalType: null, picks: new Set<number>() })}
                              style={{
                                background: "transparent", color: "var(--ink-mute)",
                                border: "none", padding: "11px 8px",
                                fontSize: 13, fontWeight: 500, cursor: "pointer",
                                fontFamily: "var(--font-ui)",
                              }}
                            >Cancel</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* RIGHT RAIL */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 14,
          position: isMobile ? "static" : "sticky", top: 20,
        }}>
          {/* GAME PLAN */}
          <div style={{
            background: "var(--ink)", color: "var(--paper)",
            borderRadius: 18, padding: 22,
          }}>
            <div style={{ ...MONO10, color: "var(--accent)" }}>Your game plan</div>

            {committed.length === 0 ? (
              <div style={{ fontSize: 13, color: "#cfd6de", lineHeight: 1.5, marginTop: 12 }}>
                Nothing locked in yet. Work through the leaks on the left and add the ones you want to attack.
              </div>
            ) : (
              <>
                <div className="tnum" style={{
                  fontFamily: "var(--font-display)", fontStyle: "italic",
                  fontSize: 56, fontWeight: 600, color: "var(--accent)",
                  lineHeight: 0.9, marginTop: 10, letterSpacing: -2,
                }}>−{projTotal.toFixed(1)}</div>
                <div style={{ ...MONO10, color: "#cfd6de", marginTop: 6 }}>projected strokes / round</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                  {committed.map(l => {
                    const st = stOf(l.id);
                    const g = st.goalType === "frequency" ? l.goals.frequency : l.goals.impact!;
                    return (
                      <div key={l.id} style={{ borderTop: "1px solid #2a323f", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                          <span className="tnum" style={{
                            fontFamily: "var(--font-mono)", fontSize: 11,
                            fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                          }}>
                            {st.goalType === "frequency"
                              ? `${fmt(g.current, g.unit)}→${fmt(g.target, g.unit)}`
                              : `${g.current.toFixed(2)}→${g.target.toFixed(2)}`}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#8a93a0", marginTop: 3 }}>
                          {st.goalType === "frequency" ? "Reduce frequency" : "Reduce impact"} · {st.picks.size} play{st.picks.size > 1 ? "s" : ""}
                        </div>
                        <div style={{ marginTop: 8 }}><ProgressBar pct={0} /></div>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  ...MONO10, color: "#8a93a0",
                  marginTop: 16, textAlign: "center", letterSpacing: 0.4,
                }}>Tracking begins with your next round.</div>
              </>
            )}
          </div>

          {/* WHAT'S WORKING */}
          <div style={{
            background: "var(--green-soft)", border: "1px solid #b9d8cc",
            borderRadius: 18, padding: "18px 20px",
          }}>
            <div style={{ ...MONO10, color: "var(--green-deep)", marginBottom: 6 }}>What&rsquo;s working</div>

            {CATS.map((cat: Cat) => {
              const items = STRENGTHS.filter(s => s.cat === cat);
              if (!items.length) return null;
              return (
                <div key={cat} style={{ marginTop: 14 }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.2,
                    textTransform: "uppercase", color: "var(--green)", fontWeight: 700,
                    paddingBottom: 7, marginBottom: 10,
                    borderBottom: "1px solid rgba(8,70,52,0.13)",
                  }}>{cat}</div>
                  {items.map(s => (
                    <div key={s.metric} style={{
                      display: "flex", gap: 12, alignItems: "center", marginBottom: 11,
                    }}>
                      <span className="tnum" style={{
                        fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 600,
                        color: "var(--green-deep)", width: 56, flexShrink: 0, textAlign: "right",
                      }}>{s.value}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--green-deep)" }}>{s.metric}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 2, lineHeight: 1.35 }}>{s.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const MONO10: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.4,
  textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 700,
};
const MONO9: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.6,
  textTransform: "uppercase", color: "var(--ink-mute)", fontWeight: 600,
};
const BADGE: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1, fontWeight: 700,
  color: "var(--green-deep)", background: "var(--green-soft)", padding: "2px 8px", borderRadius: 999,
};
const STEP_HEAD: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 2,
};
const STEP_NUM = {
  width: 20, height: 20, borderRadius: "50%",
  background: "var(--ink)", color: "var(--accent)",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  display: "grid", placeItems: "center",
};
