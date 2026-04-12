"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useParams } from "next/navigation";
import { HoleData, CourseRecord, DoglegDirection } from "@/lib/types";
import { getCourse, saveCourse, loadCourses } from "@/lib/storage";
import GreensideSelector, {
  GreensideState, defaultGreensideState, flatToGreenside, greensideToFlat,
} from "@/app/components/GreensideSelector";

const DOGLEG_OPTIONS: { value: DoglegDirection; label: string }[] = [
  { value: null,            label: "None" },
  { value: "straight",      label: "Straight" },
  { value: "slight_left",   label: "Slight Left" },
  { value: "moderate_left", label: "Moderate Left" },
  { value: "severe_left",   label: "Severe Left" },
  { value: "slight_right",  label: "Slight Right" },
  { value: "moderate_right",label: "Moderate Right" },
  { value: "severe_right",  label: "Severe Right" },
];

const TEE_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "tee_tree_hazard_left",   label: "Trees / Hazard left" },
  { key: "tee_tree_hazard_right",  label: "Trees / Hazard right" },
  { key: "tee_tree_hazard_across", label: "Trees / Hazard across/middle" },
  { key: "tee_bunkers_left",       label: "Bunkers left" },
  { key: "tee_bunkers_right",      label: "Bunkers right" },
  { key: "tee_water_out_left",     label: "Water / OB left" },
  { key: "tee_water_out_right",    label: "Water / OB right" },
  { key: "tee_water_out_across",   label: "Water / OB across/middle" },
];

const APPROACH_CHECKBOXES: { key: keyof HoleData; label: string }[] = [
  { key: "approach_tree_hazard_left",   label: "Trees / Hazard left" },
  { key: "approach_tree_hazard_right",  label: "Trees / Hazard right" },
  { key: "approach_tree_hazard_long",   label: "Trees / Hazard long" },
  { key: "approach_tree_hazard_across", label: "Trees / Hazard across/middle" },
  { key: "approach_water_out_left",     label: "Water / OB left" },
  { key: "approach_water_out_right",    label: "Water / OB right" },
  { key: "approach_water_out_short",    label: "Water / OB short" },
  { key: "approach_water_out_long",     label: "Water / OB long" },
];

// Shared light-grey label/section styles
const LABEL: React.CSSProperties   = { fontSize: 13, color: "#aaa", display: "block", marginBottom: 4 };
const SECTION: React.CSSProperties = { fontSize: 11, color: "#bbb", fontWeight: 600, letterSpacing: 1, marginBottom: 8, marginTop: 20, display: "block", textTransform: "uppercase" };
const HOLE_NAME: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#bbb" };

// ─── Scorecard ────────────────────────────────────────────────────────────────

function AiAnalysisPanel({ hole, onSave, allTeeVersions, courseId }: { hole: HoleData; onSave: (updated: HoleData) => void; allTeeVersions?: any[]; courseId?: string; }) {
  const [va, setVa] = React.useState<any>((hole as any).visual_analysis ?? null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Sync when hole changes (navigating between holes)
  React.useEffect(() => {
    const existing = (hole as any).visual_analysis ?? null;
    if (existing && !existing.pre_green_zone) {
      existing.pre_green_zone = {
        distance_from_green_yards: 35,
        description: "",
        trees_left: "none",
        trees_right: "none",
        trees_long: "none",
        bunkers_present: false,
        bunker_description: null,
        water_present: false,
        water_description: null,
        overall_danger: "safe",
        approach_distance: 35,
        go_for_green_rating: 3,
        layup_rating: 3,
        recommendation: "go_for_green",
        recommendation_reason: "",
      };
    }
    setVa(existing);
    setSaved(false);
  }, [hole.hole]);

  const update = (path: string[], value: unknown) => {
    setVa((prev: any) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const updated = { ...hole, visual_analysis: va } as HoleData;
    await onSave(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const [refreshing, setRefreshing] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [copyTarget, setCopyTarget] = React.useState("");

  const otherTees = (allTeeVersions ?? []).filter(t => t.id !== courseId);

  const handleCopyToTee = async () => {
    if (!copyTarget || !va) return;
    const targetCourse = otherTees.find((t: any) => t.id === copyTarget);
    if (!targetCourse) return;
    setCopying(true);
    try {
      const updatedHoles = (targetCourse.holes ?? []).map((h: any) =>
        h.hole === hole.hole ? { ...h, visual_analysis: JSON.parse(JSON.stringify(va)) } : h
      );
      const { saveCourse } = await import("@/lib/storage");
      await saveCourse({ ...targetCourse, holes: updatedHoles });
      alert(`AI analysis copied to ${targetCourse.tee_box} tees ✓`);
    } catch (e) {
      alert("Copy failed — check console");
      console.error(e);
    } finally {
      setCopying(false);
    }
  };

  const handleRefresh = async () => {
    if (!va) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { ...hole, visual_analysis: va } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      const p = data.refreshed;
      setVa((prev: any) => ({
        ...prev,
        strategic_notes: p.strategic_notes ?? prev.strategic_notes,
        tee_zone: {
          ...prev.tee_zone,
          opening_description: p.tee_opening_description ?? prev.tee_zone?.opening_description,
          left_notes: p.tee_left_notes ?? prev.tee_zone?.left_notes,
          right_notes: p.tee_right_notes ?? prev.tee_zone?.right_notes,
          recommended_aim_reason: p.tee_aim_reason ?? prev.tee_zone?.recommended_aim_reason,
        },
        landing_zone: {
          ...prev.landing_zone,
          notes: p.landing_notes ?? prev.landing_zone?.notes,
        },
        pre_landing_zone: {
          ...prev.pre_landing_zone,
          description: p.pre_landing_description ?? prev.pre_landing_zone?.description,
          bunker_description: p.pre_landing_bunker_description ?? prev.pre_landing_zone?.bunker_description,
          water_description: p.pre_landing_water_description ?? prev.pre_landing_zone?.water_description,
          other_obstacles: p.pre_landing_other_obstacles ?? prev.pre_landing_zone?.other_obstacles,
          room_to_recover_notes: p.pre_landing_room_notes ?? prev.pre_landing_zone?.room_to_recover_notes,
          recommendation: p.pre_landing_recommendation ?? prev.pre_landing_zone?.recommendation,
        },
        approach_zone: {
          ...prev.approach_zone,
          bunkers_description: p.approach_bunkers_description ?? prev.approach_zone?.bunkers_description,
          water_description: p.approach_water_description ?? prev.approach_zone?.water_description,
          green_notes: p.approach_green_notes ?? prev.approach_zone?.green_notes,
          notes: p.approach_notes ?? prev.approach_zone?.notes,
        },
        ...(prev.layup_zone && p.layup_description ? {
          layup_zone: {
            ...prev.layup_zone,
            description: p.layup_description,
            recommendation_reason: p.layup_recommendation_reason ?? prev.layup_zone?.recommendation_reason,
          }
        } : {}),
      }));
      setSaved(false);
    } catch (e) {
      console.error('Refresh error:', e);
      alert('Refresh failed — check console');
    } finally {
      setRefreshing(false);
    }
  };

  // ── Shared styles ──
  const sl: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "#0f6e56", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "block", marginTop: 14 };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f0f0f0", gap: 8 };
  const lbl: React.CSSProperties = { color: "#666", flex: 1 };
  const inp: React.CSSProperties = { padding: "3px 7px", fontSize: 12, border: "1px solid #ddd", borderRadius: 5, background: "white", color: "#1a1a1a" };
  const ta: React.CSSProperties = { ...inp, width: "100%", minHeight: 52, resize: "vertical" as const, fontFamily: "inherit", lineHeight: 1.5, marginTop: 3 };
  const note: React.CSSProperties = { fontSize: 12, color: "#555", lineHeight: 1.5, margin: "3px 0 6px", fontStyle: "italic" };

  const COVERAGE = ["none","sparse","moderate","heavy","wall"];
  const DANGER = ["safe","mild","moderate","dangerous","very_dangerous"];
  const BUFFER = ["very_tight","tight","moderate","generous","open"];
  const HAZARD_T = ["none","trees","bunker","water","rough","OB"];
  const SEVERITY = ["none","low","moderate","high","severe"];
  const DOGLEG = ["straight","slight_left","moderate_left","severe_left","slight_right","moderate_right","severe_right"];
  const GREEN_SIZE = ["very_small","small","medium","large","very_large"];
  const GREEN_SHAPE = ["round","oval","elongated","kidney","irregular","multi_tier"];
  const FWY_WIDTH = ["very_narrow","narrow","medium","wide","very_wide"];
  const AIM = ["left_of_center","center","right_of_center"];
  const WATER_T = ["none","pond","lake","stream","creek","ocean","marsh"];
  const THREAT = ["none","low","moderate","high","severe"];
  const ROOM = ["plenty","some","tight","none"];

  function EBool({ path, label }: { path: string[]; label: string }) {
    const val = path.reduce((o: any, k) => o?.[k], va) as boolean;
    return (
      <div style={row}>
        <span style={lbl}>{label}</span>
        <button onClick={() => update(path, !val)} style={{ padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, border: "none", cursor: "pointer", background: val ? "#0f6e56" : "#e5e5e5", color: val ? "white" : "#666", minWidth: 46 }}>
          {val ? "✓ Yes" : "No"}
        </button>
      </div>
    );
  }

  function ENum({ path, label, unit }: { path: string[]; label: string; unit?: string }) {
    const val = path.reduce((o: any, k) => o?.[k], va) as number ?? 0;
    return (
      <div style={row}>
        <span style={lbl}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <input type="number" value={val} onChange={e => update(path, Number(e.target.value))} style={{ ...inp, width: 62, textAlign: "right" }} />
          {unit && <span style={{ fontSize: 11, color: "#888" }}>{unit}</span>}
        </div>
      </div>
    );
  }

  function ESel({ path, label, opts }: { path: string[]; label: string; opts: string[] }) {
    const val = path.reduce((o: any, k) => o?.[k], va) as string ?? opts[0];
    return (
      <div style={row}>
        <span style={lbl}>{label}</span>
        <select value={val} onChange={e => update(path, e.target.value)} style={{ ...inp, color: "#0f6e56" }}>
          {opts.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
      </div>
    );
  }

  function EText({ path, label }: { path: string[]; label: string }) {
    const val = path.reduce((o: any, k) => o?.[k], va) as string ?? "";
    const ref = React.useRef<HTMLTextAreaElement>(null);
    React.useEffect(() => {
      if (ref.current) ref.current.value = val;
    }, [val]);
    return (
      <div style={{ padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{label}</div>
        <textarea
          ref={ref}
          defaultValue={val}
          onBlur={e => update(path, e.target.value)}
          style={ta}
        />
      </div>
    );
  }

  function CovBar({ label, value }: { label: string; value: string }) {
    const levels: Record<string, number> = { none: 0, sparse: 1, moderate: 2, heavy: 3, wall: 4 };
    const level = levels[value] ?? 0;
    const colors = ["#e5e5e5", "#c8e6c9", "#ffcc80", "#ef9a9a", "#b71c1c"];
    return (
      <div style={{ marginBottom: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 2 }}>
          <span>{label}</span><span style={{ fontWeight: 600, textTransform: "capitalize" }}>{value}</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[0,1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i <= level ? colors[level] : "#e5e5e5" }} />)}
        </div>
      </div>
    );
  }

  function DangerBadge({ value }: { value: string }) {
    const c: Record<string,{bg:string;text:string}> = { safe:{bg:"#f0faf6",text:"#0f6e56"}, mild:{bg:"#f0faf6",text:"#0f6e56"}, moderate:{bg:"#fffbea",text:"#b45309"}, dangerous:{bg:"#fff0f0",text:"#c0392b"}, very_dangerous:{bg:"#fff0f0",text:"#c0392b"} };
    const s = c[value] ?? c.moderate;
    return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: s.bg, color: s.text, textTransform: "capitalize" }}>{value.replace(/_/g,"  ")}</span>;
  }

  const diffColor = va ? (va.visual_difficulty_score <= 3 ? "#0f6e56" : va.visual_difficulty_score <= 5 ? "#f59e0b" : va.visual_difficulty_score <= 7 ? "#f97316" : "#ef4444") : "#aaa";

  const tz = va?.tee_zone;
  const lz = va?.landing_zone;
  const plz = va?.pre_landing_zone;
  const az = va?.approach_zone;
  const layz = va?.layup_zone;

  return (
    <details style={{ marginTop: 20, border: "1px solid #e0f0ea", borderRadius: 10, overflow: "hidden" }}>
      <summary style={{ cursor: "pointer", padding: "10px 14px", background: "#f0faf6", fontSize: 12, fontWeight: 700, color: "#0f6e56", letterSpacing: 0.3, userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>AI Analysis {va?.visual_difficulty_score ? `· Difficulty ${va.visual_difficulty_score}/10` : ""}</span>
        {!va && <span style={{ fontSize: 11, fontWeight: 400, color: "#888" }}>No data yet — scan this hole to populate</span>}
      </summary>

      <div style={{ padding: "0 14px 14px", background: "white" }}>

        {/* No data state */}
        {!va && (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>No AI analysis for this hole yet.</p>
            <p style={{ fontSize: 12, color: "#aaa" }}>Use the <strong style={{ color: "#0f6e56" }}>Scan with AI →</strong> link above to analyze this hole.</p>
          </div>
        )}

        {/* Has data */}
        {va && (
          <>
            {/* Overview */}
            <span style={sl}>Overview</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "8px 4px", border: "1px solid #eee" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: diffColor }}>{va.visual_difficulty_score}/10</div>
                <div style={{ fontSize: 10, color: "#666" }}>difficulty</div>
              </div>
              <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "8px 4px", border: "1px solid #eee" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{va.total_bunker_count ?? 0}</div>
                <div style={{ fontSize: 10, color: "#666" }}>bunkers</div>
              </div>
              <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "8px 4px", border: "1px solid #eee" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{va.fairway_width_yards ?? "—"}</div>
                <div style={{ fontSize: 10, color: "#666" }}>fwy yds</div>
              </div>
            </div>
            <ENum path={["visual_difficulty_score"]} label="Difficulty score (1-10)" />
            <ESel path={["fairway_width"]} label="Fairway width" opts={FWY_WIDTH} />
            <ENum path={["fairway_width_yards"]} label="Fairway width" unit="yds" />
            <ENum path={["total_bunker_count"]} label="Total bunkers" />
            <ENum path={["fairway_bunker_count"]} label="Fairway bunkers" />
            <ENum path={["greenside_bunker_count"]} label="Greenside bunkers" />
            <EBool path={["water_present"]} label="Water present" />
            {va.water_present && <>
              <ESel path={["water_type"]} label="Water type" opts={WATER_T} />
              <ESel path={["water_threat_level"]} label="Water threat" opts={THREAT} />
            </>}
            <ESel path={["primary_miss_side"]} label="Primary miss side" opts={["left","right","both","long","short","none"]} />

            {/* Strategic notes */}
            <span style={sl}>Strategy</span>
            <EText path={["strategic_notes"]} label="Strategic notes (your game)" />

            {/* Tee zone */}
            {tz && <>
              <span style={sl}>🏌️ Tee corridor</span>
              <EText path={["tee_zone","opening_description"]} label="Opening description" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0" }}>
                <div style={{ background: "#fafafa", borderRadius: 8, padding: "8px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>← Left (fade)</div>
                  <ENum path={["tee_zone","left_buffer_yards"]} label="Buffer" unit="yds" />
                  <ESel path={["tee_zone","left_buffer_rating"]} label="Rating" opts={BUFFER} />
                </div>
                <div style={{ background: "#fafafa", borderRadius: 8, padding: "8px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Right (pull) →</div>
                  <ENum path={["tee_zone","right_buffer_yards"]} label="Buffer" unit="yds" />
                  <ESel path={["tee_zone","right_buffer_rating"]} label="Rating" opts={BUFFER} />
                </div>
              </div>
              <EText path={["tee_zone","left_notes"]} label="Left notes (fade)" />
              <EText path={["tee_zone","right_notes"]} label="Right notes (pull)" />
              <CovBar label="Trees left" value={tz.tree_density_left ?? "none"} />
              <ESel path={["tee_zone","tree_density_left"]} label="Tree density left" opts={COVERAGE} />
              <CovBar label="Trees right" value={tz.tree_density_right ?? "none"} />
              <ESel path={["tee_zone","tree_density_right"]} label="Tree density right" opts={COVERAGE} />
              <div style={{ background: "#f0faf6", borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
                <ESel path={["tee_zone","recommended_aim"]} label="Recommended aim" opts={AIM} />
                <EText path={["tee_zone","recommended_aim_reason"]} label="Aim reason" />
              </div>
            </>}

            {/* Landing zone — hidden for par 3 */}
            {lz && hole.par !== 3 && <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={sl}>🎯 Landing zone</span>
                <DangerBadge value={lz.overall_danger ?? "safe"} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f6e56" }}>{lz.estimated_distance_yards}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>yds out</div>
                </div>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{lz.width_yards}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>yds wide</div>
                </div>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{lz.remaining_distance_to_green}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>yds to green</div>
                </div>
              </div>
              <ENum path={["landing_zone","estimated_distance_yards"]} label="Distance from tee" unit="yds" />
              <ENum path={["landing_zone","width_yards"]} label="Width" unit="yds" />
              <ENum path={["landing_zone","depth_yards"]} label="Depth" unit="yds" />
              <ENum path={["landing_zone","remaining_distance_to_green"]} label="Remaining to green" unit="yds" />
              <ESel path={["landing_zone","overall_danger"]} label="Overall danger" opts={DANGER} />
              <CovBar label="Trees left" value={lz.trees_left ?? "none"} />
              <ESel path={["landing_zone","trees_left"]} label="Trees left" opts={COVERAGE} />
              <CovBar label="Trees right" value={lz.trees_right ?? "none"} />
              <ESel path={["landing_zone","trees_right"]} label="Trees right" opts={COVERAGE} />
              <EBool path={["landing_zone","bunkers_present"]} label="Bunkers present" />
              {lz.bunkers_present && <EText path={["landing_zone","bunker_positions"]} label="Bunker positions" />}
              <EBool path={["landing_zone","water_present"]} label="Water present" />
              {lz.water_present && <EText path={["landing_zone","water_description"]} label="Water description" />}
              <EText path={["landing_zone","notes"]} label="Notes" />
            </>}

            {/* Pre-landing zone — hidden for par 3 */}
            {plz && hole.par !== 3 && <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={sl}>📍 Pre-landing (50 yds short of green)</span>
                <DangerBadge value={plz.overall_danger ?? "safe"} />
              </div>
              <ENum path={["pre_landing_zone","distance_yards"]} label="Distance from tee" unit="yds" />
              <ENum path={["pre_landing_zone","width_yards"]} label="Width" unit="yds" />
              <ESel path={["pre_landing_zone","overall_danger"]} label="Overall danger" opts={DANGER} />
              <CovBar label="Trees left" value={plz.trees_left ?? "none"} />
              <ESel path={["pre_landing_zone","trees_left"]} label="Trees left" opts={COVERAGE} />
              <CovBar label="Trees right" value={plz.trees_right ?? "none"} />
              <ESel path={["pre_landing_zone","trees_right"]} label="Trees right" opts={COVERAGE} />
              <EBool path={["pre_landing_zone","bunkers_present"]} label="Bunkers present" />
              {plz.bunkers_present && <EText path={["pre_landing_zone","bunker_description"]} label="Bunker description" />}
              <EBool path={["pre_landing_zone","water_present"]} label="Water present" />
              {plz.water_present && <EText path={["pre_landing_zone","water_description"]} label="Water description" />}
              <EText path={["pre_landing_zone","other_obstacles"]} label="Other obstacles" />
              <ESel path={["pre_landing_zone","room_to_recover"]} label="Room to recover" opts={ROOM} />
              <EText path={["pre_landing_zone","room_to_recover_notes"]} label="Room to recover notes" />
              <EBool path={["pre_landing_zone","safer_than_landing_zone"]} label="Safer than landing zone" />
              <EText path={["pre_landing_zone","description"]} label="Description" />
              <EText path={["pre_landing_zone","recommendation"]} label="Recommendation" />
            </>}

            {/* Approach zone */}
            {az && <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={sl}>⛳ Green zone</span>
                <DangerBadge value={az.overall_danger ?? "safe"} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0891b2" }}>{az.distance_to_green_center}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>yds to pin</div>
                </div>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{az.green_width_yards}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>green width</div>
                </div>
                <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{az.green_depth_yards}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>green depth</div>
                </div>
              </div>
              <ENum path={["approach_zone","distance_to_green_center"]} label="Distance to green" unit="yds" />
              <ESel path={["approach_zone","overall_danger"]} label="Overall danger" opts={DANGER} />
              <CovBar label="Trees left" value={az.trees_left ?? "none"} />
              <ESel path={["approach_zone","trees_left"]} label="Trees left" opts={COVERAGE} />
              <CovBar label="Trees right" value={az.trees_right ?? "none"} />
              <ESel path={["approach_zone","trees_right"]} label="Trees right" opts={COVERAGE} />
              <CovBar label="Trees long" value={az.trees_long ?? "none"} />
              <ESel path={["approach_zone","trees_long"]} label="Trees long" opts={COVERAGE} />
              <ESel path={["approach_zone","green_size"]} label="Green size" opts={GREEN_SIZE} />
              <ESel path={["approach_zone","green_shape"]} label="Green shape" opts={GREEN_SHAPE} />
              <ENum path={["approach_zone","green_width_yards"]} label="Green width" unit="yds" />
              <ENum path={["approach_zone","green_depth_yards"]} label="Green depth" unit="yds" />
              <EText path={["approach_zone","bunkers_description"]} label="Bunkers description" />
              <EText path={["approach_zone","water_description"]} label="Water description" />
              <EText path={["approach_zone","green_notes"]} label="Green notes" />
              <EText path={["approach_zone","notes"]} label="Approach notes" />
            </>}

            {/* Pre-green zone */}
            {va.pre_green_zone && (() => {
              const pgz = va.pre_green_zone;
              return <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={sl}>🏳️ Pre-green zone ({pgz.distance_from_green_yards} yds short)</span>
                  <DangerBadge value={pgz.overall_danger ?? "safe"} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ textAlign: "center", background: "#fafafa", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#7c3aed" }}>{pgz.distance_from_green_yards}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>yds short of green</div>
                  </div>
                  <div style={{ textAlign: "center", background: pgz.recommendation === "go_for_green" ? "#f0faf6" : "#fff8f0", borderRadius: 8, padding: "6px 4px", border: "1px solid #eee" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: pgz.recommendation === "go_for_green" ? "#0f6e56" : "#f97316" }}>
                      {pgz.recommendation === "go_for_green" ? "✓ Go for it" : "→ Layup"}
                    </div>
                    <div style={{ fontSize: 10, color: "#666" }}>recommendation</div>
                  </div>
                </div>
                <ENum path={["pre_green_zone","distance_from_green_yards"]} label="Distance short of green" unit="yds" />
                <ESel path={["pre_green_zone","overall_danger"]} label="Overall danger" opts={DANGER} />
                <CovBar label="Trees left" value={pgz.trees_left ?? "none"} />
                <ESel path={["pre_green_zone","trees_left"]} label="Trees left" opts={COVERAGE} />
                <CovBar label="Trees right" value={pgz.trees_right ?? "none"} />
                <ESel path={["pre_green_zone","trees_right"]} label="Trees right" opts={COVERAGE} />
                <CovBar label="Trees long (behind)" value={pgz.trees_long ?? "none"} />
                <ESel path={["pre_green_zone","trees_long"]} label="Trees long" opts={COVERAGE} />
                <EBool path={["pre_green_zone","bunkers_present"]} label="Bunkers present" />
                {pgz.bunkers_present && <EText path={["pre_green_zone","bunker_description"]} label="Bunker description" />}
                <EBool path={["pre_green_zone","water_present"]} label="Water present" />
                {pgz.water_present && <EText path={["pre_green_zone","water_description"]} label="Water description" />}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0" }}>
                  <div style={{ background: "#f0faf6", borderRadius: 8, padding: "8px", border: "1px solid #c8e6c9" }}>
                    <div style={{ fontSize: 10, color: "#0f6e56", fontWeight: 700, marginBottom: 4 }}>Go for green</div>
                    <ENum path={["pre_green_zone","go_for_green_rating"]} label="Rating (1-5)" />
                  </div>
                  <div style={{ background: "#fafafa", borderRadius: 8, padding: "8px", border: "1px solid #eee" }}>
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 700, marginBottom: 4 }}>Layup here</div>
                    <ENum path={["pre_green_zone","layup_rating"]} label="Rating (1-5)" />
                  </div>
                </div>
                <div style={row}>
                  <span style={lbl}>Recommendation</span>
                  <select value={pgz.recommendation} onChange={e => update(["pre_green_zone","recommendation"], e.target.value)} style={{ ...inp, color: "#0f6e56" }}>
                    <option value="go_for_green">Go for green</option>
                    <option value="layup">Layup</option>
                  </select>
                </div>
                <EText path={["pre_green_zone","recommendation_reason"]} label="Reason" />
                <EText path={["pre_green_zone","description"]} label="Zone description" />
              </>;
            })()}

            {/* Layup zone */}
            {layz && <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={sl}>⚖️ Go for green vs layup</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: layz.recommendation === "go_for_green" ? "#f0faf6" : "#fff8f0", color: layz.recommendation === "go_for_green" ? "#0f6e56" : "#f97316" }}>
                  {layz.recommendation === "go_for_green" ? "✓ Go for it" : "→ Layup"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ background: "#f0faf6", borderRadius: 8, padding: "8px", border: "1px solid #c8e6c9" }}>
                  <div style={{ fontSize: 10, color: "#0f6e56", fontWeight: 700, marginBottom: 4 }}>Go for green</div>
                  <ENum path={["layup_zone","go_for_green_rating"]} label="Rating (1-5)" />
                </div>
                <div style={{ background: "#fafafa", borderRadius: 8, padding: "8px", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 10, color: "#666", fontWeight: 700, marginBottom: 4 }}>Layup to 50 yds</div>
                  <ENum path={["layup_zone","layup_rating"]} label="Rating (1-5)" />
                </div>
              </div>
              <div style={row}>
                <span style={lbl}>Recommendation</span>
                <select value={layz.recommendation} onChange={e => update(["layup_zone","recommendation"], e.target.value)} style={{ ...inp, color: "#0f6e56" }}>
                  <option value="go_for_green">Go for green</option>
                  <option value="layup">Layup</option>
                </select>
              </div>
              <EText path={["layup_zone","recommendation_reason"]} label="Reason" />
              <EBool path={["layup_zone","bunkers_present"]} label="Bunkers in layup zone" />
              <EBool path={["layup_zone","water_present"]} label="Water in layup zone" />
            </>}

            {/* Copy to tee */}
            {otherTees.length > 0 && va && (
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <select
                  value={copyTarget}
                  onChange={e => setCopyTarget(e.target.value)}
                  style={{ flex: 1, padding: "8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 8, background: "white", color: "#1a1a1a" }}
                >
                  <option value="">Copy AI analysis to tee…</option>
                  {otherTees.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.tee_box} tees</option>
                  ))}
                </select>
                <button
                  onClick={handleCopyToTee}
                  disabled={!copyTarget || copying}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, background: copyTarget ? "#1a1a1a" : "#e5e5e5", color: copyTarget ? "white" : "#aaa", border: "none", borderRadius: 8, cursor: copyTarget ? "pointer" : "not-allowed" }}
                >
                  {copying ? "Copying…" : "Copy →"}
                </button>
              </div>
            )}

            {/* Refresh + Save buttons */}
            <button
              onClick={handleRefresh}
              disabled={refreshing || saving}
              style={{ width: "100%", marginTop: 14, padding: "9px", fontSize: 13, fontWeight: 600, background: "white", color: "#0f6e56", border: "2px solid #0f6e56", borderRadius: 8, cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.7 : 1 }}
            >
              {refreshing ? "Refreshing AI text fields…" : "↺ Refresh AI summary from edited fields"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ width: "100%", marginTop: 8, padding: "9px", fontSize: 13, fontWeight: 600, background: saved ? "#e8f5e9" : "#0f6e56", color: saved ? "#2e7d32" : "white", border: saved ? "1px solid #a5d6a7" : "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : saved ? "✓ AI analysis saved" : "Save AI analysis"}
            </button>
          </>
        )}
      </div>
    </details>
  );
}

function Scorecard({ savedCourse, allVersions, onEditCourse }: {
  savedCourse: CourseRecord;
  allVersions: CourseRecord[];
  onEditCourse: () => void;
}) {
  const holes = savedCourse.holes;
  const is18 = holes.length === 18;

  const sortedTees = [...allVersions].sort((a, b) =>
    b.holes.reduce((s, h) => s + (h.yards||0), 0) - a.holes.reduce((s, h) => s + (h.yards||0), 0)
  );

  type Col = { type: "hole"; hole: HoleData } | { type: "spacer"; label: string; parSum: number; yardsMap: Record<string, number> };
  const cols: Col[] = [];
  const makeSpacerYards = (sliceHoles: HoleData[]) => {
    const nums = new Set(sliceHoles.map(h => h.hole));
    return Object.fromEntries(sortedTees.map(t => [t.tee_box, t.holes.filter(h => nums.has(h.hole)).reduce((s, h) => s + (h.yards||0), 0)]));
  };

  if (is18) {
    holes.slice(0,9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"Out", parSum:holes.slice(0,9).reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes.slice(0,9)) });
    holes.slice(9).forEach(h => cols.push({ type:"hole", hole:h }));
    cols.push({ type:"spacer", label:"In", parSum:holes.slice(9).reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes.slice(9)) });
  } else {
    holes.forEach(h => cols.push({ type:"hole", hole:h }));
  }
  cols.push({ type:"spacer", label:"Total", parSum:holes.reduce((s,h)=>s+h.par,0), yardsMap:makeSpacerYards(holes) });

  const c: React.CSSProperties  = { padding:"6px 4px", textAlign:"center", fontSize:12, borderRight:"1px solid #e0e0e0", whiteSpace:"nowrap" };
  const hdr: React.CSSProperties = { ...c, background:"#1a3a2a", color:"white", fontWeight:600 };
  const lbl: React.CSSProperties = { ...c, background:"#f0f0f0", fontWeight:600, color:"#333", textAlign:"left", paddingLeft:8, minWidth:64 };
  const sp: React.CSSProperties  = { ...c, background:"#e8f5f0", fontWeight:700, color:"#0f6e56" };

  const btn = (primary: boolean): React.CSSProperties => ({
    padding:"10px 20px", fontSize:14, fontWeight:600,
    background: primary ? "#0f6e56" : "white",
    color: primary ? "white" : "#0f6e56",
    border:"1px solid #0f6e56",
    borderRadius:8, cursor:"pointer", textDecoration:"none", display:"inline-block",
  });

  return (
    <main style={{ maxWidth:940, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:"#1a1a1a", margin:"0 0 4px" }}>{savedCourse.name}</h1>
        <p style={{ fontSize:14, color:"#666", margin:0 }}>
          {savedCourse.city}, {savedCourse.state}
          {savedCourse.rating && savedCourse.slope ? ` · Rating ${savedCourse.rating} / Slope ${savedCourse.slope}`
            : savedCourse.rating ? ` · Rating ${savedCourse.rating}`
            : savedCourse.slope ? ` · Slope ${savedCourse.slope}` : ""}
        </p>
      </div>
      <div style={{ overflowX:"auto", marginBottom:28, borderRadius:10, border:"1px solid #ddd", boxShadow:"0 2px 8px #0001" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", tableLayout:"auto" }}>
          <tbody>
            <tr>
              <td style={lbl}>Hole</td>
              {cols.map((col,ci) => col.type==="hole" ? <td key={ci} style={hdr}>{col.hole.hole}</td> : <td key={ci} style={sp}>{col.label}</td>)}
            </tr>
            <tr>
              <td style={lbl}>Index</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#fafafa", color:"#555" }}>{col.hole.stroke_index}</td>
                : <td key={ci} style={{ ...c, background:"#e8f5f0" }}></td>)}
            </tr>
            <tr>
              <td style={lbl}>Par</td>
              {cols.map((col,ci) => col.type==="hole"
                ? <td key={ci} style={{ ...c, background:"#fff", fontWeight:600, color:"#1a1a1a" }}>{col.hole.par}</td>
                : <td key={ci} style={sp}>{col.parSum}</td>)}
            </tr>
            {sortedTees.map((tee,ti) => (
              <tr key={tee.id} style={{ background:ti%2===0?"#fff":"#f9f9f9" }}>
                <td style={{ ...lbl, background:ti%2===0?"#fff":"#f9f9f9" }}>
                  <span style={{ fontSize:11, color:"#0f6e56", fontWeight:600 }}>{tee.tee_box}</span>
                </td>
                {cols.map((col,ci) => {
                  if (col.type==="hole") {
                    const th = tee.holes.find(h => h.hole===col.hole.hole);
                    return <td key={ci} style={c}>{th?.yards||"—"}</td>;
                  }
                  return <td key={ci} style={{ ...sp, fontSize:13 }}>{col.yardsMap[tee.tee_box]||"—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <a href={`/rounds/add?course=${savedCourse.id}`} style={btn(true)}>+ Add a round</a>
        <button onClick={onEditCourse} style={btn(false)}>← Edit this course</button>
        <a href="/courses" style={btn(false)}>Back to courses</a>
        <a href="/" style={{ ...btn(false), color:"#666", borderColor:"#ccc" }}>Go to strategy</a>
      </div>
    </main>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function EditCourseInner() {

  const params = useParams();
  const id = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id as string);
  const searchParams = useSearchParams();

  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [saving, setSaving] = useState(false);
  const [holeNotesOpen, setHoleNotesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [greenside, setGreenside] = useState<GreensideState>(defaultGreensideState());
  const [showScorecard, setShowScorecard] = useState(false);
  const [allTeeVersions, setAllTeeVersions] = useState<CourseRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    getCourse(id).then(async (data) => {
      if (data) {
        setCourse(data);
        setCourseName(data.name ?? "");
        setTeeBox(data.tee_box ?? "");
        setCity(data.city ?? "");
        setState(data.state ?? "");
        setRating(data.rating != null ? String(data.rating) : "");
        setSlope(data.slope != null ? String(data.slope) : "");
        setAiSummary(data.ai_summary ?? "");
        setHoles(data.holes ?? []);
        if (data.holes?.length > 0) setGreenside(flatToGreenside(data.holes[0] as Record<string,unknown>));
        const allCourses = await loadCourses();
        const versions = allCourses.filter(c => c.name === data.name);
        setAllTeeVersions(versions.length > 0 ? versions : [data]);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (searchParams.get("scan") !== "1") return;
    if (holes.length === 0) return; // wait for course to load first

    const holeNum = parseInt(searchParams.get("holeNum") || "1");
    const vaRaw = searchParams.get("visual_analysis");
    const vaOnly = searchParams.get("vaOnly") === "1";

    if (vaOnly) {
      // Existing hole — only update visual_analysis, leave all other fields untouched
      if (vaRaw) {
        try {
          const va = JSON.parse(vaRaw);
          setHoles(prev => prev.map(h => h.hole === holeNum ? { ...h, visual_analysis: va } as HoleData : h));
          setCurrentHole(holeNum - 1);
        } catch { /* ignore parse errors */ }
      }
      return;
    }

    // New hole — merge all fields
    const prefilled: Partial<HoleData> = {
      par: parseInt(searchParams.get("par") || "4") as 3 | 4 | 5,
      yards: parseInt(searchParams.get("yards") || "0"),
      dogleg_direction: (searchParams.get("dogleg_direction") as DoglegDirection) || null,
      tee_tree_hazard_left:       searchParams.get("tee_tree_hazard_left") === "true",
      tee_tree_hazard_right:      searchParams.get("tee_tree_hazard_right") === "true",
      tee_bunkers_left:           searchParams.get("tee_bunkers_left") === "true",
      tee_bunkers_right:          searchParams.get("tee_bunkers_right") === "true",
      tee_water_out_left:         searchParams.get("tee_water_out_left") === "true",
      tee_water_out_right:        searchParams.get("tee_water_out_right") === "true",
      tee_water_out_across:       searchParams.get("tee_water_out_across") === "true",
      approach_tree_hazard_left:  searchParams.get("approach_tree_hazard_left") === "true",
      approach_tree_hazard_right: searchParams.get("approach_tree_hazard_right") === "true",
      approach_tree_hazard_long:  searchParams.get("approach_tree_hazard_long") === "true",
      approach_bunkers_left:      searchParams.get("approach_bunkers_left") === "true",
      approach_bunkers_right:     searchParams.get("approach_bunkers_right") === "true",
      approach_water_out_left:    searchParams.get("approach_water_out_left") === "true",
      approach_water_out_right:   searchParams.get("approach_water_out_right") === "true",
      approach_water_out_short:   searchParams.get("approach_water_out_short") === "true",
      approach_water_out_long:    searchParams.get("approach_water_out_long") === "true",
      approach_bunker_short_middle:  searchParams.get("approach_bunker_short_middle") === "true",
      approach_bunker_short_left:    searchParams.get("approach_bunker_short_left") === "true",
      approach_bunker_middle_left:   searchParams.get("approach_bunker_middle_left") === "true",
      approach_bunker_long_left:     searchParams.get("approach_bunker_long_left") === "true",
      approach_bunker_long_middle:   searchParams.get("approach_bunker_long_middle") === "true",
      approach_bunker_long_right:    searchParams.get("approach_bunker_long_right") === "true",
      approach_bunker_middle_right:  searchParams.get("approach_bunker_middle_right") === "true",
      approach_bunker_short_right:   searchParams.get("approach_bunker_short_right") === "true",
      approach_green_short_middle:   searchParams.get("approach_green_short_middle") === "true",
      approach_green_short_left:     searchParams.get("approach_green_short_left") === "true",
      approach_green_middle_left:    searchParams.get("approach_green_middle_left") === "true",
      approach_green_long_left:      searchParams.get("approach_green_long_left") === "true",
      approach_green_long_middle:    searchParams.get("approach_green_long_middle") === "true",
      approach_green_long_right:     searchParams.get("approach_green_long_right") === "true",
      approach_green_middle_right:   searchParams.get("approach_green_middle_right") === "true",
      approach_green_short_right:    searchParams.get("approach_green_short_right") === "true",
      approach_green_depth:          parseInt(searchParams.get("approach_green_depth") || "25"),
    };

    if (vaRaw) {
      try { (prefilled as any).visual_analysis = JSON.parse(vaRaw); } catch { /* ignore */ }
    }

    setHoles(prev => prev.map(h => h.hole === holeNum ? { ...h, ...prefilled } : h));
    setCurrentHole(holeNum - 1);
  }, [holes.length, searchParams]);

  const inputStyle: React.CSSProperties  = { width:"100%", padding:"8px 12px", fontSize:15, border:"1px solid #ddd", borderRadius:8, boxSizing:"border-box" };
  const selectStyle: React.CSSProperties = { ...inputStyle, background:"white", color:"#0f6e56" };
  const primaryBtn: React.CSSProperties  = { padding:"10px 20px", fontSize:15, fontWeight:600, background:"#1a1a1a", color:"white", border:"1px solid #1a1a1a", borderRadius:8, cursor:"pointer" };
  const navBtn = (disabled: boolean): React.CSSProperties => ({
    padding:"8px 16px", fontSize:14, fontWeight:600, background:"white",
    color: disabled ? "#ddd" : "#bbb",
    border:`1px solid ${disabled ? "#eee" : "#ddd"}`,
    borderRadius:8, cursor: disabled ? "not-allowed" : "pointer",
  });

  function updateHole(field: keyof HoleData, value: any) {
    setHoles(prev => prev.map((h, i) => {
      if (i !== currentHole) return h;
      const u = { ...h, [field]: value };
      if (field === "par" && value === 3) {
        u.tee_tree_hazard_left=false; u.tee_tree_hazard_right=false;
        u.tee_tree_hazard_across=false;
        u.tee_bunkers_left=false; u.tee_bunkers_right=false;
        u.tee_water_out_left=false; u.tee_water_out_right=false; u.tee_water_out_across=false;
      }
      return u;
    }));
  }

  function toggleCheck(field: keyof HoleData) {
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, [field]: !h[field] } : h));
  }

  function handleGreensideChange(next: GreensideState) {
    setGreenside(next);
    const flat = greensideToFlat(next);
    setHoles(prev => prev.map((h, i) => i === currentHole ? { ...h, ...flat } : h));
  }

  function goToPrevHole() {
    const prev = Math.max(0, currentHole - 1);
    setCurrentHole(prev);
    setGreenside(flatToGreenside(holes[prev] as Record<string,unknown>));
  }

  function goToNextHole() {
    const next = Math.min(holes.length-1, currentHole+1);
    setCurrentHole(next);
    setGreenside(flatToGreenside(holes[next] as Record<string,unknown>));
  }

  async function handleSave() {
    if (!course) return;
    setSaving(true);
    const updated = {
      ...course, name:courseName.trim(), tee_box:teeBox.trim(),
      city:city.trim(), state:state.trim(),
      rating: rating!==""?parseFloat(rating):null,
      slope: slope!==""?parseInt(slope):null,
      holes,
      ai_summary: aiSummary || null,
    };
    await saveCourse(updated);
    const allCourses = await loadCourses();
    const versions = allCourses.filter(c => c.name === updated.name);
    setAllTeeVersions(versions.length > 0 ? versions : [updated]);
    setCourse(updated);
    setSaving(false);
    setShowScorecard(true);
  }

  if (loading) return <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}><p style={{ color:"#666" }}>Loading course...</p></main>;
  if (!course) return <main style={{ maxWidth:520, margin:"60px auto", fontFamily:"sans-serif", padding:"0 24px" }}><p style={{ color:"red" }}>Course not found.</p><a href="/courses" style={{ fontSize:13, color:"#666" }}>← Back to courses</a></main>;

  if (showScorecard && course) {
    return (
      <Scorecard
        savedCourse={{ ...course, name:courseName, tee_box:teeBox, city, state, rating:rating?parseFloat(rating):null, slope:slope?parseInt(slope):null, holes }}
        allVersions={allTeeVersions}
        onEditCourse={() => setShowScorecard(false)}
      />
    );
  }

  const hole = holes[currentHole];

  return (
    <main style={{ maxWidth:520, margin:"40px auto", fontFamily:"sans-serif", padding:"0 24px" }}>
      <div style={{ marginBottom:16 }}>
        <a href="/courses" style={{ fontSize:13, color:"#bbb" }}>← Back to courses</a>
      </div>
      <h1 style={{ fontSize:20, fontWeight:600, marginBottom:20, color:"#bbb" }}>Edit course</h1>

      {/* Course details */}
      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:28, padding:20, background:"#f6f6f6", borderRadius:12 }}>
        <p style={{ fontSize:12, color:"#bbb", margin:"0 0 4px", fontWeight:600, letterSpacing:1 }}>COURSE DETAILS</p>
        <div><label style={LABEL}>Course name</label><input style={inputStyle} value={courseName} onChange={e => setCourseName(e.target.value)} /></div>
        <div><label style={LABEL}>Tee box</label><input style={inputStyle} value={teeBox} onChange={e => setTeeBox(e.target.value)} /></div>
        <div><label style={LABEL}>Course Rating</label><input style={inputStyle} value={rating} type="number" step="0.1" min="60" max="80" onChange={e => setRating(e.target.value)} placeholder="e.g. 71.4" /></div>
        <div><label style={LABEL}>Slope</label><input style={inputStyle} value={slope} type="number" min="55" max="155" onChange={e => setSlope(e.target.value)} placeholder="e.g. 128" /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={LABEL}>City</label><input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} /></div>
          <div><label style={LABEL}>State</label><input style={inputStyle} value={state} onChange={e => setState(e.target.value)} /></div>
        </div>
        {/* AI Summary collapsible */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:10 }}>
          <button onClick={() => setSummaryOpen(o => !o)}
            style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", background:"none", border:"none", cursor:"pointer", padding:0 }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#0f6e56", textTransform:"uppercase", letterSpacing:1 }}>
              AI Course Summary {aiSummary ? "✓" : ""}
            </span>
            <span style={{ fontSize:13, color:"#999" }}>{summaryOpen ? "▲" : "▼"}</span>
          </button>
          {summaryOpen && (
            <div style={{ marginTop:10 }}>
              <label style={LABEL}>Paste an AI-generated course description here</label>
              <textarea
                value={aiSummary}
                onChange={e => setAiSummary(e.target.value)}
                placeholder="e.g. Designed by Arthur Hills, this course features..."
                rows={8}
                style={{ ...inputStyle, resize:"vertical", lineHeight:1.5, fontSize:13 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Hole navigation — centered */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, gap:12 }}>
        <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
        <div style={{ textAlign:"center", flex:1 }}>
          <div style={HOLE_NAME}>Hole {hole.hole}</div>
          <div style={{ fontSize:13, color:"#bbb", marginTop:2 }}>{currentHole+1} of {holes.length}</div>
<a href={`/add-course/scan?holeNum=${hole.hole}&courseId=${id}&returnTo=edit`} style={{ fontSize:12, color:"#0f6e56", textDecoration:"underline", display:"block", marginTop:4 }}>
            Scan with AI →
          </a>
        </div>
        <button style={navBtn(currentHole>=holes.length-1)} onClick={goToNextHole} disabled={currentHole>=holes.length-1}>Next →</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div><label style={LABEL}>Par</label>
            <select style={selectStyle} value={hole.par} onChange={e => updateHole("par", Number(e.target.value))}>
              {[3,4,5].map(p => <option key={p} value={p}>Par {p}</option>)}
            </select>
          </div>
          <div><label style={LABEL}>Yards</label>
            <input style={inputStyle} type="number" min={1} max={700} value={hole.yards||""} onChange={e => updateHole("yards", Number(e.target.value))} />
          </div>
          <div><label style={LABEL}>Stroke Index</label>
            <input style={inputStyle} type="number" min={1} max={18} value={hole.stroke_index||""} onChange={e => updateHole("stroke_index", Number(e.target.value))} />
          </div>

          {/* Preferred tee strategy */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:8 }}>
            <div>
              <label style={LABEL}>Preferred Club</label>
              <select style={selectStyle} value={hole.preferred_club ?? ""} onChange={e => updateHole("preferred_club", e.target.value || undefined)}>
                <option value="">— none —</option>
                {["Driver","3W","5W","7W","4i","5i","6i","7i","8i","9i","PW","SW","LW"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Preferred Landing</label>
              <select style={selectStyle} value={hole.preferred_landing ?? ""} onChange={e => updateHole("preferred_landing", e.target.value || null)}>
                <option value="">— none —</option>
                <option value="L">L — Left rough</option>
                <option value="LF">LF — Left fairway</option>
                <option value="CF">CF — Center fairway</option>
                <option value="RF">RF — Right fairway</option>
                <option value="R">R — Right rough</option>
              </select>
            </div>
          </div>

        </div>
        {/* Hole Notes */}
        <div>
          <button onClick={()=>setHoleNotesOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"4px 0"}}>
            <span style={{fontSize:11,fontWeight:600,color:"#0f6e56",textTransform:"uppercase",letterSpacing:1}}>Hole Notes {hole.hole_notes?"✓":""}</span>
            <span style={{fontSize:13,color:"#bbb"}}>{holeNotesOpen?"▲":"▼"}</span>
          </button>
          {holeNotesOpen&&(
            <textarea
              value={hole.hole_notes??""} onChange={e=>updateHole("hole_notes",e.target.value)}
              placeholder="Add notes about this hole..."
              rows={3}
              style={{width:"100%",padding:"8px 10px",fontSize:13,border:"1px solid #ddd",borderRadius:8,boxSizing:"border-box",resize:"vertical",fontFamily:"sans-serif",lineHeight:1.5,marginTop:6}}
            />
          )}
        </div>

        <div>
          <label style={LABEL}>Dogleg direction</label>
          <select style={selectStyle} value={hole.dogleg_direction??""} onChange={e => updateHole("dogleg_direction", e.target.value===""?null:e.target.value as DoglegDirection)} disabled={hole.par===3}>
            {DOGLEG_OPTIONS.map(o => <option key={String(o.value)} value={o.value??""}>{o.label}</option>)}
          </select>
          {hole.par===3 && <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 0" }}>Disabled for par 3</p>}
        </div>

        {/* Tee Shot Hazards — 2 columns */}
        <div>
          <span style={SECTION}>Tee Shot Hazards</span>
          {hole.par===3 && <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 8px" }}>Disabled for par 3</p>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, opacity:hole.par===3?0.3:1 }}>
            {TEE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#bbb", cursor:hole.par===3?"not-allowed":"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => hole.par!==3&&toggleCheck(key)} disabled={hole.par===3} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Approach Hazards */}
        <div>
          <span style={SECTION}>Approach Hazards</span>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {APPROACH_CHECKBOXES.map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:"#bbb", cursor:"pointer" }}>
                <input type="checkbox" checked={!!hole[key]} onChange={() => toggleCheck(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Greenside */}
        <div>
          <span style={SECTION}>Greenside</span>
          <div style={{ marginBottom:12 }}>
            <label style={LABEL}>Green depth (yards)</label>
            <input style={{ ...inputStyle, maxWidth:120 }} type="number" min={0} value={hole.approach_green_depth||""} onChange={e => updateHole("approach_green_depth", Number(e.target.value))} />
          </div>
          <GreensideSelector value={greenside} onChange={handleGreensideChange} />
        </div>

        <AiAnalysisPanel hole={hole} allTeeVersions={allTeeVersions} courseId={id} onSave={async (updated) => {
  setHoles(prev => prev.map(h => h.hole === updated.hole ? updated : h));
}} />

        {/* Bottom nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8, paddingTop:16, borderTop:"1px solid #eee", gap:12 }}>
          <button style={navBtn(currentHole===0)} onClick={goToPrevHole} disabled={currentHole===0}>← Prev</button>
          <span style={{ fontSize:14, fontWeight:600, color:"#bbb" }}>Hole {hole.hole}</span>
          <button style={navBtn(currentHole>=holes.length-1)} onClick={goToNextHole} disabled={currentHole>=holes.length-1}>Next →</button>
        </div>

        <button style={{ ...primaryBtn, opacity:saving?0.6:1, marginTop:8 }} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save all changes"}
        </button>
      </div>
    </main>
  );
}

export default function EditCourse() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#aaa" }}>Loading...</div>}>
      <EditCourseInner />
    </Suspense>
  );
}
