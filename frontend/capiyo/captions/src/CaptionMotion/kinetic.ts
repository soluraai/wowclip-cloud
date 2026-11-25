import type { Ink } from "../StyleOne/metrics";
import { helperInkCollision, type PocketEdge } from "../StyleOne/pockets";

export type GlyphSlice = { left: number; right: number };
export type KineticEntry = {
  kind: "slide" | "letters" | "wipe";
  x: number; y: number; blur: number; pace: number; stagger: number; reverse: boolean;
  left: number; right: number;
};
export type KineticItem = {
  key: string; text: string; x: number; baseline: number; ink: Ink; size: number;
  edge?: PocketEdge; locked?: boolean; slices: GlyphSlice[];
  /** The one direction this word enters from, shortened as far as its neighbours need. */
  path?: { x: number; y: number };
};

export const motionHash = (seed: string) => {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967296;
};

/** Mask copies of the complete shaped word; never rebuild it from isolated glyphs.
 * Joined scripts and calligraphic faces use whole-word reveals instead.
 */
export const kineticSlices = (text: string, ink: Ink, advance: (prefix: string) => number,
  allowLetters = true): GlyphSlice[] => {
  if (!allowLetters || text.length < 3 || text.length > 24 || !/^[A-Za-z0-9.,!?;:'"’“”()\-₹$%+ ]+$/.test(text)) return [];
  const slices: GlyphSlice[] = [];
  let left = ink.left - .5;
  for (let index = 1; index <= text.length; index++) {
    const right = index === text.length ? ink.right + .5 : Math.max(left, Math.min(ink.right, advance(text.slice(0, index))));
    if (right > left) slices.push({ left, right });
    left = right;
  }
  return slices;
};

const samples = (entry: Pick<KineticEntry, "x" | "y">) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(entry.x, entry.y) / .75));
  return Array.from({ length: steps + 1 }, (_, index) => ({ x: entry.x * index / steps, y: entry.y * index / steps }));
};

/** Plan once after fitting. Audit the full entrance envelope, including earlier
 * moving words, so seeded variety cannot send a helper through another letter.
 */
export const planKineticEntries = (items: KineticItem[], seed: string, randomize = true,
  canvas?: { width: number; height: number }): Map<string, KineticEntry> => {
  const chosen = new Map<string, KineticEntry>();
  const paths = new Map<string, { x: number; y: number }[]>();
  // Anchor large words first; helpers then use the remaining free paths.
  const ordered = [...items].sort((a, b) => Number(!!b.locked) - Number(!!a.locked) || b.size - a.size);
  for (const item of ordered) {
    const roll = (salt: string) => randomize ? motionHash(`${seed}:${item.key}:${salt}`) : .2;
    const kind: KineticEntry["kind"] = item.path ? item.path.x ? "letters" : "slide" :
      item.slices.length && roll("treatment") < .48 ? "letters" : roll("treatment") > .76 || item.locked ? "wipe" : "slide";
    const entry: KineticEntry = { kind, x: 0, y: 0, blur: 2.2 + roll("focus") * 2.2,
      pace: .82 + roll("pace") * .32, stagger: .25 + roll("stagger") * .2,
      reverse: item.path ? item.path.x < 0 : roll("sweep") > .62, left: item.ink.left - .5, right: item.ink.right + .5 };
    const vectors = [[0, 1], [0, -1], [-1, 0], [1, 0], [-.65, .76], [.65, .76], [-.65, -.76], [.65, -.76]];
    const freeSide = (x: number, y: number) => item.edge === "above" ? y <= 0 : item.edge === "below" ? y >= 0 :
      item.edge === "left" ? x <= 0 : item.edge === "right" ? x >= 0 : true;
    vectors.sort((a, b) => Number(!freeSide(a[0], a[1])) - Number(!freeSide(b[0], b[1])) ||
      (randomize ? motionHash(`${seed}:${item.key}:${a}`) - motionHash(`${seed}:${item.key}:${b}`) : b[1] - a[1]));
    const travel = Math.min(item.size * .28, item.ink.cap * .4, 16);
    const safe = (candidate: { x: number; y: number }) => {
      const positions = samples(candidate);
      return positions.every(position => {
        const x = item.x + position.x, baseline = item.baseline + position.y;
        if (canvas && (x < 1 || x + item.ink.width > canvas.width - 1 ||
            baseline + item.ink.top < 1 || baseline + item.ink.bottom > canvas.height - 1)) return false;
        return items.every(other => other === item || (paths.get(other.key) ?? [{ x: 0, y: 0 }]).every(offset => {
          const obstacle = { x: other.x + offset.x, width: other.ink.width,
            baseline: other.baseline + offset.y, ink: other.ink,
            top: other.baseline + offset.y + other.ink.top, bottom: other.baseline + offset.y + other.ink.bottom };
          return !helperInkCollision(item.ink, x, baseline, obstacle, 1.1) &&
            !helperInkCollision(other.ink, obstacle.x, obstacle.baseline, { x, width: item.ink.width, baseline,
              ink: item.ink, top: baseline + item.ink.top, bottom: baseline + item.ink.bottom }, 1.1);
        }));
      });
    };
    if (item.path) {
      const candidate = [1, .7, .45, .25, .12].map(amount => ({ x: item.path!.x * amount, y: item.path!.y * amount })).find(safe);
      if (candidate) Object.assign(entry, candidate);
    } else if (!item.locked) {
      let found = false;
      for (const amount of [1, .55, .25]) {
        for (const [x, y] of vectors) {
          const candidate = { x: x * travel * amount, y: y * travel * amount };
          if (safe(candidate)) { Object.assign(entry, candidate); found = true; break; }
        }
        if (found) break;
      }
    }
    // A genuinely sealed pocket still gets a directional reveal, without displacement.
    if (!entry.x && !entry.y && entry.kind === "slide" && !item.path) entry.kind = item.slices.length ? "letters" : "wipe";
    chosen.set(item.key, entry); paths.set(item.key, samples(entry));
  }
  return chosen;
};

export const kineticDuration = (available: number, requested: number, fps: number, pace = 1) => {
  if (Math.ceil(available * fps / 1000) <= 3) return 0;
  return Math.min(requested * pace, available * .56);
};
export const kineticPhase = (elapsed: number, duration: number, index = 0, count = 1, stagger = 0) => {
  if (elapsed < 0) return { progress: 0, opacity: 0, remaining: 1 };
  const spread = count > 1 ? duration * stagger : 0;
  const delay = count > 1 ? spread * index / (count - 1) : 0;
  const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, (elapsed - delay) / Math.max(.001, duration - spread)));
  const progress = 1 - (1 - t) ** 3;
  const alpha = Math.min(1, t / .22);
  return { progress, opacity: alpha * alpha * (3 - 2 * alpha), remaining: 1 - progress };
};
