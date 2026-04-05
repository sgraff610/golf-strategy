"use client";
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
    color: "white",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    padding: "10px 24px",
    display: "block",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  };

  const desktopNavLink: React.CSSProperties = {
    color: "white",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.1)",
  };

  return (
    <nav style={{ background: "#2f2f2f", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 36,
      }}>
        <a href="/" style={{ color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          ⛳ Golf Strategy
        </a>

        {isMobile ? (
          <button
            onClick={() => setOpen(!open)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "white", fontSize: 20, padding: 4, lineHeight: 1,
            }}
            aria-label="Menu"
          >
            {open ? "✕" : "☰"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <a href="/" style={desktopNavLink}>Strategy</a>
            <a href="/courses" style={desktopNavLink}>Courses</a>
            <a href="/rounds" style={desktopNavLink}>Rounds</a>
            <a href="/rounds/calc" style={desktopNavLink}>Analysis</a>
            <a href="/rounds/insights" style={desktopNavLink}>Insights</a>
            <a href="/rounds/chat" style={desktopNavLink}>Chat</a>
            <a href="/rounds/play" style={desktopNavLink}>Play</a>
          </div>
        )}
      </div>

      {isMobile && open && (
        <div style={{ background: "#222222", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <a href="/" style={navLink} onClick={() => setOpen(false)}>Strategy</a>
          <a href="/courses" style={navLink} onClick={() => setOpen(false)}>Courses</a>
          <a href="/rounds" style={navLink} onClick={() => setOpen(false)}>Rounds</a>
          <a href="/rounds/calc" style={navLink} onClick={() => setOpen(false)}>Analysis</a>
          <a href="/rounds/insights" style={navLink} onClick={() => setOpen(false)}>Insights</a>
          <a href="/rounds/chat" style={navLink} onClick={() => setOpen(false)}>Chat</a>
          <a href="/rounds/play" style={navLink} onClick={() => setOpen(false)}>Play</a>
        </div>
      )}
    </nav>
  );
}
