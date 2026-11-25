import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { clamp, finite, type CaptionWord } from "../CaptionEngine/types";
import { parseNeonNumber } from "./numbers";
import type { NeonCue, NeonDirection, NeonSettings, NeonSource, NeonStyle, NeonVariant } from "./types";

export const resolveNeonStyle = (style: NeonStyle = {}): NeonSettings => ({
  positionX: clamp(finite(style.positionX, 0.5), 0.1, 0.9),
  positionY: clamp(finite(style.positionY, 0.755), 0.15, 0.85),
  maxWidth: clamp(finite(style.maxWidth, 0.84), 0.5, 0.9),
  heroScale: clamp(finite(style.heroScale, 1), 0.65, 1.3),
  normalSize: clamp(finite(style.normalSize, 44), 28, 64),
  glow: clamp(finite(style.glow, 1.35), 0, 2.5),
  // Outline always keeps a subtle electrical fluctuation, even at the minimum.
  flicker: clamp(finite(style.flicker, 0.96), 0.15, 1),
  trailLayers: 0,
  scrimOpacity: clamp(finite(style.scrimOpacity, 0.35), 0, 1),
  transparent: style.transparent === true,
  backgroundColor: style.backgroundColor ?? "#080a0e",
  heroSlide: style.heroSlide ?? "alternate",
  heroSlideDistance: clamp(finite(style.heroSlideDistance, 60), 10, 240),
});

const common = new Set("a an and are as at be been but by can did do for from had has have how i in into is it its just me my of on or our so than that the their them then there these this to us was were what when where which who will with you your hai hain ho ka ki ke ko mein main aur toh to tum ye yeh woh ek se par nahi ना है हैं हो का की के को में मैं और तो तुम ये यह वो एक से पर नहीं".split(" "));
const emphasis = new Set("why not question discipline focus dream dreams believe start stop never impossible possible everything anything nobody somebody success fear failure create change grow growth win winning potential life time work talent power matter matters courage ready reason reason mehnat paisa pehchan shauk zindagi मेहनत पैसा पहचान ज़िंदगी सपने हिम्मत".split(" "));
const bare = (word: CaptionWord) => word.text.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
export const neonSeed = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
};

const autoGroups = (words: CaptionWord[]): CaptionWord[][] => {
  const groups: CaptionWord[][] = [];
  let pending: CaptionWord[] = [];
  const flush = () => { if (pending.length) groups.push(pending); pending = []; };
  for (const word of words) {
    const previous = pending[pending.length - 1];
    const chars = pending.reduce((sum, item) => sum + item.text.length + 1, 0);
    if (previous && (word.startMs - previous.endMs > 420 || pending.length >= 6 ||
      (parseNeonNumber(word.text) && pending.some((item) => parseNeonNumber(item.text))) ||
      chars + word.text.length > 36 || word.endMs - pending[0].startMs > 2600)) flush();
    pending.push(word);
    if (word.pageBreakAfter || /[.!?;]$/.test(word.text)) flush();
  }
  flush();
  return groups;
};

/** Accept only contiguous, non-overlapping word IDs. Unplanned speech stays automatic. */
const directedGroups = (words: CaptionWord[], direction: NeonDirection[], diagnostics: string[]) => {
  const accepted = new Map<number, { words: CaptionWord[]; direction: NeonDirection }>();
  const used = new Set<string>();
  for (const item of direction) {
    const first = words.findIndex((word) => word.id === item.wordIds?.[0]);
    const group = words.slice(first, first + (item.wordIds?.length ?? 0));
    if (first < 0 || !group.length || group.length > 12 ||
      group.some((word, index) => word.id !== item.wordIds[index] || used.has(word.id)) ||
      group.length !== item.wordIds.length ||
      (item.heroWordId && !group.some((word) => word.id === item.heroWordId))) {
      diagnostics.push(`Ignored invalid NeonOverlap direction beginning ${item.wordIds?.[0] ?? "(empty)"}.`);
      continue;
    }
    group.forEach((word) => used.add(word.id));
    accepted.set(first, { words: group, direction: item });
  }
  const result: { words: CaptionWord[]; direction?: NeonDirection }[] = [];
  let pending: CaptionWord[] = [];
  const flush = () => { result.push(...autoGroups(pending).map((group) => ({ words: group }))); pending = []; };
  for (let index = 0; index < words.length;) {
    const directed = accepted.get(index);
    if (directed) { flush(); result.push(directed); index += directed.words.length; }
    else { pending.push(words[index]); index++; }
  }
  flush();
  return result;
};

export const compileNeonOverlap = (source: NeonSource) => {
  const { words, diagnostics } = normalizeTranscript(source.transcript);
  const groups = directedGroups(words, source.direction ?? [], diagnostics);
  let lastVariant: NeonVariant = "plain";
  let heroCount = 0;
  let heroSlideCount = 0;
  const cues: NeonCue[] = groups.map(({ words: group, direction }, index) => {
    const seed = neonSeed(group.map((word) => word.text).join(" "));
    const numericIndex = group.findIndex((word) => parseNeonNumber(word.text));
    const ranked = group.map((word, position) => ({ position,
      score: (emphasis.has(bare(word)) ? 12 : 0) + (common.has(bare(word)) ? -12 : 0) +
        Math.min(8, [...bare(word)].length) + (position === 0 ? 1.5 : 0) -
        Math.max(0, [...bare(word)].length - 15) * 2,
    })).sort((a, b) => b.score - a.score);
    const chosen = direction?.heroWordId ? group.findIndex((word) => word.id === direction.heroWordId) :
      numericIndex >= 0 ? numericIndex : ranked[0].position;
    const isHero = ranked[0].score >= 10 || index === 0 || (index % 3 === 0 && ranked[0].score >= 5);
    let variant: NeonVariant = numericIndex >= 0 ? "metric" : "plain";
    if (numericIndex < 0 && isHero) {
      const rotation: NeonVariant[] = ["outline", "shine", "split", "echo", "outline"];
      variant = rotation[heroCount % rotation.length];
      if (variant === lastVariant) variant = variant === "outline" ? "shine" : "outline";
      heroCount++;
    }
    if (direction?.variant) variant = direction.variant;
    const number = parseNeonNumber(group[chosen].text);
    if (variant === "metric" && !number) variant = "shine";
    lastVariant = variant;
    const heroSlide: "left" | "right" = direction?.heroSlide ?? (heroSlideCount % 2 === 0 ? "left" : "right");
    if (variant !== "plain") {
      heroSlideCount++;
    }
    const startMs = group[0].startMs;
    const spokenEnd = Math.max(...group.map((word) => word.endMs));
    const next = groups[index + 1]?.words[0].startMs ?? Infinity;
    // Finish the outgoing cue before the next begins: no faded text behind new speech.
    const endMs = Math.min(next, spokenEnd + 240);
    const retireMs = Math.max(startMs, endMs - Math.min(130, (endMs - startMs) * 0.18));
    return {
      id: `neon-${group[0].id}`, index, words: group, heroIndex: chosen,
      variant, accent: "red", placement: "center", heroSlide,
      number, startMs, retireMs, endMs, seed,
    };
  });
  return { cues, words, diagnostics,
    durationMs: Math.max(1000, finite(source.durationMs, 0), cues[cues.length - 1]?.endMs ?? 0),
  };
};

export const activeNeonCues = (cues: NeonCue[], now: number): NeonCue[] => {
  let low = 0, high = cues.length - 1, index = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (cues[mid].startMs <= now) { index = mid; low = mid + 1; }
    else high = mid - 1;
  }
  const cue = cues[index];
  return cue && now >= cue.startMs && now < cue.endMs ? [cue] : [];
};
