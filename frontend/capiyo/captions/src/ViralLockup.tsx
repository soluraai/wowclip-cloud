import { NO_SPACING, useSpacing, type PartSpacing } from "./Premium/sizes";
import { MotionWord } from "./Standard/MotionWord";
import { CueMotionContext, useCueMotion } from "./BasicCaption/cueMotion";
import { chosenEntrance, gradientLine, usePartFonts, usePartSizes, type PartFace, partCase, type PremiumParts } from "./Premium/parts";
import { NO_SIZES, SAFE_WIDTH, sizeOf, type PartSizes } from "./Premium/sizes";
import { evenSizeCap } from "./CaptionEngine/evenSize";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { normalizeWords, activeCue } from "./LaunchCaptionPack/timeline";
import type { CaptionSource, Word } from "./LaunchCaptionPack/types";
import type { BasicCaptionPresentation } from "./BasicCaption/BasicCaptionRenderer";
import { SourceVideo } from "./SourceVideo";

export type ViralLockupProps = {
  variant?: "og" | "maroon-king"; sourceConfig?: CaptionSource;
  styleConfig?: { positionX?: number; positionY?: number; maxWidth?: number; fontSize?: number; naturalWrap?: boolean };
  presentationConfig?: BasicCaptionPresentation;
};
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 4;
const fonts = [
  ["Viral Display", "launch-caption-pack/fonts/legacy/poppins-black.ttf", "900"],
  ["Viral Sans", "style-two/fonts/instrument-sans-variable.ttf", "100 900"],
  ["Viral Script", "muse-script/GreatVibes-Regular.ttf", "400"],
  ["Viral Cursive", "muse-script/Yellowtail-Regular.ttf", "400"],
  ["Viral Hindi", "editorial-type/fonts/noto-sans-devanagari.ttf", "100 900"],
] as const;
let fontPromise: Promise<unknown> | undefined;
const loadFonts = () => fontPromise ??= Promise.all(fonts.map(async ([family, path, weight]) => {
  const face = await new FontFace(family, `url(${JSON.stringify(staticFile(path))})`, { weight }).load();
  document.fonts.add(face);
})).catch(error => { fontPromise = undefined; throw error; });
const stop = new Set("a an the and or of to for in is how this your you it go make".split(" "));
const rank = (w: Word) => (w.emphasis ? 100 : 0) + (stop.has(w.text.toLowerCase()) ? -20 : 0) + w.text.length;
export const groupViralWords = (words: Word[]) => {
  const groups: Word[][] = [];
  for (const word of words) {
    const row = groups[groups.length - 1]; const previous = row?.[row.length - 1];
    if (!row || (previous && (previous.pageBreakAfter || /[.!?]$/.test(previous.text) ||
      word.startMs - previous.endMs > 380 || row.length >= 6 || [...row, word].map(item => item.text).join(" ").length > 32 ||
      word.endMs - row[0].startMs > 3400))) groups.push([word]);
    else row.push(word);
  }
  return groups;
};
type Run = { word: Word; text: string; x: number; y: number; size: number; family: string; weight: number; italic: boolean; role: "hero" | "top" | "script"; stretch: number };
type LockupFaces = { main?: PartFace; helper?: PartFace; script?: PartFace };
type Page = { id: string; words: Word[]; startMs: number; endMs: number; runs: Run[]; height: number; heroFit: number; scriptFit: number };
const layout = (words: Word[], ctx: CanvasRenderingContext2D, variant: "og" | "maroon-king", maxWidth: number, requestedSize: number, faces: LockupFaces, heroCap = 1, scriptCap = 1, sizes: PartSizes = NO_SIZES, extra: PartSpacing = NO_SPACING, parts?: PremiumParts) => {
  // Text case and word gap picked for each part; the headline is capitals by design.
  const caseOf = (role: Run["role"], text: string) => partCase(text, parts?.[role === "hero" ? "main" : role === "top" ? "helper" : "script"]?.textCase,
    role === "hero" ? (t) => t.toUpperCase() : undefined);
  const gapOf = (role: Run["role"]) => parts?.[role === "hero" ? "main" : role === "top" ? "helper" : "script"]?.wordGap ?? 0;
  let current = extra.main;
  const groups = groupViralWords(words);
  const box = Math.max(maxWidth, Math.min(720 * SAFE_WIDTH, maxWidth * sizes.main));
  return groups.map((group, index): Page => {
    let heroIndex = group.reduce((best, word, i) => rank(word) > rank(group[best]) ? i : best, 0);
    // The reference's two-word headline is a deliberate semantic unit.
    const you = group.findIndex(w => w.text.toLowerCase() === "you");
    const doubleHero = variant === "maroon-king" && you >= 0 && group[you + 1]?.text.toLowerCase() === "go";
    if (doubleHero) heroIndex = you;
    const heroes = group.slice(heroIndex, heroIndex + (doubleHero ? 2 : 1));
    const before = group.slice(0, heroIndex);
    const after = group.slice(heroIndex + heroes.length);
    const top = variant === "og" ? [] : before;
    const script = variant === "og" ? [...before, ...after] : after;
    const mode = variant === "og" ? 0 : index % 3;
    const runs: Run[] = [];
    let heroFit = 1, scriptFit = 1;
    const measure =(text: string, size: number, family: string, weight: number, italic = false) => {
      ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`; ctx.letterSpacing = `${size * current}px`;
      return ctx.measureText(text);
    };
    const row = (entries: Word[], role: Run["role"], baseSize: number, y: number, align: number) => {
      current = role === "hero" ? extra.main : role === "top" ? extra.helper : extra.script;
      if (!entries.length) return { width: 0, height: 0 };
      const face = role === "hero" ? faces.main : role === "top" ? faces.helper : faces.script;
      const family = face?.family ?? (role === "hero" ? "Viral Display" : role === "top" ? "Viral Sans" : variant === "og" ? "Viral Cursive" : "Viral Script");
      const weight = face?.weight ?? (role === "hero" ? 900 : 400);
      const italic = face?.italic === true;
      const texts = entries.map(w => caseOf(role, w.text));
      const scaled = entries.map(w => baseSize * sizeOf(sizes, role === "hero" ? "main" : role === "top" ? "helper" : "script", w.id));
      const widths = texts.map((t, i) => measure(t, scaled[i], family, weight, italic).width);
      const gap = baseSize * ((role === "script" ? .19 : .23) + gapOf(role));
      const natural = widths.reduce((a, b) => a + b, 0) + gap * (entries.length - 1);
      const room = Math.min(1, (role === "hero" ? box : maxWidth) / Math.max(1, natural));
      if (role === "hero") heroFit = room;
      if (role === "script") scriptFit = Math.min(scriptFit, room);
      const scale = Math.min(room, role === "hero" ? heroCap : role === "script" ? scriptCap : 1);
      const total = natural * scale;
      let x = -total * align;
      entries.forEach((word, i) => {
        runs.push({ word, text: texts[i], x, y, size: scaled[i] * scale,
          family, weight, italic, role,
          stretch: role === "hero" && variant === "maroon-king" ? 1.2 : 1 });
        x += (widths[i] + gap) * scale;
      });
      return { width: total, height: Math.max(...scaled) * scale };
    };
    const hero = row(heroes, "hero", requestedSize * (variant === "maroon-king" ? 1.1 : 1), 0, .5);
    // Indian, Arabic and Thai letters carry more detail than English ones: at the small top-line size they
    // don't read, so a top line in those scripts is drawn larger.
    // Smart Mix (English main word, native helpers) gets a smaller lift so the main word stays big.
    const native = (entries: Word[]) => entries.some(w => /[؀-ۿऀ-෿฀-๿]/.test(w.text));
    const nativeHero = native(heroes);
    const detailed = native(top);
    const topRow = row(top, "top", requestedSize * (detailed ? (nativeHero ? .38 : .31) : .27), -hero.height * .91,
      mode === 1 ? 0 : mode === 2 ? 1 : .5);
    // The same scripts' cursive faces read far bigger than Great Vibes' small English letters: a smaller line
    // keeps the main word the biggest thing (OG's line is small already).
    // Next to an English main word (Smart Mix) the native line keeps the full size, or it reads tiny.
    const detailedScript = variant !== "og" && nativeHero && native(script);
    const scriptSize = requestedSize * (variant === "og" ? .62 : detailedScript ? .56 : .72);
    // A script line too long for the box runs on two rows at its full size.
    const scriptWidth = (entries: Word[]) => {
      const family = faces.script?.family ?? (variant === "og" ? "Viral Cursive" : "Viral Script");
      return entries.reduce((sum, word) => sum + measure(caseOf("script", word.text), scriptSize, family, faces.script?.weight ?? 400, faces.script?.italic === true).width, 0) + scriptSize * (.19 + gapOf("script")) * (entries.length - 1);
    };
    let scriptBreak = 0;
    if (script.length > 1 && scriptWidth(script) > maxWidth) {
      let best = Infinity;
      for (let at = 1; at < script.length; at++) {
        const worst = Math.max(scriptWidth(script.slice(0, at)), scriptWidth(script.slice(at)));
        if (worst < best) { best = worst; scriptBreak = at; }
      }
    }
    // OG centers its script line on the headline, so the lockup reads balanced inside its box.
    const og = variant === "og";
    const scriptAlign = og || mode === 1 ? .5 : mode === 2 ? 0 : 1;
    const scriptY = hero.height * (og ? .2 : .27);
    const scriptRow = row(scriptBreak ? script.slice(0, scriptBreak) : script, "script", scriptSize, scriptY, scriptAlign);
    const secondRow = scriptBreak ? row(script.slice(scriptBreak), "script", scriptSize, scriptY + scriptRow.height * .92, scriptAlign) : undefined;
    for (const run of runs) {
      if (run.role === "top" && mode !== 0) run.x += mode === 1 ? -hero.width / 2 : hero.width / 2;
      if (run.role === "script" && !og) run.x += mode === 2 ? -hero.width * .43 : mode === 0 ? hero.width * .47 : 0;
    }
    // Fit the complete composition once; subsequent word arrivals never move it.
    const left = Math.min(...runs.map(r => r.x - r.size * .12));
    const right = Math.max(...runs.map(r => r.x + measure(r.text, r.size, r.family, r.weight, r.italic).width + r.size * .12));
    // OG's words already hold one size across the video, so its pages aren't refitted one by one.
    const fit = variant === "og" ? 1 : Math.min(1, box / Math.max(1, right - left));
    const upper = -hero.height * .9 - topRow.height;
    const lower = scriptY + (secondRow ? scriptRow.height * .92 + secondRow.height * .28 : scriptRow.height * .28);
    const centerY = (upper + lower) / 2;
    return { id: group[0].id, words: group, startMs: group[0].startMs,
      endMs: Math.min(Math.max(...group.map(w => w.endMs)) + 180, groups[index + 1]?.[0].startMs ?? Infinity),
      height: (lower - upper) * fit, heroFit, scriptFit,
      runs: runs.map(r => ({ ...r, x: (r.x - (left + right) / 2) * fit, y: (r.y - centerY) * fit, size: r.size * fit })) };
  });
};

export const ViralLockup: React.FC<ViralLockupProps> = ({ variant = "og", sourceConfig = { transcript: [] }, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps, unit = width / 720;
  const words = useMemo(() => normalizeWords(sourceConfig).words, [sourceConfig]);
  const [ready, setReady] = useState(false);
  const parts = presentationConfig?.parts;
  const { faces, ready: facesReady } = usePartFonts(parts);
  const sizes = usePartSizes(presentationConfig);
  const motion = useContext(CueMotionContext)?.animation;
  const uid = `lockup-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; const handle = delayRender("Loading reference lockup fonts");
    void loadFonts().then(() => { if (!disposed) setReady(true); }).catch(cancelRender).finally(() => continueRender(handle));
    return () => { disposed = true; continueRender(handle); };
  }, [delayRender, continueRender, cancelRender]);
  // Spacing picked in the editor, as a share of each word's size.
  const tracking = useSpacing(presentationConfig);
  const pages = useMemo(() => {
    if (!ready || !facesReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Reference lockups require text measurement.");
    const lay = (heroCap: number, scriptCap: number, own: PartSizes) => layout(words, ctx, variant, 720 * (styleConfig?.maxWidth ?? .76),
      styleConfig?.fontSize ?? (variant === "og" ? 96 : 112), faces, heroCap, scriptCap, own, tracking, parts);
    const natural = lay(1, 1, NO_SIZES);
    // Every headline is one size, set by the widest; the script never outgrows it.
    const heroCap = Math.min(1, ...natural.map(page => page.heroFit));
    return lay(heroCap, Math.min(heroCap, evenSizeCap(natural.map(page => page.scriptFit))), sizes);
  }, [ready, facesReady, faces, sizes, words, variant, styleConfig, tracking, parts]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (pages.length) onLayout?.((Math.max(...pages.map(p => p.height)) + 28) * unit); }, [pages, onLayout, unit]);
  const page = activeCue(pages, now);
  useCueMotion(page?.startMs, page?.endMs);
  const settled = styleConfig?.naturalWrap || presentationConfig?.reducedMotion;
  const heroGradient = parts?.main?.gradient, gradientEnds = heroGradient && gradientLine(heroGradient.angle);
  const background = sourceConfig.background;
  const backgroundSrc = background?.src ? /^(https?:|data:|blob:|\/)/i.test(background.src)
    ? background.src : staticFile(background.src) : undefined;
  return <AbsoluteFill style={{ background: presentationConfig?.backgroundColor ?? "transparent", overflow: "hidden", pointerEvents: "none" }}>
    {backgroundSrc && (background?.kind === "image" ? <Img src={backgroundSrc}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <SourceVideo src={backgroundSrc}
      muted={background?.muted ?? false} volume={background?.volume ?? 1}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />)}
    <svg width={width} height={height} viewBox={`0 0 720 ${height / unit}`} aria-label={page?.words.map(w => w.text).join(" ")}
      style={{ position: "absolute", inset: 0, display: "block" }}>
      {heroGradient ? <defs><linearGradient id={`${uid}-hero`} {...gradientEnds}>
        {heroGradient.stops.map((stop, index) => <stop key={index} offset={stop.position / 100} stopColor={stop.color} />)}
      </linearGradient></defs> : null}
      <g transform={`translate(${720 * (styleConfig?.positionX ?? .5)} ${height / unit * (styleConfig?.positionY ?? .7)})`}>
        {/* The headline sits behind; the script and top line are drawn over it. */}
        {page && [...page.runs.filter(run => run.role === "hero"), ...page.runs.filter(run => run.role !== "hero")].map(run => {
          const age = now - run.word.startMs;
          if (!settled && age < 0) return null;
          const hero = run.role === "hero";
          const p = settled || chosenEntrance(motion, hero, run.word.id) ? 1 : ease(age / 240);
          const dx = run.role === "hero" ? (1 - p) * -36 : 0;
          const dy = run.role === "hero" ? 0 : (1 - p) * (run.role === "top" ? -20 : 22);
          return <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size} main={hero}><g data-viral-word={run.word.id} data-viral-role={run.role}
            transform={`translate(${run.x + dx} ${run.y + dy}) scale(1 ${run.stretch})`}>
            <text fontFamily={`"${run.family}"`} fontSize={run.size} letterSpacing={run.size * (run.role === "hero" ? tracking.main : run.role === "top" ? tracking.helper : tracking.script)} fontWeight={run.weight} fontStyle={run.italic ? "italic" : "normal"}
              fill={hero ? heroGradient ? `url(#${uid}-hero)` : parts?.main?.color ?? presentationConfig?.highlights?.color ?? (variant === "og" ? "#e23131" : "#bd1019") :
                parts?.[run.role === "top" ? "helper" : "script"]?.color ?? "#fffdf9"}
              style={{ fontSynthesis: "none", whiteSpace: "pre" }}>{run.text}</text>
          </g></MotionWord>;
        })}
      </g>
    </svg>
  </AbsoluteFill>;
};
export const resolveViralLockupMetadata = ({ props }: { props: ViralLockupProps }) => {
  const words = normalizeWords(props.sourceConfig ?? { transcript: [] }).words;
  return { fps: 30, durationInFrames: Math.max(30, Math.ceil(Math.max(props.sourceConfig?.durationMs ?? 0, ...words.map(w => w.endMs + 180)) * .03)) };
};
