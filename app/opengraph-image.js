import { ImageResponse } from "next/og";

export const alt = "V Celju se nič ne dogaja – dogodki danes, jutri in ta vikend";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "64px", background: "#f4f1e8", color: "#111111", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 28 }}>VCELJUSENICNEDOGAJA.SI</div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>
        <div style={{ display: "flex" }}>V CELJU SE</div>
        <div style={{ display: "flex" }}><span style={{ color: "#ff3b30", textDecoration: "line-through", marginRight: 24 }}>NIČ</span>NE DOGAJA.</div>
      </div>
      <div style={{ display: "flex", fontSize: 32 }}>Dogodki danes, jutri in ta vikend.</div>
    </div>,
    size,
  );
}
