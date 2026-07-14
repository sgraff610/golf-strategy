"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getClubDistances, getClubDistancesSync, saveClubDistances } from "@/lib/storage";
import { DEFAULT_CLUB_DISTANCES } from "@/lib/planTypes";
import type { ClubDistances } from "@/lib/planTypes";
import { Pencil, Trash2 } from "lucide-react";
import { useIsMobile } from "@/app/hooks/useIsMobile";

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

// ─── Grade helpers ────────────────────────────────────────────────────────────

const GRADE_DIST_ORDER = ["Gimme","3ft","5ft","7ft","10ft","15ft","20ft","30ft","40ft","50ft","50+"];
const GRADE_PUTT_FALLBACK: Record<string,number> = {
  "Gimme":1.00,"3ft":1.07,"5ft":1.28,"7ft":1.52,"10ft":1.75,
  "15ft":1.90,"20ft":1.97,"30ft":2.05,"40ft":2.12,"50ft":2.18,"50+":2.23,
};
const GRADE_IRON_CLUBS = ["4i","5i","6i","7i","8i","9i","PW","GW","SW","LW"];
const GRADE_DIST_FT: Record<string,number> = {
  "Gimme":1,"3ft":3,"5ft":5,"7ft":7,"10ft":10,
  "15ft":15,"20ft":20,"30ft":30,"40ft":40,"50ft":50,"50+":60,
};

type PerfGrade = { letter: string; color: string; bg: string; detail: string };
type Grades = { driver: PerfGrade | null; iron: PerfGrade | null; chipping: PerfGrade | null; putter: PerfGrade | null };

function gSG(sg: number) {
  if (sg >= 3.0)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (sg >= 1.5)  return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (sg >= 0)    return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (sg >= -1.5) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (sg >= -3.0) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return                  { letter:"F",  color:"#fff", bg:"#c0392b" };
}
function gDriver(d: number) {
  if (d >= 15)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (d >= 8)   return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (d >= -5)  return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (d >= -15) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (d >= -25) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return               { letter:"F",  color:"#fff", bg:"#c0392b" };
}
function gChip(ccs: number) {
  if (ccs >= 2.0)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (ccs >= 1.0)  return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (ccs >= 0)    return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (ccs >= -1.0) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (ccs >= -2.0) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return                   { letter:"F",  color:"#fff", bg:"#c0392b" };
}
function gIron(delta: number) {
  if (delta >= 2.0)  return { letter:"A+", color:"#fff", bg:"#0f6e56" };
  if (delta >= 1.0)  return { letter:"A",  color:"#fff", bg:"#27ae60" };
  if (delta >= 0)    return { letter:"B",  color:"#fff", bg:"#2980b9" };
  if (delta >= -1.0) return { letter:"C",  color:"#333", bg:"#f5c842" };
  if (delta >= -2.0) return { letter:"D",  color:"#fff", bg:"#e67e22" };
  return                    { letter:"F",  color:"#fff", bg:"#c0392b" };
}

function computeGrades(allRounds: Round[], round: Round): Grades {
  const allHoles = allRounds.flatMap(r => r.holes ?? []);
  const rh = round.holes ?? [];

  // Putter
  const puttBase: Record<string,number> = { ...GRADE_PUTT_FALLBACK };
  for (const dist of GRADE_DIST_ORDER) {
    const hs = allHoles.filter(h => h.first_putt_distance === dist && Number(h.putts) > 0);
    if (hs.length >= 5) puttBase[dist] = hs.reduce((s,h) => s + Number(h.putts), 0) / hs.length;
  }
  const putterHoles = rh.filter(h => h.first_putt_distance && puttBase[h.first_putt_distance] != null && Number(h.putts) > 0);
  let putter: PerfGrade | null = null;
  if (putterHoles.length >= 3) {
    const exp = putterHoles.reduce((s,h) => s + puttBase[h.first_putt_distance], 0);
    const act = putterHoles.reduce((s,h) => s + Number(h.putts), 0);
    const sg = Math.round((exp - act) * 10) / 10;
    const cost = Math.round(-sg * 10) / 10;
    putter = { ...gSG(sg), detail: `${cost >= 0 ? "+" : ""}${cost} strokes vs avg (${putterHoles.length} holes)` };
  }

  // Iron
  const ironBase: Record<string,number> = {};
  for (const club of GRADE_IRON_CLUBS) {
    const shots = allHoles.filter(h => h.appr_distance === club && h.appr_accuracy && h.appr_accuracy !== "");
    if (shots.length >= 3) ironBase[club] = shots.filter(h => h.appr_accuracy === "Hit").length / shots.length;
  }
  const ironShots = rh.filter(h => GRADE_IRON_CLUBS.includes(h.appr_distance) && h.appr_accuracy && h.appr_accuracy !== "" && ironBase[h.appr_distance] != null);
  let iron: PerfGrade | null = null;
  if (ironShots.length >= 3) {
    const exp = ironShots.reduce((s,h) => s + (ironBase[h.appr_distance] ?? 0), 0);
    const act = ironShots.filter(h => h.appr_accuracy === "Hit").length;
    const delta = Math.round((act - exp) * 10) / 10;
    iron = { ...gIron(delta), detail: `${delta >= 0 ? "+" : ""}${delta} greens vs avg (${ironShots.length} shots)` };
  }

  // Chipping (April 2026+ baseline)
  const apr26 = allRounds.filter(r => r.date >= "2026-04-01");
  let totalExtra = 0, chipRounds = 0, totalProxFt = 0, totalProxHoles = 0;
  for (const r of apr26) {
    const hs: any[] = r.holes ?? [];
    const norm = (r.holes_played ?? hs.length) <= 9 ? 2 : 1;
    const extra = hs.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 2).length * norm;
    const proxHoles = hs.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 1 && GRADE_DIST_FT[h.first_putt_distance] != null);
    if (proxHoles.length >= 1) {
      totalExtra += extra; chipRounds++;
      totalProxFt += proxHoles.reduce((s,h) => s + GRADE_DIST_FT[h.first_putt_distance], 0);
      totalProxHoles += proxHoles.length;
    }
  }
  let chipping: PerfGrade | null = null;
  if (chipRounds >= 2 && round.date >= "2026-04-01") {
    const baseExtra = totalExtra / chipRounds;
    const baseProx = totalProxHoles > 0 ? totalProxFt / totalProxHoles : null;
    const norm = (round.holes_played ?? rh.length) <= 9 ? 2 : 1;
    const roundExtra = rh.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 2).length * norm;
    const roundProxH = rh.filter(h => (Number(h.chips)||0) + (Number(h.greenside_bunker)||0) >= 1 && GRADE_DIST_FT[h.first_putt_distance] != null);
    if (roundProxH.length >= 2) {
      const roundProx = roundProxH.reduce((s,h) => s + GRADE_DIST_FT[h.first_putt_distance], 0) / roundProxH.length;
      const dcSG = baseExtra - roundExtra;
      const proxSG = baseProx != null ? (baseProx - roundProx) * 0.08 : 0;
      const ccs = Math.round((dcSG + proxSG) * 10) / 10;
      chipping = { ...gChip(ccs), detail: `${ccs >= 0 ? "+" : ""}${ccs} composite · ${Math.round(roundProx * 10) / 10}ft avg` };
    }
  }

  // Driver
  const last50 = [...allRounds].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 50);
  const base = last50.reduce((acc,r) => {
    const dh = (r.holes ?? []).filter((h: any) => h.par === 4 || h.par === 5);
    acc.hit += dh.filter((h: any) => h.tee_accuracy === "Hit").length;
    acc.total += dh.length;
    return acc;
  }, { hit: 0, total: 0 });
  let driver: PerfGrade | null = null;
  if (base.total >= 20) {
    const baseFIR = (base.hit / base.total) * 100;
    const dh = rh.filter(h => h.par === 4 || h.par === 5);
    if (dh.length >= 2) {
      const hit = dh.filter(h => h.tee_accuracy === "Hit").length;
      const fir = (hit / dh.length) * 100;
      const delta = Math.round((fir - baseFIR) * 10) / 10;
      driver = { ...gDriver(delta), detail: `${hit}/${dh.length} FIR (${Math.round(fir)}%) · ${delta >= 0 ? "+" : ""}${delta}pp vs avg` };
    }
  }

  return { driver, iron, chipping, putter };
}

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
  const threePuttHoles = scoredHoles.filter((h: any) => Number(h.putts) >= 3);
  // Only count chip+GS bunker from 2026+ rounds (not tracked before then)
  const chipGsRounds = slice.filter(r => r.date >= "2026-01-01");
  const chipGsScoredHoles = chipGsRounds.flatMap(r => r.holes.filter((h: any) => h.score && Number(h.score) > 0));
  const gsExtraShots = chipGsScoredHoles.reduce((s: number, h: any) => s + Math.max(0, (Number(h.chips) || 0) + (Number(h.greenside_bunker) || 0) - 1), 0);
  return {
    avgScoreToPar: roundScoresPar.length ? roundScoresPar.reduce((s, v) => s + v, 0) / roundScoresPar.length : 0,
    avgPuttsPer18: totalHoles > 0 ? (scoredHoles.reduce((s, h: any) => s + (Number(h.putts) || 0), 0) / totalHoles) * 18 : null,
    drivingPct: drivingHoles.length > 0 ? drivingHoles.filter((h: any) => h.tee_accuracy === "Hit").length / drivingHoles.length : null,
    girPct: totalHoles > 0 ? scoredHoles.filter((h: any) => h.gir).length / totalHoles : null,
    avgPuttAfterChip: chipHoles.length > 0 ? chipHoles.reduce((s, h: any) => s + PUTT_DIST_MAP[h.first_putt_distance], 0) / chipHoles.length : null,
    threePuttPer18: totalHoles > 0 ? (threePuttHoles.length / totalHoles) * 18 : null,
    gsExtraShotsPer18: chipGsScoredHoles.length > 0 ? (gsExtraShots / chipGsScoredHoles.length) * 18 : null,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtStp = (n?: number | null) => n == null ? "—" : n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
const fmtDiff = (n?: number | null) => n == null ? "—" : n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
const fmtPct = (n?: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`;
const fmtPuts = (n?: number | null) => n == null ? "—" : n.toFixed(1);
const fmtFt = (n?: number | null) => n == null ? "—" : `${n.toFixed(1)}ft`;
const fmtSge = (n?: number | null) => n == null ? "—" : n.toFixed(1);
const fmtDateShort = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function totalScore(holes: any[]) { return holes.reduce((s, h) => s + (Number(h.score) || 0), 0); }
function totalPar(holes: any[]) { return holes.reduce((s, h) => s + (h.par || 0), 0); }
function totalPutts(holes: any[]) { return holes.reduce((s, h) => s + (Number(h.putts) || 0), 0); }
function fairwaysHit(holes: any[]) { return holes.filter(h => (h.par === 4 || h.par === 5) && h.tee_accuracy === "Hit").length; }
function drivingTotal(holes: any[]) { return holes.filter(h => h.par === 4 || h.par === 5).length; }
function girsHit(holes: any[]) { return holes.filter(h => h.gir).length; }
function threePuttCount(holes: any[]) { return holes.filter(h => Number(h.putts) >= 3).length; }
function gsExtraShotCount(holes: any[]) { return holes.reduce((s, h) => s + Math.max(0, (Number(h.chips) || 0) + (Number(h.greenside_bunker) || 0) - 1), 0); }
function avgFirstPuttAfterChip(holes: any[]): string {
  const ch = holes.filter(h => Number(h.chips) > 0 && PUTT_DIST_MAP[h.first_putt_distance] !== undefined);
  if (ch.length === 0) return "—";
  return (ch.reduce((s, h) => s + PUTT_DIST_MAP[h.first_putt_distance], 0) / ch.length).toFixed(1) + "ft";
}

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
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
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
      background: "linear-gradient(135deg,#f29450 0%,#d4763a 60%,#b85320 100%)",
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
  const isMobile = useIsMobile();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courseInfoMap, setCourseInfoMap] = useState<Record<string, CourseInfo>>({});
  const [profile, setProfile] = useState({ strengths: "", weaknesses: "" });
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [clubDistances, setClubDistances] = useState<ClubDistances>(() => getClubDistancesSync());
  const [distDraft, setDistDraft] = useState<ClubDistances>(() => getClubDistancesSync());
  const [recapRounds, setRecapRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [tab, setTab] = useState<"rounds" | "trophy" | "bag" | "notes">("rounds");
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
  const tabsRef = useRef<HTMLDivElement>(null);

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
    setClubDistances(distDraft);
    setDistEditing(false);
    setDistSaving(false);
    setDistSaved(true);
    setTimeout(() => setDistSaved(false), 2000);
  }

  async function toggleInBag(club: string) {
    const current = clubDistances[club]?.inBag !== false;
    const updated = { ...clubDistances, [club]: { ...clubDistances[club], inBag: !current } };
    setClubDistances(updated);
    setDistDraft(updated);
    await saveClubDistances(updated);
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

  const byAvgDist = (a: [string, { min: number; max: number }], b: [string, { min: number; max: number }]) =>
    ((b[1].min + b[1].max) / 2) - ((a[1].min + a[1].max) / 2);
  const bagSource = distEditing ? distDraft : clubDistances;
  const inBagEntries = Object.entries(bagSource).filter(([, v]) => v.inBag !== false).sort(byAvgDist);
  const reserveEntries = Object.entries(bagSource).filter(([, v]) => v.inBag === false).sort(byAvgDist);

  const roundsAsc = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const roundsDesc = [...rounds].sort((a, b) => b.date.localeCompare(a.date));

  const todayISO = new Date().toISOString().split("T")[0];
  const diffsWithInfo = roundsAsc.map(r => {
    // Don't count toward handicap unless: round date is in the past, OR all hole scores are entered.
    const isPast = (r.date ?? "") < todayISO;
    const scoredCount = r.holes.filter(h => h.score && Number(h.score) > 0).length;
    const expectedHoles = (r.holes_played > 0) ? r.holes_played : 18;
    const isComplete = scoredCount >= expectedHoles;
    if (!isPast && !isComplete) return null;
    const d = r.score_differential != null
      ? (r.holes_played <= 9 ? r.score_differential * 2 : r.score_differential)
      : computeDiffNum(r, courseInfoMap[r.course_id]);
    return d !== null ? { diff: d, course_name: r.course_name, date: r.date, id: r.id } : null;
  }).filter((d): d is { diff: number; course_name: string; date: string; id: string } => d !== null);

  const diffsOnly = diffsWithInfo.map(d => d.diff);
  const last20WithInfo = diffsWithInfo.slice(-20);
  const last20Diffs = last20WithInfo.map(d => d.diff);
  const handicapIndex = computeHandicapIndex(diffsOnly);

  const sorted20 = [...last20Diffs].sort((a, b) => a - b);
  const threshold = sorted20[Math.min(7, sorted20.length - 1)] ?? Infinity;
  const sparklineData = diffsOnly.slice(-20);

  // Last-5-rounds trend: compare current HI to HI computed without the last 5 rounds
  const hcp5ago = diffsOnly.length > 5 ? computeHandicapIndex(diffsOnly.slice(0, -5)) : null;
  const trend = handicapIndex != null && hcp5ago != null ? handicapIndex - hcp5ago : null;

  const stats5 = calcStats(roundsAsc.slice(-5));
  const stats20 = calcStats(roundsAsc.slice(-20));
  const statsAll = calcStats(roundsAsc);

  // Trophy computations
  const rounds18 = roundsDesc.filter(r => (r.holes_played ?? r.holes.length) >= 18 && totalScore(r.holes) > 0);
  const bestRound = rounds18.length ? rounds18.reduce((b, r) =>
    (totalScore(r.holes) - totalPar(r.holes)) < (totalScore(b.holes) - totalPar(b.holes)) ? r : b
  ) : null;
  const bestDiffEntry = diffsWithInfo.length ? diffsWithInfo.reduce((b, d) => d.diff < b.diff ? d : b) : null;
  let streak = 0;
  for (const r of rounds18) { if (totalScore(r.holes) < 90) streak++; else break; }
  const thisYear = new Date().getFullYear().toString();
  const coursesThisYear = new Set(rounds.filter(r => r.date?.startsWith(thisYear)).map(r => r.course_id)).size;

  // Best by course
  const csByCourse: Record<string, { name: string; courseId: string; rounds: number; best: number; bestDate: string; total: number }> = {};
  for (const r of rounds18) {
    const sc = totalScore(r.holes);
    if (!csByCourse[r.course_id]) csByCourse[r.course_id] = { name: r.course_name, courseId: r.course_id, rounds: 0, best: sc, bestDate: r.date, total: 0 };
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

  const gradesMap = useMemo((): Record<string, Grades> => {
    if (rounds.length === 0) return {};
    const sorted = [...rounds].sort((a, b) => b.date.localeCompare(a.date));
    const recent20 = sorted.slice(0, 20);
    const map: Record<string, Grades> = {};
    for (const r of recent20) map[r.id] = computeGrades(rounds, r);
    return map;
  }, [rounds]);

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
          <div style={{ position: "absolute", top: 0, right: 0, width: 160, height: 160, background: "radial-gradient(circle,rgba(242,148,80,.15) 0%,transparent 70%)", pointerEvents: "none" }} />

          {/* 2-row × 2-col grid: stacks to single column on mobile */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gridTemplateRows: "auto auto", columnGap: 16, rowGap: 10 }}>

            {/* Row 1, Col 1: HI + trend — 2-col inner grid aligned to sub-stats below */}
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  {handicapIndex !== null ? (
                    <div style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 56, color: "white", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                      {handicapIndex.toFixed(1)}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "rgba(255,255,255,.5)", lineHeight: 1 }}>
                      {diffsOnly.length < 3 ? `Need ${3 - diffsOnly.length} more` : "—"}
                    </div>
                  )}
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,.35)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 4 }}>
                    Handicap Index
                  </div>
                </div>
                {trend !== null ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 40, fontWeight: 500, color: trend < 0 ? "#6de8b8" : "#f29450", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                      {trend < 0 ? `↓ ${Math.abs(trend).toFixed(1)}` : `↑ ${trend.toFixed(1)}`}
                    </div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,.4)", marginTop: 4, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>
                      last 5 rounds
                    </div>
                  </div>
                ) : <div />}
              </div>
            </div>

            {/* Row 1, Col 2: sparkline — width:100% so it fills column same as chip grid below */}
            <div style={{ width: "100%" }}>
              <Sparkline data={sparklineData} w={200} h={55} stroke="#6de8b8" fill="rgba(109,232,184,.12)" />
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", marginTop: 3, letterSpacing: 0.3 }}>
                last {sparklineData.length} rounds
              </div>
            </div>

            {/* Row 2, Col 1: 2×2 sub-stats under the HI number */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[
                { label: "Score", val: fmtStp(stats20?.avgScoreToPar) },
                { label: "Putts", val: fmtPuts(stats20?.avgPuttsPer18) },
                { label: "Fwy",   val: fmtPct(stats20?.drivingPct) },
                { label: "GIR",   val: fmtPct(stats20?.girPct) },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 600, color: "white", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
                    {s.val}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,.4)", marginTop: 3, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Row 2, Col 2: 5×4 diff chip grid — bottom right */}
            {last20WithInfo.length > 0 ? (
              <div>
              <div style={{ fontSize:7, color:"rgba(255,255,255,.22)", fontWeight:600, letterSpacing:0.4, textTransform:"uppercase", marginBottom:3 }}>oldest ←</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }}>
                {last20WithInfo.map((item, i) => {
                  const used = item.diff <= threshold;
                  const active = activeDiffIdx === i;
                  const isNewest = i === last20WithInfo.length - 1;
                  return (
                    <div key={i} style={{ position: "relative" }}>
                      <a
                        href={`/rounds/${item.id}/edit`}
                        onMouseEnter={() => setActiveDiffIdx(i)}
                        onMouseLeave={() => setActiveDiffIdx(null)}
                        style={{
                          display: "block", fontSize: 9, fontWeight: 700, padding: "3px 5px", borderRadius: 99,
                          cursor: "pointer", fontFeatureSettings: '"tnum" 1', textAlign: "center",
                          textDecoration: "none",
                          background: used ? "linear-gradient(135deg,#f29450,#b85320)" : "rgba(255,255,255,.1)",
                          color: used ? "#fff8e3" : "rgba(255,255,255,.4)",
                          boxShadow: used ? "0 1px 2px rgba(80,55,15,.3)" : "none",
                          border: isNewest ? "1px solid rgba(255,255,255,.35)" : used ? "none" : "1px solid rgba(255,255,255,.07)",
                        }}
                      >
                        {item.diff.toFixed(1)}
                      </a>
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
              <div style={{ textAlign:"right", marginTop:3, fontSize:7, color:"rgba(255,255,255,.22)", fontWeight:600, letterSpacing:0.4, textTransform:"uppercase" }}>→ newest</div>
              </div>
            ) : <div />}

          </div>
        </div>

        {/* ── Key Stats (always visible) ── */}
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700 }}>Key Stats</div>
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
            { label: "1st putt after chip", v: [stats5, stats20, statsAll].map(s => fmtFt(s?.avgPuttAfterChip)) },
            { label: "3-Putts / 18",        v: [stats5, stats20, statsAll].map(s => fmtSge(s?.threePuttPer18)) },
            { label: "GS Extra Shots / 18", v: [stats5, stats20, statsAll].map(s => fmtSge(s?.gsExtraShotsPer18)) },
          ].map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "9px 16px", borderTop: "1px solid var(--line-soft)", fontSize: 13, alignItems: "center" }}>
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>{row.label}</span>
              {row.v.map((val, j) => (
                <span key={j} style={{ textAlign: "center", color: "var(--green-deep)", fontWeight: 700, fontFeatureSettings: '"tnum" 1' }}>{val}</span>
              ))}
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div ref={tabsRef} style={{ display: "flex", borderBottom: "1px solid var(--line)", marginBottom: 18, gap: 0 }}>
          {([
            { id: "rounds", label: "Rounds", count: rounds.length },
            { id: "trophy", label: "Trophy Case" },
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
                      background: "var(--paper)", border: `1px solid ${isBestRound ? "var(--accent)" : "var(--line)"}`,
                      borderRadius: 14, padding: "14px 16px",
                      boxShadow: isBestRound ? "0 0 0 1px rgba(242,148,80,.13)" : "none",
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
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
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
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
                          {[
                            { label: "3-Putt", val: threePuttCount(round.holes) || "—" },
                            { label: "GS Extra Shots", val: round.date >= "2026-01-01" ? (gsExtraShotCount(round.holes) || "—") : "—" },
                            { label: "Avg 1st Putt / Chip", val: avgFirstPuttAfterChip(round.holes) },
                          ].map(({ label, val }) => (
                            <div key={label} style={{ background: "var(--paper-alt)", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                              <div style={{ fontSize: 8.5, color: "var(--muted-2)", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFeatureSettings: '"tnum" 1' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Grade chips */}
                      {(() => {
                        const grades = gradesMap[round.id];
                        if (!grades) return null;
                        const chips = [
                          { label: "Driver",   grade: grades.driver },
                          { label: "Irons",    grade: grades.iron },
                          { label: "Chipping", grade: grades.chipping },
                          { label: "Putting",  grade: grades.putter },
                        ].filter(g => g.grade != null);
                        if (chips.length === 0) return null;
                        return (
                          <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" as const }}>
                            {chips.map(({ label, grade }) => (
                              <div key={label} title={grade!.detail} style={{
                                display: "flex", alignItems: "center", gap: 4,
                                background: grade!.bg, borderRadius: 6, padding: "3px 7px",
                              }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: grade!.color, fontFamily: "monospace" }}>{grade!.letter}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: grade!.color, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Action chips */}
                      <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
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
                        <a href={`/rounds/grint?roundId=${round.id}`} style={{
                          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, textDecoration: "none",
                          background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)",
                        }}>
                          Submit to TheGrint →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Trophy Case tab ── */}
        {tab === "trophy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(() => {
              const brScore = bestRound ? totalScore(bestRound.holes) : null;
              const brPar = bestRound ? totalPar(bestRound.holes) : null;
              const brToPar = brScore != null && brPar ? brScore - brPar : null;
              const trophyCardBase: React.CSSProperties = {
                background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14,
                padding: "14px 16px", position: "relative", display: "block", textDecoration: "none",
              };
              const trophyInner = (kind: string, big: string, label: string, sub: string, extra?: React.ReactNode) => (
                <>
                  <div style={{ position: "absolute", top: 12, right: 12 }}><MilestoneBadge kind={kind} size={22} /></div>
                  <div style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: 32, color: "var(--green-deep)", lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>{big}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginTop: 6 }}>{label}</div>
                  {extra}
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
                </>
              );
              return (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                  <a href={bestRound ? `/rounds/${bestRound.id}/edit` : undefined} style={trophyCardBase}>
                    {trophyInner("pr", brScore != null ? String(brScore) : "—", "Best round",
                      bestRound ? `${bestRound.course_name} · ${bestRound.date}` : "No 18-hole rounds yet",
                      brToPar != null ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{brToPar === 0 ? "Even par" : brToPar > 0 ? `+${brToPar} vs par` : `${brToPar} vs par`}</div> : null,
                    )}
                  </a>
                  <a href={bestDiffEntry ? `/rounds/${bestDiffEntry.id}/edit` : undefined} style={trophyCardBase}>
                    {trophyInner("diff", bestDiffEntry ? bestDiffEntry.diff.toFixed(1) : "—", "Best differential",
                      bestDiffEntry ? `${bestDiffEntry.course_name} · ${bestDiffEntry.date}` : "—")}
                  </a>
                  <div style={{ ...trophyCardBase, cursor: "pointer" }} onClick={() => { setTab("rounds"); setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
                    {trophyInner("streak", String(streak), streak === 1 ? "Sub-90 round" : "Sub-90 streak",
                      streak > 0 ? "Current run" : "Break 90 to start one")}
                  </div>
                  <div style={{ ...trophyCardBase, cursor: "pointer" }} onClick={() => { setTab("rounds"); setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
                    {trophyInner("course", String(coursesThisYear || new Set(rounds.map(r => r.course_id)).size),
                      coursesThisYear ? "Courses this year" : "Courses played", `${rounds.length} total rounds`)}
                  </div>
                </div>
              );
            })()}

            {courseStatsList.length > 0 && (
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: 2, color: "var(--muted-2)", textTransform: "uppercase", fontWeight: 700 }}>Best at each course</div>
                </div>
                {courseStatsList.map((cs, i) => (
                  <div key={cs.courseId} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "11px 16px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                    <CourseGlyph name={cs.name} size={30} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cs.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{cs.rounds} rounds · avg {(cs.total / cs.rounds).toFixed(1)}</div>
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

              {/* In the Bag */}
              <div style={{ padding: "8px 16px 4px", borderTop: "1px solid var(--line-soft)", background: "var(--paper-alt)" }}>
                <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--green)", fontWeight: 700, textTransform: "uppercase" }}>In the Bag · {inBagEntries.length}</span>
              </div>
              {inBagEntries.map(([club, { min, max }], i) => (
                <div key={club} style={{
                  display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center",
                  padding: "10px 16px", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{club}</span>
                  <div style={{ position: "relative", height: 7, background: "var(--paper-alt)", borderRadius: 99 }}>
                    <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "var(--green)", left: `${((min - 50) / 250) * 100}%`, width: `${((max - min) / 250) * 100}%` }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {distEditing && (
                      <button onClick={() => toggleInBag(club)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, cursor: "pointer", fontWeight: 600, border: "1px solid var(--line)", background: "var(--paper-alt)", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        Move to Reserve
                      </button>
                    )}
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

              {/* Reserve */}
              {reserveEntries.length > 0 && (
                <>
                  <div style={{ padding: "8px 16px 4px", borderTop: "1px solid var(--line)", background: "var(--paper-alt)" }}>
                    <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted-2)", fontWeight: 700, textTransform: "uppercase" }}>Reserve · {reserveEntries.length}</span>
                  </div>
                  {reserveEntries.map(([club, { min, max }], i) => (
                    <div key={club} style={{
                      display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center",
                      padding: "10px 16px", borderTop: i > 0 ? "1px solid var(--line-soft)" : "none",
                      opacity: 0.6,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{club}</span>
                      <div style={{ position: "relative", height: 7, background: "var(--paper-alt)", borderRadius: 99 }}>
                        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "var(--muted-2)", left: `${((min - 50) / 250) * 100}%`, width: `${((max - min) / 250) * 100}%` }} />
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {distEditing && (
                          <button onClick={() => toggleInBag(club)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, cursor: "pointer", fontWeight: 600, border: "1px solid var(--green)", background: "var(--green-soft)", color: "var(--green)", whiteSpace: "nowrap" }}>
                            Move to Bag
                          </button>
                        )}
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
                          <span style={{ fontSize: 11.5, fontFamily: "monospace", color: "var(--muted)", fontWeight: 600 }}>{min}–{max}y</span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

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
                      <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--accent)", flexShrink: 0, marginTop: 5 }} />
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
