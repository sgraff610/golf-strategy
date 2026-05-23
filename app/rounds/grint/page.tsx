"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Hole = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number | ""; putts: number | ""; tee_accuracy: string;
  water_penalty: number | ""; drop_or_out: number | "";
  fairway_bunker: number | ""; greenside_bunker: number | "";
};

type Round = {
  id: string; course_id: string; course_name: string; date: string;
  holes_played: number; holes: Hole[];
};

type CourseInfo = { rating: number | null; slope: number | null; tee_box: string };

function handicapStrokes(courseHandicap: number, si: number) {
  return Math.floor(courseHandicap / 18) + (si <= courseHandicap % 18 ? 1 : 0);
}

function calcAGS(holes: Hole[], courseHandicap: number) {
  return holes.map(h => {
    const s = Number(h.score) || 0;
    if (!s) return 0;
    const strokes = handicapStrokes(courseHandicap, h.stroke_index || 18);
    return Math.min(s, h.par + 2 + strokes);
  });
}

function penaltyCodes(h: Hole): string {
  const codes: string[] = [];
  for (let i = 0; i < (Number(h.water_penalty) || 0); i++) codes.push("W");
  for (let i = 0; i < (Number(h.drop_or_out) || 0); i++) codes.push("O");
  for (let i = 0; i < (Number(h.fairway_bunker) || 0); i++) codes.push("F");
  for (let i = 0; i < (Number(h.greenside_bunker) || 0); i++) codes.push("S");
  return codes.join(" ");
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function GrintContent() {
  const params = useSearchParams();
  const roundId = params.get("roundId");
  const router = useRouter();

  const [round, setRound] = useState<Round | null>(null);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Credentials stored in localStorage
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("gl-grint-creds");
    if (saved) {
      try {
        const { email: e, password: p } = JSON.parse(saved);
        setEmail(e || "");
        setPassword(p || "");
        setCredsSaved(true);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!roundId) { setLoading(false); return; }
    supabase.from("rounds").select("*").eq("id", roundId).single()
      .then(async ({ data, error: err }) => {
        if (err || !data) { setError("Round not found"); setLoading(false); return; }
        setRound(data as Round);
        if (data.course_id) {
          const { data: c } = await supabase
            .from("courses").select("rating,slope,tee_box").eq("id", data.course_id).single();
          if (c) setCourse(c as CourseInfo);
        }
        setLoading(false);
      });
  }, [roundId]);

  const { ags, courseHandicap } = useMemo(() => {
    if (!round || !course?.rating || !course?.slope) return { ags: [], courseHandicap: 0 };
    const totalPar = round.holes.reduce((s, h) => s + (h.par || 0), 0);
    const ch = Math.max(0, Math.round(20 * (course.slope / 113) + (course.rating - totalPar)));
    return { ags: calcAGS(round.holes, ch), courseHandicap: ch };
  }, [round, course]);

  const holesData = useMemo(() => {
    if (!round) return [];
    return round.holes.map((h, i) => ({
      hole: h.hole,
      par: h.par,
      yards: h.yards,
      stroke_index: h.stroke_index,
      score: Number(h.score) || 0,
      ags: ags[i] || Number(h.score) || 0,
      putts: Number(h.putts) || 0,
      penalties: penaltyCodes(h),
      tee_accuracy: h.par > 3 ? (h.tee_accuracy || "") : "",
    }));
  }, [round, ags]);

  const front = holesData.slice(0, 9);
  const back = holesData.slice(9, 18);
  const sumFront = front.reduce((s, h) => s + h.score, 0);
  const sumBack = back.reduce((s, h) => s + h.score, 0);
  const sumTotal = sumFront + sumBack;
  const agsFront = front.reduce((s, h) => s + h.ags, 0);
  const agsBack = back.reduce((s, h) => s + h.ags, 0);
  const agsTotal = agsFront + agsBack;
  const puttsFront = front.reduce((s, h) => s + h.putts, 0);
  const puttsBack = back.reduce((s, h) => s + h.putts, 0);
  const puttsTotal = puttsFront + puttsBack;

  function saveCredentials() {
    if (!email || !password) return;
    localStorage.setItem("gl-grint-creds", JSON.stringify({ email, password }));
    setCredsSaved(true);
  }

  function clearCredentials() {
    localStorage.removeItem("gl-grint-creds");
    setEmail("");
    setPassword("");
    setCredsSaved(false);
  }

  function downloadCSV() {
    if (!round) return;
    const [y, m, d] = round.date.split("-");
    const lines: string[] = [
      `Date,${m}/${d}/${y}`,
      `Course,${round.course_name}`,
      `Tee,${course?.tee_box || ""}`,
      `Round,${round.holes_played} Holes`,
      `Course Handicap,${courseHandicap}`,
      "",
      "Hole,Par,Yards,Index,Score,AGS,Putts,Penalties,Tee Accuracy",
    ];
    for (const h of holesData) {
      lines.push(`${h.hole},${h.par},${h.yards},${h.stroke_index},${h.score},${h.ags},${h.putts},${h.penalties},${h.tee_accuracy}`);
      if (h.hole === 9) {
        lines.push(`OUT,${front.reduce((s, x) => s + x.par, 0)},${front.reduce((s, x) => s + x.yards, 0)},,${sumFront},${agsFront},${puttsFront},,`);
      }
    }
    if (back.length > 0) {
      lines.push(`IN,${back.reduce((s, x) => s + x.par, 0)},${back.reduce((s, x) => s + x.yards, 0)},,${sumBack},${agsBack},${puttsBack},,`);
      lines.push(`TOT,${holesData.reduce((s, h) => s + h.par, 0)},${holesData.reduce((s, h) => s + h.yards, 0)},,${sumTotal},${agsTotal},${puttsTotal},,`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thegrint-${round.date}-${round.course_name.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitToGrint() {
    if (!round || !email || !password) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/grint/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          date: round.date,
          courseName: round.course_name,
          tee: course?.tee_box || "",
          holes: holesData,
        }),
      });
      const json = await res.json();
      setSubmitResult(json);
    } catch (err) {
      setSubmitResult({ ok: false, error: "Network error — could not reach the submit service." });
    }
    setSubmitting(false);
  }

  if (loading) return (
    <main style={{ maxWidth: 900, margin: "60px auto", padding: "0 24px" }}>
      <p style={{ color: "var(--ink-mute)" }}>Loading…</p>
    </main>
  );
  if (error || !round) return (
    <main style={{ maxWidth: 900, margin: "60px auto", padding: "0 24px" }}>
      <p style={{ color: "var(--ink-mute)" }}>{error || "No round selected."}</p>
      <a href="/rounds" style={{ color: "var(--accent)", fontSize: 13 }}>← Back to rounds</a>
    </main>
  );

  // ── Cell styles ─────────────────────────────────────────────────────────────
  const cellBase: React.CSSProperties = {
    padding: "5px 6px", fontSize: 12, textAlign: "center",
    borderRight: "1px solid var(--line-soft)", color: "var(--ink)",
    fontFamily: "var(--font-mono)",
  };
  const headerCell: React.CSSProperties = {
    ...cellBase, background: "var(--paper-alt)", fontFamily: "var(--font-ui)",
    fontWeight: 600, fontSize: 11, color: "var(--ink-soft)",
  };
  const labelCell: React.CSSProperties = {
    ...cellBase, textAlign: "left", fontFamily: "var(--font-ui)",
    fontWeight: 600, fontSize: 11, color: "var(--ink-soft)",
    background: "var(--paper-alt)", minWidth: 120, borderRight: "1px solid var(--line)",
  };
  const totalCell: React.CSSProperties = {
    ...cellBase, background: "var(--paper-alt)", fontWeight: 700,
  };

  const allCols = [...holesData.slice(0, 9), null, ...holesData.slice(9)];

  function scoreRow(key: "score" | "ags" | "putts", totF: number, totB: number | null) {
    return allCols.map((h, i) => {
      if (h === null) return (
        <td key="OUT" style={totalCell}>{totF || ""}</td>
      );
      const isBack = i > 9;
      const val = h[key];
      return (
        <td key={h.hole} style={cellBase}>
          {val || ""}
          {isBack && i === allCols.length - 1 && totB !== null
            ? null : null}
        </td>
      );
    });
  }

  return (
    <main style={{ maxWidth: 960, margin: "32px auto", padding: "0 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>
            TheGrint Export
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-mute)", marginTop: 2 }}>
            {fmtDate(round.date)} · {round.course_name} · {round.holes_played} holes
          </div>
        </div>
        <button
          onClick={() => router.back()}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer" }}
        >← Back</button>
      </div>

      {/* ── Scorecard table ─────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", borderRadius: "var(--r-card)", border: "1px solid var(--line)", marginBottom: 24 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)" }}>
              <th style={labelCell}>HOLE</th>
              {holesData.slice(0, 9).map(h => (
                <th key={h.hole} style={headerCell}>{h.hole}</th>
              ))}
              <th style={{ ...headerCell, background: "var(--line-soft)", fontWeight: 700 }}>OUT</th>
              {holesData.slice(9).map(h => (
                <th key={h.hole} style={headerCell}>{h.hole}</th>
              ))}
              {back.length > 0 && <th style={{ ...headerCell, background: "var(--line-soft)", fontWeight: 700 }}>IN</th>}
              {back.length > 0 && <th style={{ ...headerCell, background: "var(--line-soft)", fontWeight: 700 }}>TOT</th>}
            </tr>
          </thead>
          <tbody>
            {/* PAR */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={labelCell}>PAR</td>
              {holesData.slice(0, 9).map(h => <td key={h.hole} style={cellBase}>{h.par}</td>)}
              <td style={totalCell}>{front.reduce((s, h) => s + h.par, 0)}</td>
              {holesData.slice(9).map(h => <td key={h.hole} style={cellBase}>{h.par}</td>)}
              {back.length > 0 && <td style={totalCell}>{back.reduce((s, h) => s + h.par, 0)}</td>}
              {back.length > 0 && <td style={totalCell}>{holesData.reduce((s, h) => s + h.par, 0)}</td>}
            </tr>
            {/* INDEX */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={labelCell}>INDEX</td>
              {holesData.slice(0, 9).map(h => <td key={h.hole} style={cellBase}>{h.stroke_index}</td>)}
              <td style={totalCell} />
              {holesData.slice(9).map(h => <td key={h.hole} style={cellBase}>{h.stroke_index}</td>)}
              {back.length > 0 && <><td style={totalCell} /><td style={totalCell} /></>}
            </tr>
            {/* SCORE */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)", background: "rgba(0,0,0,0.02)" }}>
              <td style={{ ...labelCell, color: "var(--ink)", fontWeight: 700 }}>SCORE</td>
              {holesData.slice(0, 9).map(h => <td key={h.hole} style={{ ...cellBase, fontWeight: 600 }}>{h.score || ""}</td>)}
              <td style={{ ...totalCell, fontWeight: 700, fontSize: 13 }}>{sumFront || ""}</td>
              {holesData.slice(9).map(h => <td key={h.hole} style={{ ...cellBase, fontWeight: 600 }}>{h.score || ""}</td>)}
              {back.length > 0 && <td style={{ ...totalCell, fontWeight: 700, fontSize: 13 }}>{sumBack || ""}</td>}
              {back.length > 0 && <td style={{ ...totalCell, fontWeight: 800, fontSize: 14, color: "var(--accent-deep)" }}>{sumTotal || ""}</td>}
            </tr>
            {/* AGS */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={labelCell}>AGS (hdcp)</td>
              {holesData.slice(0, 9).map(h => <td key={h.hole} style={cellBase}>{h.ags || ""}</td>)}
              <td style={totalCell}>{agsFront || ""}</td>
              {holesData.slice(9).map(h => <td key={h.hole} style={cellBase}>{h.ags || ""}</td>)}
              {back.length > 0 && <td style={totalCell}>{agsBack || ""}</td>}
              {back.length > 0 && <td style={totalCell}>{agsTotal || ""}</td>}
            </tr>
            {/* PUTTS */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={labelCell}>PUTTS</td>
              {holesData.slice(0, 9).map(h => <td key={h.hole} style={cellBase}>{h.putts || ""}</td>)}
              <td style={totalCell}>{puttsFront || ""}</td>
              {holesData.slice(9).map(h => <td key={h.hole} style={cellBase}>{h.putts || ""}</td>)}
              {back.length > 0 && <td style={totalCell}>{puttsBack || ""}</td>}
              {back.length > 0 && <td style={totalCell}>{puttsTotal || ""}</td>}
            </tr>
            {/* PENALTIES */}
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={labelCell}>PENALTIES</td>
              {holesData.slice(0, 9).map(h => (
                <td key={h.hole} style={{ ...cellBase, fontSize: 10, color: h.penalties ? "#c0392b" : "var(--ink-mute)" }}>
                  {h.penalties || ""}
                </td>
              ))}
              <td style={totalCell} />
              {holesData.slice(9).map(h => (
                <td key={h.hole} style={{ ...cellBase, fontSize: 10, color: h.penalties ? "#c0392b" : "var(--ink-mute)" }}>
                  {h.penalties || ""}
                </td>
              ))}
              {back.length > 0 && <><td style={totalCell} /><td style={totalCell} /></>}
            </tr>
            {/* TEE ACCURACY */}
            <tr>
              <td style={labelCell}>TEE ACC.</td>
              {holesData.slice(0, 9).map(h => (
                <td key={h.hole} style={{
                  ...cellBase, fontSize: 10,
                  color: h.tee_accuracy === "Hit" ? "#0a7a5c"
                    : h.tee_accuracy ? "#c0392b" : "var(--ink-mute)",
                }}>
                  {h.tee_accuracy || ""}
                </td>
              ))}
              <td style={totalCell} />
              {holesData.slice(9).map(h => (
                <td key={h.hole} style={{
                  ...cellBase, fontSize: 10,
                  color: h.tee_accuracy === "Hit" ? "#0a7a5c"
                    : h.tee_accuracy ? "#c0392b" : "var(--ink-mute)",
                }}>
                  {h.tee_accuracy || ""}
                </td>
              ))}
              {back.length > 0 && <><td style={totalCell} /><td style={totalCell} /></>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Penalty legend */}
      <div style={{ fontSize: 11, color: "var(--ink-mute)", marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><b>W</b> = Penalty area</span>
        <span><b>O</b> = Out of bounds / drop</span>
        <span><b>F</b> = Fairway bunker</span>
        <span><b>S</b> = Greenside bunker</span>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* CSV Download */}
        <div style={{ background: "var(--paper-alt)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "20px 24px" }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>
            Download CSV
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 16 }}>
            Import this file into TheGrint using the <strong>Import Scores</strong> tab on their Add Score page.
          </p>
          <button
            onClick={downloadCSV}
            style={{
              width: "100%", padding: "11px", borderRadius: "var(--r-pill)",
              border: "none", background: "var(--ink)", color: "var(--paper)",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Download .csv
          </button>
        </div>

        {/* Auto-submit */}
        <div style={{ background: "var(--paper-alt)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "20px 24px" }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>
            Auto-submit to TheGrint
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 12 }}>
            Greenlight logs in and fills the hole-by-hole form for you.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <input
              type="email"
              placeholder="TheGrint email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)",
                background: "var(--paper)", color: "var(--ink)", fontSize: 13,
              }}
            />
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                placeholder="TheGrint password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: "100%", padding: "9px 36px 9px 12px", borderRadius: 8,
                  border: "1px solid var(--line)", background: "var(--paper)",
                  color: "var(--ink)", fontSize: 13, boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "var(--ink-mute)",
                }}
              >{showPass ? "Hide" : "Show"}</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveCredentials}
                disabled={!email || !password}
                style={{
                  flex: 1, padding: "7px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: "1px solid var(--line)", background: credsSaved ? "var(--accent)" : "transparent",
                  color: credsSaved ? "var(--ink)" : "var(--ink-soft)", cursor: "pointer",
                }}
              >{credsSaved ? "✓ Saved" : "Save credentials"}</button>
              {credsSaved && (
                <button
                  onClick={clearCredentials}
                  style={{
                    padding: "7px 10px", borderRadius: 8, fontSize: 12,
                    border: "1px solid var(--line)", background: "transparent",
                    color: "var(--ink-mute)", cursor: "pointer",
                  }}
                >Clear</button>
              )}
            </div>
          </div>

          {submitResult && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 10,
              background: submitResult.ok ? "#f0fff7" : "#fff0f0",
              border: `1px solid ${submitResult.ok ? "#a3d9b8" : "#ffcccc"}`,
              color: submitResult.ok ? "#0a5c3f" : "#cc0000",
              fontSize: 13,
            }}>
              {submitResult.ok ? submitResult.message : submitResult.error}
            </div>
          )}

          <button
            onClick={submitToGrint}
            disabled={!email || !password || submitting}
            style={{
              width: "100%", padding: "11px", borderRadius: "var(--r-pill)",
              border: "none",
              background: (!email || !password || submitting) ? "var(--line)" : "var(--accent-deep)",
              color: (!email || !password || submitting) ? "var(--ink-mute)" : "#fff",
              fontSize: 14, fontWeight: 600,
              cursor: (!email || !password || submitting) ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting…" : "Submit to TheGrint"}
          </button>

          <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 8, lineHeight: 1.4 }}>
            Credentials are saved on this device only. Auto-submit runs server-side and may take up to 30s.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function GrintPage() {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: 960, margin: "60px auto", padding: "0 24px" }}>
        <p style={{ color: "var(--ink-mute)" }}>Loading…</p>
      </main>
    }>
      <GrintContent />
    </Suspense>
  );
}
