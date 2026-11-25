import type { LuxeProps } from "./Luxe";

export type LuxeSource = NonNullable<LuxeProps["sourceConfig"]>;

type LuxeEntry = { id: string; text: string; startMs: number; endMs: number; emphasis?: boolean; pageBreakAfter?: boolean };

const show = (id: string, text: string, startMs: number, endMs: number, emphasis = false): LuxeEntry =>
  emphasis ? { id, text, startMs, endMs, emphasis: true } : { id, text, startMs, endMs };

/**
 * Curated showcase for the Luxe premium style: one phrase per cue, each locking
 * (per-seed, never random during playback) into a different engine mode —
 * signature, staggered, duet, sentence, pocket, diagonal and rail — while the
 * glass palette rotates through green, purple, blue and teal and the pocket cue
 * renders lowercase. The last word id of each phrase carries a letter salt that
 * was searched in tmp/luxe-premium/mode-tour.mjs: those exact ids change the
 * seeded hash and pin the stated modes, so they must never be renamed.
 * The footage background is required — hero glyphs difference-blend with it.
 */
const SHOWCASE_TRANSCRIPT: LuxeEntry[] = [
  show("lux-1-1", "Blend", 300, 510, true),
  show("lux-1-2", "with", 570, 740),
  show("lux-1-3", "the", 800, 970),
  show("lux-1-4", "footage.", 1030, 1324),
  show("lux-2-1", "True", 1884, 2054),
  show("lux-2-2", "Luxury", 2114, 2366, true),
  show("lux-2-3", "is", 2426, 2596),
  show("lux-2-4d", "Crafted.", 2656, 2950, true),
  show("lux-3-1", "Truly", 3510, 3720),
  show("lux-3-2", "Magnetic", 3780, 4116, true),
  show("lux-3-3l", "type.", 4176, 4346),
  show("lux-4-1", "Type", 4906, 5076),
  show("lux-4-2", "that", 5136, 5306),
  show("lux-4-3", "thinks", 5366, 5618),
  show("lux-4-4", "with", 5678, 5848),
  show("lux-4-5m", "light.", 5908, 6118, true),
  show("lux-5-1", "Words", 6678, 6888),
  show("lux-5-2", "Never", 6948, 7158, true),
  show("lux-5-3", "beg", 7218, 7388),
  show("lux-5-4ct", "attention.", 7448, 7826),
  show("lux-6-1", "Own", 8386, 8556),
  show("lux-6-2", "the", 8616, 8786),
  show("lux-6-3", "whole", 8846, 9056),
  show("lux-6-4f", "frame.", 9116, 9326, true),
  show("lux-7-1", "Style", 9886, 10096),
  show("lux-7-2", "bends", 10156, 10366, true),
  show("lux-7-3", "every", 10426, 10636),
  show("lux-7-4e", "rule.", 10696, 10866),
];

export const luxeShowcaseSource: LuxeSource = {
  transcript: SHOWCASE_TRANSCRIPT,
  durationMs: 11100,
  background: { src: "why_not_you_hq.mp4", kind: "video", muted: true, volume: 1 },
  designSeed: "luxe-premium",
};

/** Card poster frame: the settled cue 1 rests over the ~1s podium moment. */
export const LUXE_PREVIEW_STILL_FRAME = 30;
/** ceil(11100 ms * 30 fps / 1000) — what resolveLuxeMetadata resolves for the showcase. */
export const LUXE_PREVIEW_FRAMES = 333;

const MIN_WORD_MS = 140;
const bare = (text: string) => text.replace(/[^\p{L}\p{M}\p{N}']/gu, "");
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const entryNumber = (entry: Record<string, unknown> | undefined, ...keys: string[]) => {
  if (!entry) return NaN;
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return NaN;
};
const firstFinite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

/** The editor adapter emits one transcript entry per phrase ("lead hero trail"
 *  as a single string), but Luxe scores, casts and staggers words individually —
 *  heroes, duet/rail pairings and sentence flow are all word-level decisions.
 *  Cue-shaped entries are therefore split back into word entries with timing
 *  proportional to each word's length; every unaffected entry is passed through
 *  untouched so curated word-level sources keep their exact identity. */
export const expandLuxeWords = (source: unknown): LuxeSource => {
  const input = (source as LuxeSource | undefined)?.transcript;
  if (!Array.isArray(input)) return source as LuxeSource;
  let split = false;
  const entries = input.flatMap((entry, index): unknown[] => {
    const raw = record(entry) ? entry : undefined;
    const text = typeof raw?.text === "string" ? raw.text.trim().replace(/\s+/gu, " ") : "";
    const startMs = firstFinite(entryNumber(raw, "startMs", "start_ms"),
      entryNumber(raw, "start", "start_time") * 1000);
    const endMs = firstFinite(entryNumber(raw, "endMs", "end_ms"),
      entryNumber(raw, "end", "end_time") * 1000);
    // Whole entries stay exactly as supplied: word-level data, invalid timing
    // (diagnosed downstream) and non-string text need no shaping.
    if (!raw || !text || !/\s/u.test(text) ||
      !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [entry];
    split = true;
    const tokens = text.split(" ");
    const weights = tokens.map(token => Math.max(1, bare(token).length || 1));
    const span = endMs - startMs;
    const weightsTotal = weights.reduce((total, weight) => total + weight, 0);
    const durations = weights.map(weight =>
      Math.max(MIN_WORD_MS, Math.round(span * weight / weightsTotal)));
    const durationTotal = durations.reduce((total, duration) => total + duration, 0);
    // A span too short to honor the minimum for every word scales down, so the
    // split words stay inside the phrase they came from.
    const scale = durationTotal > span ? span / durationTotal : 1;
    const baseId = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `w${index}`;
    let cursor = startMs;
    return tokens.map((token, position) => {
      const piece: LuxeEntry = {
        id: `${baseId}:${position + 1}`,
        text: token,
        startMs: cursor,
        endMs: position === tokens.length - 1
          ? endMs
          : cursor + Math.max(1, Math.round(durations[position] * scale)),
      };
      cursor = piece.endMs;
      if (raw.pageBreakAfter === true && position === tokens.length - 1) piece.pageBreakAfter = true;
      return piece;
    });
  });
  // Pass the original object through unchanged when nothing was split, so
  // identity-stable sources never invalidate downstream memoisation.
  if (!split) return source as LuxeSource;
  return { ...(source as LuxeSource), transcript: entries };
};
