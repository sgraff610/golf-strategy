import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f9fb",
          borderRadius: 44,
          position: "relative",
        }}
      >
        {/* Outer halo */}
        <div style={{
          position: "absolute",
          width: 136,
          height: 136,
          borderRadius: "50%",
          background: "rgba(52,211,153,0.18)",
        }} />
        {/* Mid halo */}
        <div style={{
          position: "absolute",
          width: 98,
          height: 98,
          borderRadius: "50%",
          background: "rgba(52,211,153,0.32)",
        }} />
        {/* Core sphere */}
        <div style={{
          position: "absolute",
          width: 68,
          height: 68,
          borderRadius: "50%",
          background: "#16a34a",
        }} />
        {/* Shine */}
        <div style={{
          position: "absolute",
          width: 22,
          height: 16,
          borderRadius: "50%",
          background: "rgba(187,247,208,0.85)",
          top: 57,
          left: 61,
        }} />
        {/* Drip dot 1 */}
        <div style={{
          position: "absolute",
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "#084634",
          top: 117,
          left: 82,
        }} />
        {/* Drip dot 2 */}
        <div style={{
          position: "absolute",
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: "#084634",
          top: 140,
          left: 85,
        }} />
        {/* Drip dot 3 */}
        <div style={{
          position: "absolute",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#084634",
          top: 158,
          left: 87,
        }} />
      </div>
    ),
    { ...size },
  );
}
