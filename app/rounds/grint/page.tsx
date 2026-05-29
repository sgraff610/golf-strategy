"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/app/hooks/useIsMobile";

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
  const isMobile = useIsMobile(768);

  const [round, setRound] = useState<Round | null>(null);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [practiceRound, setPracticeRound] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

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

  function generateFillScript(): string {
    if (!round) return "";
    const [yyyy, mm, dd] = round.date.split("-");
    const teeAccMap: Record<string, string> = { Hit: "H", Left: "L", Right: "R", Short: "S", Long: "P" };
    const is9 = holesData.length <= 9;
    const isBack = is9 && (holesData[0]?.hole ?? 1) > 9;
    const teeBox = (course?.tee_box || "").replace(/'/g, "\\'");
    const courseName = round.course_name.replace(/'/g, "\\'");

    const holeLines = holesData.map(h => {
      const ta = teeAccMap[h.tee_accuracy] ?? "";
      const lines: string[] = [`  setVal('input[name="scH${h.hole}"]','${h.score}');`];
      if (h.putts) lines.push(`  setVal('input[name="ptH${h.hole}"]','${h.putts}');`);
      if (h.penalties) lines.push(`  setVal('input[name="pH${h.hole}"]','${h.penalties}');`);
      if (ta) {
        const code = ta.charCodeAt(0);
        lines.push(
          `  {var fh=document.querySelector('input[name="fH${h.hole}"]');` +
          `var tx=fh&&fh.previousElementSibling;` +
          `if(tx){['keydown','keypress','keyup'].forEach(function(n){` +
          `tx.dispatchEvent(new KeyboardEvent(n,{key:'${ta}',charCode:${code},keyCode:${code},which:${code},bubbles:true,cancelable:true}));` +
          `});await wait(300);}}`
        );
      }
      return lines.join("\n");
    }).join("\n");

    return `(async()=>{
  function setVal(s,v){const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
  function selOpt(s,v){try{setVal(s,v);}catch(e){}}
  function wait(ms){return new Promise(r=>setTimeout(r,ms));}

  setVal('select[name="year"]','${yyyy}');
  setVal('select[name="month"]','${mm}');
  setVal('select[name="date"]','${dd}');
  await wait(300);

  const ci=document.querySelector('#ucourse');
  if(ci){ci.value='${courseName}';ci.dispatchEvent(new Event('input',{bubbles:true}));ci.dispatchEvent(new Event('change',{bubbles:true}));await wait(1200);const sg=document.querySelector('.suggestion');if(sg){sg.click();await wait(1500);}}

  const teeOpts=Array.from(document.querySelectorAll('select[name="tees"] option')).filter(o=>o.value);
  const teeMatch=teeOpts.find(o=>o.text.toLowerCase().includes('${teeBox.toLowerCase()}'))||teeOpts[0];
  if(teeMatch)selOpt('select[name="tees"]',teeMatch.value);
  await wait(400);

${is9 ? `  selOpt('select[name="round"]','${isBack ? "B9" : "F9"}');await wait(800);` : ""}
${holeLines}
${practiceRound ? `  const pr=document.querySelector('#practice_score');if(pr&&!pr.checked)pr.click();` : ""}
  alert('Form filled — review everything above and click Submit.');
})();`;
  }

  async function submitToGrint() {
    if (!round) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/grint/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password,
          date: round.date,
          courseName: round.course_name,
          tee: course?.tee_box || "",
          holes: holesData,
          practiceRound,
        }),
      });
      const data = await res.json();
      setSubmitResult(data);
    } catch (e) {
      setSubmitResult({ ok: false, error: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  function copyScript() {
    const script = generateFillScript();
    navigator.clipboard.writeText(script).then(() => {
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 2500);
    });
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
    <main style={{ maxWidth: 960, margin: isMobile ? "16px auto" : "32px auto", padding: isMobile ? "0 12px" : "0 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "var(--ink)" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>

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

        {/* Submit to TheGrint */}
        <div style={{ background: "var(--paper-alt)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "20px 24px" }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>
            Submit to TheGrint
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 16, lineHeight: 1.5 }}>
            Enter your TheGrint credentials and we'll fill and submit the score automatically.
          </p>

          <input
            type="email"
            placeholder="TheGrint email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 10,
              border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)",
              fontSize: 13, boxSizing: "border-box",
            }}
          />
          <input
            type="password"
            placeholder="TheGrint password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 16,
              border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)",
              fontSize: 13, boxSizing: "border-box",
            }}
          />

          {/* Practice round toggle */}
          <label style={{
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
            padding: "10px 12px", borderRadius: 8,
            background: practiceRound ? "rgba(var(--accent-rgb,255,120,0),0.08)" : "transparent",
            border: `1px solid ${practiceRound ? "var(--accent)" : "var(--line)"}`,
            marginBottom: 16, userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={practiceRound}
              onChange={e => setPracticeRound(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Practice / Offseason Round</span>
            <span style={{ fontSize: 11, color: "var(--ink-mute)", marginLeft: "auto" }}>Won't count toward handicap</span>
          </label>

          {holesData.some(h => h.score === 0) && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 14,
              background: "#fff8e1", border: "1px solid #f0c040", color: "#7a5a00", fontSize: 13,
            }}>
              ⚠ Some holes are missing scores. Fill in all scores before submitting.
            </div>
          )}

          <button
            onClick={submitToGrint}
            disabled={submitting || !email || !password || holesData.some(h => h.score === 0)}
            style={{
              width: "100%", padding: "11px", borderRadius: "var(--r-pill)", border: "none",
              background: submitting ? "var(--line)" : (!email || !password || holesData.some(h => h.score === 0)) ? "var(--line)" : "var(--green)",
              color: (!email || !password || submitting || holesData.some(h => h.score === 0)) ? "var(--ink-mute)" : "#fff",
              fontSize: 14, fontWeight: 600,
              cursor: (submitting || !email || !password || holesData.some(h => h.score === 0)) ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {submitting ? "Submitting…" : "Submit to TheGrint"}
          </button>

          {submitResult && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8, fontSize: 13,
              background: submitResult.ok ? "#e8f5e9" : "#fdecea",
              border: `1px solid ${submitResult.ok ? "#81c784" : "#e57373"}`,
              color: submitResult.ok ? "#1b5e20" : "#b71c1c",
            }}>
              {submitResult.ok ? `✓ ${submitResult.message}` : `✗ ${submitResult.error}`}
            </div>
          )}

          <details style={{ marginTop: 16 }}>
            <summary style={{ fontSize: 12, color: "var(--ink-mute)", cursor: "pointer", userSelect: "none" }}>
              Manual fallback — copy fill script
            </summary>
            <div style={{ marginTop: 10 }}>
              <button
                onClick={copyScript}
                disabled={holesData.some(h => h.score === 0)}
                style={{
                  width: "100%", padding: "9px", borderRadius: "var(--r-pill)", border: "none",
                  background: scriptCopied ? "#0a7a5c" : "var(--accent-deep)",
                  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {scriptCopied ? "✓ Copied!" : "Copy Fill Script"}
              </button>
              <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 8, lineHeight: 1.5 }}>
                Open TheGrint, log in, press <b>F12</b> → <b>Console</b>, paste, and hit Enter.
              </p>
            </div>
          </details>
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
