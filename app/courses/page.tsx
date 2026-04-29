"use client";
import { useState, useEffect, useRef } from "react";
import { CourseRecord } from "@/lib/types";
import { loadCourses, saveCourse } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

// ─── Theme vars ───────────────────────────────────────────────────────────────

const ROOT: React.CSSProperties = {
  '--bg': '#eef1f4', '--paper': '#f7f9fb', '--paper-alt': '#e6ebf0',
  '--ink': '#131821', '--ink-soft': '#253041', '--muted': '#5d6b7a', '--muted-2': '#8995a3',
  '--line': '#d7dde3', '--line-soft': '#e5eaef',
  '--green': '#0f6e56', '--green-deep': '#084634', '--green-soft': '#d2e8df',
  '--accent': '#f29450', '--accent-deep': '#b45f22', '--accent-soft': '#fde0c8',
  '--sand': '#c8a84b', '--flag': '#c94a2a',
  '--good': '#1e8449', '--bad': '#c94a2a',
  background: '#eef1f4', color: '#131821',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  minHeight: '100vh',
} as React.CSSProperties;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TONES = ['#4a7c5e', '#5a6e3a', '#3d6582', '#6b4f3a', '#7a4a6b', '#3a6a6e'];
function toneFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
const coursePar   = (c: CourseRecord) => c.holes.reduce((s, h) => s + h.par, 0);
const courseYards = (c: CourseRecord) => c.holes.reduce((s, h) => s + (h.yards || 0), 0);

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseStat = {
  rounds: number; best: number | null; avg: number | null;
  last: number | null; lastDate: string | null;
  history: { date: string; score: number; toPar: number }[];
};
type CourseGroup = { name: string; teeBoxes: CourseRecord[]; tone: string };

// ─── Chip ─────────────────────────────────────────────────────────────────────

type ChipTone = 'default' | 'green' | 'clay' | 'warn';
function Chip({ tone = 'default' as ChipTone, children }: { tone?: ChipTone; children: React.ReactNode }) {
  const T = {
    default: { bg: 'var(--paper-alt)', bd: 'var(--line)',    fg: 'var(--ink-soft)' },
    green:   { bg: 'var(--green-soft)', bd: 'var(--green)',  fg: 'var(--green-deep)' },
    clay:    { bg: 'var(--accent-soft)', bd: 'var(--accent)', fg: 'var(--accent-deep)' },
    warn:    { bg: '#fbe0d6', bd: 'var(--bad)',              fg: 'var(--bad)' },
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, padding: '3px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.bd}`, color: T.fg }}>
      {children}
    </span>
  );
}

// ─── CourseHero ───────────────────────────────────────────────────────────────

function CourseHero({ tone, imageUrl, big = false, imagePosition, onSavePosition }: {
  tone: string;
  imageUrl?: string | null;
  big?: boolean;
  imagePosition?: string | null;
  onSavePosition?: (pos: string) => Promise<void>;
}) {
  const h = big ? 180 : 120;
  const r = big ? 14 : 10;
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (imagePosition) {
      const [xp, yp] = imagePosition.split(' ');
      return { x: parseFloat(xp) || 50, y: parseFloat(yp) || 50 };
    }
    return { x: 50, y: 50 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const savePosRef = useRef(onSavePosition);
  savePosRef.current = onSavePosition;
  const canDrag = big && !!imageUrl && !!onSavePosition;

  useEffect(() => {
    if (!canDrag) return;
    function onMove(e: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragRef.current.mx) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.my) / rect.height) * 100;
      setPos({
        x: Math.max(0, Math.min(100, dragRef.current.px + dx)),
        y: Math.max(0, Math.min(100, dragRef.current.py + dy)),
      });
    }
    function onUp(e: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragRef.current.mx) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.my) / rect.height) * 100;
      const nx = Math.max(0, Math.min(100, dragRef.current.px + dx));
      const ny = Math.max(0, Math.min(100, dragRef.current.py + dy));
      dragRef.current = null;
      setIsDragging(false);
      setPos({ x: nx, y: ny });
      savePosRef.current?.(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [canDrag]);

  function onMouseDown(e: React.MouseEvent) {
    if (!canDrag) return;
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setIsDragging(true);
    e.preventDefault();
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', height: h, borderRadius: r, overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0, background: `${tone}22` }}>
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              filter: 'sepia(8%) saturate(62%) contrast(108%) brightness(86%)',
              objectPosition: `${pos.x}% ${pos.y}%`,
              cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'default',
              userSelect: 'none',
            }}
            onMouseDown={onMouseDown}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(170deg, transparent 35%, ${tone}65 100%)`, pointerEvents: 'none' }} />
          {canDrag && !isDragging && (
            <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9.5, color: 'rgba(255,255,255,.8)', background: 'rgba(0,0,0,.45)', padding: '3px 9px', borderRadius: 99, pointerEvents: 'none' }}>
              drag to reposition
            </div>
          )}
        </>
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
          <rect width="400" height="180" fill={`${tone}18`} />
          <path d="M0 130 Q80 105 160 120 T320 115 T400 125 V180 H0 Z" fill={`${tone}55`} />
          <path d="M0 145 Q70 130 140 140 T280 135 T400 145 V180 H0 Z" fill={`${tone}88`} />
          <path d="M0 165 Q90 155 180 160 T360 158 T400 162 V180 H0 Z" fill={tone} />
          <line x1="320" y1="106" x2="320" y2="144" stroke="rgba(255,255,255,.7)" strokeWidth="1.4" />
          <path d="M320 106 L335 109 L330 113 L335 116 L320 113 Z" fill="#c94a2a" />
          <circle cx="320" cy="145" r="2" fill="rgba(0,0,0,.2)" />
          <circle cx="62" cy="40" r="13" fill="#c8a84b" opacity="0.55" />
        </svg>
      )}
    </div>
  );
}

// ─── Wikipedia image search (client-side, CORS-open) ──────────────────────────

async function searchCourseImages(courseName: string): Promise<string[]> {
  try {
    // Step 1: opensearch to find article titles
    const q = encodeURIComponent(courseName + ' golf course');
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=5&format=json&origin=*`
    );
    const [, titles]: [string, string[]] = await searchRes.json();
    if (!titles?.length) return [];

    // Step 2: fetch REST summary for each title to get thumbnail
    const results = await Promise.all(
      titles.slice(0, 4).map(async (title) => {
        try {
          const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
          );
          const data = await res.json();
          return (data.originalimage?.source ?? data.thumbnail?.source ?? null) as string | null;
        } catch { return null; }
      })
    );
    return results.filter((u): u is string => !!u);
  } catch { return []; }
}

// ─── PhotoPicker ─────────────────────────────────────────────────────────────

function PhotoPicker({ courseName, current, onSave }: {
  courseName: string;
  current: string | null;
  onSave: (url: string | null) => Promise<void>;
}) {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    setSearching(true);
    setSearched(true);
    const imgs = await searchCourseImages(courseName);
    setResults(imgs);
    setSearching(false);
  }

  async function handleSave(url: string | null) {
    setSaving(true);
    await onSave(url);
    setSaving(false);
  }

  return (
    <div style={{ background: 'var(--paper-alt)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', marginTop: 10 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Course photo</div>

      {/* Auto-search */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={handleSearch}
          disabled={searching}
          style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: 'var(--ink)', color: 'var(--paper)', border: 'none', borderRadius: 8, cursor: searching ? 'wait' : 'pointer', opacity: searching ? 0.7 : 1, marginRight: 10 }}
        >
          {searching ? 'Searching…' : 'Find photos automatically'}
        </button>
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(courseName + ' golf course')}&tbm=isch`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}
        >
          Search Google Images ↗
        </a>
      </div>

      {/* Wikipedia results */}
      {searched && !searching && (
        results.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Found on Wikipedia — click to use:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {results.map((url, i) => (
                <button
                  key={i}
                  onClick={() => { setUrlInput(url); handleSave(url); }}
                  style={{ padding: 0, border: urlInput === url ? '3px solid var(--green)' : '2px solid var(--line)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'none', width: 100, height: 66, flexShrink: 0 }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'sepia(8%) saturate(62%) contrast(108%) brightness(86%)' }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>No Wikipedia images found for this course. Try pasting a URL below or searching Google Images.</div>
        )
      )}

      {/* Manual URL */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="Or paste an image URL…"
          style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 8, outline: 'none', color: 'var(--ink)', background: 'var(--paper)' }}
        />
        <button
          onClick={() => handleSave(urlInput.trim() || null)}
          disabled={saving}
          style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: 'var(--green)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {current && (
          <button
            onClick={() => { setUrlInput(''); handleSave(null); }}
            style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted-2)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Preview */}
      {urlInput && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--muted-2)', marginBottom: 4 }}>Preview:</div>
          <div style={{ height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', position: 'relative' }}>
            <img src={urlInput} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(8%) saturate(62%) contrast(108%) brightness(86%)' }} onError={e => (e.currentTarget.parentElement!.style.display = 'none')} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScoreChart ───────────────────────────────────────────────────────────────

function ScoreChart({ history }: { history: { date: string; score: number; toPar: number }[] }) {
  const [hov, setHov] = useState<number | null>(null);
  if (history.length < 2) return (
    <div style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
      {history.length === 0 ? 'No rounds recorded yet.' : 'Need at least 2 rounds to show a trend.'}
    </div>
  );
  const W = 480, H = 150, pad = { l: 36, r: 12, t: 20, b: 16 };
  const vals = history.map(r => r.toPar);
  const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
  const vMin = rawMin - 1, vMax = rawMax + 1;
  const rng = vMax - vMin || 1;
  const xs = (i: number) => pad.l + (W - pad.l - pad.r) * (i / (history.length - 1));
  const ys = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - vMin) / rng);
  const fmtD = (v: number) => v > 0 ? `+${v}` : v === 0 ? 'E' : String(v);
  const linePath = history.map((r, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)} ${ys(r.toPar).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L${xs(history.length - 1).toFixed(1)} ${H - pad.b} L${xs(0).toFixed(1)} ${H - pad.b} Z`;
  const bestToPar = rawMin;
  // Y axis ticks: min, 0 (if in range), max — de-duped
  const midTick = (vMin < 0 && vMax > 0) ? 0 : Math.round((rawMin + rawMax) / 2);
  const ticks = [...new Set([rawMin, midTick, rawMax])];
  // Tooltip
  const TW = 92, TH = 38;
  const hovPt = hov !== null ? history[hov] : null;
  const hovX = hov !== null ? xs(hov) : 0;
  const hovY = hov !== null ? ys(history[hov].toPar) : 0;
  const tx = Math.max(4, Math.min(W - TW - 4, hovX - TW / 2));
  const ty = Math.max(4, hovY - TH - 10);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* par / even line */}
      {vMin <= 0 && vMax >= 0 && (
        <line x1={pad.l} y1={ys(0)} x2={W - pad.r} y2={ys(0)} stroke="var(--green)" strokeOpacity="0.3" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} y1={ys(v)} x2={W - pad.r} y2={ys(v)} stroke="var(--line)" strokeDasharray="2 4" />
          <text x={pad.l - 4} y={ys(v) + 3} fontSize="9" fill="var(--muted-2)" textAnchor="end">{fmtD(v)}</text>
        </g>
      ))}
      <path d={fillPath} fill="var(--accent-soft)" opacity="0.5" />
      <path d={linePath} stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {history.map((r, i) => {
        const isBest = r.toPar === bestToPar;
        const isHov = hov === i;
        return (
          <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'crosshair' }}>
            <circle cx={xs(i)} cy={ys(r.toPar)} r={14} fill="transparent" />
            <circle cx={xs(i)} cy={ys(r.toPar)} r={isHov ? 5 : isBest ? 5 : 3.5}
              fill={isBest ? 'var(--green)' : isHov ? 'var(--accent)' : 'var(--paper)'}
              stroke={isBest ? 'var(--green-deep)' : 'var(--accent-deep)'} strokeWidth="1.5" />
          </g>
        );
      })}
      {/* Hover tooltip */}
      {hovPt && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={tx} y={ty} width={TW} height={TH} rx={5} fill="var(--ink)" />
          <text x={tx + TW / 2} y={ty + 13} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.6)">
            {hovPt.date.slice(0, 10)}
          </text>
          <text x={tx + TW / 2} y={ty + 30} textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
            {hovPt.score} · {fmtD(hovPt.toPar)}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─── CourseCard ───────────────────────────────────────────────────────────────

function CourseCard({ group, stat, onClick }: { group: CourseGroup; stat: CourseStat | null; onClick: () => void }) {
  const first = group.teeBoxes[0];
  const par = coursePar(first);
  const yards = courseYards(first).toLocaleString();
  const heroTee = group.teeBoxes.find(t => t.hero_image_url);
  const imageUrl = heroTee?.hero_image_url ?? null;
  const imagePosition = heroTee?.hero_image_position ?? null;
  return (
    <div
      onClick={onClick}
      style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, cursor: 'pointer', overflow: 'hidden', transition: 'transform .15s, box-shadow .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(0,0,0,.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      <CourseHero tone={group.tone} imageUrl={imageUrl} imagePosition={imagePosition} />
      <div style={{ padding: '16px 20px' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600, fontStyle: 'italic', color: 'var(--ink)', lineHeight: 1.15, marginBottom: 3 }}>{group.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {first.city || first.state ? `${[first.city, first.state].filter(Boolean).join(', ')} · ` : ''}
            {group.teeBoxes.map(t => t.tee_box).join(' / ')} · {yards}y
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
          {[
            { label: 'Best',   value: stat?.best ?? '—',                          color: stat?.best ? 'var(--green-deep)' : 'var(--muted)' },
            { label: 'Avg',    value: stat?.avg != null ? stat.avg.toFixed(1) : '—', color: 'var(--ink)' },
            { label: 'Rounds', value: stat?.rounds ?? 0,                           color: 'var(--ink)' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 500, fontStyle: 'italic', color: s.color, lineHeight: 1.1 }}>{String(s.value)}</div>
            </div>
          ))}
        </div>

        {/* Course info */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
          <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>PAR</span>{par}</span>
          {first.rating && <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>RATING</span>{first.rating}</span>}
          {first.slope  && <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>SLOPE</span>{first.slope}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── CourseDetail ─────────────────────────────────────────────────────────────

function CourseDetail({ group, stat, onBack, onDeleteTee, onSaveImage, onSavePosition }: {
  group: CourseGroup;
  stat: CourseStat | null;
  onBack: () => void;
  onDeleteTee: (c: CourseRecord) => void;
  onSaveImage: (url: string | null) => Promise<void>;
  onSavePosition: (pos: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'history' | 'details'>('history');
  const [photoOpen, setPhotoOpen] = useState(false);
  const first = group.teeBoxes[0];
  const par = coursePar(first);
  const heroTee = group.teeBoxes.find(t => t.hero_image_url);
  const imageUrl = heroTee?.hero_image_url ?? null;
  const imagePosition = heroTee?.hero_image_position ?? null;
  const TABS = [
    { k: 'history' as const, n: '01', t: 'History' },
    { k: 'details' as const, n: '02', t: 'Course details' },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        ← All courses
      </button>

      {/* Hero */}
      <div style={{ marginBottom: photoOpen ? 0 : 22 }}>
        <div style={{ position: 'relative' }}>
          <CourseHero tone={group.tone} imageUrl={imageUrl} imagePosition={imagePosition} big onSavePosition={onSavePosition} />
          <div style={{ position: 'absolute', left: 24, bottom: 18, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <div>
              {(first.city || first.state) && (
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'rgba(255,255,255,.85)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5, textShadow: '0 1px 2px rgba(0,0,0,.4)' }}>
                  {[first.city, first.state].filter(Boolean).join(', ')}
                </div>
              )}
              <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 500, fontStyle: 'italic', fontSize: 34, lineHeight: 1.05, margin: 0, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.45)' }}>{group.name}</h1>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setPhotoOpen(o => !o)}
                style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)', color: 'white', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {photoOpen ? 'Done' : '📷 Change photo'}
              </button>
              <a href={`/rounds/add?course=${first.id}`} style={{ background: 'var(--green)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                + Add round
              </a>
            </div>
          </div>
        </div>
        {photoOpen && (
          <PhotoPicker
            courseName={group.name}
            current={imageUrl}
            onSave={async (url) => { await onSaveImage(url); setPhotoOpen(false); }}
          />
        )}
        {!photoOpen && <div style={{ marginBottom: 22 }} />}
      </div>

      {/* Stats panel */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Your record here</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Best',   value: stat?.best ?? '—',                             color: stat?.best ? 'var(--green-deep)' : 'var(--muted)' },
            { label: 'Avg',    value: stat?.avg != null ? stat.avg.toFixed(1) : '—', color: 'var(--ink)' },
            { label: 'Last',   value: stat?.last ?? '—',                             color: 'var(--ink)' },
            { label: 'Rounds', value: stat?.rounds ?? 0,                             color: 'var(--ink)' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 8.5, letterSpacing: 1.5, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 500, fontStyle: 'italic', color: s.color, lineHeight: 1 }}>{String(s.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
          <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>PAR</span>{par}</span>
          <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>YARDS</span>{courseYards(first).toLocaleString()}</span>
          {first.rating && <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>RATING</span>{first.rating}</span>}
          {first.slope  && <span><span style={{ fontSize: 8.5, color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 3 }}>SLOPE</span>{first.slope}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 24 }}>
        {TABS.map(s => {
          const active = s.k === tab;
          return (
            <button key={s.k} onClick={() => setTab(s.k)} style={{ background: 'transparent', border: 'none', borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent', padding: '10px 0 11px', marginRight: 32, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: 8.5, letterSpacing: 1.5, color: 'var(--muted-2)', fontWeight: 700, fontFamily: 'monospace', marginBottom: 2 }}>{s.n}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 500, fontStyle: 'italic', color: active ? 'var(--ink)' : 'var(--muted)' }}>{s.t}</div>
            </button>
          );
        })}
      </div>

      {/* History tab */}
      {tab === 'history' && (
        <div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '18px 22px', marginBottom: 18 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>Score history</div>
            <ScoreChart history={(stat?.history ?? []).slice().reverse()} />
          </div>

          {(stat?.history.length ?? 0) > 0 ? (
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700 }}>Every round</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{stat!.history.length} rounds</div>
              </div>
              {stat!.history.map((r, i) => {
                const isBest = r.score === stat!.best;
                const tp = r.toPar;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 70px 70px 1fr', gap: 16, padding: '13px 22px', borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', background: isBest ? 'var(--green-soft)' : 'transparent' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', letterSpacing: 0.3, fontFamily: 'monospace' }}>{r.date}</div>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 500, fontStyle: 'italic', color: isBest ? 'var(--green-deep)' : 'var(--ink)', lineHeight: 1 }}>{r.score}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: tp < 0 ? 'var(--good)' : tp === 0 ? 'var(--ink)' : 'var(--muted)' }}>
                      {tp > 0 ? `+${tp}` : tp === 0 ? 'E' : tp}
                    </div>
                    {isBest && <Chip tone="green">Best round</Chip>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>No rounds recorded here yet.</div>
          )}
        </div>
      )}

      {/* Details tab */}
      {tab === 'details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tee boxes */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700 }}>Tee boxes</div>
              <a href={`/add-course?copyFrom=${first.id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textDecoration: 'none' }}>+ Add tees</a>
            </div>
            {group.teeBoxes.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: i > 0 ? '1px dashed var(--line-soft)' : 'none', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{t.tee_box} tees</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {courseYards(t).toLocaleString()} yds · Par {coursePar(t)}
                    {t.rating ? ` · Rating ${t.rating}` : ''}
                    {t.slope  ? ` · Slope ${t.slope}`  : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a href={`/?course=${t.id}`} style={{ padding: '6px 13px', fontSize: 12, fontWeight: 600, background: 'var(--green)', color: 'white', borderRadius: 8, textDecoration: 'none' }}>Play</a>
                  <a href={`/courses/${t.id}/edit`} style={{ padding: '6px 13px', fontSize: 12, fontWeight: 600, background: 'var(--paper-alt)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, textDecoration: 'none' }}>Edit</a>
                  <button onClick={() => onDeleteTee(t)} style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--muted-2)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Hole breakdown */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 9.5, letterSpacing: 2, color: 'var(--muted-2)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>Hole breakdown — {first.tee_box} tees</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {([3, 4, 5] as const).map(p => {
                const count = first.holes.filter(h => h.par === p).length;
                if (!count) return null;
                return (
                  <div key={p} style={{ textAlign: 'center', background: 'var(--paper-alt)', borderRadius: 10, padding: '12px 8px' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 500, fontStyle: 'italic', color: p === 3 ? '#3a6ea8' : p === 5 ? 'var(--green)' : 'var(--ink)', lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginTop: 3 }}>Par {p}s</div>
                  </div>
                );
              })}
            </div>
            {/* Mini scorecard */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-alt)' }}>
                    {['Hole', 'Par', 'Yds', 'SI'].map(h => (
                      <td key={h} style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--muted-2)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid var(--line)' }}>{h}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {first.holes.map((h, i) => (
                    <tr key={h.hole} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--paper-alt)' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--ink)' }}>{h.hole}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', color: h.par === 3 ? '#3a6ea8' : h.par === 5 ? 'var(--green)' : 'var(--ink-soft)', fontWeight: 600 }}>{h.par}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'monospace' }}>{h.yards || '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--muted-2)' }}>{h.stroke_index || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Plan round CTA */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <a href={`/plan?course=${first.id}`} style={{ flex: 1, background: 'var(--ink)', color: 'var(--paper)', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
          Build pre-round plan →
        </a>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoursesPage() {
  const [groups, setGroups]       = useState<CourseGroup[]>([]);
  const [stats, setStats]         = useState<Record<string, CourseStat>>({});
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<CourseGroup | null>(null);
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState<'rounds' | 'alpha'>('rounds');
  const [deleteTarget, setDeleteTarget]     = useState<CourseRecord | null>(null);
  const [blockingRounds, setBlockingRounds] = useState<{ id: string; date: string; course_name: string }[] | null>(null);
  const [showConfirm, setShowConfirm]       = useState(false);

  async function reloadGroups(courses: CourseRecord[]) {
    const map: Record<string, CourseRecord[]> = {};
    for (const c of courses) { if (!map[c.name]) map[c.name] = []; map[c.name].push(c); }
    return Object.entries(map).map(([name, teeBoxes]) => ({ name, teeBoxes, tone: toneFor(name) }));
  }

  useEffect(() => {
    async function load() {
      const courses = await loadCourses();
      const grps = await reloadGroups(courses);
      setGroups(grps);

      const allIds = courses.map(c => c.id);
      // Rounds store per-hole data in holes[]; sum holes[].score for total
      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, course_id, date, holes')
        .in('course_id', allIds)
        .order('date', { ascending: false });
      const statMap: Record<string, CourseStat> = {};
      for (const grp of grps) {
        const ids = new Set(grp.teeBoxes.map(t => t.id));
        const rds = (rounds ?? []).filter(r => ids.has(r.course_id));
        const expectedHoles = grp.teeBoxes[0].holes.length;
        // Compute total score + par from each round's holes array
        const scored = rds
          .map(r => {
            const hs: any[] = r.holes ?? [];
            const score = hs.reduce((s: number, h: any) => s + (Number(h.score) || 0), 0);
            const par   = hs.reduce((s: number, h: any) => s + (Number(h.par)   || 4), 0);
            const playedHoles = hs.filter((h: any) => Number(h.score) > 0).length;
            return { date: r.date as string, score, par, toPar: score - par, playedHoles };
          })
          .filter(r => r.score > 0 && r.playedHoles === expectedHoles); // skip incomplete/wrong-length rounds
        const scores = scored.map(r => r.score);
        statMap[grp.name] = {
          rounds:   scores.length,
          best:     scores.length ? Math.min(...scores) : null,
          avg:      scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
          last:     scored[0]?.score ?? null,
          lastDate: scored[0]?.date  ?? null,
          history:  scored.map(r => ({ date: r.date, score: r.score, toPar: r.toPar })),
        };
      }
      setStats(statMap);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDeleteTee(course: CourseRecord) {
    const { data } = await supabase.from('rounds').select('id, date, course_name').eq('course_id', course.id);
    setDeleteTarget(course);
    if (data && data.length > 0) { setBlockingRounds(data); setShowConfirm(false); }
    else { setBlockingRounds(null); setShowConfirm(true); }
  }

  async function handleSaveImage(url: string | null) {
    if (!selected) return;
    for (const tee of selected.teeBoxes) {
      await saveCourse({ ...tee, hero_image_url: url });
    }
    const courses = await loadCourses();
    const newGroups = await reloadGroups(courses);
    setGroups(newGroups);
    const updated = newGroups.find(g => g.name === selected.name);
    if (updated) setSelected(updated);
  }

  async function handleSavePosition(pos: string) {
    if (!selected) return;
    for (const tee of selected.teeBoxes) {
      await saveCourse({ ...tee, hero_image_position: pos });
    }
    const courses = await loadCourses();
    const newGroups = await reloadGroups(courses);
    setGroups(newGroups);
    const updated = newGroups.find(g => g.name === selected.name);
    if (updated) setSelected(updated);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await supabase.from('courses').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null); setShowConfirm(false);
    const courses = await loadCourses();
    const newGroups = await reloadGroups(courses);
    setGroups(newGroups);
    if (selected) {
      const updated = newGroups.find(g => g.name === selected.name);
      setSelected(updated ?? null);
    }
  }

  const filtered = groups
    .filter(g =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.teeBoxes[0].city?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const ra = stats[a.name]?.rounds ?? 0;
      const rb = stats[b.name]?.rounds ?? 0;
      if (sortBy === 'alpha') {
        const alpha = a.name.localeCompare(b.name);
        return alpha !== 0 ? alpha : rb - ra;
      }
      // default: most rounds first, then alpha
      return rb !== ra ? rb - ra : a.name.localeCompare(b.name);
    });

  if (loading) return (
    <div style={ROOT}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 32px' }}>
        <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Loading courses…</p>
      </div>
    </div>
  );

  return (
    <div style={ROOT}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 32px 80px' }}>

        {selected ? (
          <CourseDetail
            group={selected}
            stat={stats[selected.name] ?? null}
            onBack={() => { setSelected(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); }}
            onDeleteTee={handleDeleteTee}
            onSaveImage={handleSaveImage}
            onSavePosition={handleSavePosition}
          />
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
              <Chip tone="green">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--green)', display: 'inline-block' }} />
                Your courses
              </Chip>
              <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 500, fontSize: 46, lineHeight: 1.05, margin: '12px 0 8px', letterSpacing: -0.5, color: 'var(--ink)' }}>
                Where are we <em style={{ color: 'var(--green-deep)' }}>playing</em>?
              </h1>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: 0, maxWidth: 500 }}>
                Every course you've played, your record there. Tap a course to dig into history.
              </p>
            </div>

            {/* Search + sort + add */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', minWidth: 200, maxWidth: 380 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search courses…"
                  style={{ width: '100%', padding: '11px 16px 11px 40px', fontSize: 14, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
                <svg width="15" height="15" viewBox="0 0 24 24" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} fill="none" stroke="var(--muted-2)" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
                </svg>
              </div>
              {/* Sort toggle */}
              <div style={{ display: 'flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
                {([['rounds', 'Most played'], ['alpha', 'A–Z']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    style={{ background: sortBy === k ? 'var(--ink)' : 'transparent', color: sortBy === k ? 'var(--paper)' : 'var(--muted)', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background .15s, color .15s' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <a href="/add-course" style={{ padding: '11px 18px', fontSize: 13, fontWeight: 600, background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                + Add course
              </a>
              <a href="/" style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                ← Strategy
              </a>
            </div>

            {/* Grid */}
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{groups.length === 0 ? 'No courses yet. Add one to get started.' : 'No courses match your search.'}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
                {filtered.map(g => (
                  <CourseCard
                    key={g.name}
                    group={g}
                    stat={stats[g.name] ?? null}
                    onClick={() => { setSelected(g); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 4px 24px rgba(0,0,0,.15)' }}>
            {blockingRounds && blockingRounds.length > 0 ? (
              <>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#1a1a1a' }}>Can't delete {deleteTarget.tee_box} tees</p>
                <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>{blockingRounds.length} round{blockingRounds.length > 1 ? 's are' : ' is'} using this course.</p>
                <ul style={{ paddingLeft: 16, marginBottom: 20 }}>
                  {blockingRounds.map(r => (
                    <li key={r.id} style={{ marginBottom: 6 }}>
                      <a href={`/rounds/${r.id}/edit`} style={{ color: '#0f6e56', fontWeight: 500, fontSize: 14 }}>{r.date} — {r.course_name}</a>
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setDeleteTarget(null); setBlockingRounds(null); }} style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, background: '#0f6e56', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
              </>
            ) : showConfirm ? (
              <>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#1a1a1a' }}>Delete {deleteTarget.tee_box} tees?</p>
                <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>This will permanently delete {deleteTarget.name} ({deleteTarget.tee_box}) and cannot be undone.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={confirmDelete} style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, background: '#c0392b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Yes, delete</button>
                  <button onClick={() => { setDeleteTarget(null); setShowConfirm(false); }} style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, background: '#eee', color: '#333', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
