import React, { useMemo, useRef, type CSSProperties } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { CueMotionContext, type RoleLooks, type RolePaints, type WordLook } from "../BasicCaption/cueMotion";
import type { CaptionAnimation } from "../BasicCaption/motion";
import type { BasicTextEffects } from "../BasicCaption/BasicCaptionRenderer";
import { effectsFilter } from "../BasicCaption/wordPresentation";

/** Design on a whole drawn caption (or one word of it): outline, 3D depth, glow and shadow as filters. */
export const dropShadows = (fx: BasicTextEffects | undefined, unit: number) => effectsFilter(fx, unit);

type WordStyle = { overrideColor?: boolean; font?: { color?: string }; effects?: BasicTextEffects; blendPass?: "hidden" | "visible"; textCase?: string };
/** What one word has of its own, for a style that draws its words itself. */
export const wordLooksOf = (wordStyles: Record<string, WordStyle> | undefined, unit: number): Record<string, WordLook> =>
  Object.fromEntries(Object.entries(wordStyles ?? {}).map(([id, word]) => [id, {
    color: word.overrideColor ? word.font?.color : undefined,
    opacity: word.effects?.opacity,
    filter: dropShadows(word.effects, unit),
    visibility: word.blendPass,
    textCase: word.textCase,
  }]));

/** One positioned layer over the video, with the caption motion inside it. */
export const CaptionLayer: React.FC<{
  origin: string;
  transform: string;
  animation?: CaptionAnimation;
  /** The layer the editor's selection box measures. */
  measured?: boolean;
  blend?: boolean;
  hidden?: boolean;
  /** Shadow, glow, opacity and blend on the caption as a whole. */
  look?: CSSProperties;
  keyWords?: string;
  wordLooks?: Record<string, WordLook>;
  paints?: RolePaints;
  roleLooks?: RoleLooks;
  children: React.ReactNode;
}> = ({ origin, transform, animation, measured, blend, hidden, look, keyWords, wordLooks, paints, roleLooks, children }) => {
  const { width } = useVideoConfig();
  const target = useRef<HTMLDivElement>(null);
  const motion = useMemo(() => ({ animation, target, keyWords, wordLooks, paints, roleLooks }), [animation, keyWords, wordLooks, paints, roleLooks]);
  return <AbsoluteFill data-caption-layer data-caption-box={measured || undefined}
    style={{ ...look, transformOrigin: origin, transform, mixBlendMode: blend ? "difference" : look?.mixBlendMode, visibility: hidden ? "hidden" : undefined }}>
    <div ref={target} style={{ position: "absolute", inset: 0, transformOrigin: origin, fontSize: (60 * width) / 1080 }}>
      <CueMotionContext.Provider value={motion}>{children}</CueMotionContext.Provider>
    </div>
  </AbsoluteFill>;
};
