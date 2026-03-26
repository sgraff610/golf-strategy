"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getCourse } from "@/lib/storage";
import { HoleData } from "@/lib/types";

type TeeAccuracy = "Hit" | "Left" | "Right" | "Short" | "Long" | "";

type RoundHole = {
  hole: number;
  par: number;
  yards: number;
  stroke_index: number;
  score: number | "";
  chips: number | "";
  putts: number | "";
  tee_accuracy: TeeAccuracy;
  appr_accuracy: TeeAccuracy;
  appr_distance: string;
  water_penalty: number | "";
  drop_or_out: number | "";
  tree_haz: number | "";
  fairway_bunker: number | "";
  greenside_bunker: number | "";
  gir: boolean;
  grints: boolean;
  club: string;
  first_putt_distance: string;
};

const CLUB_DISTANCES: Record<string, number> = {
  Driver: 230, "3W": 210, "5W": 195, "7W": 180,
  "4i": 185, "5i": 175, "6i": 165, "7i": 155,
  "8i": 145, "9i": 130, PW: 120, SW: 100, LW: 80,
};

function getDriveDistance(club: string): number {
  return CLUB_DISTANCES[club] ?? 0;
}

function calculateDrivePenaltyLikelihood(hole: RoundHole, courseHole: HoleData | undefined): number {
  if (!courseHole) return 0;
  const water = (Number(hole.water_penalty) || 0) + (Number(hole.drop_or_out) || 0);
  if (water === 0) return 0;
  if (hole.tee_accuracy === "Hit") return 0;

  const score = Number(hole.score) || 0;
  const putts = Number(hole.putts) || 0;
  const chips = Number(hole.chips) || 0;
  const otherStrokes = score - putts - chips - 1;

  const driveMatchesHazard =
    (hole.tee_accuracy === "Left" && courseHole.tee_water_out_left) ||
    (hole.tee_accuracy === "Right" && courseHole.tee_water_out_right);

  if (!driveMatchesHazard) return 0;
  if (otherStrokes === 1) return 100;
  if (otherStrokes > 1) return 50;
  return 0;
}

export default function RoundsCalc() {
  const [rounds, setRounds] = useState<{ id: string; course_name: string; date: string }[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [roundHoles, setRoundHoles] = useState<RoundHole[]>([]);
  const [courseHoles, setCourseHoles] = useState<HoleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.from("rounds").select("id, course_name, date").order("date", { ascending: false }).then(({ data }) => {
      if (data) setRounds(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedRoundId) return;
    setLoading(true);
    supabase.from("rounds").select("*").eq("id", selectedRoundId).single().then(async ({ data }) => {
      if (data) {
        setRoundHoles(data.holes ?? []);
        const course = await getCourse(data.course_id);
        setCourseHoles(course?.holes ?? []);
      }
      setLoading(false);
    });
  }, [selectedRoundId, refreshKey]);

  const inputStyle = {
    width: "100%", padding: "6px 8px", fontSize: 14,
    border: "1px solid #ddd", borderRadius: 6,
    boxSizing: "border-box" as const,
  };
  const selectStyle = { ...inputStyle, background: "white", color: "#0f6e56" };
  const labelStyle = { fontSize: 12, color: "#666", display: "block" as const, marginBottom: 3 };
  const calcStyle = {
    ...inputStyle,
    background: "#f0f9f6", color: "#0f6e56", fontWeight: 600 as const,
    border: "1px solid #b2dfdb",
  };

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/rounds" style={{ fontSize: 13, color: "#666" }}>← Back to rounds</a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Drive Analysis</h1>
        {selectedRoundId && (
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid #0f6e56", background: "white", color: "#0f6e56", cursor: "pointer", fontWeight: 600 }}
          >
            ↻ Refresh
          </button>
        )}
      </div>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>Select a round to analyze drive penalty likelihood per hole.</p>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Round</label>
        <select style={selectStyle} value={selectedRoundId} onChange={e => setSelectedRoundId(e.target.value)}>
          <option value="">— Select a round —</option>
          {rounds.map(r => (
            <option key={r.id} value={r.id}>{r.date} — {r.course_name}</option>
          ))}
        </select>
      </div>

      {loading && <p style={{ color: "#666" }}>Loading...</p>}

      {!loading && roundHoles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {roundHoles.map((hole, i) => {
            const courseHole = courseHoles.find(h => h.hole === hole.hole);
            const driveDistance = getDriveDistance(hole.club);
            const penaltyLikelihood = calculateDrivePenaltyLikelihood(hole, courseHole);
            const hasPenalty = ((Number(hole.water_penalty) || 0) + (Number(hole.drop_or_out) || 0)) > 0;

            return (
              <div key={i} style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f6e56" }}>Hole {hole.hole}</span>
                  <span style={{ fontSize: 13, color: "#666" }}>Par {hole.par} · {hole.yards} yds · SI {hole.stroke_index}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>Score</label>
                    <div style={{ ...calcStyle, padding: "6px 8px" }}>{hole.score !== "" ? hole.score : "—"}</div>
                  </div>
                  <div>
                    <label style={labelStyle}>DRIV Club</label>
                    <div style={{ ...calcStyle, padding: "6px 8px" }}>{hole.club || "—"}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>Drive Distance (est.)</label>
                    <div style={{ ...calcStyle, padding: "6px 8px" }}>
                      {driveDistance > 0 ? `${driveDistance} yds` : "—"}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>DRIV Acc</label>
                    <div style={{ ...calcStyle, padding: "6px 8px" }}>{hole.tee_accuracy || "—"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Drive Water/OB Likelihood</label>
                  <div style={{
                    ...calcStyle, padding: "8px 12px",
                    background: hasPenalty && penaltyLikelihood >= 50 ? "#fff3e0" : "#f0f9f6",
                    border: hasPenalty && penaltyLikelihood >= 50 ? "1px solid #ffcc80" : "1px solid #b2dfdb",
                    color: hasPenalty && penaltyLikelihood >= 50 ? "#e65100" : "#0f6e56",
                    fontSize: 15,
                  }}>
                    {hasPenalty ? `${penaltyLikelihood}%` : "No penalty recorded"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && selectedRoundId && roundHoles.length === 0 && (
        <p style={{ color: "#666" }}>No hole data found for this round.</p>
      )}
    </main>
  );
}
