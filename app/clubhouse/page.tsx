"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getClubDistances, saveClubDistances } from "@/lib/storage";
import { DEFAULT_CLUB_DISTANCES } from "@/lib/planTypes";
import type { ClubDistances } from "@/lib/planTypes";
import { Pencil, Trash2 } from "lucide-react";

// ─── Theme ────────────────────────────────────────────────────────────────────

const ROOT: React.CSSProperties = {
  "--bg": "#eef1f4", "--paper": "#f7f9fb", "--paper-alt": "#e6ebf0",
  "--ink": "#131821", "--ink-soft": "#253041", "--muted": "#5d6b7a", "--muted-2": "#8995a3",
  "--line": "#d7dde3", "--line-soft": "#e5eaef",
  "--green": "#0f6e56", "--green-deep": "#084634", "--green-soft": "#d2e8df",
  "--accent": "#f29450", "--accent-soft": "#fde0c8",
  "--sand": "#c8a84b", "--sand-soft": "#f5ecd0", "--sand-deep": "#8c6a26",
  "--good": "#1e8449", "--bad": "#c94a2a",
  background: "#eef1f4", color: "#131821",
  fontFamily: "system-ui, -apple-system, sans-serif",
  minHeight: "100vh",
} as React.CSSProperties;

// ─── Types ────────────────────────────────────────────────────────────────────

type Round = {
  id: string; course_id: string; course_name: string;
  date: string; holes_played: number; starting_hole: number;
  holes: any[]; score_differential: number | null;
  recap?: Record<string, unknown> | null;
};
type CourseInfo = { rating: number | null; slope: number | null; hole_count: number | null };

// ─── Math ─────────────────────────────────────────────────────────────────────

const PUTT_DIST_MAP: Record<string, number> = {
  "Gimme": 1, "3ft": 3, "5ft": 5, "7ft": 7, "10ft": 10,
  "15ft": 15, "20ft": 20, "30ft": 30, "40ft": 40, "50ft": 50, "50+": 60,
};

function adjustedGrossScore(holes: any[]): number {
  return holes.reduce((s, h) => s + Math.min(Number(h.score) || 0, h.par + 2), 0);
}

function computeDiffNum(round: Round, info: CourseInfo | undefined): number | null {
  if (!info?.rating || !info?.slope) return null;
  const scored = round.holes.filter(h => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (!scored.length) return null;
  const ags = adjustedGrossScore(scored);
  const hp = round.holes_played ?? scored.length;
  const is9R = hp <= 9;
  const is9C = (info.hole_count ?? round.holes.length) <= 9;
  let rating = info.rating;
  if (is9R && !is9C) rating /= 2;
  else if (!is9R && is9C) rating *= 2;
  return is9R ? ((113 / info.slope) * (ags - rating)) * 2 : (ags - rating) * 113 / info.slope;
}

function computeHandicapIndex(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1 : last20.length <= 8 ? 2 : last20.length <= 11 ? 3
    : last20.length <= 14 ? 4 : last20.length <= 16 ? 5 : last20.length <= 18 ? 6
    : last20.length === 19 ? 7 : 8;
  return Math.floor((sorted.slice(0, count).reduce((s, d) => s + d, 0) / count) * 10) / 10;
}

function calcStats(slice: Round[]) {
  const scoredHoles = slice.flatMap(r => r.holes.filter((h: any) => h.score && Number(h.score) > 0));
  if (!scoredHoles.length || !slice.length) return null;
  const roundScoresPar = slice.map(r => {
    const sc = r.holes.filter((h: any) => h.score && Number(h.score) > 0);
    if (!sc.length) return null;
    const stp = sc.reduce((s: number, h: any) => s + Number(h.score) - (h.par || 0), 0);
    return (r.holes_played ?? sc.length) <= 9 ? stp * 2 : stp;
  }).filter((v): v is number => v !== null);
  const totalHoles = scoredHoles.length;
  const drivingHoles = scoredHoles.filter((h: any) => h.par === 4 || h.par === 5);
  const chipHoles = scoredHoles.filter((h: any) =>
    Number(h.chips) > 0 && PUTT_DIST_MAP[h.first_putt_distance] !== undefined
  );
  return {
    avgScoreToPar: roundScoresPar.length ? roundScoresPar.reduce((s, v) => s + v, 0) / roundScoresPar.length : 0,
    avgPuttsPer18: totalHoles > 0 ? (scoredHoles.reduce((s, h: any) => s + (Number(h.putts) || 0), 0) / totalHoles) * 18 : null,
    drivingPct: drivingHoles.length > 0 ? drivingHoles.filter((h: any) => h.tee_accuracy === "Hit").length / drivingHoles.length : null,
    girPct: totalHoles > 0 ? scoredHoles.filter((h: any) => h.gir).length / totalHoles : null,
    avgPuttAfterChip: chipHoles.length > 0 ? chipHoles.reduce((s, h: any) => s + PUTT_DIST_MAP[h.first_putt_distance], 0) / chipHoles.length : null,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtStp = (n?: number | null) => n == null ? "—" : n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
const fmtDiff = (n?: number | null) => n == null ? "—" : n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
const fmtPct = (n?: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`;
const fmtPuts = (n?: number | null) => n == null ? "—" : n.toFixed(1);
const fmtFt = (n?: number | null) => n == null ? "—" : `${n.toFixed(1)}ft`;
const fmtDateShort = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function totalScore(holes: any[]) { return holes.reduce((s, h) => s + (Number(h.score) || 0), 0); }
function totalPutts(holes: any[]) { return holes.reduce((s, h) => s + (Number(h.putts) || 0), 0); }
function fairwaysHit(holes: any[]) { return holes.filter(h => (h.par === 4 || h.par === 5) && h.tee_accuracy === "Hit").length; }
function drivingTotal(holes: any[]) { return holes.filter(h => h.par === 4 || h.par === 5).length; }
function girsHit(holes: any[]) { return holes.filter(h => h.gir).length; }

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, w = 96, h = 36, stroke = "var(--green)", fill }: {
  data: number[]; w?: number; h?: number; stroke?: string; fill?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 4) + 2,
    h - 2 - ((v - min) / range) * (h - 4),
  ] as [number, number]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      {fill && <path d={`${d} L${last[0]} ${h} L${pts[0][0]} ${h} Z`} fill={fill} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}

// ─── MilestoneBadge ───────────────────────────────────────────────────────────

const BADGE: Record<string, { ch: string; title: string }> = {
  pr:     { ch: "PR", title: "Personal record" },
  diff:   { ch: "◆",  title: "Lowest differential" },
  streak: { ch: "▲",  title: "Hot streak" },
  course: { ch: "★",  title: "Best at this course" },
};
function MilestoneBadge({ kind = "pr", size = 20 }: { kind?: string; size?: number }) {
  const { ch, title } = BADGE[kind] ?? BADGE.pr;
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: 99, flexShrink: 0,
      background: "linear-gradient(135deg,#d9b466 0%,#b08a3e 60%,#8c6a26 100%)",
      color: "#fff8e3", fontSize: size * 0.46, fontWeight: 700, letterSpacing: kind === "pr" ? 0.3 : 0,
      boxShadow: "0 1px 2px rgba(80,55,15,.3),inset 0 .5px 0 rgba(255,255,255,.4)",
    }}>{ch}</span>
  );
}

// ─── CourseGlyph ──────────────────────────────────────────────────────────────

function CourseGlyph({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg,var(--green) 0%,var(--green-deep) 100%)",
      color: "#fff8e3", fontFamily: "Georgia,serif", fontWeight: 600,
      fontSize: size * 0.38, letterSpacing: -0.5, fontStyle: "italic",
    }}>{initials || "GC"}</div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClubhousePage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courseInfoMap, setCourseInfoMap] = useState<Record<string, CourseInfo>>({});
  const [profile, setProfile] = useState({ strengths: "", weaknesses: "" });
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [clubDistances, setClubDistances] = useState<ClubDistances>(DEFAULT_CLUB_DISTANCES);
  const [distDraft, setDistDraft] = useState<ClubDistances>(DEFAULT_CLUB_DISTANCES);
  const [recapRounds, setRecapRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [tab, setTab] = useState<"rounds" | "stats" | "bag" | "notes">("stats");
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [activeDiffIdx, setActiveDiffIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [distEditing, setDistEditing] = useState(false);
  const [distSaving, setDistSaving] = useState(false);
  const [distSaved, setDistSaved] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newClubName, setNewClubName] = useState("");
  const [newClubMin, setNewClubMin] = useState("");
  const [newClubMax, setNewClubMax] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Round | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    getClubDistances().then(d => { setClubDistances(d); setDistDraft(d); });
  }, []);

  useEffect(() => {
    supabase.from("player_data").select("*").eq("id", "singleton").single()
      .then(({ data }) => {
        if (data) {
          setProfile({ strengths: data.strengths ?? "", weaknesses: data.weaknesses ?? "" });
          setChangeLog(data.change_log ?? []);
        }
      });
  }, []);

  useEffect(() => {
    supabase.from("rounds").select("id, course_name, date, recap")
      .not("recap", "is", null).order("date", { ascending: false }).limit(2)
      .then(({ data }) => { if (data) setRecapRounds(data); });
  }, []);

  useEffect(() => {
    supabase.from("rounds").select("*").order("date", { ascending: true })
      .then(async ({ data, error }) => {
        if (!error && data) {
          setRounds(data);
          const ids = [...new Set(data.map((r: any) => r.course_id).filter(Boolean))];
          if (ids.length) {
            const { data: courses } = await supabase.from("courses")
              .select("id,rating,slope,hole_count").in("id", ids);
            if (courses) {
              const map: Record<string, CourseInfo> = {};
              courses.forEach((c: any) => { map[c.id] = { rating: c.rating, slope: c.slope, hole_count: c.hole_count }; });
              setCourseInfoMap(map);
            }
          }
        }
        setLoading(false);
      });
  }, []);

  // ── Saves ─────────────────────────────────────────────────────────────────────

  async function saveProfile() {
    setSaving(true);
    await supabase.from("player_data").upsert({ id: "singleton", strengths: profile.strengths, weaknesses: profile.weaknesses, change_log: changeLog, updated_at: new Date().toISOString() });
    setSaved(true); setEditing(false); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveDistances() {
    setDistSaving(true);
    await saveClubDistances(distDraft);
    setClubDistances(distDraft); setDistEditing(false); setDistSaving(false); setDistSaved(true);
    setTimeout(() => setDistSaved(false), 2000);
  }

  async function saveChangeLog(updated: string[]) {
    setChangeLog(updated);
    await supabase.from("player_data").upsert({ id: "singleton", strengths: profile.strengths, weaknesses: profile.weaknesses, change_log: updated, updated_at: new Date().toISOString() });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await supabase.from("rounds").delete().eq("id", deleteTarget.id);
    setRounds(prev => prev.filter(r => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  const roundsAsc = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const roundsDesc = [...rounds].sort((a, b) => b.date.localeCompare(a.date));

  const diffsWithInfo = roundsAsc.map(r => {
    const d = r.score_differential != null
      ? (r.holes_played <= 9 ? r.score_differential * 2 : r.score_differential)
      : computeDiffNum(r, courseInfoMap[r.course_id]);
    return d !== null ? { diff: d, course_name: r.course_name, date: r.date } : null;
  }).filter((d): d is { diff: number; course_name: string; date: string } => d !== null);

  const diffsOnly = diffsWithInfo.map(d => d.diff);
  const last20WithInfo = diffsWithInfo.slice(-20);
  const last20Diffs = last20WithInfo.map(d => d.diff);
  const handicapIndex = computeHandicapIndex(diffsOnly);

  const sorted20 = [...last20Diffs].sort((a, b) => a - b);
  const threshold = sorted20[Math.min(7, sorted20.length - 1)] ?? Infinity;
  const sparklineData = diffsOnly.slice(-12);

  // 30-day trend
  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const diffsFor30 = roundsAsc
    .filter(r => new Date(r.date + "T12:00:00") < thirtyAgo)
    .map(r => r.score_differential != null
      ? (r.holes_played <= 9 ? r.score_differential * 2 : r.score_differential)
      : computeDiffNum(r, courseInfoMap[r.course_id])
    ).filter((d): d is number => d !== null);
  const hcp30 = computeHandicapIndex(diffsFor30);
  const trend = handicapIndex != null && hcp30 != null ? handicapIndex - hcp30 : null;

  const stats5 = calcStats(roundsAsc.slice(-5));
  const stats20 = calcStats(roundsAsc.slice(-20));
  const statsAll = calcStats(roundsAsc);

  // Trophy computations
  const rounds18 = roundsDesc.filter(r => (r.holes_played ?? r.holes.length) >= 18 && totalScore(r.holes) > 0);
  const bestRound = rounds18.length ? rounds18.reduce((b, r) => totalScore(r.holes) < totalScore(b.holes) ? r : b) : null;
  const bestDiffEntry = diffsWithInfo.length ? diffsWithInfo.reduce((b, d) => d.diff < b.diff ? d : b) : null;
  let streak = 0;
  for (const r of rounds18) { if (totalScore(r.holes) < 90) streak++; else break; }
  const thisYear = new Date().getFullYear().toString();
  const coursesThisYear = new Set(rounds.filter(r => r.date?.startsWith(thisYear)).map(r => r.course_id)).size;

  // Best by course
  const csByCourse: Record<string, { name: string; rounds: number; best: number; bestDate: string; total: number }> = {};
  for (const r of rounds18) {
    const sc = totalScore(r.holes);
    if (!csByCourse[r.course_id]) csByCourse[r.course_id] = { name: r.course_name, rounds: 0, best: sc, bestDate: r.date, total: 0 };
    const cs = csByCourse[r.course_id];
    cs.rounds++; cs.total += sc;
    if (sc < cs.best) { cs.best = sc; cs.bestDate = r.date; }
  }
  const courseStatsList = Object.values(csByCourse).sort((a, b) => b.rounds - a.rounds);

  // Filtered rounds for tab
  const uniqueCourses = Array.from(new Set(rounds.map(r => r.course_name))).sort();
  const uniqueYears = Array.from(new Set(rounds.map(r => r.date?.slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const filteredRounds = roundsDesc.filter(r => {
    if (courseFilter && r.course_name !== courseFilter) return false;
    if (yearFilter && !r.date?.startsWith(yearFilter)) return false;
    return true;
  });

  const iconBtn = (color: string, id: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 7,
    border: `1px solid ${hoveredBtn === id ? color : "var(--line)"}`,
    background: hoveredBtn === id ? `${color}18` : "var(--paper)",
    color: hoveredBtn === id ? color : "var(--muted-2)", cursor: "pointer", transition: "all .15s",
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={ROOT}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px", color: "var(--muted)", fontStyle: "italic" }}>
        Loading clubhouse…
      </div>
    </div>
  );

  return (
    <div style={ROOT}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0 16px" }}>
          <div>
            <a href="/" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.3, textDecoration: "none" }}>← Strategy</a>
            <div style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontStyle: "italic", fontSize: 28, color: "var(--ink)", lineHeight: 1.1, marginTop: 4 }}>
              The Clubhouse
            </div>
          </div>
          <a href="/rounds/add" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--green-deep)", color: "white", border: "none",
            borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></svg>
            Add round
          </a>
        </div>

        {/* ── Hero ── */}
        <div style={{
          background: "linear-gradient(135deg,#1a4f3e 0%,var(--green-deep) 65%,#051f14 100%)",
          borderRadius: 18, padding: "22px 22px 18px", marginBottom: 16,
          position: "relative", overflow: "hidden",
          boxShadow: "0 4px 24px rgba(8,70,52,.25)",
        }}>
          {/* Subtle radial glow top-right */}
          <div style={{ position: "absolute", top: 0, right: 0, width: 160, height: 160, background: "radial-gradient(circle,rgba(200,168,75,.12) 0%,transparent 70%)", pointerEvents: "none" }} />

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* Left: HI + trend + 5×4 diff grid */}
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.55)", fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 4 }}>
                Handicap Index
              </div>
              {handicapIndex !== null ? (
                <div style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 60, color: "white", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                  {handicapIndex.toFixed(1)}
                </div>
              ) : (
                <div style={{ fontFamily: "Georgia,serif", fontSize: 22, color: "rgba(255,255,255,.5)", lineHeight: 1 }}>
                  {diffsOnly.length < 3 ? `Need ${3 - diffsOnly.length} more` : "—"}
                </div>
              )}
              {trend !== null && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: trend < 0 ? "#6de8b8" : "#f29450", fontWeight: 700 }}>
                    {trend < 0 ? `↓ ${Math.abs(trend).toFixed(1)}` : `↑ ${trend.toFixed(1)}`}
                  </span>
                  <span>30 days</span>
                </div>
              )}

              {/* 5×4 diff chip grid */}
              {last20WithInfo.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 3 }}>
                  {last20WithInfo.map((item, i) => {
                    const used = item.diff <= threshold;
                    const active = activeDiffIdx === i;
                    return (
                      <div key={i} style={{ position: "relative" }}>
                        <div
                          onClick={() => setActiveDiffIdx(active ? null : i)}
                          style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 3px", borderRadius: 5,
                            cursor: "pointer", fontFeatureSettings: '"tnum" 1', textAlign: "center",
                            background: used ? "linear-gradient(135deg,#d9b466,#8c6a26)" : "rgba(255,255,255,.1)",
                            color: used ? "#fff8e3" : "rgba(255,255,255,.4)",
                            boxShadow: used ? "0 1px 2px rgba(80,55,15,.3)" : "none",
                            border: used ? "none" : "1px solid rgba(255,255,255,.07)",
                          }}
                        >
                          {item.diff.toFixed(1)}
                        </div>
                        {active && (
                          <div style={{
                            position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                            background: "var(--ink)", color: "white", borderRadius: 8, padding: "6px 10px",
                            fontSize: 10.5, whiteSpace: "nowrap", zIndex: 20, pointerEvents: "none",
                            boxShadow: "0 3px 10px rgba(0,0,0,.3)",
                          }}>
                            {item.course_name}<br />
                            <span style={{ color: "rgba(255,255,255,.55)" }}>{item.date}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: big sparkline + 2×2 stats */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <Sparkline data={sparklineData} w={200} h={68} stroke="#6de8b8" fill="rgba(109,232,184,.12)" />
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", marginTop: 3, letterSpacing: 0.3 }}>
                  last {sparklineData.length} rounds
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { label: "Score", val: fmtStp(stats20?.avgScoreToPar) },
                  { label: "Putts", val: fmtPuts(stats20?.avgPuttsPer18) },
                  { label: "Fwy",   val: fmtPct(stats20?.drivingPct) },
                  { label: "GIR",   val: fmtPct(stats20?.girPct) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 17, fontWeight: 600, color: "white", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                      {s.val}
                    </div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,.4)", marginTop: 3, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Trophy Case ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, color: "var(--ink)", marginBottom: 10 }}>
            Trophy case
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(() => {
              const brScore = bestRound ? totalScore(bestRound.holes) : null;
              const brPar = bestRound ? bestRound.holes.reduce((s: number, h: any) => s + (h.par || 0), 0) : null;
              const brToPar = brScore != null && brPar ? brScore - brPar : null;
              const brToParStr = brToPar == null ? "" : brToPar === 0 ? " (E)" : brToPar > 0 ? ` (+${brToPar})` : ` (${brToPar})`;
              return [{
                kind: "pr",
                big: brScore != null ? String(brScore) : "—",
                label: "Best round",
                sub: bestRound
                  ? `${brToParStr ? brToParStr.slice(2, -1) + " vs par · " : ""}${bestRound.course_name} · ${fmtDateShort(bestRound.date)}`
                  : "No 18-hole rounds yet",
                extra: brToParStr ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {brToPar === 0 ? "Even par" : brToPar! > 0 ? `+${brToPar} vs par` : `${brToPar} vs par`}
                  </div>
                ) : null,
              }];
            })().map(t => (
              <div key={t.label} style={{
                background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14,
                padding: "14px 16px", position: "relative",
              }}>
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <MilestoneBadge kind={t.kind} size={22} />
                </div>
                <div style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: 32, color: "var(--green-deep)", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                  {t.big}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginTop: 6 }}>{t.label}</div>
                {t.extra}
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {bestRound ? `${bestRound.course_name} · ${fmtDateShort(bestRound.date)}` : "No 18-hole rounds yet"}
                </div>
              </div>
            ))}
            {[
              {
                kind: "diff", big: bestDiffEntry ? bestDiffEntry.diff.toFixed(1) : "—",
                label: "Best differential", sub: bestDiffEntry ? `${bestDiffEntry.course_name} · ${bestDiffEntry.date}` : "—",
              },
              {
                kind: "streak", big: String(streak),
                label: streak === 1 ? "Sub-90 round" : "Sub-90 streak", sub: streak > 0 ? "Current run" : "Break 90 to start one",
              },
              {
                kind: "course", big: String(coursesThisYear || new Set(rounds.map(r => r.course_id)).size),
                label: coursesThisYear ? "Courses this year" : "Courses played", sub: `${rounds.length} total rounds`,
              },
            ].map(t => (
              <div key={t.label} style={{
                background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14,
                padding: "14px 16px", position: "relative",
              }}>
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <MilestoneBadge kind={t.kind} size={22} />
                </div>
                <div style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: 32, color: "var(--green-deep)", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                  {t.big}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginTop: 6 }}>{t.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--line)", marginBottom: 18, gap: 0 }}>
          {([
            { id: "stats",  label: "Stats" },
            { id: "rounds", label: "Rounds", count: rounds.length },
            { id: "bag",    label: "Bag" },
            { id: "notes",  label: "Notes" },
          ] as const).map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, background: "none", border: "none",
                borderBottom: active ? "2px solid var(--green-deep)" : "2px solid transparent",
                padding: "10px 4px", marginBottom: -1, cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                color: active ? "var(--green-deep)" : "var(--muted)",
              }}>
                {t.label}
                {"count" in t && t.count != null && (
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.55 }}> · {t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Rounds tab ── */}
        {tab === "rounds" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontWeight: 500 }}
              >
                <option value="">All courses</option>
                {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontWeight: 500 }}
              >
                <option value="">All years</option>
                {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {(courseFilter || yearFilter) && (
                <button onClick={() => { setCourseFilter(""); setYearFilter(""); }}
                  style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Reset
                </button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-2)", fontWeight: 600 }}>
                {filteredRounds.length} {filteredRounds.length !== rounds.length ? `of ${rounds.length} ` : ""}rounds
              </span>
            </div>

            {filteredRounds.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: 13 }}>No rounds match your filters.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredRounds.map(round => {
                  const sc = totalScore(round.holes);
                  const rawDiff = round.score_differential != null
                    ? (round.holes_played <= 9 ? round.score_differential * 2 : round.score_differential)
                    : null;
                  const isBestRound = bestRound?.id === round.id;
                  return (
                    <div key={round.id} style={{
                      background: "var(--paper)", border: `1px solid ${isBestRound ? "var(--sand)" : "var(--line)"}`,
                      borderRadius: 14, padding: "14px 16px",
                      boxShadow: isBestRound ? "0 0 0 1px var(--sand)22" : "none",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--green-deep)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {round.course_name}
                            </span>
                            {isBestRound && <MilestoneBadge kind="pr" size={16} />}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: 0.2 }}>
                            {round.date} · {round.holes_played} holes
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: 26, color: "var(--ink)", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                              {sc || "—"}
                            </div>
                            {rawDiff !== null && (
                              <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, marginTop: 2 }}>
                                Diff {fmtDiff(rawDiff)}
                              </div>
                            )}
                          </div>
                          <a href={`/rounds/${round.id}/edit`} title="Edit"
                            style={iconBtn("var(--ink)", `edit-${round.id}`)}
                            onMouseEnter={() => setHoveredBtn(`edit-${round.id}`)}
                            onMouseLeave={() => setHoveredBtn(null)}
                          ><Pencil size={13} /></a>
                          <button title="Delete" onClick={() => setDeleteTarget(round)}
                            style={iconBtn("#c0392b", `del-${round.id}`)}
                            onMouseEnter={() => setHoveredBtn(`del-${round.id}`)}
                            onMouseLeave={() => setHoveredBtn(null)}
                          ><Trash2 size={13} /></button>
                        </div>
                      </div>

                      {/* Stat strip */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                        {[
                          { label: "Putts",   val: totalPutts(round.holes) || "—" },
                          { label: "Driving", val: `${fairwaysHit(round.holes)}/${drivingTotal(round.holes)}` },
                          { label: "GIR",     val: `${girsHit(round.holes)}/${round.holes.length}` },
                          { label: "+/−",     val: (() => { const p = round.holes.reduce((s, h) => s + (h.par || 0), 0); const d = sc - p; return d > 0 ? `+${d}` : d === 0 ? "E" : String(d); })() },
                        ].map(({ label, val }) => (
                          <div key={label} style={{ background: "var(--paper-alt)", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 8.5, color: "var(--muted-2)", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green-deep)", fontFeatureSettings: '"tnum" 1' }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Action chips */}
                      <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <a href={`/rounds/recap?roundId=${round.id}`} style={{
                          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, textDecoration: "none",
                          background: round.recap ? "var(--green-soft)" : "var(--paper-alt)",
                          color: round.recap ? "var(--green-deep)" : "var(--muted-2)",
                          border: `1px solid ${round.recap ? "var(--green)" : "var(--line)"}`,
                        }}>
                          {round.recap ? "✓ Recap" : "+ Recap"}
                        </a>
                        <a href={`/rounds/insights`} style={{
                          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, textDecoration: "none",
                          background: "var(--paper-alt)", color: "var(--muted-2)", border: "1px solid var(--line)",
                        }}>
                          Insights
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Stats tab ── */}
        {tab === "stats" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Stats comparison table */}
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700 }}>Form</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", fontSize: 9.5, color: "var(--muted-2)", fontWeight: 700, padding: "8px 16px 4px", letterSpacing: 0.5, textTransform: "uppercase" }}>
                <span />
                <span style={{ textAlign: "center" }}>Last 5</span>
                <span style={{ textAlign: "center" }}>Last 20</span>
                <span style={{ textAlign: "center" }}>All time</span>
              </div>
              {[
                { label: "Score to par", v: [stats5, stats20, statsAll].map(s => fmtStp(s?.avgScoreToPar)) },
                { label: "Putts / 18",  v: [stats5, stats20, statsAll].map(s => fmtPuts(s?.avgPuttsPer18)) },
                { label: "Fairways",    v: [stats5, stats20, statsAll].map(s => fmtPct(s?.drivingPct)) },
                { label: "GIR",         v: [stats5, stats20, statsAll].map(s => fmtPct(s?.girPct)) },
                { label: "1st putt",    v: [stats5, stats20, statsAll].map(s => fmtFt(s?.avgPuttAfterChip)) },
              ].map((row, i) => (
                <div key={row.label} style={{
                  display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
                  padding: "9px 16px", borderTop: `1px solid var(--line-soft)`, fontSize: 13, alignItems: "center",
                }}>
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>{row.label}</span>
                  {row.v.map((val, j) => (
                    <span key={j} style={{ textAlign: "center", color: "var(--green-deep)", fontWeight: 700, fontFeatureSettings: '"tnum" 1' }}>{val}</span>
                  ))}
                </div>
              ))}
            </div>

            {/* Best at each course */}
            {courseStatsList.length > 0 && (
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700 }}>Best at each course</div>
                </div>
                {courseStatsList.map((cs, i) => (
                  <div key={cs.name} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
                    padding: "11px 16px", borderTop: i ? "1px solid var(--line-soft)" : "none",
                  }}>
                    <CourseGlyph name={cs.name} size={30} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cs.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                        {cs.rounds} rounds · avg {(cs.total / cs.rounds).toFixed(1)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: 20, color: "var(--green-deep)", lineHeight: 1 }}>{cs.best}</div>
                      <div style={{ fontSize: 9.5, color: "var(--muted-2)", marginTop: 2 }}>{fmtDateShort(cs.bestDate)}</div>
                    </div>
                    <MilestoneBadge kind="course" size={18} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bag tab ── */}
        {tab === "bag" && (
          <div>
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700 }}>Club distances</div>
                {!distEditing && (
                  <button onClick={() => { setDistDraft({ ...clubDistances }); setDistEditing(true); }}
                    style={{ fontSize: 11, color: "var(--green)", background: "none", border: "1px solid var(--green)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>
                    Edit
                  </button>
                )}
              </div>
              {Object.entries(distEditing ? distDraft : clubDistances).map(([club, { min, max }], i) => (
                <div key={club} style={{
                  display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center",
                  padding: "10px 16px", borderTop: i ? "1px solid var(--line-soft)" : "none",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{club}</span>
                  <div style={{ position: "relative", height: 7, background: "var(--paper-alt)", borderRadius: 99 }}>
                    <div style={{
                      position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "var(--green)",
                      left: `${((min - 50) / 250) * 100}%`,
                      width: `${((max - min) / 250) * 100}%`,
                    }} />
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: distEditing ? 130 : 70 }}>
                    {distEditing ? (
                      <>
                        <input type="number" value={min}
                          onChange={e => setDistDraft(d => ({ ...d, [club]: { ...d[club], min: Number(e.target.value) } }))}
                          style={{ width: 52, textAlign: "center", padding: "3px 4px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, color: "var(--ink)", background: "var(--paper)" }} />
                        <span style={{ fontSize: 10, color: "var(--muted-2)" }}>–</span>
                        <input type="number" value={max}
                          onChange={e => setDistDraft(d => ({ ...d, [club]: { ...d[club], max: Number(e.target.value) } }))}
                          style={{ width: 52, textAlign: "center", padding: "3px 4px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, color: "var(--ink)", background: "var(--paper)" }} />
                        <button onClick={() => setDistDraft(d => { const n = { ...d }; delete n[club]; return n; })}
                          style={{ fontSize: 11, color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>✕</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11.5, fontFamily: "monospace", color: "var(--green-deep)", fontWeight: 600 }}>{min}–{max}y</span>
                    )}
                  </div>
                </div>
              ))}
              {distEditing && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "8px 16px", borderTop: "1px dashed var(--line)", background: "var(--paper-alt)" }}>
                    <input value={newClubName} onChange={e => setNewClubName(e.target.value)} placeholder="Club"
                      style={{ padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, color: "var(--ink)", background: "var(--paper)", width: "100%" }} />
                    <div />
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input type="number" value={newClubMin} onChange={e => setNewClubMin(e.target.value)} placeholder="Min"
                        style={{ width: 52, textAlign: "center", padding: "3px 4px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, color: "var(--ink)", background: "var(--paper)" }} />
                      <span style={{ fontSize: 10, color: "var(--muted-2)" }}>–</span>
                      <input type="number" value={newClubMax} onChange={e => setNewClubMax(e.target.value)} placeholder="Max"
                        style={{ width: 52, textAlign: "center", padding: "3px 4px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, color: "var(--ink)", background: "var(--paper)" }} />
                      <button onClick={() => {
                        if (!newClubName.trim() || !newClubMin || !newClubMax) return;
                        setDistDraft(d => ({ ...d, [newClubName.trim()]: { min: Number(newClubMin), max: Number(newClubMax) } }));
                        setNewClubName(""); setNewClubMin(""); setNewClubMax("");
                      }} style={{ fontSize: 11, color: "var(--green)", background: "none", border: "1px solid var(--green)", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                        + Add
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
                    <button onClick={saveDistances} disabled={distSaving}
                      style={{ flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600, background: "var(--green-deep)", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                      {distSaving ? "Saving…" : distSaved ? "Saved!" : "Save distances"}
                    </button>
                    <button onClick={() => setDistEditing(false)}
                      style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "var(--paper-alt)", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Notes tab ── */}
        {tab === "notes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Strengths */}
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, borderLeft: "3px solid var(--good)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--good)", textTransform: "uppercase", fontWeight: 700 }}>Strengths</div>
                {!editing && <button onClick={() => setEditing(true)}
                  style={{ fontSize: 11, color: "var(--green)", background: "none", border: "1px solid var(--green)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>Edit</button>}
              </div>
              {editing ? (
                <textarea value={profile.strengths} onChange={e => setProfile(p => ({ ...p, strengths: e.target.value }))}
                  rows={4} placeholder="e.g. Consistent off the tee, good touch around greens…"
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, boxSizing: "border-box", resize: "vertical", color: "var(--ink)", background: "var(--paper)", lineHeight: 1.55 }} />
              ) : (
                <div style={{ fontSize: 13, color: profile.strengths ? "var(--ink)" : "var(--muted-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", fontStyle: profile.strengths ? "normal" : "italic" }}>
                  {profile.strengths || "Tap Edit to add your strengths…"}
                </div>
              )}
            </div>

            {/* Weaknesses */}
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, borderLeft: "3px solid var(--bad)" }}>
              <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--bad)", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Weaknesses</div>
              {editing ? (
                <textarea value={profile.weaknesses} onChange={e => setProfile(p => ({ ...p, weaknesses: e.target.value }))}
                  rows={4} placeholder="e.g. Long irons inconsistent, speed control on downhillers…"
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, boxSizing: "border-box", resize: "vertical", color: "var(--ink)", background: "var(--paper)", lineHeight: 1.55 }} />
              ) : (
                <div style={{ fontSize: 13, color: profile.weaknesses ? "var(--ink)" : "var(--muted-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", fontStyle: profile.weaknesses ? "normal" : "italic" }}>
                  {profile.weaknesses || "Tap Edit to add your weaknesses…"}
                </div>
              )}
            </div>

            {editing && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveProfile} disabled={saving}
                  style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, background: "var(--green-deep)", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  {saving ? "Saving…" : saved ? "Saved!" : "Save notes"}
                </button>
                <button onClick={() => setEditing(false)}
                  style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, background: "var(--paper-alt)", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Wishlist */}
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>Wishlist</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={newItem} onChange={e => setNewItem(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { saveChangeLog([...changeLog, newItem.trim()]); setNewItem(""); } }}
                  placeholder="Add a goal or desired change…"
                  style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", background: "var(--paper)", outline: "none" }} />
                <button onClick={() => { if (!newItem.trim()) return; saveChangeLog([...changeLog, newItem.trim()]); setNewItem(""); }}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "var(--green-deep)", color: "white", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Add
                </button>
              </div>
              {changeLog.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted-2)", fontStyle: "italic", margin: 0 }}>No wishlist items yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {changeLog.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                      <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--sand)", flexShrink: 0, marginTop: 5 }} />
                      <span style={{ flex: 1, fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{item}</span>
                      <button onClick={() => saveChangeLog(changeLog.filter((_, idx) => idx !== i))}
                        style={{ fontSize: 11, color: "var(--bad)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Club advice from recaps */}
            {recapRounds.length > 0 && (
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>Club advice · last recaps</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { key: "Driver", label: "Driver" }, { key: "3W", label: "3-wood" }, { key: "5W", label: "5-wood" },
                    { key: "4i-7i", label: "4i – 7i" }, { key: "8i-PW", label: "8i – PW" },
                    { key: "SW-LW", label: "SW – LW / Chip" }, { key: "Putter", label: "Putter" },
                  ].map(g => {
                    const notes = recapRounds.map(r => ({
                      date: r.date, course: r.course_name,
                      note: ((r.recap as any)?.group_notes?.[g.key] ?? "").trim(),
                    })).filter(n => n.note);
                    if (!notes.length) return null;
                    return (
                      <div key={g.key}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{g.label}</div>
                        {notes.map((n, i) => (
                          <div key={i} style={{ marginBottom: i < notes.length - 1 ? 8 : 0 }}>
                            <div style={{ fontSize: 10, color: "var(--muted-2)", marginBottom: 2 }}>{n.course} · {n.date}</div>
                            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{n.note}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete modal ── */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "var(--paper)", borderRadius: 14, padding: 28, maxWidth: 400, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--ink)" }}>Delete this round?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
              {deleteTarget.date} — {deleteTarget.course_name}. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={confirmDelete}
                style={{ flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600, background: "var(--bad)", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                Yes, delete
              </button>
              <button onClick={() => setDeleteTarget(null)}
                style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "var(--paper-alt)", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
