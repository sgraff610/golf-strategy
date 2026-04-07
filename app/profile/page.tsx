"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Round = {
  id: string;
  course_id: string;
  course_name: string;
  date: string;
  holes_played: number;
  holes: any[];
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

// USGA handicap index from best 8 of last 20 differentials
function computeHandicapIndex(diffs: number[]): number | null {
  const last20 = diffs.slice(-20);
  if (last20.length < 3) return null;
  const sorted = [...last20].sort((a, b) => a - b);
  // Number of best diffs to use per USGA table
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
  return Math.floor(avg * 10) / 10; // truncate to 1 decimal
}

const PROFILE_KEY = "golf_player_profile";

export default function ProfilePage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courseInfoMap, setCourseInfoMap] = useState<Record<string, CourseInfo>>({});
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({ strengths: "", weaknesses: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  // Load profile from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored) setProfile(JSON.parse(stored));
    } catch {}
  }, []);

  // Load rounds and course info
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

  function saveProfile() {
    setSaving(true);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  // Compute differentials for all rounds in chronological order
  const diffs: number[] = rounds
    .map(r => computeDiff(r, courseInfoMap[r.course_id]))
    .filter((d): d is number => d !== null);

  const last20Diffs = diffs.slice(-20);
  const handicapIndex = computeHandicapIndex(diffs);

  // Stats from last 20 rounds
  const last20Rounds = rounds.slice(-20);
  const totalHoles = last20Rounds.reduce((s, r) => s + r.holes.filter((h: any) => h.score && Number(h.score) > 0).length, 0);
  const totalScore = last20Rounds.reduce((s, r) => s + r.holes.reduce((hs: number, h: any) => hs + (Number(h.score) || 0), 0), 0);
  const totalPar = last20Rounds.reduce((s, r) => s + r.holes.reduce((hs: number, h: any) => hs + (h.par || 0), 0), 0);
  const avgScoreToPar = totalHoles > 0 ? (totalScore - totalPar) / last20Rounds.length : null;
  const totalPutts = last20Rounds.reduce((s, r) => s + r.holes.reduce((hs: number, h: any) => hs + (Number(h.putts) || 0), 0), 0);
  const avgPutts = totalHoles > 0 ? totalPutts / totalHoles : null;
  const drivingHoles = last20Rounds.reduce((s, r) => s + r.holes.filter((h: any) => (h.par === 4 || h.par === 5) && h.score).length, 0);
  const fairwaysHit = last20Rounds.reduce((s, r) => s + r.holes.filter((h: any) => (h.par === 4 || h.par === 5) && h.tee_accuracy === "Hit").length, 0);
  const girsHit = last20Rounds.reduce((s, r) => s + r.holes.filter((h: any) => h.gir).length, 0);
  const drivingPct = drivingHoles > 0 ? fairwaysHit / drivingHoles : null;
  const girPct = totalHoles > 0 ? girsHit / totalHoles : null;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const fmt = (n: number) => n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box",
    fontFamily: "sans-serif", lineHeight: 1.5,
  };

  if (loading) return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <p style={{ color: "#666" }}>Loading profile...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ fontSize: 13, color: "#666" }}>← Strategy</a>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>My Profile</h1>
      <p style={{ fontSize: 13, color: "#999", marginBottom: 28 }}>Based on your last {Math.min(rounds.length, 20)} rounds</p>

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

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Avg Score", value: avgScoreToPar !== null ? fmt(avgScoreToPar) : "—", sub: "per round vs par" },
          { label: "Avg Putts", value: avgPutts !== null ? avgPutts.toFixed(1) : "—", sub: "per hole" },
          { label: "Fairways", value: drivingPct !== null ? pct(drivingPct) : "—", sub: "hit (par 4/5)" },
          { label: "GIR", value: girPct !== null ? pct(girPct) : "—", sub: "greens in regulation" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: "#f6f6f6", borderRadius: 12, padding: "16px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: "#0f6e56", margin: "0 0 2px" }}>{value}</p>
            <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Recent differentials */}
      {last20Diffs.length > 0 && (
        <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
            Recent Differentials (last {last20Diffs.length})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {last20Diffs.map((d, i) => {
              const sorted = [...last20Diffs].sort((a, b) => a - b);
              const threshold = sorted[Math.min(7, sorted.length - 1)];
              const isUsed = d <= threshold;
              return (
                <div key={i} style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: isUsed ? "#0f6e56" : "#eee",
                  color: isUsed ? "white" : "#666",
                }}>
                  {d.toFixed(1)}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "#bbb", margin: "8px 0 0", fontStyle: "italic" }}>Teal = used in handicap calculation</p>
        </div>
      )}

      {/* Strengths & Weaknesses */}
      <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Player Notes</p>
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
              placeholder="e.g. Consistent off the tee with driver, good at reading greens, strong in wind..."
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
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
              placeholder="e.g. Struggle with short irons under pressure, tendency to miss right on approach..."
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
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
              {saved ? "Saved!" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); }}
              style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#eee", color: "#333", border: "none", borderRadius: 8, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
    </main>
  );
}
