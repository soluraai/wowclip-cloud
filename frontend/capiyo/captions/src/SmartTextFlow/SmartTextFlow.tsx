import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import React, { useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { clamp, finite } from "../CaptionEngine/types";
import { compileSmartTextFlow, currentFlowCue, resolveFlowStyle } from "./engine";
import { ensureFlowFonts, flowFont } from "./fonts";
import { layoutSmartFlow, type FlowLayout } from "./layout";
import { flowCount, flowExit, flowWordMotion } from "./motion";
import { formatFlowNumber } from "./numbers";
import { flowEffect, flowReveal } from "./intent";
import { flowMetricRuns } from "./metric";
import { createFlowDecorations } from "./decorations";
import { FlowPaint, FlowMetricDetails, FlowAccentBeat } from "./ornaments";
import { flowColor, flowCueAccent, flowTokenInk } from "./colors";
import { smartTextFlowSource } from "./source";
import type { FlowCue, FlowSettings, FlowSource, FlowStyle } from "./types";
import { SourceVideo } from "../SourceVideo";
import { usePartFonts } from "../Premium/parts";
import { useSpacing } from "../Premium/sizes";

export type SmartTextFlowProps = { sourceConfig?: FlowSource; styleConfig?: FlowStyle; fps?: number; presentationConfig?: BasicCaptionPresentation };
const asset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

export const FlowPage: React.FC<{ cue: FlowCue; layout: FlowLayout; settings: FlowSettings; now: number; width: number; fps: number;
  /** Colors picked in the editor for single words, by word id. */
  inks?: Record<string, string> }> = ({
  cue, layout, settings, now, width, fps, inks,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const unit = width / 720;
  const accent = flowCueAccent(cue, settings);
  const cueSettings = { ...settings, accent };
  const exit = flowExit(cue, now);
  const words = layout.words.map((word) => {
    const motion = flowWordMotion(now, word.token, cue.endMs, fps);
    return { ...word, motion: layout.inlineNumbers && word.token.number ? { ...motion,
      y: (1 - motion.presence) * 6, scale: .97 + motion.presence * .03, blur: motion.blur * .7 } : motion };
  });
  const decorations = createFlowDecorations(cue, layout, now, unit, uid);
  const focusWord = words.find((word) => word.metric || word.token.id === cue.focusId);
  return <div data-smart-flow-cue={cue.id} style={{ position: "absolute", inset: 0, opacity: 1 - exit,
    transform: `translateY(${(-exit * 5 * unit).toFixed(3)}px)`, filter: `blur(${(exit * 2 * unit).toFixed(3)}px)` }}>
    <svg width={width} height={1} style={{ overflow: "visible", display: "block" }}>
      <defs>{decorations.filter((decoration) => decoration.effect === "marker").map((decoration) =>
        <clipPath key={decoration.id} id={decoration.id}><rect x={decoration.x} y={decoration.y - unit}
          width={decoration.width * decoration.progress} height={decoration.height + 2 * unit} /></clipPath>)}
        {words.filter((word) => flowReveal(cue, word.token) !== "soft").map((word, index) => {
          const x = word.x + word.left - 3 * unit, y = word.baseline - word.ascent - 3 * unit;
          const w = word.right - word.left + 6 * unit, h = word.ascent + word.descent + 6 * unit;
          const ink = flowReveal(cue, word.token) === "ink", p = word.motion.presence;
          return <clipPath key={word.token.id} id={`${uid}-reveal-${index}`}><rect x={x} y={ink ? y : y + h * (1 - p)}
            width={ink ? w * p : w} height={ink ? h : h * p} /></clipPath>;
        })}
      </defs>
      {decorations.map((decoration) => <FlowPaint key={decoration.key} decoration={decoration}
        accent={settings.colorMode === "palette" ? flowColor(decoration.row[0].token.emphasisColor) ?? accent : accent} unit={unit} />)}
      {words.map((word) => {
        const { token, motion } = word;
        if (motion.opacity <= 0) return null;
        const font = flowFont(token.role, token.look);
        const focus = token.id === cue.focusId;
        const effect = word.metric ? "none" : flowEffect(cue, token);
        const wordAccent = settings.colorMode === "palette" ? flowColor(token.emphasisColor) ?? flowColor(token.color) ?? accent : accent;
        const ink = inks?.[token.id] ?? flowTokenInk(token, settings, effect === "textColor" || (focus && effect === "underline") ? wordAccent : settings.text);
        const count = flowCount(token, cue, now);
        const display = token.number && count < 1 ? formatFlowNumber(token.number, count) : token.text;
        const x = word.x;
        const y = word.baseline;
        const textStyle: React.CSSProperties = { fontFamily: font.family, fontWeight: font.weight, fontStyle: font.style,
          fontSize: word.size, letterSpacing: word.tracking, fontVariantNumeric: "tabular-nums", fontSynthesis: "none" };
        const marker = decorations.find((decoration) => decoration.effect === "marker" && decoration.row.some((item) => item.token.id === token.id));
        const revealIndex = words.filter((item) => flowReveal(cue, item.token) !== "soft").findIndex((item) => item.token.id === token.id);
        return <g key={token.id} data-smart-flow-word={token.id} data-role={token.role} style={{
          opacity: motion.opacity,
          transform: `translateY(${((motion.y + (settings.colorMode === "palette" && !(layout.inlineNumbers && token.number) ? (1 - motion.presence) * 5 : 0)) * unit).toFixed(3)}px) scale(${motion.scale.toFixed(5)})`,
          transformOrigin: `${x + word.width / 2}px ${y}px`, filter: `blur(${(motion.blur * unit).toFixed(3)}px)`,
        }}>
          {word.metric && token.number ? <g style={{ textShadow: `0 0 ${18 * unit}px ${wordAccent}30` }}>
            {flowMetricRuns(token, word.metric, x, y, word.size, count).map((run, index) => <text key={index} x={run.x} y={run.y}
              textAnchor={run.center ? "middle" : "start"} fill={layout.inlineNumbers || run.accent ? wordAccent : settings.text}
              style={{ ...textStyle, fontWeight: run.weight, fontSize: run.size, letterSpacing: run.size * -0.025 }}>{run.text}</text>)}
            {!layout.inlineNumbers && <FlowMetricDetails word={word} count={count} settings={{ ...cueSettings, accent: wordAccent }} unit={unit} />}
          </g> : <>
          <g clipPath={revealIndex >= 0 ? `url(#${uid}-reveal-${revealIndex})` : undefined}>
          <text x={token.number ? x + word.width / 2 : x} y={y} textAnchor={token.number ? "middle" : "start"}
            fill={ink} style={{ ...textStyle,
              textShadow: `0 0 ${12 * unit}px ${ink}${Math.round(settings.glow * (focus ? 90 : 35)).toString(16).padStart(2, "0")}`,
            }}>{display}</text>
          {marker && <text x={token.number ? x + word.width / 2 : x} y={y} textAnchor={token.number ? "middle" : "start"}
            fill={settings.canvas} clipPath={`url(#${marker.id})`} style={textStyle}>{display}</text>}
          </g>
          </>}
        </g>;
      })}
      {focusWord && layout.kind !== "prose" && <FlowAccentBeat x={width / 2 + layout.width / 2 + 10 * unit}
        y={focusWord.baseline - focusWord.ascent + 3 * unit} elapsed={now - focusWord.token.startMs - 350} accent={accent} unit={unit} />}
    </svg>
  </div>;
};

export const SmartTextFlow: React.FC<SmartTextFlowProps> = ({ sourceConfig = smartTextFlowSource, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const settings = useMemo(() => resolveFlowStyle(styleConfig), [styleConfig]);
  const plain = useMemo(() => compileSmartTextFlow(sourceConfig, settings, fps), [sourceConfig, settings, fps]);
  // Fonts picked in the editor: the main word's for the highlighted words, the small text's for the rest.
  const { faces, ready: facesReady } = usePartFonts(presentationConfig?.parts);
  const tracking = useSpacing(presentationConfig);
  const compiled = useMemo(() => {
    if (!faces.main && !faces.helper && !tracking.main && !tracking.helper) return plain;
    return { ...plain, cues: plain.cues.map(cue => ({ ...cue, tokens: cue.tokens.map(token => {
      const face = token.number ? undefined : token.role === "body" ? faces.helper : faces.main;
      return { ...token, look: { ...(face ? { family: face.family, weight: face.weight, italic: face.italic } : {}), tracking: token.role === "body" ? tracking.helper : tracking.main } };
    }) })) };
  }, [plain, faces, tracking]);
  // A color picked for one word paints only that word.
  const wordStyles = presentationConfig?.wordStyles, wordColors = presentationConfig?.wordColors;
  const inks = useMemo(() => {
    const out: Record<string, string> = { ...(wordColors ?? {}) };
    for (const [id, word] of Object.entries(wordStyles ?? {})) {
      const color = word.overrideColor ? word.gradient?.stops[0]?.color ?? word.font?.color : undefined;
      if (color && !out[id]) out[id] = color;
    }
    return out;
  }, [wordStyles, wordColors]);
  const layoutKey = useMemo(() => ({ compiled, settings, width, height }), [compiled, settings, width, height]);
  const [loaded, setLoaded] = useState<{ key: typeof layoutKey; layouts: Map<string, FlowLayout> } | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let cancelled = false, released = false;
    const handle = delayRender("Loading and measuring SmartTextFlow typography");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void ensureFlowFonts().then(() => {
      if (cancelled || !facesReady) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("SmartTextFlow needs a 2D typography context.");
      const layouts = new Map(compiled.cues.map((cue) => [cue.id, layoutSmartFlow(cue, context, width, height, settings)]));
      setLoaded({ key: layoutKey, layouts });
    }).catch((error: unknown) => { if (!cancelled) cancelRender(error); }).finally(release);
    return () => { cancelled = true; release(); };
  }, [layoutKey, compiled, settings, width, height, facesReady, delayRender, continueRender, cancelRender]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (loaded?.key === layoutKey) onLayout?.(Math.max(0, ...[...loaded.layouts.values()].map(l => l.height)) + 40 * width / 720);
  }, [loaded, layoutKey, onLayout, width]);
  const cue = currentFlowCue(compiled.cues, now);

  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", backgroundColor: settings.transparent ? "transparent" : settings.canvas }}>
    {!settings.transparent && sourceConfig.background?.src && (sourceConfig.background.kind === "image"
      ? <Img src={asset(sourceConfig.background.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <SourceVideo src={asset(sourceConfig.background.src)}
        muted={sourceConfig.background.muted ?? false} volume={clamp(finite(sourceConfig.background.volume, 1), 0, 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}
    {cue && loaded?.key === layoutKey && <div style={{ position: "absolute", left: 0, right: 0, top: height * settings.positionY, height: 0 }}>
      <FlowPage cue={cue} layout={loaded.layouts.get(cue.id)!} settings={settings} now={now} width={width} fps={fps} inks={inks} />
    </div>}
  </AbsoluteFill>;
};

export const resolveSmartTextFlowMetadata = ({ props }: { props: SmartTextFlowProps }) => {
  const fps = clamp(finite(props.fps, finite(props.sourceConfig?.composition?.fps, 30)), 1, 120);
  const settings = resolveFlowStyle(props.styleConfig);
  return { fps, durationInFrames: Math.max(1, Math.ceil(compileSmartTextFlow(props.sourceConfig ?? smartTextFlowSource, settings, fps).durationMs * fps / 1000)) };
};
