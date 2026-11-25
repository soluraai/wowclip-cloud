import { useEffect, useMemo, useState } from "react";
import { getRemotionEnvironment, staticFile, useDelayRender } from "remotion";
import { fontRole, roleFace, scriptsIn, SCRIPTS, type FontRole, type ScriptInfo } from "./scripts";
import { fontNameOf } from "./fontNames";

/**
 * Gives every font on the page a face for the scripts in the captions, so any template draws Hindi, Tamil,
 * Bengali and the rest without code of its own. For each loaded face of a family that lacks the script, a
 * face for the script is added under the same family name, weight and style, limited to the script's
 * characters (unicode-range). Latin letters keep the template's font; the script's letters come from a face
 * picked for the font's role (cursive for a cursive helper, condensed for Anton, Poppins for heavy display
 * type), scaled (size-adjust) so they read at the same size as the template's Latin letters.
 * Families that already draw the script (Mukta, Poppins Devanagari) are left alone.
 * English captions never reach any of this.
 */
const ours = new WeakSet<FontFace>();

/**
 * Each face's source, kept as faces are made. Chrome picks ONE group of faces per family by the weight range
 * written on them, and only then by unicode-range: a script face over "100 550" next to the template's Latin
 * face over "100 900" made English words in a Hindi line fall back to the browser's default font. So where a
 * script face takes part of a weight range, the Latin face is added again over that same part (see pairFaces).
 */
type FontSource = ConstructorParameters<typeof FontFace>[1];
const store = globalThis as { __capiyoFontSources?: WeakMap<FontFace, FontSource>; __capiyoFontFaceWrapped?: boolean };
const sources = (store.__capiyoFontSources ??= new WeakMap<FontFace, FontSource>());
if (typeof FontFace !== "undefined" && !store.__capiyoFontFaceWrapped) {
  store.__capiyoFontFaceWrapped = true;
  const Native = FontFace;
  const Wrapped = function (family: string, source: FontSource, descriptors?: FontFaceDescriptors) {
    const face = new Native(family, source, descriptors);
    sources.set(face, source);
    return face;
  } as unknown as typeof FontFace;
  Wrapped.prototype = Native.prototype;
  (globalThis as { FontFace: typeof FontFace }).FontFace = Wrapped;
}
const done = new Set<string>();
const probes = new Map<string, Promise<boolean>>();
const PROBE = "__capiyo_probe_";
const NATIVE = "__capiyo_native_";

const src = (path: string) => `url(${JSON.stringify(staticFile(path))})`;

/** Loads a file under a family of its own, for measuring. Cached per file. */
function probeFile(path: string, family: string, descriptors: FontFaceDescriptors = {}) {
  const key = `${family}|${path}`;
  let ready = probes.get(key);
  if (!ready) {
    const face = new FontFace(family, src(path), descriptors);
    ours.add(face);
    document.fonts.add(face);
    ready = face.load().then(() => true, () => false);
    probes.set(key, ready);
  }
  return ready;
}

/** Two copies of the script's sans face, one drawn at half size. A font that draws the script itself measures the same over both. */
const probe = (script: ScriptInfo) => Promise.all([
  probeFile(script.sans, `${PROBE}${script.id}_a`),
  probeFile(script.sans, `${PROBE}${script.id}_b`, { sizeAdjust: "50%" } as FontFaceDescriptors),
]).then((loaded) => loaded.every(Boolean));

const nativeFamily = (path: string) => `${NATIVE}${path.replace(/[^a-z0-9]/gi, "_")}`;

let canvas: CanvasRenderingContext2D | null = null;
const context = () => (canvas ??= document.createElement("canvas").getContext("2d"));
/** A face's family as CSS reads it: some templates register names wrapped in quotes. */
const familyOf = (face: FontFace) => face.family.trim().replace(/^(["'])(.*)\1$/, "$2");
const firstWeight = (weight: string) => Number.parseFloat(weight) || 400;
/** "100 900" → [100, 900]; "700" → [700, 700]; "bold" → [700, 700]. */
const weightRange = (weight: string): [number, number] => {
  const [a, b] = weight.trim().split(/\s+/).map((part) => part === "bold" ? 700 : Number.parseFloat(part) || 400);
  return [a, b ?? a];
};
/** The metric descriptors a face was made with (size-adjust and the line overrides), where it set any. */
const overridesOf = (face: FontFace) => {
  const own = face as unknown as Record<string, unknown>;
  return Object.fromEntries(["sizeAdjust", "ascentOverride", "descentOverride", "lineGapOverride"]
    .filter((key) => typeof own[key] === "string" && own[key] !== "100%" && own[key] !== "normal").map((key) => [key, own[key]])) as FontFaceDescriptors;
};
const styleOf = (style: string) => (/italic|oblique/.test(style) ? "italic" : "normal");

function drawsScript(face: FontFace, script: ScriptInfo) {
  const ctx = context();
  if (!ctx) return false;
  const width = (fallback: string) => {
    ctx.font = `${styleOf(face.style)} ${firstWeight(face.weight)} 48px ${JSON.stringify(familyOf(face))}, "${PROBE}${script.id}_${fallback}"`;
    return ctx.measureText(script.sample).width;
  };
  return Math.abs(width("a") - width("b")) < 0.5;
}

/** The Latin letters' size (x-height, or most of the cap height for cursive fonts with tiny x-heights) and width, in em. */
function latinMetrics(face: FontFace, weight: number) {
  const ctx = context();
  if (!ctx) return { size: 0.55, width: 0.55 };
  ctx.font = `${styleOf(face.style)} ${weight} 100px ${JSON.stringify(familyOf(face))}`;
  const x = ctx.measureText("x").actualBoundingBoxAscent / 100;
  const cap = ctx.measureText("H").actualBoundingBoxAscent / 100;
  const width = ctx.measureText("abcdefghijklmnopqrstuvwxyz").width / 2600;
  return { size: Math.max(x, cap * 0.62) || 0.55, width };
}

/** Height of the script's plain letter (to the headline in Devanagari and Bengali), in em. */
function nativeHeight(path: string, script: ScriptInfo) {
  const ctx = context();
  if (!ctx) return 0.63;
  ctx.font = `400 100px ${JSON.stringify(nativeFamily(path))}`;
  const box = ctx.measureText(script.sample.slice(0, 1));
  return (box.actualBoundingBoxAscent + Math.max(0, box.actualBoundingBoxDescent)) / 100 || 0.63;
}

/** Width per letter (grapheme) of the script's sample in a native face, in em. */
function nativeWidth(path: string, script: ScriptInfo) {
  const ctx = context();
  if (!ctx) return 0.7;
  ctx.font = `400 100px ${JSON.stringify(nativeFamily(path))}`;
  const letters = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(script.sample)].length
    : script.sample.length;
  return ctx.measureText(script.sample).width / 100 / Math.max(1, letters) || 0.7;
}

/**
 * Hindi is the reference, matched to the English x-height. Every other script is sized so its letters cover
 * the same area as Hindi's (height x width of the same word "kamalin"): Tamil and Malayalam letters are short
 * and wide, Kannada and Telugu tall, so matching height alone made Tamil ~10% bigger and Kannada ~20%
 * smaller than Hindi. Measured from the actual font files, so any face added later follows on its own.
 */
const DEVA = SCRIPTS.find((script) => script.id === "deva")!;
async function scriptAdjust(file: string, script: ScriptInfo, latinSize: number) {
  const height = nativeHeight(file, script);
  if (script.id === "deva" || !(await probeFile(DEVA.sans, nativeFamily(DEVA.sans)))) return latinSize * SCRIPT_TO_X / height;
  const refHeight = nativeHeight(DEVA.sans, DEVA), refWidth = nativeWidth(DEVA.sans, DEVA);
  const width = nativeWidth(file, script);
  return latinSize * SCRIPT_TO_X / refHeight * Math.sqrt((refHeight * refWidth) / (height * width));
}

/**
 * The script's letters drawn this much taller than the Latin x-height. Poppins, drawn by one team for both
 * scripts, sets Devanagari at 1.3×; Noto at 1.18×. 1.2 keeps Hindi as readable as the English beside it.
 */
const SCRIPT_TO_X = 1.2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Per role, on top of the size match. Text faces (helper lines, small plain text) go a bit bigger: Indian
 * scripts carry more detail per letter, so at helper sizes ("आहे" over a main word) they read far smaller
 * than English at the same height. Headline and cursive faces stay matched: shrinking one against the other
 * made a native main word look smaller than its script line.
 */
const ROLE_SIZE: Partial<Record<FontRole, number>> = { sans: 1.15, serif: 1.05 };

/**
 * A font with its own letters for the script, drawn much bigger than its English (Poppins sets Devanagari at
 * 1.3× and Black weights tower as a main word). Those get our faces over the script, sized like every other.
 */
function drawsTooBig(face: FontFace, name: string, script: ScriptInfo) {
  const ctx = context();
  if (!ctx) return false;
  const weight = clamp(400, ...weightRange(face.weight));
  const latin = latinMetrics(face, weight);
  ctx.font = `${styleOf(face.style)} ${weight} 100px ${JSON.stringify(familyOf(face))}`;
  const box = ctx.measureText(script.sample.slice(0, 1));
  const own = (box.actualBoundingBoxAscent + Math.max(0, box.actualBoundingBoxDescent)) / 100;
  const target = latin.size * SCRIPT_TO_X * (ROLE_SIZE[fontRole(name, weight, latin.width)] ?? 1);
  return own > target * 1.15;
}

type Plan = { role: FontRole; file: string; from: number; to: number };

/**
 * The script faces for one template face, each over part of its weight range. A static face gets one; a
 * variable sans ("100 900") gets its light weights from the sans face and its heavy ones from display faces,
 * since the same family is used at 400 for helper text and at 900 for a main word.
 */
function plansFor(script: ScriptInfo, name: string, face: FontFace): Plan[] {
  const [lo, hi] = weightRange(face.weight);
  const italic = styleOf(face.style) === "italic";
  const middle = clamp(400, lo, hi);
  const named = fontRole(name, middle, latinMetrics(face, middle).width);
  // A static medium/bold sans face takes the script's display face from `boldFrom` (Tamil's Noto was thin).
  const single = (role: FontRole): FontRole => role === "sans" && script.boldFrom && lo >= script.boldFrom && script.roles?.display ? "display" : role;
  const spans: [FontRole, number, number][] = lo === hi ? [[single(fontRole(name, lo, latinMetrics(face, lo).width)), lo, hi]]
    : named === "sans" || named === "display" ? [["sans", lo, Math.min(hi, (script.boldFrom ?? 650) - 1)], ["display", Math.max(lo, script.boldFrom ?? 650), hi]]
    : [[named, lo, hi]];
  return spans.filter(([, from, to]) => from <= to).flatMap(([role, from, to]) => {
    const files = (script.roles?.[role] ?? []).filter((option) => !!option.italic === italic);
    if (files.length < 2) return [{ role, file: roleFace(script, role, Math.round((from + to) / 2), italic).file, from, to }];
    // Several weights of the face: each takes the part of the range nearest to it.
    const sorted = [...files].sort((a, b) => a.weight - b.weight);
    return sorted.map((option, i) => ({ role, file: option.file,
      from: i ? Math.max(from, Math.floor((sorted[i - 1].weight + option.weight) / 2) + 1) : from,
      to: i < sorted.length - 1 ? Math.min(to, Math.floor((option.weight + sorted[i + 1].weight) / 2)) : to }))
      .filter((plan) => plan.from <= plan.to);
  });
}

/** Adds the missing script faces for the fonts loaded so far. Returns the faces it added. */
async function pairFaces(scripts: ScriptInfo[]) {
  const added: FontFace[] = [];
  const all = [...document.fonts] as FontFace[];
  for (const script of scripts) {
    // A family split into ranges (Google's CSS) that has its own slice for this script draws it already.
    const covered = new Set(all.filter((face) => !ours.has(face) && !wholeRange(face.unicodeRange) && overlaps(face.unicodeRange, script.range))
      .map(familyOf));
    for (const face of all) {
      const family = familyOf(face);
      if (ours.has(face) || face.status !== "loaded" || family.startsWith(PROBE) || family.startsWith(NATIVE) || covered.has(family)) continue;
      // Fonts only drawn in the editor's font list wait until picked (see app/src/fonts/runtime.ts).
      if ((globalThis as { __capiyoPickerFonts?: Set<string> }).__capiyoPickerFonts?.has(family)) continue;
      const key = [family, face.weight, face.style, face.stretch, script.id].join("|");
      if (done.has(key)) continue;
      done.add(key);
      const name = fontNameOf(family);
      if (drawsScript(face, script) && !drawsTooBig(face, name, script)) continue;
      const [lo, hi] = weightRange(face.weight);
      const source = sources.get(face);
      let plans = plansFor(script, name, face);
      // Without the Latin face's source, a split would cost the English words their font: one face over the whole range.
      if (!source && plans.some((plan) => plan.from !== lo || plan.to !== hi)) {
        const middle = clamp(400, lo, hi);
        plans = [{ ...(plans.find((plan) => plan.from <= middle && middle <= plan.to) ?? plans[0]), from: lo, to: hi }];
      }
      for (const plan of plans) {
        if (!(await probeFile(plan.file, nativeFamily(plan.file)))) continue;
        const weight = plan.from === plan.to ? `${plan.from}` : `${plan.from} ${plan.to}`;
        if (source && (plan.from !== lo || plan.to !== hi)) {
          // The template's own face again over just this part of the range, so Latin letters keep their font.
          const latin = new FontFace(family, source, { weight, style: face.style, stretch: face.stretch, unicodeRange: face.unicodeRange,
            featureSettings: face.featureSettings, ...overridesOf(face) });
          ours.add(latin);
          document.fonts.add(latin);
          added.push(latin);
        }
        const latin = latinMetrics(face, clamp(Math.round((plan.from + plan.to) / 2), plan.from, plan.to));
        const adjust = clamp(await scriptAdjust(plan.file, script, latin.size) * (ROLE_SIZE[plan.role] ?? 1), 0.6, 1.4);
        // For checking by hand: globalThis.__capiyoScriptFaces lists what each font was paired with.
        ((globalThis as { __capiyoScriptFaces?: unknown[] }).__capiyoScriptFaces ??= [])
          .push({ font: name, weight: `${plan.from}-${plan.to}`, role: plan.role, file: plan.file, adjust });
        const pair = new FontFace(family, src(plan.file), {
          weight, style: face.style, stretch: face.stretch,
          unicodeRange: script.range, sizeAdjust: `${(adjust * 100).toFixed(1)}%`,
        } as FontFaceDescriptors);
        ours.add(pair);
        document.fonts.add(pair);
        added.push(pair);
      }
    }
  }
  return added;
}

/** "U+0900-097F, U+0964" → [[0x900, 0x97f], [0x964, 0x964]] */
const ranges = (value: string) => value.split(",").map((part) => {
  const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
  const start = Number.parseInt(from.replace(/\?/g, "0"), 16);
  return [start, to ? Number.parseInt(to, 16) : Number.parseInt(from.replace(/\?/g, "f"), 16)] as const;
}).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end));
const overlaps = (a: string, b: string) => ranges(a).some(([s1, e1]) => ranges(b).some(([s2, e2]) => s1 <= e2 && s2 <= e1));
const wholeRange = (range: string) => ranges(range).some(([start, end]) => start === 0 && end >= 0x10ffff);


/**
 * Pairs the fonts of everything under it with the scripts found in `text`. Returns a number that goes up each
 * time new script faces are ready: templates measure their words once, so the caller remounts the template on
 * it and the words are measured again with the script faces in place.
 */
export function useScriptFonts(text: string) {
  const scripts = useMemo(() => scriptsIn(text), [text]);
  const key = scripts.map((script) => script.id).join(" ");
  const { delayRender, continueRender } = useDelayRender();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!scripts.length || typeof document === "undefined" || !document.fonts) return;
    let live = true;
    // Gradient text (background-clip: text) is painted only inside its box: vowel signs above and below a
    // line-height box got cut. Native captions grow every such box up and down without moving the layout.
    let ink = document.getElementById("capiyo-script-ink");
    const ownInk = !ink;
    if (!ink) {
      ink = document.createElement("style");
      ink.id = "capiyo-script-ink";
      ink.textContent = '[style*="background-clip: text"]{padding-top:.32em;padding-bottom:.28em;margin-top:-.32em;margin-bottom:-.28em}';
      document.head.appendChild(ink);
    }
    // Rendering waits until every font the template added is paired and loaded; the editor pairs as fonts arrive.
    const rendering = getRemotionEnvironment().isRendering;
    let handle = rendering ? delayRender(`Loading ${scripts.map((script) => script.name).join(", ")} fonts`, { timeoutInMilliseconds: 60_000 }) : null;
    let running: Promise<FontFace[]> = Promise.resolve([]);
    // One pass at a time, so two passes never pair the same face.
    const pair = () => (running = running.then(async () => {
      const usable = (await Promise.all(scripts.map(probe))).every(Boolean);
      if (!usable || !live) return [];
      const added = await pairFaces(scripts);
      await Promise.all(added.map((face) => face.load().catch(() => undefined)));
      if (added.length && live) setVersion((value) => value + 1);
      return added;
    }));
    // Templates add their fonts as they mount, already loaded (no font event fires), some after a fetch: watch
    // the font list and pair whatever arrives. A render waits until the list has been still for a moment.
    let seen = -1, seenPicked = 0, stillSince = Date.now(), busy = false;
    const started = Date.now();
    const tick = async () => {
      if (busy || !live) return;
      busy = true;
      try {
        const picked = (globalThis as { __capiyoPickerVersion?: number }).__capiyoPickerVersion ?? 0;
        if (document.fonts.size !== seen || picked !== seenPicked) {
          seen = document.fonts.size;
          seenPicked = picked;
          stillSince = Date.now();
          await pair();
        } else if (handle !== null && document.fonts.status === "loaded" && (Date.now() - stillSince > 600 || Date.now() - started > 20_000)) {
          continueRender(handle);
          handle = null;
        }
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), 120);
    void tick();
    return () => {
      live = false;
      clearInterval(timer);
      if (ownInk) ink?.remove();
      if (handle !== null) continueRender(handle);
    };
    // `scripts` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayRender, continueRender]);
  return { scripts, version };
}
