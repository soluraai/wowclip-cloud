import type { CaptionSource } from "../LaunchCaptionPack/types";

/** One story, one clock, across every Premium card. IDs survive all adapters. */
export const premiumScenes = [
  { text: "Make your story worth sharing.", hero: 2 },
  { text: "Small ideas become powerful moments.", hero: 3 },
  { text: "Keep 100% of their attention.", hero: 1 },
  { text: "Your next chapter starts here.", hero: 2 },
].map((scene, sceneIndex) => {
  const text = scene.text.split(" ");
  return { ...scene, words: text.map((word, index) => ({
    id: `premium-${sceneIndex}-${index}`, text: word,
    startMs: sceneIndex * 3200 + index * 330,
    endMs: sceneIndex * 3200 + (index === text.length - 1 ? 2400 : (index + 1) * 330),
    emphasis: index === scene.hero, pageBreakAfter: index === text.length - 1,
  })) };
});

export const premiumPreviewSource: CaptionSource = {
  transcript: premiumScenes.flatMap(scene => scene.words), durationMs: 12800,
};
export const PREMIUM_PREVIEW_FRAMES = 384;
// Hovering a card plays all four scenes, so the wait stays short.
export const PREMIUM_PREVIEW_SPEED = 1.6;
// All five words are settled and decorations/depth have reached full strength.
export const PREMIUM_PREVIEW_STILL_FRAME = 70;
// The style cards' own background, so a card scaled to fit shows no box of its own.
export const PREMIUM_CANVAS = "#1D1F24";
