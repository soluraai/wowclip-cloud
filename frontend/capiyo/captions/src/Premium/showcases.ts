import type { CaptionSource } from "../LaunchCaptionPack/types";
import { premiumPreviewSource } from "./story";

const scenes = (phrases: [string, number][]) => phrases.map(([text, hero], scene) => {
  const words = text.split(" ");
  return { hero, words: words.map((word, index) => ({
    id: `showcase-${scene}-${index}`, text: word,
    startMs: scene * 3200 + index * 330,
    endMs: scene * 3200 + (index === words.length - 1 ? 2400 : (index + 1) * 330),
    emphasis: index === hero, pageBreakAfter: index === words.length - 1,
  })) };
});

export const luxeScenes = scenes([
  ["Make every moment count forever.", 2], ["Turn your vision into reality.", 2],
  ["Let your brilliant ideas shine.", 3], ["Create something people remember.", 1],
]);
export const smartScenes = scenes([
  ["Great ideas deserve a second look.", 1], ["A little focus changes everything today.", 2],
  ["Give every single word a purpose.", 3], ["100% worth every second of attention.", 0],
]);
export const editorialScenes = scenes([
  ["Build something truly unforgettable today.", 3], ["Turn small sparks into extraordinary stories.", 4],
  ["Let your creativity lead the way.", 2], ["Tell your wonderful story with style.", 2],
]);
export const glowScenes = scenes([
  ["Discipline builds your whole future.", 0], ["Greatness starts with one decision.", 0],
  ["Everything begins with your mindset.", 0], ["Confidence changes your whole life.", 0],
]);
// The hero word leads, so the sentence still reads when it lifts into the sign.
export const neonScenes = scenes([
  ["Dreams never stop burning inside you.", 0], ["Legends keep showing up every day.", 0],
  ["100% worth every single effort.", 0], ["Energy attracts real opportunity everywhere.", 0],
]);
export const stackScenes = scenes([
  ["Great stories always begin with you.", 2], ["Small habits slowly create big wins.", 2],
  ["Keep 100% of their full attention.", 2], ["Bold ideas truly need brave people.", 2],
]);
export const anchorScenes = scenes([
  // Each phrase stays one lockup (32 letters at most), so a card never rests on a lone word.
  ["Every champion needs a dream.", 1], ["Your biggest chapter starts now.", 2],
  ["Keep 100% of their attention.", 1], ["Great leaders rise together.", 1],
]);
// Card phrases fit one caption page of their style, so no scene breaks into a lone word.
const maroonScenes = scenes([
  ["Your next chapter starts here.", 2], ["Your passion is unstoppable now.", 3],
  ["Keep 100% of their attention.", 1], ["Big dreams need bold moves.", 1],
]);
const cadenceScenes = scenes([
  ["Small ideas become powerful moments together.", 3], ["Make your story worth sharing with everyone.", 2],
  ["Keep 100% of their attention today.", 1], ["Your next chapter starts right here.", 2],
]);
const emberScenes = scenes([
  ["A little discipline changes everything.", 2], ["Small steps create lasting momentum.", 4],
  ["Your next chapter starts right here.", 2], ["Make your ideas worth sharing.", 2],
]);
const cursorScenes = scenes([
  ["Your attention shapes your entire future.", 1], ["Start with one clear idea today.", 4],
  ["Make every single word count.", 3], ["Choose the story truly worth telling.", 2],
]);
const dynamicScenes = scenes([
  ["Make every single word count.", 3], ["One idea changes everything.", 1],
  ["Give your story more voice.", 2], ["Small steps create progress.", 3],
]);
const verseScenes = scenes([
  ["Turn small ideas into stories.", 4], ["Let your words find their beat.", 4],
  ["A little rhythm changes everything.", 2], ["Keep creating something new.", 1],
]);
const splitScenes = scenes([
  ["Your next move changes everything today.", 2], ["Nothing great ever comes easy.", 2],
  ["The real story starts here.", 2], ["Every limit is yours to break.", 1],
]);
const finderScenes = scenes([
  ["Watch what happens next right here.", 3], ["This moment changes the whole story.", 1],
  ["Keep your focus on the goal.", 2], ["Every frame tells the truth.", 1],
]);
const source = (items: ReturnType<typeof scenes>): CaptionSource => ({
  transcript: items.flatMap(scene => scene.words), durationMs: 12800,
});
const showcases: Record<string, CaptionSource & { designSeed?: string }> = {
  luxe: { ...source(luxeScenes), designSeed: "luxe-card-21" },
  "smart-text-caption": source(smartScenes), "editorial-type": source(editorialScenes),
  "glow-anchor": source(glowScenes), "neon-overlap": source(neonScenes), "reference-stack": source(stackScenes),
  "style-one": source(anchorScenes), "maroon-king": source(maroonScenes), cadence: source(cadenceScenes),
  "ember-lock": source(emberScenes), "cursor-story": source(cursorScenes),
  "dynamic-simple": source(dynamicScenes), "verse-flow": source(verseScenes),
  "split-line": source(splitScenes), viewfinder: source(finderScenes),
};
export const premiumShowcaseSource = (styleId?: string) => showcases[styleId ?? ""] ?? premiumPreviewSource;
