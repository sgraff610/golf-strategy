'use client';

export type CellValue = 0 | 1 | 2;

export type GreensideState = {
  long_left:    CellValue;
  long_middle:  CellValue;
  long_right:   CellValue;
  middle_left:  CellValue;
  middle_right: CellValue;
  short_left:   CellValue;
  short_middle: CellValue;
  short_right:  CellValue;
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
});

export function flatToGreenside(hole: Record<string, unknown>): GreensideState {
  const resolve = (pos: string): CellValue => {
    const isBunker = !!hole[`approach_bunker_${pos}`];
    const isGreen  = !!hole[`approach_green_${pos}`];
    if (isBunker) return 2;
    if (isGreen)  return 1;
    return 0;
  };
  return {
    long_left:    resolve('long_left'),
    long_middle:  resolve('long_middle'),
    long_right:   resolve('long_right'),
    middle_left:  resolve('middle_left'),
    middle_right: resolve('middle_right'),
    short_left:   resolve('short_left'),
    short_middle: resolve('short_middle'),
    short_right:  resolve('short_right'),
  };
}

export function greensideToFlat(s: GreensideState): Record<string, boolean> {
  const positions: (keyof GreensideState)[] = [
    'long_left', 'long_middle', 'long_right',
    'middle_left', 'middle_right',
    'short_left', 'short_middle', 'short_right',
  ];
  const result: Record<string, boolean> = {};
  for (const pos of positions) {
    result[`approach_bunker_${pos}`] = s[pos] === 2;
    result[`approach_green_${pos}`]  = s[pos] === 1;
  }
  return result;
}

const CX = 120;
const CY = 120;
const R_INNER = 58;
const R_OUTER = 58 + (101 - 58) * 0.7;
const GAP_DEG = 3.5;
const SEGMENT_SPAN = 45;

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function compassToMath(deg: number) { return 90 - deg; }

function polarToXY(angleDeg: number, r: number) {
  const rad = toRad(compassToMath(angleDeg));
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcPath(centerAngle: number, rInner: number, rOuter: number): string {
  const half = SEGMENT_SPAN / 2 - GAP_DEG / 2;
  const s1 = polarToXY(centerAngle - half, rOuter);
  const e1 = polarToXY(centerAngle + half, rOuter);
  const s2 = polarToXY(centerAngle + half, rInner);
  const e2 = polarToXY(centerAngle - half, rInner);
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${e1.x} ${e1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${rInner} ${rInner} 0 0 0 ${e2.x} ${e2.y}`,
    'Z',
  ].join(' ');
}

function labelPos(centerAngle: number) {
  const r = R_INNER + (R_OUTER - R_INNER) * 0.5;
  return polarToXY(centerAngle, r);
}

type Segment = { key: keyof GreensideState; abbr: string; angle: number };

const SEGMENTS: Segment[] = [
  { key: 'long_left',    abbr: 'FL', angle: 315 },
  { key: 'long_middle',  abbr: 'F',  angle: 0   },
  { key: 'long_right',   abbr: 'FR', angle: 45  },
  { key: 'middle_right', abbr: 'R',  angle: 90  },
  { key: 'short_right',  abbr: 'SR', angle: 135 },
  { key: 'short_middle', abbr: 'S',  angle: 180 },
  { key: 'short_left',   abbr: 'SL', angle: 225 },
  { key: 'middle_left',  abbr: 'L',  angle: 270 },
];

const COLORS: Record<CellValue, { fill: string; text: string }> = {
  0: { fill: '#e8e8e8', text: '#666' },
  1: { fill: '#0f6e56', text: '#fff' },
  2: { fill: '#c8a84b', text: '#fff' },
};

type GreensideSelectorProps = {
  label?: string;
  value: GreensideState;
  onChange: (next: GreensideState) => void;
};

export default function GreensideSelector({
  label = 'Greenside',
  value,
  onChange,
}: GreensideSelectorProps) {
  const handleToggle = (key: keyof GreensideState) => {
    onChange({ ...value, [key]: ((value[key] + 1) % 3) as CellValue });
  };

  const VW = 270;
  const VH = 255;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0f6e56', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ width: '100%', maxWidth: 280, margin: '0 auto' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          <text x={CX} y={CY - R_OUTER - 10} textAnchor="middle" fontSize={10} fontStyle="italic" fill="#999">↑ Far</text>
          <text x={CX - R_OUTER - 8} y={CY + 4} textAnchor="end" fontSize={10} fontStyle="italic" fill="#999">← Left</text>
          <text x={CX + R_OUTER + 8} y={CY + 4} textAnchor="start" fontSize={10} fontStyle="italic" fill="#999">Right →</text>

          {SEGMENTS.map((seg) => {
            const v = value[seg.key];
            const col = COLORS[v];
            const lp = labelPos(seg.angle);
            const d = arcPath(seg.angle, R_INNER + 3, R_OUTER);
            return (
              <g key={seg.key} onClick={() => handleToggle(seg.key)} style={{ cursor: 'pointer' }}>
                <path d={d} fill={col.fill} stroke="#fff" strokeWidth={2} style={{ transition: 'fill 0.2s' }} />
                <text x={lp.x} y={lp.y + 4} textAnchor="middle" fontSize={11} fontWeight={500} fill={col.text} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {seg.abbr}
                </text>
                <path d={d} fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} />
              </g>
            );
          })}

          <circle cx={CX} cy={CY} r={R_INNER} fill="#0f6e56" style={{ pointerEvents: 'none' }} />
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize={22} style={{ pointerEvents: 'none', userSelect: 'none' }}>🚩</text>
          <text x={CX} y={CY + 18} textAnchor="middle" fontSize={10} fontWeight={500} fill="#fff" letterSpacing="0.05em" style={{ pointerEvents: 'none', userSelect: 'none' }}>GREEN</text>
        </svg>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: '#999', fontStyle: 'italic', marginTop: 2 }}>↓ Short</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, justifyContent: 'center' }}>
        {([
          { label: 'Unset',  fill: '#e8e8e8', border: '1.5px solid #ccc' },
          { label: 'Green',  fill: '#0f6e56', border: 'none' },
          { label: 'Bunker', fill: '#c8a84b', border: 'none' },
        ] as const).map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: item.fill, border: item.border, flexShrink: 0 }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
