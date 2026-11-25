"use client";
import { memo, type ReactNode } from "react";
import { safeArea, type GuideAspect, type Platform, type PreviewGuides } from "./previewGuides";
import s from "./PreviewOverlays.module.css";

/** Simplified app chrome for checking a layout. Editor-only: it never reaches the video. */
const WHITE = "#ffffff";
const Glyph = ({ x, y, size = 72, children }: { x: number; y: number; size?: number; children: ReactNode }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 24})`} fill="none" stroke={WHITE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    {children}
  </g>
);
const ICONS: Record<string, ReactNode> = {
  heart: <path d="M12 20.5C6 15.5 2.5 12.6 2.5 8.7A4.7 4.7 0 0 1 7.2 4c2 0 3.6 1 4.8 3 1.2-2 2.8-3 4.8-3a4.7 4.7 0 0 1 4.7 4.7c0 3.9-3.5 6.8-9.5 11.8Z" />,
  heartFilled: <path fill={WHITE} d="M12 20.5C6 15.5 2.5 12.6 2.5 8.7A4.7 4.7 0 0 1 7.2 4c2 0 3.6 1 4.8 3 1.2-2 2.8-3 4.8-3a4.7 4.7 0 0 1 4.7 4.7c0 3.9-3.5 6.8-9.5 11.8Z" />,
  comment: <path d="M20.7 17a10 10 0 1 0-3.6 3.6L22 22Z" />,
  repost: <path d="M17 3l4 4-4 4M21 7H8a4 4 0 0 0-4 4v1M7 21l-4-4 4-4M3 17h13a4 4 0 0 0 4-4v-1" />,
  send: <path d="M22 3 2 3l7.2 7.1L11.7 20.3 22 3ZM22 3 9.2 10.1" />,
  bookmark: <path d="M20 21l-8-7.5L4 21V3h16Z" />,
  share: <path d="M13 5l8 7-8 7v-4.5C7.5 14.5 5 16 3 20c.5-6 3.5-10 10-10.5Z" />,
  thumbUp: <path d="M7 10v11H3V10ZM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.4l-1.5 8A2 2 0 0 1 18.5 21H7" />,
  thumbDown: <path d="M17 14V3h4v11ZM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.4l1.5-8A2 2 0 0 1 5.5 3H17" />,
  more: <path fill={WHITE} stroke="none" d="M12 6.5a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Zm0 7.4a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Zm0 7.4a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Z" />,
  camera: <><path d="M20.5 6.5h-2.2l-1.1-1.9a1.6 1.6 0 0 0-1.4-.8H8.2a1.6 1.6 0 0 0-1.4.8L5.7 6.5H3.5a2 2 0 0 0-2 2v9.2a2 2 0 0 0 2 2h17a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2Z" /><circle cx="12" cy="13" r="4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  remix: <><circle cx="12" cy="12" r="9" /><path d="M9 8.5v7l6-3.5Z" /></>,
};
const Label = ({ x, y, size, weight = 600, anchor = "start", children }: { x: number; y: number; size: number; weight?: number; anchor?: "start" | "middle" | "end"; children: ReactNode }) => (
  <text x={x} y={y} fill={WHITE} fontFamily="Inter, Arial, sans-serif" fontSize={size} fontWeight={weight} textAnchor={anchor}>
    {children}
  </text>
);
function Rail({ items, bottom }: { items: { icon: string; count?: string }[]; bottom: number }) {
  const step = 150;
  return (
    <>
      {items.map((item, index) => {
        const y = bottom - (items.length - index) * step;
        return (
          <g key={item.icon}>
            <Glyph x={966} y={y} size={72}>{ICONS[item.icon]}</Glyph>
            {item.count && <Label x={1002} y={y + 114} size={30} anchor="middle">{item.count}</Label>}
          </g>
        );
      })}
    </>
  );
}
function Reels() {
  return (
    <>
      <Label x={44} y={118} size={56} weight={700}>Reels</Label>
      <Glyph x={966} y={70}>{ICONS.camera}</Glyph>
      <Rail bottom={1720} items={[{ icon: "heart", count: "48.2K" }, { icon: "comment", count: "812" }, { icon: "repost", count: "96" }, { icon: "send", count: "2.1K" }, { icon: "more" }]} />
      <circle cx="84" cy="1690" r="40" fill="#ffffff33" stroke={WHITE} strokeWidth="3" />
      <Label x={142} y={1704} size={36} weight={700}>your.username</Label>
      <rect x="412" y="1664" width="136" height="56" rx="14" fill="none" stroke={WHITE} strokeWidth="2.5" />
      <Label x={480} y={1703} size={30} anchor="middle">Follow</Label>
      <Label x={44} y={1782} size={36} weight={400}>Your caption goes here...</Label>
      <Label x={44} y={1840} size={30} weight={400}>♫ Original audio</Label>
    </>
  );
}
function TikTok() {
  return (
    <>
      <Label x={392} y={112} size={40} weight={500}>Following</Label>
      <Label x={626} y={112} size={40} weight={700}>For You</Label>
      <rect x="664" y="130" width="70" height="6" rx="3" fill={WHITE} />
      <Glyph x={978} y={70} size={64}>{ICONS.search}</Glyph>
      <circle cx="1002" cy="880" r="50" fill="#ffffff33" stroke={WHITE} strokeWidth="3" />
      <Rail bottom={1680} items={[{ icon: "heartFilled", count: "1.2M" }, { icon: "comment", count: "8,402" }, { icon: "bookmark", count: "54K" }, { icon: "share", count: "21K" }]} />
      <circle cx="1002" cy="1742" r="44" fill="#ffffff22" stroke={WHITE} strokeWidth="10" />
      <Label x={44} y={1700} size={42} weight={700}>@yourusername</Label>
      <Label x={44} y={1764} size={36} weight={400}>Your caption goes here... #fyp</Label>
      <Label x={44} y={1826} size={32} weight={400}>♫ original sound</Label>
    </>
  );
}
function Shorts() {
  return (
    <>
      <Glyph x={826} y={70} size={64}>{ICONS.search}</Glyph>
      <Glyph x={966} y={70} size={64}>{ICONS.more}</Glyph>
      <Rail bottom={1680} items={[{ icon: "thumbUp", count: "32K" }, { icon: "thumbDown", count: "Dislike" }, { icon: "comment", count: "1,204" }, { icon: "share", count: "Share" }, { icon: "remix", count: "Remix" }]} />
      <rect x="958" y="1712" width="88" height="88" rx="16" fill="#ffffff33" stroke={WHITE} strokeWidth="3" />
      <circle cx="84" cy="1704" r="40" fill="#ffffff33" stroke={WHITE} strokeWidth="3" />
      <Label x={142} y={1718} size={36} weight={600}>@yourchannel</Label>
      <rect x="420" y="1672" width="186" height="64" rx="32" fill={WHITE} />
      <text x="513" y="1715" fill="#0f0f0f" fontFamily="Inter, Arial, sans-serif" fontSize="30" fontWeight="600" textAnchor="middle">Subscribe</text>
      <Label x={44} y={1800} size={38} weight={500}>Your Short title goes here</Label>
    </>
  );
}
const SCREENS: Record<Exclude<Platform, "none">, () => ReactNode> = { reels: Reels, tiktok: TikTok, shorts: Shorts };

function PreviewOverlays({ guides, aspect }: { guides: PreviewGuides; aspect: GuideAspect }) {
  const platform = aspect === "9:16" ? guides.platform : "none";
  const Screen = platform === "none" ? null : SCREENS[platform];
  const safe = safeArea(platform, aspect);
  return (
    <div className={s.layer} aria-hidden="true">
      {Screen && (
        <svg className={s.screen} viewBox="0 0 1080 1920" preserveAspectRatio="none">
          <Screen />
        </svg>
      )}
      {guides.safeZones && (
        <div
          className={s.safe}
          style={{
            top: `${safe.top * 100}%`,
            bottom: `${safe.bottom * 100}%`,
            left: `${safe.left * 100}%`,
            right: `${safe.right * 100}%`,
          }}
        />
      )}
      {guides.grid && (
        <>
          <span className={s.gridV} style={{ left: "33.333%" }} />
          <span className={s.gridV} style={{ left: "66.667%" }} />
          <span className={s.gridH} style={{ top: "33.333%" }} />
          <span className={s.gridH} style={{ top: "66.667%" }} />
          <span className={s.centerV} />
          <span className={s.centerH} />
        </>
      )}
    </div>
  );
}

export default memo(PreviewOverlays);
