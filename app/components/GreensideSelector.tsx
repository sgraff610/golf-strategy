'use client';

// ─────────────────────────────────────────────────────────────────────────────
// GreensideSelector
//
// Dial 1 — Outer ring (8 segments): hazard positions — cycles 0→1(green)→2(bunker)→0
//          Static center: "Green 🚩"
// Dial 2 — Aim ring (8 green segments): click to select direction, center cycles
//          nothing → warning (yellow) → danger (red) → deselected
// ─────────────────────────────────────────────────────────────────────────────

export type CellValue = 0 | 1 | 2;
export type AimValue  = 0 | 1 | 2; // 0=none, 1=warning, 2=danger

export type GreensideState = {
  long_left:    CellValue;
  long_middle:  CellValue;
  long_right:   CellValue;
  middle_left:  CellValue;
  middle_right: CellValue;
  short_left:   CellValue;
  short_middle: CellValue;
  short_right:  CellValue;
  aim_dir:   string;   // 'B'|'BR'|'R'|'FR'|'F'|'FL'|'L'|'BL' or ''
  aim_level: AimValue;
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
  aim_dir:   '',
  aim_level: 0,
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
  gs.aim_dir   = (hole['aim_dir']   as string)    ?? '';
  gs.aim_level = (hole['aim_level'] as AimValue)  ?? 0;
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

// SVG geometry — Dial 1
const CX = 110;
const CY = 110;
const R_CENTER    = 34;
const R_OUTER_IN  = R_CENTER + 4;
const R_OUTER_OUT = 90;
const GAP_DEG = 3;

// SVG geometry — Dial 2 (larger viewBox to fit context ring)
const D2_CX = 125;
const D2_CY = 125;
const R_CTX_IN  = 93;   // context ring (transparent, shows G/S from Dial 1)
const R_CTX_OUT = 112;

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function arcPath(angleDeg: number, r1: number, r2: number, cx = CX, cy = CY): string {
  const a1 = toRad(angleDeg - 22.5 + GAP_DEG / 2 - 90);
  const a2 = toRad(angleDeg + 22.5 - GAP_DEG / 2 - 90);
  const x1 = cx + r1 * Math.cos(a1), y1 = cy + r1 * Math.sin(a1);
  const x2 = cx + r2 * Math.cos(a1), y2 = cy + r2 * Math.sin(a1);
  const x3 = cx + r2 * Math.cos(a2), y3 = cy + r2 * Math.sin(a2);
  const x4 = cx + r1 * Math.cos(a2), y4 = cy + r1 * Math.sin(a2);
  const fmt = (n: number) => n.toFixed(2);
  return `M${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)} A${r2},${r2} 0 0,1 ${fmt(x3)},${fmt(y3)} L${fmt(x4)},${fmt(y4)} A${r1},${r1} 0 0,0 ${fmt(x1)},${fmt(y1)} Z`;
}

function labelPoint(angleDeg: number, r: number, cx = CX, cy = CY): [number, number] {
  const rad = toRad(angleDeg - 90);
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// Maps Dial 2 aim direction → the corresponding Dial 1 position key
const AIM_TO_OUTER: Record<string, keyof GreensideState> = {
  B:  'long_middle',  BR: 'long_right',   R:  'middle_right', FR: 'short_right',
  F:  'short_middle', FL: 'short_left',   L:  'middle_left',  BL: 'long_left',
};

const AIM_SEGMENTS = [
  { dir: 'B',  label: 'B',  angle:   0 },
  { dir: 'BR', label: 'BR', angle:  45 },
  { dir: 'R',  label: 'R',  angle:  90 },
  { dir: 'FR', label: 'FR', angle: 135 },
  { dir: 'F',  label: 'F',  angle: 180 },
  { dir: 'FL', label: 'FL', angle: 225 },
  { dir: 'L',  label: 'L',  angle: 270 },
  { dir: 'BL', label: 'BL', angle: 315 },
] as const;

const AIM_DIR_LABELS: Record<string, string> = {
  B: 'Back', BR: 'Back R', R: 'Right', FR: 'Front R',
  F: 'Front', FL: 'Front L', L: 'Left', BL: 'Back L',
};

export default function GreensideSelector({ label = 'Greenside', value, onChange }: Props) {
  const handleOuter = (key: string) => {
    const cur = value[key as keyof GreensideState] as CellValue;
    onChange({ ...value, [key]: ((cur + 1) % 3) as CellValue });
  };

  const handleAim = (dir: string) => {
    if (value.aim_dir === dir) {
      const next = ((value.aim_level + 1) % 3) as AimValue;
      onChange({ ...value, aim_level: next, aim_dir: next === 0 ? '' : dir });
    } else {
      onChange({ ...value, aim_dir: dir, aim_level: 1 });
    }
  };

  const noneSelected = !value.aim_dir || value.aim_level === 0;
  const centerFill   = noneSelected ? '#22c55e' : value.aim_level === 1 ? '#f5c842' : '#e03c2d';
  const centerStroke = noneSelected ? '#16a34a' : value.aim_level === 1 ? '#c9a000' : '#a82010';
  const centerText   = (noneSelected || value.aim_level === 1) ? '#000' : '#fff';

  const VW = 220;
  const VH = 220;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: '#0f6e56', marginBottom: 12,
      }}>
        {label}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── DIAL 1: Hazard position ring ── */}
        <div>
          <div style={{ fontSize: 10, color: '#999', fontStyle: 'italic', marginBottom: 4 }}>
            Tap to cycle: rough · extra green · bunker
          </div>
          <div style={{ width: '100%', maxWidth: VW }}>
            <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
              <text x={CX} y={CY - R_OUTER_OUT - 6} textAnchor="middle" fontSize={9} fontStyle="italic" fill="#999">↑ Far</text>
              <text x={CX - R_OUTER_OUT - 4} y={CY + 4} textAnchor="end" fontSize={9} fontStyle="italic" fill="#999">← L</text>
              <text x={CX + R_OUTER_OUT + 4} y={CY + 4} textAnchor="start" fontSize={9} fontStyle="italic" fill="#999">R →</text>
              {OUTER_SEGMENTS.map((seg) => {
                const v = value[seg.key as keyof GreensideState] as CellValue;
                const d = arcPath(seg.angle, R_OUTER_IN, R_OUTER_OUT);
                const [lx, ly] = labelPoint(seg.angle, (R_OUTER_IN + R_OUTER_OUT) / 2);
                return (
                  <g key={seg.key} style={{ cursor: 'pointer' }} onClick={() => handleOuter(seg.key)}>
                    <path d={d} fill={OUTER_COLORS[v]} stroke={OUTER_STROKE[v]} strokeWidth={1} />
                    <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fontWeight="500" fill={v === 0 ? '#9ecfaa' : '#fff'} style={{ pointerEvents: 'none' }}>{seg.label}</text>
                    <path d={d} fill="transparent" stroke="none" style={{ cursor: 'pointer' }} />
                  </g>
                );
              })}
              <circle cx={CX} cy={CY} r={R_CENTER} fill="#0f6e56" stroke="#0a5240" strokeWidth={1.5} />
              <text x={CX} y={CY - 5} textAnchor="middle" fontSize={14} style={{ pointerEvents: 'none' }}>🚩</text>
              <text x={CX} y={CY + 11} textAnchor="middle" fontSize={8} fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>GREEN</text>
            </svg>
          </div>
          <div style={{ textAlign: 'center', fontSize: 9, color: '#999', fontStyle: 'italic' }}>↓ Short</div>
        </div>

        {/* ── DIAL 2: Aim ring + context ring ── */}
        <div>
          <div style={{ fontSize: 10, color: '#999', fontStyle: 'italic', marginBottom: 4 }}>
            Tap to aim: once = warning · twice = danger
          </div>
          <div style={{ width: '100%', maxWidth: 250 }}>
            <svg viewBox="0 0 250 250" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
              {AIM_SEGMENTS.map((seg) => {
                const isSelected = value.aim_dir === seg.dir;
                const fill   = (!value.aim_dir || isSelected) ? '#22c55e' : '#e8e8e8';
                const stroke = (!value.aim_dir || isSelected) ? '#16a34a' : '#ccc';
                const tc     = (!value.aim_dir || isSelected) ? '#fff' : '#aaa';
                const d = arcPath(seg.angle, R_OUTER_IN, R_OUTER_OUT, D2_CX, D2_CY);
                const [lx, ly] = labelPoint(seg.angle, (R_OUTER_IN + R_OUTER_OUT) / 2, D2_CX, D2_CY);
                return (
                  <g key={seg.dir} style={{ cursor: 'pointer' }} onClick={() => handleAim(seg.dir)}>
                    <path d={d} fill={fill} stroke={stroke} strokeWidth={1} />
                    <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fontWeight="500" fill={tc} style={{ pointerEvents: 'none' }}>{seg.label}</text>
                    <path d={d} fill="transparent" stroke="none" />
                  </g>
                );
              })}

              {/* Context ring — transparent, shows G or S from Dial 1 */}
              {AIM_SEGMENTS.map((seg) => {
                const outerKey = AIM_TO_OUTER[seg.dir];
                const v = value[outerKey] as CellValue;
                const d = arcPath(seg.angle, R_CTX_IN, R_CTX_OUT, D2_CX, D2_CY);
                const [lx, ly] = labelPoint(seg.angle, (R_CTX_IN + R_CTX_OUT) / 2, D2_CX, D2_CY);
                const letter = v === 1 ? 'G' : v === 2 ? 'S' : null;
                const letterColor = v === 1 ? '#22c55e' : '#c8a84b';
                return (
                  <g key={`ctx-${seg.dir}`} style={{ cursor: 'pointer' }} onClick={() => handleAim(seg.dir)}>
                    <path d={d} fill="transparent" stroke="#ddd" strokeWidth={0.5} />
                    {letter && (
                      <text x={lx} y={ly + 5} textAnchor="middle" fontSize={13} fontWeight="700" fill={letterColor} style={{ pointerEvents: 'none' }}>
                        {letter}
                      </text>
                    )}
                  </g>
                );
              })}

              <g onClick={() => onChange({ ...value, aim_dir: '', aim_level: 0 })} style={{ cursor: 'pointer' }}>
                <circle cx={D2_CX} cy={D2_CY} r={R_CENTER} fill={centerFill} stroke={centerStroke} strokeWidth={1.5} />
                {noneSelected ? (
                  <>
                    <text x={D2_CX} y={D2_CY - 5} textAnchor="middle" fontSize={9} fill="#000" fontStyle="italic" style={{ pointerEvents: 'none' }}>Aim for</text>
                    <text x={D2_CX} y={D2_CY + 9} textAnchor="middle" fontSize={11} fontWeight="700" fill="#000" style={{ pointerEvents: 'none' }}>Pin</text>
                  </>
                ) : (
                  <>
                    <text x={D2_CX} y={D2_CY - 12} textAnchor="middle" fontSize={9} fontWeight="700" fill={centerText} style={{ pointerEvents: 'none' }}>
                      {value.aim_level === 1 ? 'Warning' : 'Danger'}
                    </text>
                    <text x={D2_CX} y={D2_CY} textAnchor="middle" fontSize={8} fill={centerText} style={{ pointerEvents: 'none' }}>Aim for</text>
                    <text x={D2_CX} y={D2_CY + 12} textAnchor="middle" fontSize={9} fontWeight="700" fill={centerText} style={{ pointerEvents: 'none' }}>
                      {AIM_DIR_LABELS[value.aim_dir] ?? value.aim_dir}
                    </text>
                  </>
                )}
              </g>
            </svg>
          </div>
          <div style={{ textAlign: 'center', fontSize: 9, color: '#999', fontStyle: 'italic' }}>↓ Short</div>
        </div>

      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Surrounding</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', lineHeight: 1, width: 12, textAlign: 'center', flexShrink: 0 }}>G</span>
            Extra Green
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c8a84b', lineHeight: 1, width: 12, textAlign: 'center', flexShrink: 0 }}>S</span>
            Bunker
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Aim</div>
          {[
            { color: '#22c55e', stroke: '#16a34a', label: 'Target' },
            { color: '#f5c842', stroke: '#c9a000', label: 'Warning' },
            { color: '#e03c2d', stroke: '#a82010', label: 'Danger' },
          ].map(({ color, stroke, label: l }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginBottom: 2 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1.5px solid ${stroke}`, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
