"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

// ─── Icons ─────────────────────────────────────────────────────────────────────
type IP = { active?: boolean };
const ic = (a?: boolean) => a ? "#f29450" : "rgba(255,255,255,0.6)";
const sw = (a?: boolean) => a ? 2.2 : 1.8;

function HomeIcon({ active }: IP) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ic(active)} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function PlanIcon({ active }: IP) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ic(active)} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  );
}
function CoursesIcon({ active }: IP) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ic(active)} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4"/>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
    </svg>
  );
}
function CoachIcon({ active }: IP) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ic(active)} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
function TrophyIcon({ active }: IP) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ic(active)} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4a2 2 0 01-2-2V5h4"/>
      <path d="M18 9h2a2 2 0 002-2V5h-4"/>
      <path d="M12 17c-3.314 0-6-2.686-6-6V3h12v8c0 3.314-2.686 6-6 6z"/>
      <path d="M12 17v4"/>
      <path d="M8 21h8"/>
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function BrandIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <line x1="12" y1="13" x2="12" y2="20"/>
      <line x1="8" y1="20" x2="16" y2="20"/>
    </svg>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────
const LINKS = [
  { href: "/",                label: "Home",      Icon: HomeIcon },
  { href: "/plan",            label: "Plan",      Icon: PlanIcon },
  { href: "/courses",         label: "Courses",   Icon: CoursesIcon },
  { href: "/rounds/insights", label: "Coach",     Icon: CoachIcon },
  { href: "/clubhouse",       label: "Clubhouse", Icon: TrophyIcon },
];

const BG = "linear-gradient(180deg, #0d5240 0%, #073528 100%)";
const ACCENT = "#f29450";
const BRAND_MARK: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
  background: "linear-gradient(135deg, #1e9a72 0%, #0f6e56 100%)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Nav() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setShowSidebar(window.innerWidth >= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (showSidebar) return <Sidebar isActive={isActive} />;
  return <TopBar drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} isActive={isActive} />;
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ isActive }: { isActive: (h: string) => boolean }) {
  return (
    <nav style={{
      position: "fixed", left: 0, top: 0,
      width: 72, height: "100vh",
      background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      zIndex: 100,
      boxShadow: "2px 0 16px rgba(0,0,0,0.18)",
    }}>
      {/* Brand */}
      <a href="/" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "18px 0 14px", width: "100%",
        borderBottom: "1px solid rgba(255,255,255,0.09)",
        textDecoration: "none",
      }}>
        <div style={BRAND_MARK}><BrandIcon /></div>
      </a>

      {/* Nav items */}
      <div style={{ flex: 1, paddingTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <a key={href} href={href} style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 5, padding: "11px 0", borderRadius: 10, width: 58,
              textDecoration: "none",
              background: active ? "rgba(242,148,80,0.15)" : "transparent",
              transition: "background 0.12s",
            }}>
              <Icon active={active} />
              <span style={{
                fontSize: 9, fontWeight: active ? 700 : 500,
                color: active ? ACCENT : "rgba(255,255,255,0.52)",
                letterSpacing: 0.4, lineHeight: 1, textAlign: "center",
              }}>{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Mobile top bar ────────────────────────────────────────────────────────────
function TopBar({ drawerOpen, setDrawerOpen, isActive }: {
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  isActive: (h: string) => boolean;
}) {
  return (
    <>
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: BG,
        height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 16px",
        boxShadow: "0 1px 10px rgba(0,0,0,0.22)",
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ ...BRAND_MARK, width: 30, height: 30, borderRadius: 8 }}><BrandIcon /></div>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, color: "white" }}>GOLF STRATEGY</span>
        </a>
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center" }}
          aria-label="Menu"
        >
          {drawerOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </nav>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          style={{ position: "fixed", inset: 0, top: 52, zIndex: 99, background: "rgba(0,0,0,0.45)" }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{ background: BG, position: "absolute", top: 0, left: 0, right: 0 }}
            onClick={e => e.stopPropagation()}
          >
            {LINKS.map(({ href, label, Icon }) => {
              const active = isActive(href);
              return (
                <a key={href} href={href} onClick={() => setDrawerOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "15px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  textDecoration: "none",
                  color: active ? ACCENT : "rgba(255,255,255,0.85)",
                  fontWeight: active ? 600 : 450,
                  fontSize: 15,
                }}>
                  <Icon active={active} />
                  {label}
                </a>
              );
            })}
            <div style={{ padding: "16px 16px 20px" }}>
              <a href="/rounds/play" style={{
                display: "block", textAlign: "center",
                padding: "13px 20px", background: ACCENT,
                color: "#131821", borderRadius: 10,
                fontWeight: 700, fontSize: 14, textDecoration: "none",
              }}>
                + New Round
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
