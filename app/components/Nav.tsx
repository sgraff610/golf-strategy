"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Mark, Wordmark } from "./ui/Mark";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/",                label: "Home" },
  { href: "/plan",            label: "Plan" },
  { href: "/courses",         label: "Courses" },
  { href: "/rounds/insights", label: "Coach" },
  { href: "/clubhouse",       label: "Clubhouse" },
];

export default function Nav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav style={{
      background: "var(--paper)",
      borderBottom: "1px solid var(--line)",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16,
      }}>
        {/* Brand */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <Mark size={34} />
          <Wordmark size={20} />
        </Link>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {LINKS.map(l => {
              const active = isActive(l.href);
              return (
                <Link key={l.href} href={l.href} style={{
                  padding: "8px 14px",
                  borderRadius: "var(--r-pill)",
                  fontSize: "var(--t-ui)",
                  fontWeight: 500,
                  textDecoration: "none",
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--paper)" : "var(--ink-soft)",
                  transition: "background 0.12s, color 0.12s",
                }}>{l.label}</Link>
              );
            })}
            <Link href="/plan" style={{
              marginLeft: 8,
              padding: "8px 16px",
              borderRadius: "var(--r-pill)",
              fontSize: "var(--t-ui)",
              fontWeight: 600,
              textDecoration: "none",
              background: "var(--accent)",
              color: "var(--ink)",
            }}>+ New round</Link>
            <button onClick={signOut} style={{
              marginLeft: 4,
              padding: "8px 14px",
              borderRadius: "var(--r-pill)",
              fontSize: "var(--t-ui)",
              fontWeight: 500,
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--ink-mute)",
              cursor: "pointer",
            }}>Sign out</button>
          </div>
        )}

        {/* Mobile toggle */}
        {isMobile && (
          <button onClick={() => setOpen(!open)} aria-label="Menu"
            style={{
              background: "var(--ink)", color: "var(--paper)",
              border: "none", borderRadius: 8,
              width: 38, height: 38, fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{open ? "✕" : "☰"}</button>
        )}
      </div>

      {/* Mobile drawer */}
      {isMobile && open && (
        <div style={{ background: "var(--paper)", borderTop: "1px solid var(--line)" }}>
          {LINKS.map(l => {
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
                display: "block",
                padding: "14px 24px",
                fontSize: "var(--t-ui)", fontWeight: 500,
                textDecoration: "none",
                color: active ? "var(--ink)" : "var(--ink-soft)",
                background: active ? "var(--paper-alt)" : "transparent",
                borderBottom: "1px solid var(--line-soft)",
              }}>{l.label}</Link>
            );
          })}
          <Link href="/plan" onClick={() => setOpen(false)} style={{
            display: "block", textAlign: "center", margin: "12px 24px 4px",
            padding: "12px", borderRadius: "var(--r-pill)",
            background: "var(--accent)", color: "var(--ink)",
            fontWeight: 600, textDecoration: "none",
          }}>+ New round</Link>
          <button onClick={signOut} style={{
            display: "block", width: "calc(100% - 48px)", margin: "0 24px 12px",
            padding: "12px", borderRadius: "var(--r-pill)",
            background: "transparent", border: "1px solid var(--line)",
            color: "var(--ink-mute)", fontWeight: 500,
            fontSize: "var(--t-ui)", cursor: "pointer",
          }}>Sign out</button>
        </div>
      )}
    </nav>
  );
}
