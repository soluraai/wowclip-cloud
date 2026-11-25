import { useCueMotion } from "../BasicCaption/cueMotion";
import React, { useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill, staticFile, useCurrentFrame, useDelayRender, useVideoConfig,
} from "remotion";
import { clamp, finite } from "../CaptionEngine/types";
import { compileSerifGlow, currentSerifGlowCue, resolveSerifGlowStyle } from "./engine";
import { ensureSerifGlowFont, serifGlowFont } from "./fonts";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { layoutSerifGlow, type SerifGlowLayout } from "./layout";
import { serifGlowMotion } from "./motion";
import { serifGlowSource } from "./source";
import type { SerifGlowCue, SerifGlowProps, SerifGlowSettings } from "./types";
import { SourceVideo } from "../SourceVideo";

/** A #rrggbb color moved part of the way to white (other color forms are left as they are). */
const towardWhite = (color: string, amount: number) => {
  const hex = /^#([0-9a-f]{6})$/iu.exec(color)?.[1];
  if (!hex) return color;
  return "#" + [0, 2, 4].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16);
    return Math.round(value + (255 - value) * amount).toString(16).padStart(2, "0");
  }).join("");
};

const asset = (src: string) => /^(https?:|data:|blob:|\/)/iu.test(src) ? src : staticFile(src);

const Caption: React.FC<{
  cue: SerifGlowCue; layout: SerifGlowLayout; settings: SerifGlowSettings;
  width: number; now: number; fps: number;
  settled: boolean;
  continuousEntry: boolean; continuousExit: boolean;
}> = ({ cue, layout, settings, width, now, fps, settled, continuousEntry, continuousExit }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/gu, "");
  const unit = width / 720;
  const highlight = cue.treatment === "glow";
  const motion = settled ? { opacity: 1, y: 0, scale: 1, blur: 0, bloom: 1 }
    : serifGlowMotion(now, cue.startMs, cue.endMs, cue.fadeMs, highlight, fps, continuousEntry, continuousExit);
  const color = highlight ? settings.accent : settings.textColor;
  // The lit word's core runs hot toward white, so it reads bright inside its colored glow.
  const core = highlight ? towardWhite(color, .45) : color;
  const textStyle: React.CSSProperties = { fontFamily: `"${serifGlowFont}"`, fontWeight: 400, fontStyle: "normal",
    fontSize: layout.size, letterSpacing: layout.tracking, fontKerning: "normal",
    fontSynthesis: "none", textRendering: "optimizeLegibility", whiteSpace: "pre" };
  // The glow word blinks on once, like a neon tube catching, for a few frames only, then holds steady.
  const age = now - cue.startMs;
  const FLICKER = [0, .85, .4, 1];
  const step = Math.floor(age / 50);
  const flicker = settled || !highlight ? 1 : age < 0 ? 0 : step < FLICKER.length ? FLICKER[step] : 1;
  // After the flicker, the word settles from a touch large and the glow swells once.
  const settle = settled || !highlight ? 1 : Math.min(1, Math.max(0, (age - FLICKER.length * 50) / 220));
  const lit = 1 - (1 - settle) ** 3;
  const glyph = (fill: string, filter?: string, opacity = 1) => highlight || settled
    ? <text x={layout.x} y={layout.baseline} fill={fill} filter={filter} opacity={opacity * flicker} style={textStyle}>{layout.text}</text>
    // Plain text comes in word by word, each word sliding up as it is spoken.
    : <g filter={filter} opacity={opacity}>{layout.words.map((word, index) => {
        const next = layout.words[index + 1]?.startMs;
        const length = next === undefined ? 380 : Math.max(200, Math.min(420, (next - word.startMs) * .9));
        const p = now < word.startMs ? 0 : Math.min(1, (now - word.startMs + 1000 / fps) / length);
        if (p <= 0) return null;
        const e = 1 - (1 - p) ** 3;
        return <text key={index} x={layout.x + word.dx} y={layout.baseline + (1 - e) * layout.size * .45} fill={fill}
          opacity={Math.min(1, p * 2)} style={textStyle}>{word.text}</text>;
      })}</g>;
  return <svg data-serif-glow-caption={cue.id} data-treatment={cue.treatment}
    width={width} height={1} role="img" aria-label={layout.text}
    style={{ position: "absolute", left: 0, top: 0, display: "block", overflow: "visible",
      opacity: motion.opacity, transformOrigin: "50% 0px",
      transform: `translateY(${motion.y * unit}px) scale(${motion.scale * (highlight ? 1.04 - .04 * lit : 1)})`,
      filter: motion.blur > 0.005 ? `blur(${motion.blur * unit}px)` : undefined }}>
    <defs>
      <filter id={`${uid}halo`} x="-50%" y="-200%" width="200%" height="500%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={2.1 * unit} />
      </filter>
      <filter id={`${uid}bloom`} x="-50%" y="-250%" width="200%" height="600%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={7.8 * unit} />
      </filter>
      <filter id={`${uid}shadow`} x="-50%" y="-200%" width="200%" height="500%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={1.5 * unit} />
      </filter>
    </defs>
    {glyph("#000000", `url(#${uid}shadow)`, highlight ? 0.12 : 0.55)}
    {highlight && settings.glow > 0 && <g opacity={Math.min(1, settings.glow * motion.bloom * (0.85 + 0.15 * lit))}>
      {glyph(color, `url(#${uid}bloom)`, 0.85)}
      {glyph(color, `url(#${uid}halo)`, 1)}
    </g>}
    {glyph(core)}
  </svg>;
};

export const SerifGlow: React.FC<SerifGlowProps> = ({ sourceConfig = serifGlowSource, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const onLayout = presentationConfig?.onLayout ?? (styleConfig as any)?.onLayout;
  // An explicit styleConfig value wins so the preview card can run the real
  // word animation while onLayout keeps reporting the settled height.
  const naturalWrap = (styleConfig as any)?.naturalWrap ?? !!presentationConfig?.onLayout;
  const compiled = useMemo(() => compileSerifGlow(sourceConfig), [sourceConfig]);
  const settings = useMemo(() => resolveSerifGlowStyle(styleConfig), [styleConfig]);
  const layoutKey = useMemo(() => ({ compiled, settings, width }), [compiled, settings, width]);
  const [loaded, setLoaded] = useState<{
    key: typeof layoutKey; layouts: Map<string, SerifGlowLayout>;
  } | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();

  useLayoutEffect(() => {
    let cancelled = false;
    let released = false;
    const handle = delayRender("Loading SerifGlow font and measuring phrases");
    const release = () => {
      if (!released) { released = true; continueRender(handle); }
    };
    void ensureSerifGlowFont().then(() => {
      if (cancelled) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("SerifGlow needs a 2D context for text measurement.");
      const cap = evenSizeCap(compiled.cues.map((cue) => layoutSerifGlow(context, cue, width, settings).fit));
      const layouts = new Map(compiled.cues.map((cue) => [cue.id,
        layoutSerifGlow(context, cue, width, settings, cap)]));
      setLoaded({ key: layoutKey, layouts });
    }).catch((error: unknown) => { if (!cancelled) cancelRender(error); }).finally(release);
    return () => { cancelled = true; release(); };
  }, [compiled, settings, width, layoutKey, delayRender, continueRender, cancelRender]);

  useLayoutEffect(() => {
    if (!loaded || !onLayout) return;
    const maxHeight = Math.max(...Array.from(loaded.layouts.values()).map(l => l.size * 1.5), 70);
    onLayout(maxHeight);
  }, [loaded, onLayout]);

  const cue = currentSerifGlowCue(compiled.cues, now) ?? (naturalWrap ? compiled.cues[0] : undefined);
  useCueMotion(cue?.startMs, cue?.endMs);
  const cueIndex = cue ? compiled.cues.indexOf(cue) : -1;
  const previous = compiled.cues[cueIndex - 1];
  const next = compiled.cues[cueIndex + 1];
  // The last measured layout stays up until the next is ready, so the caption never blinks out.
  const layout = cue ? loaded?.layouts.get(cue.id) : undefined;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#202624", overflow: "hidden", pointerEvents: "none" }}>
    {sourceConfig.background?.src && <SourceVideo src={asset(sourceConfig.background.src)}
      muted={sourceConfig.background.muted ?? false} volume={sourceConfig.background.volume ?? 1}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    <div style={{ position: "absolute", top: height * (naturalWrap ? 0.5 : settings.positionY), left: 0, width, height: 0 }}>
      {cue && layout && <Caption key={cue.id} cue={cue} layout={layout}
        settings={settings} width={width} now={now} fps={fps}
        settled={naturalWrap || presentationConfig?.reducedMotion === true}
        continuousEntry={!!previous && previous.endMs >= cue.startMs - 1}
        continuousExit={!!next && next.startMs <= cue.endMs + 1} />}
    </div>
  </AbsoluteFill>;
};

export const resolveSerifGlowMetadata = ({ props }: { props: SerifGlowProps }) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  return { fps, durationInFrames: Math.max(1,
    Math.ceil(compileSerifGlow(props.sourceConfig ?? serifGlowSource).durationMs * fps / 1000)) };
};
