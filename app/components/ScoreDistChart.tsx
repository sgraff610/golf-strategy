'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

type OutcomeKey = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'triple';

interface Props {
  par: number;
  similarHoleScores: number[];   // actual raw scores (e.g. [4,5,4,3]) from similar holes
  thisHoleScores: number[];      // actual raw scores from this exact hole
  difficultyRating?: number | null; // 1–10 from AI analysis
}

// ─── Outcome definitions (left→right = worst→best) ───────────────────────────

const OUTCOMES: { key: OutcomeKey; label: string; color: string }[] = [
  { key: 'triple', label: 'Triple+', color: '#ef4444' },
  { key: 'double', label: 'Double',  color: '#f97316' },
  { key: 'bogey',  label: 'Bogey',   color: '#eab308' },
  { key: 'par',    label: 'Par',     color: '#3b82f6' },
  { key: 'birdie', label: 'Birdie',  color: '#22c55e' },
  { key: 'eagle',  label: 'Eagle',   color: '#f59e0b' },
];
const KEYS = OUTCOMES.map(o => o.key);

// ─── Probability math ─────────────────────────────────────────────────────────

function scoresToDist(scores: number[], par: number): Record<OutcomeKey, number> {
  const counts: Record<OutcomeKey, number> = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
  for (const s of scores) {
    const d = s - par;
    if      (d <= -2) counts.eagle++;
    else if (d === -1) counts.birdie++;
    else if (d === 0)  counts.par++;
    else if (d === 1)  counts.bogey++;
    else if (d === 2)  counts.double++;
    else               counts.triple++;
  }
  const n = scores.length || 1;
  const out = {} as Record<OutcomeKey, number>;
  for (const k of KEYS) out[k] = counts[k] / n;
  return out;
}

function difficultyDist(rating: number): Record<OutcomeKey, number> {
  if (rating <= 3) return { eagle: 0.05, birdie: 0.28, par: 0.38, bogey: 0.22, double: 0.05, triple: 0.02 };
  if (rating <= 6) return { eagle: 0.02, birdie: 0.14, par: 0.33, bogey: 0.32, double: 0.13, triple: 0.06 };
  return               { eagle: 0.01, birdie: 0.07, par: 0.24, bogey: 0.36, double: 0.23, triple: 0.09 };
}

function thisWeight(n: number): number {
  if (n < 5)   return 0.15;
  if (n <= 15) return 0.25 + (n - 5) * 0.005;
  return Math.min(0.40, 0.35 + (n - 15) * 0.01);
}

function blendDists(
  prior: Record<OutcomeKey, number>,
  thisH: Record<OutcomeKey, number>,
  diff:  Record<OutcomeKey, number>,
  tw: number,
  hasDiff: boolean,
): Record<OutcomeKey, number> {
  const pw = 0.55, dw = hasDiff ? 0.15 : 0;
  const total = pw + tw + dw;
  const result = {} as Record<OutcomeKey, number>;
  for (const k of KEYS) {
    result[k] = (pw * prior[k] + tw * thisH[k] + dw * diff[k]) / total;
  }
  return result;
}

// ─── SVG curve helpers ────────────────────────────────────────────────────────

// Catmull-Rom spline through points (tension 0.5)
function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`);
  }
  return d.join(' ');
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const W = 320, H = 168;
const PL = 14, PR = 14, PT = 30, PB = 42;
const PW = W - PL - PR;
const PH = H - PT - PB;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScoreDistChart({ par, similarHoleScores, thisHoleScores, difficultyRating }: Props) {
  const hasSimilar = similarHoleScores.length > 0;
  const hasThis    = thisHoleScores.length > 0;
  const hasDiff    = difficultyRating != null && difficultyRating > 0;

  if (!hasSimilar && !hasThis && !hasDiff) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>
        No history yet — play this hole or similar holes to see the score distribution.
      </div>
    );
  }

  const defaultPrior: Record<OutcomeKey, number> = { eagle: 0.01, birdie: 0.08, par: 0.28, bogey: 0.36, double: 0.19, triple: 0.08 };

  const priorDist = hasSimilar ? scoresToDist(similarHoleScores, par) : defaultPrior;
  const thisDist  = hasThis    ? scoresToDist(thisHoleScores,    par) : priorDist;
  const diffDist  = hasDiff    ? difficultyDist(difficultyRating!)    : priorDist;
  const tw        = thisWeight(thisHoleScores.length);
  const blended   = blendDists(priorDist, thisDist, diffDist, tw, hasDiff);

  // Map outcomes to SVG points
  const maxProb = Math.max(...KEYS.map(k => blended[k]));
  const pts = OUTCOMES.map((o, i) => ({
    ...o,
    prob: blended[o.key],
    x: PL + (i / (OUTCOMES.length - 1)) * PW,
    y: PT + PH - (blended[o.key] / maxProb) * PH,
  }));

  const linePath = catmullRom(pts);
  const baseline = PT + PH;
  const areaPath = linePath
    + ` L${pts[pts.length - 1].x.toFixed(2)},${baseline}`
    + ` L${pts[0].x.toFixed(2)},${baseline} Z`;

  const mostLikely = OUTCOMES.reduce((best, o) => blended[o.key] > blended[best.key] ? o : best, OUTCOMES[2]);
  const mlIdx = OUTCOMES.findIndex(o => o.key === mostLikely.key);
  const mlPt = pts[mlIdx];

  // Clamp label anchor so it doesn't overflow
  const labelAnchor = mlIdx === 0 ? 'start' : mlIdx === OUTCOMES.length - 1 ? 'end' : 'middle';

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#0f6e56', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Score Distribution
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 360, display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0f6e56" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f6e56" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="distClip">
            <rect x={PL} y={PT} width={PW} height={PH + 1} />
          </clipPath>
        </defs>

        {/* Baseline */}
        <line x1={PL} y1={baseline} x2={PL + PW} y2={baseline} stroke="#e5e7eb" strokeWidth={1} />

        {/* Filled area under curve */}
        <path d={areaPath} fill="url(#distFill)" clipPath="url(#distClip)" />

        {/* Curve line */}
        <path d={linePath} fill="none" stroke="#0f6e56" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" clipPath="url(#distClip)" />

        {/* Midpoint vertical line at most likely outcome */}
        <line
          x1={mlPt.x} y1={PT}
          x2={mlPt.x} y2={baseline}
          stroke={mostLikely.color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {/* Peak dot */}
        <circle cx={mlPt.x} cy={mlPt.y} r={4} fill={mostLikely.color} stroke="white" strokeWidth={1.5} />

        {/* Peak label */}
        <text x={mlPt.x} y={mlPt.y - 10} textAnchor={labelAnchor} fontSize={10} fontWeight="700" fill={mostLikely.color}>
          {mostLikely.label} · {Math.round(blended[mostLikely.key] * 100)}%
        </text>

        {/* X-axis outcome labels */}
        {pts.map((pt, i) => {
          const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
          return (
            <g key={pt.key}>
              <text x={pt.x} y={baseline + 14} textAnchor={anchor} fontSize={9} fontWeight="600" fill={pt.color}>
                {pt.label}
              </text>
              <text x={pt.x} y={baseline + 26} textAnchor={anchor} fontSize={8} fill="#9ca3af">
                {Math.round(pt.prob * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Data footnote */}
      <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, fontStyle: 'italic' }}>
        {hasSimilar ? `${similarHoleScores.length} similar holes` : 'no similar holes'}
        {' · '}
        {hasThis ? `${thisHoleScores.length} rounds here` : 'no history here'}
        {hasDiff ? ` · difficulty ${difficultyRating}/10` : ''}
      </div>
    </div>
  );
}
