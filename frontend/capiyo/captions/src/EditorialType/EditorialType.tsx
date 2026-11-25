import { useSpacing } from "../Premium/sizes";
import { usePartFonts } from "../Premium/parts";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import React, { useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { useCueMotion } from "../BasicCaption/cueMotion";
import { clamp, finite } from "../CaptionEngine/types";
import { flowNumberParts } from "../SmartTextFlow/numbers";
import { compileEditorialType, currentEditorialCue, resolveEditorialStyle } from "./engine";
import { editorialFont, ensureEditorialFonts } from "./fonts";
import { layoutEditorialType, type EditorialLayout } from "./layout";
import { editorialMotion } from "./motion";
import { editorialNumberRuns } from "./numerals";
import { prepareEditorialEntries } from "./entries";
import { KineticText } from "../CaptionMotion/KineticText";
import { MotionWord } from "../Standard/MotionWord";
import { editorialTypeSource } from "./source";
import type { EditorialCue, EditorialSettings, EditorialSource, EditorialStyle } from "./types";

export type EditorialTypeProps = { sourceConfig?: EditorialSource; styleConfig?: EditorialStyle; fps?: number; presentationConfig?: BasicCaptionPresentation };
const asset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

const TypePage: React.FC<{ cue: EditorialCue; layout: EditorialLayout; settings: EditorialSettings; now: number; width: number; fps: number }> = ({
  cue, layout, settings, now, width, fps,
}) => {
  const unit = width / 720;
  return <svg data-editorial-cue={cue.id} data-layout={cue.kind} width={width} height={1} style={{ display: "block", overflow: "visible" }}>
    {layout.words.map((word) => {
      const { token } = word;
      const motion = editorialMotion(token, cue, now, settings, fps);
      if (now < token.startMs || now >= cue.endMs || !word.entry) return null;
      const font = editorialFont(token.typeRole, token.look);
      const style: React.CSSProperties = {
        fontFamily: font.family, fontSize: word.size, fontWeight: word.weight ?? font.weight, fontStyle: font.style,
        letterSpacing: word.tracking, fontSynthesis: "none", fontOpticalSizing: "none",
        fontVariantNumeric: token.number ? "lining-nums" : undefined,
        textShadow: `0 ${1.5 * unit}px ${4 * unit}px rgba(0,0,0,${settings.shadow}), 0 0 ${0.8 * unit}px rgba(255,255,255,0.18)`,
      };
      const parts = token.number ? flowNumberParts(token.number, 1, token.text) : null;
      const number = word.number;
      const main = cue.heroIds.includes(token.id);
      // Words simply pop in one by one; a motion picked in the editor adds its own entrance on top.
      const elapsed = Infinity;
      return <MotionWord key={token.id} id={token.id} startMs={token.startMs} size={word.size} main={main}><g data-editorial-word={token.id} data-type-role={token.typeRole}
        opacity={1 - motion.exit}>
        {number && parts ? <g fill={settings.text} style={style}>
          {editorialNumberRuns(number, parts, word.x, word.size).map((run, index) => {
            const left = word.x + word.left;
            const right = word.x + word.right;
            // All numeric runs use the same shared figure mask and displacement.
            return <KineticText key={index} text={run.text} x={run.x} baseline={word.baseline} size={word.size}
              elapsed={elapsed} available={cue.endMs - token.startMs} duration={Math.max(400, settings.entryMs)} fps={fps}
              entry={{ ...word.entry!, left: left - run.x, right: right - run.x }}
              textProps={{ fill: settings.text, textAnchor: run.center ? "middle" : "start",
                style: { ...style, fontSize: run.size, letterSpacing: run.size * (word.size ? word.tracking / word.size : font.tracking) } }} />;
          })}
        </g> : <KineticText text={token.text} x={word.x} baseline={word.baseline} size={word.size}
          elapsed={elapsed} available={cue.endMs - token.startMs} duration={Math.max(420, settings.entryMs)} fps={fps}
          entry={word.entry} slices={word.slices} textProps={{ fill: settings.text, style }} />}
      </g></MotionWord>;
    })}
  </svg>;
};

export const EditorialType: React.FC<EditorialTypeProps> = ({ sourceConfig = editorialTypeSource, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const tracking = useSpacing(presentationConfig);
  const settings = useMemo(() => ({ ...resolveEditorialStyle(styleConfig), tracking }), [styleConfig, tracking]);
  // Fonts picked in the editor: the main one for the big word, the small-text one for the rest. Numbers keep theirs.
  const { faces, ready: facesReady } = usePartFonts(presentationConfig?.parts);
  const compiled = useMemo(() => {
    const plain = compileEditorialType(sourceConfig, settings, fps);
    if (!faces.main && !faces.helper) return plain;
    return { ...plain, cues: plain.cues.map((cue) => ({ ...cue, tokens: cue.tokens.map((token) => {
      const face = token.typeRole === "number" ? undefined : token.typeRole === "serif" ? faces.main : faces.helper;
      return face ? { ...token, look: { ...token.look, family: face.family, weight: face.weight, italic: face.italic } } : token;
    }) })) };
  }, [sourceConfig, settings, fps, faces]);
  const key = useMemo(() => ({ compiled, settings, width, height }), [compiled, settings, width, height]);
  const [loaded, setLoaded] = useState<{ key: typeof key; layouts: Map<string, EditorialLayout> } | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    if (!facesReady) return;
    let cancelled = false, released = false;
    const handle = delayRender("Loading EditorialType fonts and measuring optical alignment");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void ensureEditorialFonts().then(() => {
      if (cancelled) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("EditorialType requires a canvas typography context.");
      const layouts = new Map(compiled.cues.map((cue) => [cue.id, prepareEditorialEntries(
        layoutEditorialType(cue, context, width, height, settings), cue, context, settings, width, height)]));
      setLoaded({ key, layouts });
    }).catch((error: unknown) => { if (!cancelled) cancelRender(error); }).finally(release);
    return () => { cancelled = true; release(); };
  }, [key, compiled, settings, width, height, delayRender, continueRender, cancelRender, facesReady]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (loaded?.key === key) onLayout?.(Math.max(0, ...[...loaded.layouts.values()].map(l => l.height)) + 32 * width / 720);
  }, [loaded, key, onLayout, width]);
  const cue = currentEditorialCue(compiled.cues, now);
  useCueMotion(cue?.startMs, cue?.endMs);
  return <AbsoluteFill
    style={{ background: settings.transparent ? "transparent" : settings.canvas, overflow: "hidden", pointerEvents: "none" }}
  >
    {!settings.transparent && sourceConfig.background?.src && <OffthreadVideo src={asset(sourceConfig.background.src)}
      muted={sourceConfig.background.muted ?? false} volume={sourceConfig.background.volume ?? 1}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    {cue && loaded?.key === key && <div style={{ position: "absolute", top: height * settings.positionY, left: 0, right: 0, height: 0 }}>
      <TypePage cue={cue} layout={loaded.layouts.get(cue.id)!} settings={settings} now={now} width={width} fps={fps} />
    </div>}
  </AbsoluteFill>;
};

export const resolveEditorialTypeMetadata = ({ props }: { props: EditorialTypeProps }) => {
  const fps = clamp(finite(props.fps, finite(props.sourceConfig?.composition?.fps, 30)), 1, 120);
  const settings = resolveEditorialStyle(props.styleConfig);
  return { fps, durationInFrames: Math.max(1, Math.ceil(compileEditorialType(props.sourceConfig ?? editorialTypeSource, settings, fps).durationMs * fps / 1000)) };
};
