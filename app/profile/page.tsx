"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getClubDistances, saveClubDistances } from "@/lib/storage";
import { DEFAULT_CLUB_DISTANCES } from "@/lib/planTypes";
import type { ClubDistances } from "@/lib/planTypes";

type Round = {
  id: string;
  course_id: string;
  course_name: string;
  date: string;
  holes_played: number;
  holes: any[];
  score_differential: number | null;
};

type CourseInfo = {
  rating: number | null;
  slope: number | null;
  hole_count: number | null;
};

type Profile = {
  strengths: string;
  weaknesses: string;
};

const PUTT_DIST_MAP: Record<string, number> = {
  "Gimme": 1, "3ft": 3, "5ft": 5, "7ft": 7, "10ft": 10,
  "15ft": 15, "20ft": 20, "30ft": 30, "40ft": 40, "50ft": 50, "50+": 60,
};

function adjustedGrossScore(holes: any[]): number {
  return holes.reduce((s, h) => s + Math.min(Number(h.score) || 0, h.par + 2), 0);
}

function computeDiff(round: Round, courseInfo: CourseInfo | undefined): number | null {
  if (!courseInfo?.rating || !courseInfo?.slope) return null;
  const scored = round.holes.filter(h => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (!scored.length) return null;
  const ags = adjustedGrossScore(scored);
  const holesPlayed = round.holes_played ?? scored.length;
  const is9Round = holesPlayed <= 9;
  const is9Course = (courseInfo.hole_count ?? round.holes.length) <= 9;
  let rating = courseInfo.rating;
  if (is9Round && !is9Course) rating /= 2;
  else if (!is9Round && is9Course) rating *= 2;
  const diff = is9Round
    ? ((113 / courseInfo.slope) * (ags - rating)) * 2
    : (ags - rating) * 113 / courseInfo.slope;
  return diff;
}

function computeHandicapIndex(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a, b) => a - b);
  const count = last20.length <= 6 ? 1
    : last20.length <= 8 ? 2
    : last20.length <= 11 ? 3
    : last20.length <= 14 ? 4
    : last20.length <= 16 ? 5
    : last20.length <= 18 ? 6
    : last20.length === 19 ? 7
    : 8;
  const best = sorted.slice(0, count);
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return Math.floor(avg * 10) / 10;
}

function calcStats(roundSlice: Round[]) {
  const scoredHoles = roundSlice.flatMap(r => r.holes.filter((h: any) => h.score && Number(h.score) > 0));
  const totalHoles = scoredHoles.length;
  const totalRounds = roundSlice.length;
  if (totalHoles === 0 || totalRounds === 0) return null;

  // Avg score on 18-hole basis: double 9-hole rounds
  const roundScoresPar = roundSlice
    .map(r => {
      const scored = r.holes.filter((h: any) => h.score && Number(h.score) > 0);
      if (!scored.length) return null;
      const stp = scored.reduce((s: number, h: any) => s + Number(h.score) - (h.par || 0), 0);
      const is9 = (r.holes_played ?? scored.length) <= 9;
      return is9 ? stp * 2 : stp;
    })
    .filter((v): v is number => v !== null);
  const avgScoreToPar = roundScoresPar.length > 0
    ? roundScoresPar.reduce((s, v) => s + v, 0) / roundScoresPar.length
    : 0;

  const totalPutts = scoredHoles.reduce((s, h: any) => s + (Number(h.putts) || 0), 0);
  const avgPuttsPer18 = totalHoles > 0 ? (totalPutts / totalHoles) * 18 : null;

  const drivingHoles = scoredHoles.filter((h: any) => h.par === 4 || h.par === 5);
  const fairwaysHit = drivingHoles.filter((h: any) => h.tee_accuracy === "Hit").length;
  const drivingPct = drivingHoles.length > 0 ? fairwaysHit / drivingHoles.length : null;

  const girsHit = scoredHoles.filter((h: any) => h.gir).length;
  const girPct = totalHoles > 0 ? girsHit / totalHoles : null;

  const chipHoles = scoredHoles.filter((h: any) =>
    Number(h.chips) > 0 && h.first_putt_distance && PUTT_DIST_MAP[h.first_putt_distance] !== undefined
  );
  const avgPuttAfterChip = chipHoles.length > 0
    ? chipHoles.reduce((s, h: any) => s + PUTT_DIST_MAP[h.first_putt_distance], 0) / chipHoles.length
    : null;

  return { avgScoreToPar, avgPuttsPer18, drivingPct, girPct, avgPuttAfterChip };
}

export default function ProfilePage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courseInfoMap, setCourseInfoMap] = useState<Record<string, CourseInfo>>({});
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({ strengths: "", weaknesses: "" });
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [activeDiffIdx, setActiveDiffIdx] = useState<number | null>(null);
  const [clubDistances, setClubDistances] = useState<ClubDistances>(DEFAULT_CLUB_DISTANCES);
  const [distDraft, setDistDraft] = useState<ClubDistances>(DEFAULT_CLUB_DISTANCES);
  const [distOpen, setDistOpen] = useState(false);
  const [distEditing, setDistEditing] = useState(false);
  const [distSaving, setDistSaving] = useState(false);
  const [distSaved, setDistSaved] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubMin, setNewClubMin] = useState("");
  const [newClubMax, setNewClubMax] = useState("");

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
    supabase.from("rounds").select("*").order("date", { ascending: true })
      .then(async ({ data, error }) => {
        if (!error && data) {
          setRounds(data);
          const uniqueCourseIds = [...new Set(data.map((r: any) => r.course_id).filter(Boolean))];
          if (uniqueCourseIds.length > 0) {
            const { data: courses } = await supabase
              .from("courses")
              .select("id, rating, slope, hole_count")
              .in("id", uniqueCourseIds);
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

  async function saveProfile() {
    setSaving(true);
    await supabase.from("player_data").upsert({
      id: "singleton",
      strengths: profile.strengths,
      weaknesses: profile.weaknesses,
      change_log: changeLog,
      updated_at: new Date().toISOString(),
    });
    setSaved(true);
    setEditing(false);
    setSaving(false);
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

  async function saveChangeLog(updated: string[]) {
    setChangeLog(updated);
    await supabase.from("player_data").upsert({
      id: "singleton",
      strengths: profile.strengths,
      weaknesses: profile.weaknesses,
      change_log: updated,
      updated_at: new Date().toISOString(),
    });
  }

  const diffsWithInfo = rounds
    .map(r => {
      const diff = r.score_differential != null
        ? (r.holes_played <= 9 ? r.score_differential * 2 : r.score_differential)
        : computeDiff(r, courseInfoMap[r.course_id]);
      return diff !== null ? { diff, course_name: r.course_name, date: r.date } : null;
    })
    .filter((d): d is { diff: number; course_name: string; date: string } => d !== null);

  const diffs = diffsWithInfo.map(d => d.diff);
  const last20DiffsWithInfo = diffsWithInfo.slice(-20);
  const last20Diffs = last20DiffsWithInfo.map(d => d.diff);
  const handicapIndex = computeHandicapIndex(diffs);

  const stats5   = calcStats(rounds.slice(-5));
  const stats20  = calcStats(rounds.slice(-20));
  const statsAll = calcStats(rounds);

  const fmt    = (n: number | null) => n === null ? "—" : n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
  const pct    = (n: number | null) => n !== null ? `${Math.round(n * 100)}%` : "—";
  const fmtP   = (n: number | null) => n !== null ? n.toFixed(1) : "—";
  const fmtFt  = (n: number | null) => n !== null ? `${n.toFixed(1)}ft` : "—";

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box",
    fontFamily: "sans-serif", lineHeight: 1.5,
  };

  if (loading) return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "white" }}>Loading profile...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ fontSize: 13, color: "white" }}>← Strategy</a>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#d0d0d0", margin: "0 0 4px" }}>My Profile</h1>
      <p style={{ fontSize: 13, color: "white", marginBottom: 28 }}>Based on your last {Math.min(rounds.length, 20)} rounds</p>

      {/* Handicap hero */}
      <div style={{ background: "#0f6e56", borderRadius: 16, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 8px", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>USGA Handicap Index</p>
        {handicapIndex !== null ? (
          <p style={{ fontSize: 56, fontWeight: 800, color: "white", margin: 0, lineHeight: 1 }}>{handicapIndex.toFixed(1)}</p>
        ) : (
          <p style={{ fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: 0 }}>
            {diffs.length < 3 ? `Need ${3 - diffs.length} more rounds with ratings` : "—"}
          </p>
        )}
        {handicapIndex !== null && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "8px 0 0" }}>
            Best {Math.min(8, Math.floor(last20Diffs.length * 0.4) || 1)} of last {last20Diffs.length} differentials
          </p>
        )}
      </div>

      {/* Stats table */}
      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 0.8 }}>Stat</th>
              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 0.8 }}>Last 5</th>
              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 0.8 }}>Last 20</th>
              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 0.8 }}>All time</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Avg score",           v5: fmt(stats5?.avgScoreToPar ?? null),   v20: fmt(stats20?.avgScoreToPar ?? null),   vAll: fmt(statsAll?.avgScoreToPar ?? null) },
              { label: "Putts / 18",          v5: fmtP(stats5?.avgPuttsPer18 ?? null),  v20: fmtP(stats20?.avgPuttsPer18 ?? null),  vAll: fmtP(statsAll?.avgPuttsPer18 ?? null) },
              { label: "Fairways",            v5: pct(stats5?.drivingPct ?? null),       v20: pct(stats20?.drivingPct ?? null),       vAll: pct(statsAll?.drivingPct ?? null) },
              { label: "GIR",                 v5: pct(stats5?.girPct ?? null),           v20: pct(stats20?.girPct ?? null),           vAll: pct(statsAll?.girPct ?? null) },
              { label: "1st putt after chip", v5: fmtFt(stats5?.avgPuttAfterChip ?? null), v20: fmtFt(stats20?.avgPuttAfterChip ?? null), vAll: fmtFt(statsAll?.avgPuttAfterChip ?? null) },
            ].map(({ label, v5, v20, vAll }, i) => (
              <tr key={label} style={{ borderTop: i > 0 ? "1px solid #eee" : "none" }}>
                <td style={{ padding: "10px 14px", fontWeight: 500, color: "#1a1a1a" }}>{label}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#0f6e56" }}>{v5}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#0f6e56" }}>{v20}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#0f6e56" }}>{vAll}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent differentials */}
      {last20DiffsWithInfo.length > 0 && (
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
            Recent Differentials (last {last20DiffsWithInfo.length})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {last20DiffsWithInfo.map((item, i) => {
              const sorted = [...last20Diffs].sort((a, b) => a - b);
              const threshold = sorted[Math.min(7, sorted.length - 1)];
              const isUsed = item.diff <= threshold;
              const isActive = activeDiffIdx === i;
              return (
                <div key={i} style={{ position: "relative" }}>
                  <div
                    onClick={() => setActiveDiffIdx(isActive ? null : i)}
                    style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: isUsed ? "#0f6e56" : "#eee",
                      color: isUsed ? "white" : "#0f6e56",
                    }}
                  >
                    {item.diff.toFixed(1)}
                  </div>
                  {isActive && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                      background: "#1a1a1a", color: "white", borderRadius: 8, padding: "6px 10px",
                      fontSize: 11, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    }}>
                      {item.course_name}<br />{item.date}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "#0f6e56", margin: "8px 0 0", fontStyle: "italic" }}>Teal = used in handicap calculation · tap to see course</p>
        </div>
      )}

      {/* Player Notes — expandable */}
      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
        <button
          onClick={() => { setNotesOpen(o => !o); if (editing) setEditing(false); }}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1 }}>Player Notes</span>
          <span style={{ fontSize: 16, color: "#aaa" }}>{notesOpen ? "▲" : "▼"}</span>
        </button>

        {notesOpen && (
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              {!editing && (
                <button onClick={() => setEditing(true)}
                  style={{ fontSize: 12, color: "#0f6e56", background: "none", border: "1px solid #0f6e56", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  Edit
                </button>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#27ae60", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>💪 Strengths</p>
              {editing ? (
                <textarea
                  value={profile.strengths}
                  onChange={e => setProfile(p => ({ ...p, strengths: e.target.value }))}
                  placeholder="e.g. Consistent off the tee with driver, good at reading greens..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                />
              ) : (
                <p style={{ fontSize: 14, color: profile.strengths ? "#1a1a1a" : "#bbb", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {profile.strengths || "Tap Edit to add your strengths..."}
                </p>
              )}
            </div>

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#c0392b", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>⚠️ Weaknesses</p>
              {editing ? (
                <textarea
                  value={profile.weaknesses}
                  onChange={e => setProfile(p => ({ ...p, weaknesses: e.target.value }))}
                  placeholder="e.g. Struggle with short irons under pressure..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                />
              ) : (
                <p style={{ fontSize: 14, color: profile.weaknesses ? "#1a1a1a" : "#bbb", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {profile.weaknesses || "Tap Edit to add your weaknesses..."}
                </p>
              )}
            </div>

            {editing && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={saveProfile} disabled={saving}
                  style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#0f6e56", color: "white", border: "none", borderRadius: 8, cursor: "pointer", flex: 1 }}>
                  {saving ? "Saving..." : saved ? "Saved!" : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                  style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#eee", color: "#333", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Wishlist — expandable */}
      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
        <button
          onClick={() => setChangeLogOpen(o => !o)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1 }}>Wishlist</span>
          <span style={{ fontSize: 16, color: "#aaa" }}>{changeLogOpen ? "▲" : "▼"}</span>
        </button>

        {changeLogOpen && (
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newItem.trim()) {
                    saveChangeLog([...changeLog, newItem.trim()]);
                    setNewItem("");
                  }
                }}
                placeholder="Add a desired change..."
                style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1px solid #ddd", borderRadius: 8 }}
              />
              <button
                onClick={() => {
                  if (!newItem.trim()) return;
                  saveChangeLog([...changeLog, newItem.trim()]);
                  setNewItem("");
                }}
                style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, background: "#0f6e56", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                Add
              </button>
            </div>
            {changeLog.length === 0 && (
              <p style={{ fontSize: 13, color: "#bbb", fontStyle: "italic" }}>No items yet — add desired changes above.</p>
            )}
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {changeLog.map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#444", lineHeight: 1.6, marginBottom: 8, padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ flex: 1 }}>{item}</span>
                  <button
                    onClick={() => saveChangeLog(changeLog.filter((_, idx) => idx !== i))}
                    style={{ fontSize: 11, color: "#c0392b", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 6px" }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Club Distances */}
      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
        <button
          onClick={() => { setDistOpen(o => !o); if (distEditing) setDistEditing(false); }}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1 }}>Club Distances</span>
          <span style={{ fontSize: 16, color: "#aaa" }}>{distOpen ? "▲" : "▼"}</span>
        </button>
        {distOpen && (
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              {!distEditing && (
                <button onClick={() => { setDistDraft({ ...clubDistances }); setDistEditing(true); }}
                  style={{ fontSize: 12, color: "#0f6e56", background: "none", border: "1px solid #0f6e56", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  Edit
                </button>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase" }}>Club</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase" }}>Min (yds)</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase" }}>Max (yds)</th>
                  {distEditing && <th style={{ width: 32 }} />}
                </tr>
              </thead>
              <tbody>
                {Object.entries(distEditing ? distDraft : clubDistances).map(([club, { min, max }], i) => (
                  <tr key={club} style={{ borderTop: i > 0 ? "1px solid #eee" : "none" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1a1a" }}>{club}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {distEditing ? (
                        <input type="number" value={min}
                          onChange={e => setDistDraft(d => ({ ...d, [club]: { ...d[club], min: Number(e.target.value) } }))}
                          style={{ width: 64, textAlign: "center", padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
                      ) : (
                        <span style={{ fontWeight: 700, color: "#0f6e56" }}>{min}</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {distEditing ? (
                        <input type="number" value={max}
                          onChange={e => setDistDraft(d => ({ ...d, [club]: { ...d[club], max: Number(e.target.value) } }))}
                          style={{ width: 64, textAlign: "center", padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
                      ) : (
                        <span style={{ fontWeight: 700, color: "#0f6e56" }}>{max}</span>
                      )}
                    </td>
                    {distEditing && (
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        <button
                          onClick={() => setDistDraft(d => { const next = { ...d }; delete next[club]; return next; })}
                          style={{ fontSize: 12, color: "#c0392b", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                        >✕</button>
                      </td>
                    )}
                  </tr>
                ))}
                {distEditing && (
                  <tr style={{ borderTop: "1px solid #ddd", background: "#fafafa" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <input
                        value={newClubName}
                        onChange={e => setNewClubName(e.target.value)}
                        placeholder="Club name"
                        style={{ width: "100%", padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <input type="number" value={newClubMin} onChange={e => setNewClubMin(e.target.value)} placeholder="Min"
                        style={{ width: 64, textAlign: "center", padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <input type="number" value={newClubMax} onChange={e => setNewClubMax(e.target.value)} placeholder="Max"
                        style={{ width: 64, textAlign: "center", padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      <button
                        onClick={() => {
                          if (!newClubName.trim() || !newClubMin || !newClubMax) return;
                          setDistDraft(d => ({ ...d, [newClubName.trim()]: { min: Number(newClubMin), max: Number(newClubMax) } }));
                          setNewClubName(""); setNewClubMin(""); setNewClubMax("");
                        }}
                        style={{ fontSize: 12, color: "#0f6e56", background: "none", border: "1px solid #0f6e56", borderRadius: 6, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                      >+ Add</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {distEditing && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={saveDistances} disabled={distSaving}
                  style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#0f6e56", color: "white", border: "none", borderRadius: 8, cursor: "pointer", flex: 1 }}>
                  {distSaving ? "Saving..." : distSaved ? "Saved!" : "Save"}
                </button>
                <button onClick={() => setDistEditing(false)}
                  style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#eee", color: "#333", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "white" }}>← Back to rounds</a>
      </div>
    </main>
  );
}
