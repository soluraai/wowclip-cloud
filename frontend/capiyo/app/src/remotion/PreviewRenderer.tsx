"use client";

import { Fragment, lazy, Suspense, useContext, useMemo } from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { VideoFrameContext, type VideoFrameValue } from "../../../captions/src/VideoFrame";
import { SourceVideo } from "../../../captions/src/SourceVideo";
import { BasicStyle } from "../../../captions/src/Basic/BasicStyle";
import { resolveBasicStyleId } from "../../../captions/src/Basic/catalog";
import { isStandardStyleId } from "../../../captions/src/Standard/catalog";
import { isPremiumStyleId } from "../../../captions/src/Premium/catalog";
import type { CaptionStyleRendererProps } from "../../../captions/src/CaptionStyleRenderer";
import { PreviewSkeleton } from "../app/Skeleton";
import { useCaptionLanguage } from "../../../captions/src/Script/useCaptionLanguage";
import { renderFlagOf } from "./renderFlags";

// Standard's typography engines are only downloaded when a Standard style is
// actually visible or selected. The composition identity stays stable on edits.
const StandardStyle = lazy(() => import("../../../captions/src/Standard/StandardStyle").then(module => ({ default: module.StandardStyle })));
const PremiumStyle = lazy(() => import("../../../captions/src/Premium/PremiumStyle").then(module => ({ default: module.PremiumStyle })));

import type { BasicStyleProps } from "../../../captions/src/Basic/BasicStyle";

type Background = { src?: string; kind?: string; muted?: boolean; volume?: number };
type Source = { background?: Background } & Record<string, unknown>;

/** Templates paint a black canvas under their words when they have no video; the render drops it the same way. */
const LAYER_CSS = ".capiyo-caption-layer > div { background-color: transparent !important; }";
const link = (src: string) => (/^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src));

/**
 * Renders a caption style. A render passes the project's video setup as `video` (framing, shades, kept
 * scenes); the editor hands it in through context instead, so dragging the video never redraws the captions.
 *
 * `ownVideo` (the editor's player): the video is drawn here, under the captions, instead of inside the template,
 * the way an export lays captions over the video. Switching templates, editing words or a font arriving then
 * redraws only the captions; the video keeps playing instead of loading again (a black flash of a few seconds).
 * Templates that blend with the video (difference text) still draw it themselves.
 */
export function PreviewRenderer({ styleId, video, ownVideo, ...input }: CaptionStyleRendererProps & { video?: VideoFrameValue; ownVideo?: boolean }) {
  const outer = useContext(VideoFrameContext);
  const frame = video ?? outer;
  const source = input.sourceConfig as Source | undefined;
  const background = source?.background;
  const blend = (input.presentationConfig as { textEffects?: { blend?: string } } | undefined)?.textEffects?.blend;
  const blends = (!!blend && blend !== "normal") || !!renderFlagOf(styleId ?? "").blend;
  const lifted = !!ownVideo && !blends && !!background?.src && background.kind !== "image";
  const captionInput = useMemo(
    () => (lifted ? { ...input, sourceConfig: { ...source, background: undefined } } : input),
    // `input` is a fresh object each render; its parts are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lifted, source, input.styleConfig, input.presentationConfig],
  ) as typeof input;
  // Same language layer as renders (fonts for Hindi and other scripts, Mix key words).
  const { props, fontsKey } = useCaptionLanguage(captionInput, styleId);
  // Keyed on the script fonts, so a template measures its words again once Hindi or Tamil faces are in.
  const caption = <Fragment key={fontsKey}>{renderStyle(styleId, props)}</Fragment>;
  const body = lifted ? (
    <>
      <SourceVideo src={link(background!.src!)} muted={background!.muted ?? false} volume={background!.volume ?? 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <style>{LAYER_CSS}</style>
      <AbsoluteFill className="capiyo-caption-layer">{caption}</AbsoluteFill>
    </>
  ) : caption;
  return frame ? <VideoFrameContext.Provider value={frame}>{body}</VideoFrameContext.Provider> : body;
}

function renderStyle(styleId: CaptionStyleRendererProps["styleId"], props: Omit<CaptionStyleRendererProps, "styleId">) {
  const componentProps = props as unknown as BasicStyleProps;
  return isPremiumStyleId(styleId)
    ? <Suspense fallback={<PreviewSkeleton />}><PremiumStyle {...componentProps} styleId={styleId} /></Suspense>
    : isStandardStyleId(styleId)
    ? <Suspense fallback={<PreviewSkeleton />}><StandardStyle {...componentProps} styleId={styleId} /></Suspense>
    : <BasicStyle {...componentProps} styleId={resolveBasicStyleId(styleId)} />;
}
