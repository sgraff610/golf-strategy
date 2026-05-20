"use client";

export function GreenLightMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden>
      <rect width="44" height="44" rx="12" fill="url(#gl-g)"/>
      <defs>
        <linearGradient id="gl-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f6e56"/>
          <stop offset="100%" stopColor="#084634"/>
        </linearGradient>
      </defs>
      <rect x="14" y="11" width="2.5" height="22" fill="#f7f9fb"/>
      <path d="M 16.5 12 L 30 16.5 L 25 19 L 30 21.5 L 16.5 23 Z" fill="#f29450"/>
    </svg>
  );
}
