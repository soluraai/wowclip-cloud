import type { CaptionCue } from "../CaptionEngine/types";
import { kineticSlices, planKineticEntries } from "../CaptionMotion/kinetic";
import type { StyleOneConfig } from "./config";
import type { PlacedFragment } from "./layout";
import { measureInk } from "./metrics";

export const prepareStyleOneEntries = (fragments: PlacedFragment[], cue: CaptionCue,
  config: StyleOneConfig, width: number, height: number): PlacedFragment[] => {
  const hasHelpers = fragments.some(fragment => fragment.role === "helper" || fragment.role === "soft");
  const items = fragments.flatMap(fragment => fragment.tokens.map(token => {
    const ink = measureInk(token.text, fragment.font, token.size, fragment.tracking, true);
    return { key: token.key, text: token.text, x: token.x + ink.left, baseline: fragment.baseline,
      ink, size: token.size, edge: fragment.pocketEdge,
      // Every word rises from below, so the line builds upward one word at a time.
      path: { x: 0, y: fragment.role === "hero" ? Math.min(token.size * .3, 44) : Math.min(token.size * .62, 30) },
      locked: fragment.role === "hero" && hasHelpers,
      slices: kineticSlices(token.text, ink, prefix => measureInk(prefix, fragment.font, token.size, fragment.tracking).advance,
        fragment.font.style !== "italic"),
    };
  }));
  const plans = planKineticEntries(items, `${config.motion.seed}:${cue.id}`, config.motion.randomize, { width, height });
  const slices = new Map(items.map(item => [item.key, item.slices]));
  return fragments.map(fragment => ({ ...fragment, tokens: fragment.tokens.map(token => {
    const entry = plans.get(token.key);
    return { ...token, slices: slices.get(token.key),
      entry: entry && { ...entry, blur: Math.max(entry.blur, Math.min(token.size * .14, 11) * config.motion.blurScale) } };
  }) }));
};
