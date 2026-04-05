"use client";
import { useState, useEffect, useRef } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "What's my scoring average by course?",
  "Which club do I score best with off the tee?",
  "How does my score change when I miss left vs right?",
  "What are my worst scoring holes?",
  "How is my GIR % trending over time?",
  "When do I 3-putt most often?",
  "What's my handicap differential trend?",
  "Where do I lose the most strokes vs par?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || data.error || "Something went wrong." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    }
    setLoading(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", fontFamily: "sans-serif", height: "100dvh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #eee", background: "white", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/rounds" style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>← Rounds</a>
          <span style={{ color: "#ddd" }}>|</span>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "#0f6e56", margin: 0 }}>⛳ Golf AI Analyst</h1>
        </div>
        <p style={{ fontSize: 12, color: "#999", margin: "4px 0 0 0" }}>Ask anything about your game — powered by your round data</p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {isEmpty && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Ask me about your game</p>
            <p style={{ fontSize: 13, color: "#999", marginBottom: 28 }}>I have access to all your rounds and can find patterns in your data.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{ padding: "10px 16px", fontSize: 13, background: "#f6f6f6", border: "1px solid #eee", borderRadius: 10, cursor: "pointer", textAlign: "left", color: "#333", transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#e8f5f0")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#f6f6f6")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? "#0f6e56" : "#f6f6f6",
              color: m.role === "user" ? "white" : "#1a1a1a",
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
            <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: "#f6f6f6" }}>
              <span style={{ fontSize: 13, color: "#999" }}>Analysing your data...</span>
              <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}> ●</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #eee", background: "white", flexShrink: 0 }}>
        {!isEmpty && (
          <button onClick={() => setMessages([])}
            style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginBottom: 8, padding: 0 }}>
            Clear conversation
          </button>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about your game..."
            disabled={loading}
            style={{
              flex: 1, padding: "10px 14px", fontSize: 14,
              border: "1px solid #ddd", borderRadius: 10,
              outline: "none", boxSizing: "border-box",
              color: "#1a1a1a",
              background: loading ? "#f9f9f9" : "white",
            }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            style={{
              padding: "10px 18px", fontSize: 14, fontWeight: 600,
              background: loading || !input.trim() ? "#ddd" : "#0f6e56",
              color: "white", border: "none", borderRadius: 10,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}>
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}
