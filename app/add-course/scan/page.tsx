'use client';
// app/add-course/scan/page.tsx

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const pageStyle: React.CSSProperties = { maxWidth: 700, margin: '0 auto', padding: '24px 16px' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#0f6e56', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block' };
const inputStyle: React.CSSProperties = { padding: '5px 8px', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, background: 'white', color: '#1a1a1a' };
const textareaStyle: React.CSSProperties = { ...inputStyle, width: '100%', minHeight: 60, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };
const btnPrimary: React.CSSProperties = { background: '#0f6e56', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: 16 };
const btnDisabled: React.CSSProperties = { ...btnPrimary, background: '#aaa', cursor: 'not-allowed' };
const dropZoneBase: React.CSSProperties = { border: '2px dashed #ccc', borderRadius: 10, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', color: '#666', fontSize: 14, marginBottom: 16 };
const dropZoneActive: React.CSSProperties = { ...dropZoneBase, border: '2px dashed #0f6e56', background: '#f0faf6' };
const card: React.CSSProperties = { border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', marginBottom: 12, background: '#fafafa' };
const zoneCard = (color: string): React.CSSProperties => ({ border: `1px solid ${color}30`, borderRadius: 10, padding: '14px 16px', marginBottom: 12, background: `${color}08`, borderLeft: `4px solid ${color}` });
const errorBox: React.CSSProperties = { background: '#fff0f0', border: '1px solid #f5c6c6', borderRadius: 8, padding: '10px 14px', color: '#c0392b', fontSize: 13, marginTop: 12 };
const successBox: React.CSSProperties = { background: '#f0faf6', border: '1px solid #0f6e56', borderRadius: 8, padding: '10px 14px', color: '#0f6e56', fontSize: 13, marginTop: 12 };
const editRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #f0f0f0', gap: 8 };
const editLabel: React.CSSProperties = { color: '#444', flex: 1 };

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeeZone {
  opening_description: string;
  left_buffer_yards: number;
  left_buffer_rating: string;
  left_hazard_type: string;
  left_hazard_severity: string;
  left_notes: string;
  right_buffer_yards: number;
  right_buffer_rating: string;
  right_hazard_type: string;
  right_hazard_severity: string;
  right_notes: string;
  tree_density_left: string;
  tree_density_right: string;
  recommended_aim: string;
  recommended_aim_reason: string;
}

interface LandingZoneData {
  estimated_distance_yards: number;
  width_yards: number;
  depth_yards: number;
  trees_left: string;
  trees_right: string;
  bunkers_present: boolean;
  bunker_positions: string | null;
  water_present: boolean;
  water_description: string | null;
  remaining_distance_to_green: number;
  overall_danger: string;
  notes: string;
}

interface PreLandingZone {
  distance_yards: number;
  width_yards: number;
  description: string;
  trees_left: string;
  trees_right: string;
  bunkers_present: boolean;
  bunker_description: string | null;
  water_present: boolean;
  water_description: string | null;
  other_obstacles: string | null;
  room_to_recover: string;
  room_to_recover_notes: string;
  overall_danger: string;
  safer_than_landing_zone: boolean;
  recommendation: string;
}

interface Par5SecondLanding {
  estimated_distance_yards: number;
  remaining_distance_to_green: number;
  shot_type_remaining: string;
  trees_left: string;
  trees_right: string;
  bunkers_present: boolean;
  water_present: boolean;
  overall_danger: string;
  notes: string;
}

interface ApproachZone {
  distance_to_green_center: number;
  trees_left: string;
  trees_right: string;
  trees_long: string;
  bunkers_description: string;
  water_description: string | null;
  green_size: string;
  green_shape: string;
  green_width_yards: number;
  green_depth_yards: number;
  green_notes: string;
  overall_danger: string;
  notes: string;
}

interface LayupZone {
  distance_yards_from_tee: number;
  distance_to_green: number;
  description: string;
  trees_left: string;
  trees_right: string;
  bunkers_present: boolean;
  water_present: boolean;
  overall_danger: string;
  go_for_green_rating: number;
  layup_rating: number;
  recommendation: 'go_for_green' | 'layup';
  recommendation_reason: string;
}

interface VisualAnalysis {
  fairway_width: string;
  fairway_width_yards: number;
  tee_zone: TeeZone;
  landing_zone: LandingZoneData;
  pre_landing_zone: PreLandingZone;
  par5_second_landing_zone: Par5SecondLanding | null;
  approach_zone: ApproachZone;
  layup_zone: LayupZone | null;
  total_bunker_count: number;
  fairway_bunker_count: number;
  greenside_bunker_count: number;
  water_present: boolean;
  water_type: string;
  water_threat_level: string;
  total_hazard_count: number;
  visual_difficulty: string;
  visual_difficulty_score: number;
  primary_miss_side: string;
  strategic_notes: string;
}

interface ScanResult {
  par: 3 | 4 | 5;
  yards: number;
  dogleg_direction: string | null;
  tee_tree_hazard_left: boolean;
  tee_tree_hazard_right: boolean;
  tee_bunkers_left: boolean;
  tee_bunkers_right: boolean;
  tee_water_out_left: boolean;
  tee_water_out_right: boolean;
  tee_water_out_across: boolean;
  approach_tree_hazard_left: boolean;
  approach_tree_hazard_right: boolean;
  approach_tree_hazard_long: boolean;
  approach_bunkers_left: boolean;
  approach_bunkers_right: boolean;
  approach_water_out_left: boolean;
  approach_water_out_right: boolean;
  approach_water_out_short: boolean;
  approach_water_out_long: boolean;
  approach_bunker_short_middle: boolean;
  approach_bunker_short_left: boolean;
  approach_bunker_middle_left: boolean;
  approach_bunker_long_left: boolean;
  approach_bunker_long_middle: boolean;
  approach_bunker_long_right: boolean;
  approach_bunker_middle_right: boolean;
  approach_bunker_short_right: boolean;
  approach_green_short_middle: boolean;
  approach_green_short_left: boolean;
  approach_green_middle_left: boolean;
  approach_green_long_left: boolean;
  approach_green_long_middle: boolean;
  approach_green_long_right: boolean;
  approach_green_middle_right: boolean;
  approach_green_short_right: boolean;
  approach_green_depth: number;
  visual_analysis: VisualAnalysis;
  confidence_notes?: string;
}

// ─── Edit helpers ─────────────────────────────────────────────────────────────

function EditBool({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={editRow}>
      <span style={editLabel}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{ padding: '3px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, border: 'none', cursor: 'pointer', background: value ? '#0f6e56' : '#e5e5e5', color: value ? 'white' : '#666', minWidth: 52 }}
      >
        {value ? '✓ Yes' : 'No'}
      </button>
    </div>
  );
}

function EditNum({ label, value, onChange, unit }: { label: string; value: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div style={editRow}>
      <span style={editLabel}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
        {unit && <span style={{ fontSize: 12, color: '#666' }}>{unit}</span>}
      </div>
    </div>
  );
}

function EditSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={editRow}>
      <span style={editLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, color: '#0f6e56' }}>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}

function EditText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <textarea value={value} onChange={e => onChange(e.target.value)} style={textareaStyle} />
    </div>
  );
}

function DangerBadge({ value }: { value: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    safe: { bg: '#f0faf6', text: '#0f6e56' }, mild: { bg: '#f0faf6', text: '#0f6e56' },
    moderate: { bg: '#fffbea', text: '#b45309' }, dangerous: { bg: '#fff0f0', text: '#c0392b' },
    very_dangerous: { bg: '#fff0f0', text: '#c0392b' },
  };
  const c = colors[value] ?? colors.moderate;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.text, textTransform: 'capitalize' }}>{value.replace(/_/g, ' ')}</span>;
}

function CoverageBar({ label, value }: { label: string; value: string }) {
  const levels: Record<string, number> = { none: 0, sparse: 1, moderate: 2, heavy: 3, wall: 4 };
  const level = levels[value] ?? 0;
  const colors = ['#e5e5e5', '#c8e6c9', '#ffcc80', '#ef9a9a', '#b71c1c'];
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 2 }}>
        <span>{label}</span><span style={{ fontWeight: 600, color: '#1a1a1a', textTransform: 'capitalize' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0,1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= level ? colors[level] : '#e5e5e5' }} />)}
      </div>
    </div>
  );
}

function DifficultyMeter({ score }: { score: number }) {
  const color = score <= 3 ? '#0f6e56' : score <= 5 ? '#f59e0b' : score <= 7 ? '#f97316' : '#ef4444';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 4 }}>
        <span>Visual difficulty</span><span style={{ fontWeight: 700, color, fontSize: 18 }}>{score}/10</span>
      </div>
      <div style={{ background: '#e5e5e5', borderRadius: 4, height: 8 }}>
        <div style={{ width: `${score * 10}%`, background: color, height: 8, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function BufferBar({ yards, rating, side }: { yards: number; rating: string; side: 'left' | 'right' }) {
  const ratingColors: Record<string, string> = { very_tight: '#ef4444', tight: '#f97316', moderate: '#f59e0b', generous: '#84cc16', open: '#0f6e56' };
  const color = ratingColors[rating] ?? '#aaa';
  const pct = Math.min(100, (yards / 40) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#666' }}>{side === 'left' ? '← Left (fade)' : 'Right (pull) →'}</span>
        <span style={{ fontWeight: 700, color }}>{yards} yds — {rating.replace(/_/g, ' ')}</span>
      </div>
      <div style={{ background: '#e5e5e5', borderRadius: 4, height: 7 }}>
        <div style={{ width: `${pct}%`, background: color, height: 7, borderRadius: 4 }} />
      </div>
    </div>
  );
}

const COVERAGE_OPTS = ['none','sparse','moderate','heavy','wall'];
const DANGER_OPTS = ['safe','mild','moderate','dangerous','very_dangerous'];
const BUFFER_OPTS = ['very_tight','tight','moderate','generous','open'];
const HAZARD_TYPE_OPTS = ['none','trees','bunker','water','rough','OB'];
const SEVERITY_OPTS = ['none','low','moderate','high','severe'];
const DOGLEG_OPTS = ['straight','slight_left','moderate_left','severe_left','slight_right','moderate_right','severe_right'];
const GREEN_SIZE_OPTS = ['very_small','small','medium','large','very_large'];
const GREEN_SHAPE_OPTS = ['round','oval','elongated','kidney','irregular','multi_tier'];
const FAIRWAY_WIDTH_OPTS = ['very_narrow','narrow','medium','wide','very_wide'];
const AIM_OPTS = ['left_of_center','center','right_of_center'];
const WATER_TYPE_OPTS = ['none','pond','lake','stream','creek','ocean','marsh'];
const THREAT_OPTS = ['none','low','moderate','high','severe'];

// ─── Deep update helper ───────────────────────────────────────────────────────

function deepSet<T>(obj: T, path: string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  return { ...obj as object, [head]: deepSet((obj as Record<string,any>)[head], rest, value) } as T;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScanHolePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [holeNum, setHoleNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    const imgs = newFiles.filter(f => f.type.startsWith('image/')).slice(0, 2);
    const combined = [...files, ...imgs].slice(0, 2);
    setFiles(combined);
    setPreviews(combined.map(f => URL.createObjectURL(f)));
    setResult(null); setError('');
  }, [files]);

  const removeFile = (i: number) => {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next); setPreviews(next.map(f => URL.createObjectURL(f))); setResult(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  // Generic result updater — path like ['visual_analysis','tee_zone','left_buffer_yards']
  const update = (path: string[], value: unknown) => {
    setResult(prev => prev ? deepSet(prev, path, value) : prev);
  };

  const scan = async () => {
    if (!files.length) { setError('Please select at least one image.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const res = await fetch('/api/scan-hole', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResult(data.result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refreshSummary = async () => {
    if (!result) return;
    setRefreshing(true);
    const va = result.visual_analysis;
    const tz = va.tee_zone;
    const lz = va.landing_zone;
    const plz = va.pre_landing_zone;
    const az = va.approach_zone;
    const layz = va.layup_zone;


    try {
      const res = await fetch('/api/refresh-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      const parsed = data.refreshed;

      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          visual_analysis: {
            ...prev.visual_analysis,
            strategic_notes: parsed.strategic_notes ?? prev.visual_analysis.strategic_notes,
            tee_zone: {
              ...prev.visual_analysis.tee_zone,
              opening_description: parsed.tee_opening_description ?? prev.visual_analysis.tee_zone.opening_description,
              left_notes: parsed.tee_left_notes ?? prev.visual_analysis.tee_zone.left_notes,
              right_notes: parsed.tee_right_notes ?? prev.visual_analysis.tee_zone.right_notes,
              recommended_aim_reason: parsed.tee_aim_reason ?? prev.visual_analysis.tee_zone.recommended_aim_reason,
            },
            landing_zone: {
              ...prev.visual_analysis.landing_zone,
              notes: parsed.landing_notes ?? prev.visual_analysis.landing_zone.notes,
            },
            pre_landing_zone: {
              ...prev.visual_analysis.pre_landing_zone,
              description: parsed.pre_landing_description ?? prev.visual_analysis.pre_landing_zone.description,
              bunker_description: parsed.pre_landing_bunker_description ?? prev.visual_analysis.pre_landing_zone.bunker_description,
              water_description: parsed.pre_landing_water_description ?? prev.visual_analysis.pre_landing_zone.water_description,
              other_obstacles: parsed.pre_landing_other_obstacles ?? prev.visual_analysis.pre_landing_zone.other_obstacles,
              room_to_recover_notes: parsed.pre_landing_room_notes ?? prev.visual_analysis.pre_landing_zone.room_to_recover_notes,
              recommendation: parsed.pre_landing_recommendation ?? prev.visual_analysis.pre_landing_zone.recommendation,
            },
            approach_zone: {
              ...prev.visual_analysis.approach_zone,
              bunkers_description: parsed.approach_bunkers_description ?? prev.visual_analysis.approach_zone.bunkers_description,
              water_description: parsed.approach_water_description ?? prev.visual_analysis.approach_zone.water_description,
              green_notes: parsed.approach_green_notes ?? prev.visual_analysis.approach_zone.green_notes,
              notes: parsed.approach_notes ?? prev.visual_analysis.approach_zone.notes,
            },
            ...(prev.visual_analysis.layup_zone && parsed.layup_description ? {
              layup_zone: {
                ...prev.visual_analysis.layup_zone,
                description: parsed.layup_description,
                recommendation_reason: parsed.layup_recommendation_reason ?? prev.visual_analysis.layup_zone.recommendation_reason,
              }
            } : {}),
          },
        };
      });
    } catch (e) {
      console.error('Refresh error:', e);
      alert('Refresh failed — check console for details');
    } finally {
      setRefreshing(false);
    }
  };

  const useResult = () => {
    if (!result) return;
    const scanParams = new URLSearchParams(window.location.search);
    const courseId = scanParams.get('courseId');
    const returnTo = scanParams.get('returnTo');
    const existingHole = returnTo === 'edit' && courseId;

    const params = new URLSearchParams();
    if (holeNum) params.set('holeNum', holeNum);

    if (existingHole) {
      // Existing hole — only pass visual_analysis, skip all other fields
      if (result.visual_analysis) params.set('visual_analysis', JSON.stringify(result.visual_analysis));
      params.set('vaOnly', '1');
      router.push(`/courses/${courseId}/edit?scan=1&${params.toString()}`);
    } else {
      // New hole — pass everything
      Object.entries(result).forEach(([k, v]) => {
        if (k === 'confidence_notes' || k === 'visual_analysis') return;
        params.set(k, String(v));
      });
      if (result.visual_analysis) params.set('visual_analysis', JSON.stringify(result.visual_analysis));
      router.push(`/add-course?scan=1&${params.toString()}`);
    }
  };

  const va = result?.visual_analysis;
  const tz = va?.tee_zone;
  const lz = va?.landing_zone;
  const plz = va?.pre_landing_zone;
  const az = va?.approach_zone;
  const layz = va?.layup_zone;
  const p5lz = va?.par5_second_landing_zone;

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>← back</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>Scan hole with AI</h1>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>Upload 1–2 images — yardage book diagram or satellite view. After scanning, edit any field Claude got wrong before importing.</p>
      </div>

      <span style={sectionLabel}>Images (up to 2)</span>
      <div style={dragging ? dropZoneActive : dropZoneBase} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => fileInputRef.current?.click()}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏌️</div>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop hole images here</div>
        <div style={{ fontSize: 12, color: '#999' }}>Drag & drop, or click to select · max 2 images</div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addFiles(Array.from(e.target.files || []))} />
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" style={{ height: 100, borderRadius: 8, border: '1px solid #ddd', objectFit: 'cover' }} />
              <button onClick={() => removeFile(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#e74c3c', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <span style={sectionLabel}>Hole number (optional)</span>
        <input type="number" min={1} max={18} placeholder="e.g. 7" value={holeNum} onChange={e => setHoleNum(e.target.value)} style={{ ...inputStyle, width: 120 }} />
      </div>

      <button style={loading || !files.length ? btnDisabled : btnPrimary} onClick={scan} disabled={loading || !files.length}>
        {loading ? 'Analyzing with AI…' : 'Analyze with AI →'}
      </button>
      {error && <div style={errorBox}>{error}</div>}

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#0f6e56', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'sway 1.2s ease-in-out infinite' }}>⛳</div>
          Reading corridor · counting bunkers · building strategy…
          <style>{`@keyframes sway{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}`}</style>
        </div>
      )}

      {/* ══ RESULTS (all editable) ══ */}
      {result && va && tz && lz && plz && az && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f6e56' }}>AI analysis — edit anything below</h2>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>All fields are editable. Fix anything Claude got wrong, then import.</p>

          {result.confidence_notes && (
            <div style={{ background: '#fffbea', border: '1px solid #f0d060', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#7a6000', marginBottom: 12 }}>⚠ {result.confidence_notes}</div>
          )}

          {/* ── OVERVIEW ── */}
          <div style={card}>
            <span style={sectionLabel}>Overview</span>
            <div style={editRow}>
              <span style={editLabel}>Par</span>
              <select value={result.par} onChange={e => update(['par'], Number(e.target.value))} style={{ ...inputStyle, color: '#0f6e56' }}>
                {[3,4,5].map(p => <option key={p} value={p}>Par {p}</option>)}
              </select>
            </div>
            <EditNum label="Yards" value={result.yards} onChange={v => update(['yards'], v)} unit="yds" />
            <div style={editRow}>
              <span style={editLabel}>Dogleg</span>
              <select value={result.dogleg_direction ?? 'straight'} onChange={e => update(['dogleg_direction'], e.target.value)} style={{ ...inputStyle, color: '#0f6e56' }}>
                {DOGLEG_OPTS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <DifficultyMeter score={va.visual_difficulty_score} />
              <EditNum label="Difficulty score" value={va.visual_difficulty_score} onChange={v => update(['visual_analysis','visual_difficulty_score'], Math.min(10, Math.max(1, v)))} />
              <EditSelect label="Fairway width" value={va.fairway_width} options={FAIRWAY_WIDTH_OPTS} onChange={v => update(['visual_analysis','fairway_width'], v)} />
              <EditNum label="Fairway width" value={va.fairway_width_yards} onChange={v => update(['visual_analysis','fairway_width_yards'], v)} unit="yds" />
              <EditNum label="Total bunkers" value={va.total_bunker_count} onChange={v => update(['visual_analysis','total_bunker_count'], v)} />
              <EditNum label="Fairway bunkers" value={va.fairway_bunker_count} onChange={v => update(['visual_analysis','fairway_bunker_count'], v)} />
              <EditNum label="Greenside bunkers" value={va.greenside_bunker_count} onChange={v => update(['visual_analysis','greenside_bunker_count'], v)} />
              <EditBool label="Water present" value={va.water_present} onChange={v => update(['visual_analysis','water_present'], v)} />
              {va.water_present && (
                <>
                  <EditSelect label="Water type" value={va.water_type} options={WATER_TYPE_OPTS} onChange={v => update(['visual_analysis','water_type'], v)} />
                  <EditSelect label="Water threat" value={va.water_threat_level} options={THREAT_OPTS} onChange={v => update(['visual_analysis','water_threat_level'], v)} />
                </>
              )}
            </div>
          </div>

          {/* ── STRATEGIC NOTES ── */}
          <div style={card}>
            <span style={sectionLabel}>Strategic summary</span>
            <EditText label="Strategic notes (your game)" value={va.strategic_notes} onChange={v => update(['visual_analysis','strategic_notes'], v)} />
          </div>

          {/* ── TEE ZONE ── */}
          <div style={zoneCard('#2f2f2f')}>
            <span style={sectionLabel}>🏌️ Tee zone — corridor</span>
            <EditText label="Opening description" value={tz.opening_description} onChange={v => update(['visual_analysis','tee_zone','opening_description'], v)} />
            <div style={{ marginTop: 8 }}>
              <BufferBar yards={tz.left_buffer_yards} rating={tz.left_buffer_rating} side="left" />
              <EditNum label="Left buffer" value={tz.left_buffer_yards} onChange={v => update(['visual_analysis','tee_zone','left_buffer_yards'], v)} unit="yds" />
              <EditSelect label="Left buffer rating" value={tz.left_buffer_rating} options={BUFFER_OPTS} onChange={v => update(['visual_analysis','tee_zone','left_buffer_rating'], v)} />
              <EditSelect label="Left hazard type" value={tz.left_hazard_type} options={HAZARD_TYPE_OPTS} onChange={v => update(['visual_analysis','tee_zone','left_hazard_type'], v)} />
              <EditSelect label="Left hazard severity" value={tz.left_hazard_severity} options={SEVERITY_OPTS} onChange={v => update(['visual_analysis','tee_zone','left_hazard_severity'], v)} />
              <EditText label="Left notes" value={tz.left_notes} onChange={v => update(['visual_analysis','tee_zone','left_notes'], v)} />
            </div>
            <div style={{ marginTop: 4 }}>
              <BufferBar yards={tz.right_buffer_yards} rating={tz.right_buffer_rating} side="right" />
              <EditNum label="Right buffer" value={tz.right_buffer_yards} onChange={v => update(['visual_analysis','tee_zone','right_buffer_yards'], v)} unit="yds" />
              <EditSelect label="Right buffer rating" value={tz.right_buffer_rating} options={BUFFER_OPTS} onChange={v => update(['visual_analysis','tee_zone','right_buffer_rating'], v)} />
              <EditSelect label="Right hazard type" value={tz.right_hazard_type} options={HAZARD_TYPE_OPTS} onChange={v => update(['visual_analysis','tee_zone','right_hazard_type'], v)} />
              <EditSelect label="Right hazard severity" value={tz.right_hazard_severity} options={SEVERITY_OPTS} onChange={v => update(['visual_analysis','tee_zone','right_hazard_severity'], v)} />
              <EditText label="Right notes" value={tz.right_notes} onChange={v => update(['visual_analysis','tee_zone','right_notes'], v)} />
            </div>
            <div style={{ marginTop: 4, background: '#f0faf6', borderRadius: 8, padding: '10px 12px' }}>
              <EditSelect label="Recommended aim" value={tz.recommended_aim} options={AIM_OPTS} onChange={v => update(['visual_analysis','tee_zone','recommended_aim'], v)} />
              <EditText label="Aim reason" value={tz.recommended_aim_reason} onChange={v => update(['visual_analysis','tee_zone','recommended_aim_reason'], v)} />
            </div>
            <div style={{ marginTop: 8 }}>
              <CoverageBar label="Trees left" value={tz.tree_density_left} />
              <EditSelect label="Tree density left" value={tz.tree_density_left} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','tee_zone','tree_density_left'], v)} />
              <CoverageBar label="Trees right" value={tz.tree_density_right} />
              <EditSelect label="Tree density right" value={tz.tree_density_right} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','tee_zone','tree_density_right'], v)} />
            </div>
          </div>

          {/* ── LANDING ZONE ── */}
          <div style={zoneCard('#0f6e56')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>🎯 Landing zone</span>
              <DangerBadge value={lz.overall_danger} />
            </div>
            <EditNum label="Distance from tee" value={lz.estimated_distance_yards} onChange={v => update(['visual_analysis','landing_zone','estimated_distance_yards'], v)} unit="yds" />
            <EditNum label="Width" value={lz.width_yards} onChange={v => update(['visual_analysis','landing_zone','width_yards'], v)} unit="yds" />
            <EditNum label="Depth" value={lz.depth_yards} onChange={v => update(['visual_analysis','landing_zone','depth_yards'], v)} unit="yds" />
            <EditNum label="Remaining to green" value={lz.remaining_distance_to_green} onChange={v => update(['visual_analysis','landing_zone','remaining_distance_to_green'], v)} unit="yds" />
            <EditSelect label="Overall danger" value={lz.overall_danger} options={DANGER_OPTS} onChange={v => update(['visual_analysis','landing_zone','overall_danger'], v)} />
            <div style={{ marginTop: 4 }}>
              <CoverageBar label="Trees left" value={lz.trees_left} />
              <EditSelect label="Trees left" value={lz.trees_left} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','landing_zone','trees_left'], v)} />
              <CoverageBar label="Trees right" value={lz.trees_right} />
              <EditSelect label="Trees right" value={lz.trees_right} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','landing_zone','trees_right'], v)} />
            </div>
            <EditBool label="Bunkers present" value={lz.bunkers_present} onChange={v => update(['visual_analysis','landing_zone','bunkers_present'], v)} />
            {lz.bunkers_present && <EditText label="Bunker positions" value={lz.bunker_positions ?? ''} onChange={v => update(['visual_analysis','landing_zone','bunker_positions'], v)} />}
            <EditBool label="Water present" value={lz.water_present} onChange={v => update(['visual_analysis','landing_zone','water_present'], v)} />
            {lz.water_present && <EditText label="Water description" value={lz.water_description ?? ''} onChange={v => update(['visual_analysis','landing_zone','water_description'], v)} />}
            <EditText label="Notes" value={lz.notes} onChange={v => update(['visual_analysis','landing_zone','notes'], v)} />
          </div>

          {/* ── PRE-LANDING ZONE ── */}
          <div style={zoneCard('#666')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>📍 Pre-landing ({plz.distance_yards} yds)</span>
              <DangerBadge value={plz.overall_danger} />
            </div>
            <EditNum label="Distance" value={plz.distance_yards} onChange={v => update(['visual_analysis','pre_landing_zone','distance_yards'], v)} unit="yds" />
            <EditNum label="Width" value={plz.width_yards ?? 0} onChange={v => update(['visual_analysis','pre_landing_zone','width_yards'], v)} unit="yds" />
            <EditSelect label="Overall danger" value={plz.overall_danger} options={DANGER_OPTS} onChange={v => update(['visual_analysis','pre_landing_zone','overall_danger'], v)} />
            <CoverageBar label="Trees left" value={plz.trees_left} />
            <EditSelect label="Trees left" value={plz.trees_left} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','pre_landing_zone','trees_left'], v)} />
            <CoverageBar label="Trees right" value={plz.trees_right} />
            <EditSelect label="Trees right" value={plz.trees_right} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','pre_landing_zone','trees_right'], v)} />
            <EditBool label="Bunkers present" value={plz.bunkers_present} onChange={v => update(['visual_analysis','pre_landing_zone','bunkers_present'], v)} />
            {plz.bunkers_present && <EditText label="Bunker description" value={plz.bunker_description ?? ''} onChange={v => update(['visual_analysis','pre_landing_zone','bunker_description'], v)} />}
            <EditBool label="Water present" value={plz.water_present} onChange={v => update(['visual_analysis','pre_landing_zone','water_present'], v)} />
            {plz.water_present && <EditText label="Water description" value={plz.water_description ?? ''} onChange={v => update(['visual_analysis','pre_landing_zone','water_description'], v)} />}
            <EditText label="Other obstacles" value={plz.other_obstacles ?? ''} onChange={v => update(['visual_analysis','pre_landing_zone','other_obstacles'], v)} />
            <EditSelect label="Room to recover" value={plz.room_to_recover ?? 'some'} options={['plenty','some','tight','none']} onChange={v => update(['visual_analysis','pre_landing_zone','room_to_recover'], v)} />
            <EditText label="Room to recover notes" value={plz.room_to_recover_notes ?? ''} onChange={v => update(['visual_analysis','pre_landing_zone','room_to_recover_notes'], v)} />
            <EditBool label="Safer than landing zone" value={plz.safer_than_landing_zone} onChange={v => update(['visual_analysis','pre_landing_zone','safer_than_landing_zone'], v)} />
            <EditText label="Description" value={plz.description} onChange={v => update(['visual_analysis','pre_landing_zone','description'], v)} />
            <EditText label="Recommendation" value={plz.recommendation} onChange={v => update(['visual_analysis','pre_landing_zone','recommendation'], v)} />
          </div>

          {/* ── PAR 5 SECOND LANDING ── */}
          {result.par === 5 && p5lz && (
            <div style={zoneCard('#7c3aed')}>
              <span style={sectionLabel}>🏳️ Par 5 — layup landing zone</span>
              <EditNum label="Distance from tee" value={p5lz.estimated_distance_yards} onChange={v => update(['visual_analysis','par5_second_landing_zone','estimated_distance_yards'], v)} unit="yds" />
              <EditNum label="Remaining to green" value={p5lz.remaining_distance_to_green} onChange={v => update(['visual_analysis','par5_second_landing_zone','remaining_distance_to_green'], v)} unit="yds" />
              <EditSelect label="Overall danger" value={p5lz.overall_danger} options={DANGER_OPTS} onChange={v => update(['visual_analysis','par5_second_landing_zone','overall_danger'], v)} />
              <CoverageBar label="Trees left" value={p5lz.trees_left} /><EditSelect label="Trees left" value={p5lz.trees_left} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','par5_second_landing_zone','trees_left'], v)} />
              <CoverageBar label="Trees right" value={p5lz.trees_right} /><EditSelect label="Trees right" value={p5lz.trees_right} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','par5_second_landing_zone','trees_right'], v)} />
              <EditBool label="Bunkers present" value={p5lz.bunkers_present} onChange={v => update(['visual_analysis','par5_second_landing_zone','bunkers_present'], v)} />
              <EditBool label="Water present" value={p5lz.water_present} onChange={v => update(['visual_analysis','par5_second_landing_zone','water_present'], v)} />
              <EditText label="Notes" value={p5lz.notes} onChange={v => update(['visual_analysis','par5_second_landing_zone','notes'], v)} />
            </div>
          )}

          {/* ── APPROACH ZONE ── */}
          <div style={zoneCard('#0891b2')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>🏴 Approach zone</span>
              <DangerBadge value={az.overall_danger} />
            </div>
            <EditNum label="Distance to green center" value={az.distance_to_green_center} onChange={v => update(['visual_analysis','approach_zone','distance_to_green_center'], v)} unit="yds" />
            <EditSelect label="Overall danger" value={az.overall_danger} options={DANGER_OPTS} onChange={v => update(['visual_analysis','approach_zone','overall_danger'], v)} />
            <CoverageBar label="Trees left" value={az.trees_left} /><EditSelect label="Trees left" value={az.trees_left} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','approach_zone','trees_left'], v)} />
            <CoverageBar label="Trees right" value={az.trees_right} /><EditSelect label="Trees right" value={az.trees_right} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','approach_zone','trees_right'], v)} />
            <CoverageBar label="Trees long" value={az.trees_long} /><EditSelect label="Trees long" value={az.trees_long} options={COVERAGE_OPTS} onChange={v => update(['visual_analysis','approach_zone','trees_long'], v)} />
            <EditText label="Bunkers description" value={az.bunkers_description} onChange={v => update(['visual_analysis','approach_zone','bunkers_description'], v)} />
            <EditText label="Water description" value={az.water_description ?? ''} onChange={v => update(['visual_analysis','approach_zone','water_description'], v)} />
            <EditSelect label="Green size" value={az.green_size} options={GREEN_SIZE_OPTS} onChange={v => update(['visual_analysis','approach_zone','green_size'], v)} />
            <EditSelect label="Green shape" value={az.green_shape} options={GREEN_SHAPE_OPTS} onChange={v => update(['visual_analysis','approach_zone','green_shape'], v)} />
            <EditNum label="Green width" value={az.green_width_yards} onChange={v => update(['visual_analysis','approach_zone','green_width_yards'], v)} unit="yds" />
            <EditNum label="Green depth" value={az.green_depth_yards} onChange={v => update(['visual_analysis','approach_zone','green_depth_yards'], v)} unit="yds" />
            <EditText label="Green notes" value={az.green_notes} onChange={v => update(['visual_analysis','approach_zone','green_notes'], v)} />
            <EditText label="Approach notes" value={az.notes} onChange={v => update(['visual_analysis','approach_zone','notes'], v)} />
          </div>

          {/* ── LAYUP ZONE ── */}
          {layz && (
            <div style={zoneCard(layz.recommendation === 'go_for_green' ? '#0f6e56' : '#f97316')}>
              <span style={sectionLabel}>⚖️ Go for green vs layup</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ background: 'white', borderRadius: 8, padding: '10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f6e56', marginBottom: 6 }}>Go for green</div>
                  <EditNum label="Rating (1-5)" value={layz.go_for_green_rating} onChange={v => update(['visual_analysis','layup_zone','go_for_green_rating'], Math.min(5,Math.max(1,v)))} />
                </div>
                <div style={{ background: 'white', borderRadius: 8, padding: '10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 6 }}>Layup to 50 yds</div>
                  <EditNum label="Rating (1-5)" value={layz.layup_rating} onChange={v => update(['visual_analysis','layup_zone','layup_rating'], Math.min(5,Math.max(1,v)))} />
                </div>
              </div>
              <div style={editRow}>
                <span style={editLabel}>Recommendation</span>
                <select value={layz.recommendation} onChange={e => update(['visual_analysis','layup_zone','recommendation'], e.target.value)} style={{ ...inputStyle, color: '#0f6e56' }}>
                  <option value="go_for_green">Go for green</option>
                  <option value="layup">Layup</option>
                </select>
              </div>
              <EditText label="Reason" value={layz.recommendation_reason} onChange={v => update(['visual_analysis','layup_zone','recommendation_reason'], v)} />
              <EditBool label="Bunkers in layup zone" value={layz.bunkers_present} onChange={v => update(['visual_analysis','layup_zone','bunkers_present'], v)} />
              <EditBool label="Water in layup zone" value={layz.water_present} onChange={v => update(['visual_analysis','layup_zone','water_present'], v)} />
              <EditText label="Layup zone description" value={layz.description} onChange={v => update(['visual_analysis','layup_zone','description'], v)} />
            </div>
          )}

          {/* ── HAZARD BOOLEANS ── */}
          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#666', padding: '10px 0' }}>Detailed hazard fields (for hole editor)</summary>
            <div style={{ paddingTop: 8 }}>
              {result.par !== 3 && (
                <div style={card}>
                  <span style={sectionLabel}>Tee shot hazards</span>
                  <EditBool label="Trees / hazard left" value={result.tee_tree_hazard_left} onChange={v => update(['tee_tree_hazard_left'], v)} />
                  <EditBool label="Trees / hazard right" value={result.tee_tree_hazard_right} onChange={v => update(['tee_tree_hazard_right'], v)} />
                  <EditBool label="Bunkers left" value={result.tee_bunkers_left} onChange={v => update(['tee_bunkers_left'], v)} />
                  <EditBool label="Bunkers right" value={result.tee_bunkers_right} onChange={v => update(['tee_bunkers_right'], v)} />
                  <EditBool label="Water / OB left" value={result.tee_water_out_left} onChange={v => update(['tee_water_out_left'], v)} />
                  <EditBool label="Water / OB right" value={result.tee_water_out_right} onChange={v => update(['tee_water_out_right'], v)} />
                  <EditBool label="Water / OB across" value={result.tee_water_out_across} onChange={v => update(['tee_water_out_across'], v)} />
                </div>
              )}
              <div style={card}>
                <span style={sectionLabel}>Approach hazards</span>
                <EditBool label="Trees left" value={result.approach_tree_hazard_left} onChange={v => update(['approach_tree_hazard_left'], v)} />
                <EditBool label="Trees right" value={result.approach_tree_hazard_right} onChange={v => update(['approach_tree_hazard_right'], v)} />
                <EditBool label="Trees long" value={result.approach_tree_hazard_long} onChange={v => update(['approach_tree_hazard_long'], v)} />
                <EditBool label="Bunkers left" value={result.approach_bunkers_left} onChange={v => update(['approach_bunkers_left'], v)} />
                <EditBool label="Bunkers right" value={result.approach_bunkers_right} onChange={v => update(['approach_bunkers_right'], v)} />
                <EditBool label="Water / OB left" value={result.approach_water_out_left} onChange={v => update(['approach_water_out_left'], v)} />
                <EditBool label="Water / OB right" value={result.approach_water_out_right} onChange={v => update(['approach_water_out_right'], v)} />
                <EditBool label="Water / OB short" value={result.approach_water_out_short} onChange={v => update(['approach_water_out_short'], v)} />
                <EditBool label="Water / OB long" value={result.approach_water_out_long} onChange={v => update(['approach_water_out_long'], v)} />
              </div>
              <div style={card}>
                <span style={sectionLabel}>Bunker positions (around green)</span>
                {(['short_middle','short_left','middle_left','long_left','long_middle','long_right','middle_right','short_right'] as const).map(pos => (
                  <EditBool key={pos} label={pos.replace(/_/g, ' ')} value={result[`approach_bunker_${pos}` as keyof ScanResult] as boolean} onChange={v => update([`approach_bunker_${pos}`], v)} />
                ))}
              </div>
              <div style={card}>
                <span style={sectionLabel}>Green position</span>
                {(['short_middle','short_left','middle_left','long_left','long_middle','long_right','middle_right','short_right'] as const).map(pos => (
                  <EditBool key={pos} label={pos.replace(/_/g, ' ')} value={result[`approach_green_${pos}` as keyof ScanResult] as boolean} onChange={v => update([`approach_green_${pos}`], v)} />
                ))}
                <EditNum label="Green depth" value={result.approach_green_depth} onChange={v => update(['approach_green_depth'], v)} unit="yds" />
              </div>
            </div>
          </details>

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <button
              style={{ width: '100%', padding: '11px 20px', fontSize: 14, fontWeight: 600, border: '2px solid #0f6e56', borderRadius: 8, background: 'white', color: '#0f6e56', cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.7 : 1 }}
              onClick={refreshSummary}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing AI summary…' : '↺ Refresh AI summary from edited fields'}
            </button>
            {refreshing && <p style={{ fontSize: 12, color: '#0f6e56', textAlign: 'center', marginTop: 6 }}>Rewriting text fields based on your corrections — no image re-analysis…</p>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button style={{ ...btnPrimary, flex: 1, marginTop: 0 }} onClick={useResult}>Import into hole editor →</button>
            <button style={{ flex: 1, padding: '10px 20px', fontSize: 14, fontWeight: 600, border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#444', cursor: 'pointer' }} onClick={() => { setResult(null); setFiles([]); setPreviews([]); setHoleNum(''); }}>Scan another</button>
          </div>
          <div style={successBox}>Edit fields, refresh the AI summary, then import when ready.</div>
        </div>
      )}
    </div>
  );
}
