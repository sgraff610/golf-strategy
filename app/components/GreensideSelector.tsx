'use client';

// ─────────────────────────────────────────────────────────────────────────────
// GreensideSelector
//
// Outer ring (8 segments): hazard positions — cycles 0→1(green)→2(bunker)→0
// Inner ring (8 segments): aim target — single-select, yellow=caution, red=danger
//   click once → yellow, click again → red, click again → deselect
//   selecting a new segment deselects the previous one
// Center circle: shows "Aim for Pin" (default) or "Aim for {direction}"
//
// Drop this file into: app/components/GreensideSelector.tsx
// ─────────────────────────────────────────────────────────────────────────────

export type CellValue = 0 | 1 | 2;
export type AimValue = 0 | 1 | 2; // 0=none, 1=yellow, 2=red

export type GreensideState = {
  long_left:    CellValue;
  long_middle:  CellValue;
  long_right:   CellValue;
  middle_left:  CellValue;
  middle_right: CellValue;
  short_left:   CellValue;
  short_middle: CellValue;
  short_right:  CellValue;
  aim_dir:      string;   // e.g. 'FL', 'F', 'FR', 'L', 'R', 'BL', 'B', 'BR' or ''
  aim_level:    AimValue; // 0=unset, 1=yellow, 2=red
};

export const defaultGreensideState = (): GreensideState => ({
  long_left:    0,
  long_middle:  0,
  long_right:   0,
  middle_left:  0,
  middle_right: 0,
  short_left:   0,
  short_middle: 0,
  short_right:  0,
  aim_dir:      '',
  aim_level:    0,
});

// ─── Flat ↔ Nested helpers ────────────────────────────────────────────────────

type FlatHole = Record<string, boolean | number | string | null | undefined>;

const POSITIONS = ['long_left','long_middle','long_right','middle_left','middle_right','short_left','short_middle','short_right'] as const;

export function flatToGreenside(hole: FlatHole): GreensideState {
  const gs = defaultGreensideState();
  for (const pos of POSITIONS) {
    const bunker = !!hole[`approach_bunker_${pos}`];
    const green  = !!hole[`approach_green_${pos}`];
    gs[pos] = bunker ? 2 : green ? 1 : 0;
  }
  gs.aim_dir   = (hole['aim_dir']   as string)  ?? '';
  gs.aim_level = (hole['aim_level'] as AimValue) ?? 0;
  return gs;
}

export function greensideToFlat(gs: GreensideState): FlatHole {
  const out: FlatHole = {};
  for (const pos of POSITIONS) {
    out[`approach_bunker_${pos}`] = gs[pos] === 2;
    out[`approach_green_${pos}`]  = gs[pos] === 1;
  }
  out['aim_dir']   = gs.aim_dir;
  out['aim_level'] = gs.aim_level;
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  label?: string;
  value: GreensideState;
  onChange: (next: GreensideState) => void;
};

// F=bottom(180°), B=top(0°), R=right(90°), L=left(270°). arcPath subtracts 90° internally.
// _left and _right keys are swapped horizontally to match visual orientation.
const OUTER_SEGMENTS = [
  { key: 'long_middle',  label: 'B',   angle:   0 },
  { key: 'long_right',   label: 'BR',  angle:  45 },
  { key: 'middle_right', label: 'R',   angle:  90 },
  { key: 'short_right',  label: 'FR',  angle: 135 },
  { key: 'short_middle', label: 'F',   angle: 180 },
  { key: 'short_left',   label: 'FL',  angle: 225 },
  { key: 'middle_left',  label: 'L',   angle: 270 },
  { key: 'long_left',    label: 'BL',  angle: 315 },
] as const;

// Inner aim ring — same cardinal directions
const INNER_SEGMENTS = [
  { dir: 'B',  label: 'B',  angle:   0 },
  { dir: 'BR', label: 'BR', angle:  45 },
  { dir: 'R',  label: 'R',  angle:  90 },
  { dir: 'FR', label: 'FR', angle: 135 },
  { dir: 'F',  label: 'F',  angle: 180 },
  { dir: 'FL', label: 'FL', angle: 225 },
  { dir: 'L',  label: 'L',  angle: 270 },
  { dir: 'BL', label: 'BL', angle: 315 },
] as const;

const AIM_LABELS: Record<string, string> = {
  FL: 'Front Left', F: 'Front', FR: 'Front Right',
  L: 'Left', R: 'Right',
  BL: 'Back Left', B: 'Back', BR: 'Back Right',
};

const OUTER_COLORS: Record<CellValue, string> = {
  0: '#0f6e56',
  1: '#22c55e',
  2: '#c8a84b',
};

const OUTER_STROKE: Record<CellValue, string> = {
  0: '#0a5240',
  1: '#16a34a',
  2: '#a0842e',
};

const AIM_COLORS: Record<AimValue, string> = {
  0: '#d4edda',   // light green — unselected inner segment
  1: '#f5c842',   // yellow
  2: '#e03c2d',   // red
};

const AIM_STROKE: Record<AimValue, string> = {
  0: '#9ecfaa',
  1: '#c9a000',
  2: '#a82010',
};

// SVG geometry
const CX = 145;
const CY = 145;
const R_CENTER  = 42;   // center circle (+10%)
const R_INNER_IN  = R_CENTER + 2;  // 44
const R_INNER_OUT = 74;            // inner ring outer edge (-10% from 82)
const R_OUTER_IN  = R_INNER_OUT + 3; // 77
const R_OUTER_OUT = 115;           // outer ring outer edge (-10% from 128)
const GAP_DEG = 3;

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function arcPath(angleDeg: number, r1: number, r2: number): string {
  // Boundaries at exactly angleDeg ± 22.5°; gap inset from those boundary lines
  const a1 = toRad(angleDeg - 22.5 + GAP_DEG / 2 - 90);
  const a2 = toRad(angleDeg + 22.5 - GAP_DEG / 2 - 90);
  const x1 = CX + r1 * Math.cos(a1), y1 = CY + r1 * Math.sin(a1);
  const x2 = CX + r2 * Math.cos(a1), y2 = CY + r2 * Math.sin(a1);
  const x3 = CX + r2 * Math.cos(a2), y3 = CY + r2 * Math.sin(a2);
  const x4 = CX + r1 * Math.cos(a2), y4 = CY + r1 * Math.sin(a2);
  const fmt = (n: number) => n.toFixed(2);
  return `M${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)} A${r2},${r2} 0 0,1 ${fmt(x3)},${fmt(y3)} L${fmt(x4)},${fmt(y4)} A${r1},${r1} 0 0,0 ${fmt(x1)},${fmt(y1)} Z`;
}

function labelPoint(angleDeg: number, r: number): [number, number] {
  const rad = toRad(angleDeg - 90);
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

export default function GreensideSelector({ label = 'Greenside', value, onChange }: Props) {
  // Outer ring click
  const handleOuter = (key: keyof GreensideState) => {
    if (key === 'aim_dir' || key === 'aim_level') return;
    onChange({ ...value, [key]: ((value[key as keyof GreensideState] as number + 1) % 3) as CellValue });
  };

  // Inner aim ring click — single select, cycles 0→1→2→0, deselects previous
  const handleAim = (dir: string) => {
    if (value.aim_dir === dir) {
      // same segment — cycle
      const next = ((value.aim_level + 1) % 3) as AimValue;
      onChange({ ...value, aim_level: next, aim_dir: next === 0 ? '' : dir });
    } else {
      // new segment — select at level 1, deselect previous
      onChange({ ...value, aim_dir: dir, aim_level: 1 });
    }
  };

  const aimLabel = value.aim_dir ? AIM_LABELS[value.aim_dir] ?? value.aim_dir : 'Pin';
  const aimLine1 = 'Aim for';
  const aimLine2 = aimLabel;

  const VW = 290;
  const VH = 290;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: '#0f6e56', marginBottom: 12,
      }}>
        {label}
      </div>

      <div style={{ width: '100%', maxWidth: 290 }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        >
          {/* Orientation labels */}
          <text x={CX} y={CY - R_OUTER_OUT - 8} textAnchor="middle" fontSize={10} fontStyle="italic" fill="#999">↑ Far</text>
          <text x={CX - R_OUTER_OUT - 6} y={CY + 4} textAnchor="end" fontSize={10} fontStyle="italic" fill="#999">← Left</text>
          <text x={CX + R_OUTER_OUT + 6} y={CY + 4} textAnchor="start" fontSize={10} fontStyle="italic" fill="#999">Right →</text>

          {/* ── OUTER RING (hazards) ── */}
          {OUTER_SEGMENTS.map((seg) => {
            const v = value[seg.key as keyof GreensideState] as CellValue;
            const d = arcPath(seg.angle, R_OUTER_IN, R_OUTER_OUT);
            const [lx, ly] = labelPoint(seg.angle, (R_OUTER_IN + R_OUTER_OUT) / 2);
            return (
              <g key={seg.key} style={{ cursor: 'pointer' }} onClick={() => handleOuter(seg.key as keyof GreensideState)}>
                <path d={d} fill={OUTER_COLORS[v]} stroke={OUTER_STROKE[v]} strokeWidth={1} />
                <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight="500" fill={v === 0 ? '#888' : '#fff'} style={{ pointerEvents: 'none' }}>
                  {seg.label}
                </text>
                {/* invisible larger hit area */}
                <path d={d} fill="transparent" stroke="none" style={{ cursor: 'pointer' }} />
              </g>
            );
          })}

          {/* ── INNER RING (aim) ── */}
          {INNER_SEGMENTS.map((seg) => {
            const isSelected = value.aim_dir === seg.dir;
            const noneSelected = !value.aim_dir || value.aim_level === 0;
            // Nothing selected → all bright green
            // level=1 or 2 selected → selected stays green, rest go light gray
            let fill: string;
            let stroke: string;
            let textColor: string;
            if (noneSelected || isSelected) {
              fill = '#22c55e'; stroke = '#16a34a'; textColor = '#fff';
            } else {
              fill = '#e8e8e8'; stroke = '#ccc'; textColor = '#888';
            }
            const d = arcPath(seg.angle, R_INNER_IN, R_INNER_OUT);
            const [lx, ly] = labelPoint(seg.angle, (R_INNER_IN + R_INNER_OUT) / 2);
            return (
              <g key={seg.dir} style={{ cursor: 'pointer' }} onClick={() => handleAim(seg.dir)}>
                <path d={d} fill={fill} stroke={stroke} strokeWidth={1} />
                <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fontWeight="500" fill={textColor} style={{ pointerEvents: 'none' }}>
                  {seg.label}
                </text>
                <path d={d} fill="transparent" stroke="none" />
              </g>
            );
          })}

          {/* ── CENTER CIRCLE ── */}
          {(() => {
            const noneSelected = !value.aim_dir || value.aim_level === 0;
            const circleFill = noneSelected ? '#22c55e' : value.aim_level === 1 ? '#f5c842' : '#e03c2d';
            const circleStroke = noneSelected ? '#16a34a' : value.aim_level === 1 ? '#c9a000' : '#a82010';
            const handleReset = () => onChange({ ...value, aim_dir: '', aim_level: 0 });
            const textColor = (noneSelected || value.aim_level === 1) ? '#000' : '#fff';
            return (
              <g onClick={handleReset} style={{ cursor: 'pointer' }}>
                <circle cx={CX} cy={CY} r={R_CENTER} fill={circleFill} stroke={circleStroke} strokeWidth={1.5} />
                {noneSelected ? (
                  <>
                    <text x={CX} y={CY - 6} textAnchor="middle" fontSize={9} fill="#000" fontStyle="italic" style={{ pointerEvents: 'none' }}>Aim for</text>
                    <text x={CX} y={CY + 8} textAnchor="middle" fontSize={11} fontWeight="700" fill="#000" style={{ pointerEvents: 'none' }}>Pin</text>
                  </>
                ) : (
                  <>
                    <text x={CX} y={CY - 14} textAnchor="middle" fontSize={10} fontWeight="700" fill={textColor} style={{ pointerEvents: 'none' }}>
                      {value.aim_level === 1 ? 'Warning' : 'Danger'}
                    </text>
                    <text x={CX} y={CY - 2} textAnchor="middle" fontSize={9} fill={textColor} style={{ pointerEvents: 'none' }}>Aim for</text>
                    <text x={CX} y={CY + 13} textAnchor="middle" fontSize={10} fontWeight="700" fill={textColor} style={{ pointerEvents: 'none' }}>
                      {AIM_LABELS[value.aim_dir] ?? value.aim_dir}
                    </text>
                  </>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Two-column legend */}
      <div style={{ display: 'flex', gap: 24, marginTop: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Left: Aim Direction */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#999', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 5 }}>Aim</div>
          {[
            { color: '#22c55e', border: '#16a34a', label: 'Target' },
            { color: '#f5c842', border: '#c9a000', label: 'Warning' },
            { color: '#e03c2d', border: '#a82010', label: 'Danger' },
          ].map(({ color, border, label: l }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginBottom: 3 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1.5px solid ${border}`, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>
        {/* Right: Hazard positions */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#999', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 5 }}>Surrounding</div>
          {[
            { color: '#0f6e56', border: '#0a5240', label: 'Rough' },
            { color: '#22c55e', border: '#16a34a', label: 'Extra Green' },
            { color: '#c8a84b', border: '#a0842e', label: 'Bunker' },
          ].map(({ color, border, label: l }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginBottom: 3 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1.5px solid ${border}`, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
