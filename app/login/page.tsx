"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Mark, Wordmark } from "@/app/components/ui/Mark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div style={{
      minHeight: "100svh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--paper)",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 380,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32,
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={44} />
          <Wordmark size={26} />
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} style={{
          width: "100%",
          background: "var(--paper-alt)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-card)",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{
              fontFamily: "Georgia, serif",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--ink)",
              marginBottom: 4,
            }}>Sign in</div>
            <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>
              Your session stays active for 60 days.
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--paper)",
                color: "var(--ink)",
                fontSize: 15,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--paper)",
                color: "var(--ink)",
                fontSize: 15,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </label>

          {error && (
            <div style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fff0f0",
              border: "1px solid #ffcccc",
              color: "#cc0000",
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px",
              borderRadius: "var(--r-pill)",
              border: "none",
              background: loading ? "var(--line)" : "var(--ink)",
              color: loading ? "var(--ink-mute)" : "var(--paper)",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.12s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
