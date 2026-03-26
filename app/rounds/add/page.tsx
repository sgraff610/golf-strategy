import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Golf Strategy",
  description: "Golf strategy and round tracking app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body style={{ margin: 0, fontFamily: "sans-serif" }}>
        <nav style={{
          background: "#0f6e56",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 52,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}>
          <a href="/" style={{ color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
            ⛳ Golf Strategy
          </a>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/" style={navLink}>Strategy</a>
            <a href="/courses" style={navLink}>Courses</a>
            <a href="/rounds" style={navLink}>Rounds</a>
            <a href="/rounds/calc" style={navLink}>Analysis</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}

const navLink: React.CSSProperties = {
  color: "white",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.15)",
};