import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#111111",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "40px",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="110"
        height="110"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" fill="white" />
        <line x1="12" y1="9" x2="12" y2="3" />
        <line x1="12" y1="15" x2="12" y2="21" />
        <line x1="9" y1="12" x2="3" y2="8" />
        <line x1="15" y1="12" x2="21" y2="8" />
        <line x1="9" y1="12" x2="3" y2="16" />
        <line x1="15" y1="12" x2="21" y2="16" />
      </svg>
    </div>,
    { ...size }
  );
}
