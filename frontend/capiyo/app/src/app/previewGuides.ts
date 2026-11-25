export type Platform = "none" | "reels" | "tiktok" | "shorts";
export type PreviewGuides = {
  platform: Platform;
  safeZones: boolean;
  grid: boolean;
  snap: boolean;
};
export const DEFAULT_GUIDES: PreviewGuides = {
  platform: "none",
  safeZones: false,
  grid: false,
  snap: true,
};
export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "none", label: "App UI: off" },
  { id: "reels", label: "Instagram Reels" },
  { id: "tiktok", label: "TikTok" },
  { id: "shorts", label: "YouTube Shorts" },
];
export type GuideAspect = "9:16" | "4:5" | "16:9" | "1:1";
type Inset = { top: number; bottom: number; left: number; right: number };

/**
 * Clear space on a 1080×1920 frame. Platforms don't publish one stable set of numbers and their
 * UI changes, so these are conservative estimates. "none" is the area safe on all three apps.
 */
const SAFE_ZONES: Record<Platform, Inset> = {
  none: { top: 220, bottom: 480, left: 60, right: 170 },
  reels: { top: 220, bottom: 420, left: 40, right: 140 },
  tiktok: { top: 130, bottom: 480, left: 60, right: 150 },
  shorts: { top: 200, bottom: 400, left: 60, right: 170 },
};

/** Insets as fractions of the frame. Other shapes use the classic 5% title-safe margin. */
export function safeArea(platform: Platform, aspect: GuideAspect): Inset {
  if (aspect !== "9:16") return { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 };
  const zone = SAFE_ZONES[platform];
  return {
    top: zone.top / 1920,
    bottom: zone.bottom / 1920,
    left: zone.left / 1080,
    right: zone.right / 1080,
  };
}
