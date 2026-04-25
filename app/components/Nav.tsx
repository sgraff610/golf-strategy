"use client";
// app/components/Nav.tsx
// REPLACED: adds a "Plan" link next to Strategy/Play.
import { useState, useEffect } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 600);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const navLink: React.CSSProperties = {
    color: "white", textDecoration: "none", fontSize: 14, fontWeight: 500,
    padding: "10px 24px", display: "block",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  };
  const desktopNavLink: React.CSSProperties = {
    color: "white", textDecoration: "none", fontSize: 13, fontWeight: 500,
    padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.1)",
  };

  const LINKS = [
    { href: "/",                  label: "Strategy/Play" },
    { href: "/plan",              label: "Plan" },
    { href: "/courses",           label: "Courses" },
    { href: "/rounds",            label: "Rounds" },
    { href: "/rounds/insights",   label: "Coach" },
    { href: "/profile",           label: "Profile" },
  ];

  return (
    <nav style={{ background: "#2f2f2f", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 36 }}>
        <a href="/" style={{ color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>⛳ Golf Strategy</a>
        {isMobile ? (
          <button onClick={() => setOpen(!open)} aria-label="Menu"
            style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 20, padding: 4, lineHeight: 1 }}>
            {open ? "✕" : "☰"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LINKS.map((l) => (<a key={l.href} href={l.href} style={desktopNavLink}>{l.label}</a>))}
          </div>
        )}
      </div>
      {isMobile && open && (
        <div style={{ background: "#222222", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} style={navLink} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
        </div>
      )}
    </nav>
  );
}
