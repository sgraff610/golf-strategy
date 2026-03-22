"use client";
import { useState } from "react";

export default function Home() {
  const [form, setForm] = useState({
    hole: "", par: "", yards: "",
    dogleg_direction: "none",
    hazard_left: "none", hazard_right: "none",
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHole: {
            hole: Number(form.hole),
            par: Number(form.par),
            yards: Number(form.yards),
            dogleg_direction: form.dogleg_direction,
            hazard_left: form.hazard_left,
            hazard_right: form.hazard_right,
          },
          history: [],
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Golf Strategy Engine</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Enter a hole to get your tee and approach strategy.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[
          { label: "Hole number", name: "hole", type: "number", placeholder: "e.g. 7" },
          { label: "Par", name: "par", type: "number", placeholder: "3, 4 or 5" },
          { label: "Yards", name: "yards", type: "number", placeholder: "e.g. 425" },
        ].map(({ label, name, type, placeholder }) => (
          <div key={name}>
            <label style={{ fontSize: 13, color: "#444", display: "block", marginBottom: 4 }}>{label}</label>
            <input
              name={name} type={type} placeholder={placeholder}
              value={(form as any)[name]} onChange={handleChange}
              style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
            />
          </div>
        ))}

        {[
          { label: "Dogleg direction", name: "dogleg_direction", options: ["none", "left", "right"] },
          { label: "Hazard on left", name: "hazard_left", options: ["none", "water", "trees", "bunker"] },
          { label: "Hazard on right", name: "hazard_right", options: ["none", "water", "trees", "bunker"] },
        ].map(({ label, name, options }) => (
          <div key={name}>
            <label style={{ fontSize: 13, color: "#444", display: "block", marginBottom: 4 }}>{label}</label>
            <select
              name={name} value={(form as any)[name]} onChange={handleChange}
              style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid #ddd", borderRadius: 8, background: "white", boxSizing: "border-box" }}
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}

        <button
          onClick={handleSubmit} disabled={loading}
          style={{ marginTop: 8, padding: "12px", fontSize: 15, fontWeight: 600, background: "#1a1a1a", color: "white", border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Thinking..." : "Get Strategy"}
        </button>
      </div>

      {error && <p style={{ color: "red", marginTop: 24 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#f6f6f6", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>TEE STRATEGY</p>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {result.strategy.tee_strategy.club} — aim {result.strategy.tee_strategy.aim}
            </p>
            <p style={{ fontSize: 14, color: "#555" }}>{result.strategy.tee_strategy.reason}</p>
          </div>

          <div style={{ background: "#f6f6f6", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>APPROACH</p>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              Favor {result.strategy.approach_strategy.aim}
            </p>
            <p style={{ fontSize: 14, color: "#555" }}>{result.strategy.approach_strategy.reason}</p>
          </div>

          {result.strategy.warning && (
            <div style={{ background: "#fff4e5", border: "1px solid #f0a500", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 12, color: "#b37400", marginBottom: 4 }}>WARNING</p>
              <p style={{ fontSize: 15, color: "#7a4f00" }}>{result.strategy.warning}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
