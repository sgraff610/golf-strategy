import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f9fb",
          borderRadius: 8,
          position: "relative",
        }}
      >
        {/* Halo */}
        <div style={{
          position: "absolute",
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "rgba(52,211,153,0.30)",
        }} />
        {/* Core */}
        <div style={{
          position: "absolute",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#16a34a",
        }} />
        {/* Drip dot */}
        <div style={{
          position: "absolute",
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "#084634",
          top: 25,
          left: 14,
        }} />
      </div>
    ),
    { ...size },
  );
}
