import React, { useLayoutEffect } from "react";
import { CaptionLayer } from "../Standard/CaptionLayer";
import { staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import type { PlainPage } from "./heroPlan";
import { partFace, usePartFonts, type PremiumParts } from "./parts";

const ENTRANCE_MS = 260;
const RISE = 0.3;
const BLUR = 0.09;
const ease = (t: number) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

type PlainDesign = { src: string; name?: string; weight: number; italic?: boolean; size: number; color: string; glow?: boolean; silver?: boolean };
const INTER = "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf";
const SILVER = "linear-gradient(180deg, #fbfcfd 6%, #cfd4db 48%, #969da8 100%)";
const SERIF = "style-two/fonts/instrument-serif-italic.ttf";
/** A normal line wears the helper text of its style, at a size of its own for each face. */
const DESIGNS: Record<string, PlainDesign> = {
  "neon-overlap": { src: SERIF, weight: 400, italic: true, size: .062, color: "#fffdf8", glow: true },
  "style-one": { src: "style-two/fonts/instrument-sans-variable.ttf", weight: 500, size: .056, color: "#d5dae1", silver: true },
  "maroon-king": { src: "muse-script/GreatVibes-Regular.ttf", weight: 400, size: .08, color: "#fffdf9" },
  luxe: { src: SERIF, weight: 400, italic: true, size: .056, color: "#fffaf2", glow: true },
  "cursor-story": { src: INTER, weight: 500, size: .062, color: "#fffdf8" },
  "ember-lock": { src: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay-Italic[wght].ttf", weight: 400, italic: true, size: .064, color: "#fffdf8" },
  "dynamic-simple": { src: "launch-caption-pack/fonts/plusjakartasans/PlusJakartaSans.ttf", weight: 700, size: .062, color: "#ffffff" },
  "split-line": { src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 600, size: .056, color: "#ffffff" },
  "verse-flow": { src: "editorial-type/fonts/roboto-variable.ttf", weight: 700, size: .058, color: "#ffffff" },
  viewfinder: { src: "launch-caption-pack/fonts/standard-type/IBMPlexMono-Regular.ttf", weight: 400, size: .052, color: "#ffffff" },
  "prism-relay": { src: "launch-caption-pack/fonts/standard-type/IBMPlexMono-Regular.ttf", weight: 400, size: .07, color: "#f3fffd" },
  "pocket-flow": { src: INTER, weight: 600, size: .076, color: "#ffffff" },
  "blend-cursor": { src: SERIF, weight: 400, italic: true, size: .08, color: "#fffaf2", glow: true },
  // Its normal lines match the cursive script under the headline.
  og: { src: "muse-script/Yellowtail-Regular.ttf", name: "Cursive", weight: 400, size: .076, color: "#fffdf9" },
};
/** Each face loads once per page; a second request waits on the first instead of adding a duplicate. */
const plainFaces = new Map<string, Promise<void>>();
const loadPlainFace = (family: string, src: string, italic: boolean) => {
  const key = JSON.stringify([family, src, italic]);
  let pending = plainFaces.get(key);
  if (!pending) {
    pending = new FontFace(family, `url(${JSON.stringify(src)})`, { weight: "100 900", style: italic ? "italic" : "normal" }).load()
      .then(loaded => { document.fonts.add(loaded); }).catch(() => { plainFaces.delete(key); });
    plainFaces.set(key, pending);
  }
  return pending;
};
export type PlainFont ={ family: string; weight: number; italic: boolean; color: string; size: number; glow: boolean; silver: boolean; tracking?: number;
  textCase?: "preserve" | "uppercase" | "lowercase"; wordGap?: number };

export const usePlainFont = (styleId: string | undefined, fallbackFonts: { family: string; src: string }[] = [], parts?: PremiumParts): PlainFont => {
  const design = styleId ? DESIGNS[styleId] : undefined;
  const look = parts?.plain ?? parts?.[styleId === "maroon-king" ? "script" : "helper"];
  const picked = partFace(look);
  usePartFonts(picked ? { helper: look } : undefined);
  // The face's own name rides in the family, so other scripts pair it by role (a cursive line stays cursive).
  const family = `Plain ${styleId} ${design?.name ?? design?.src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ") ?? ""}`.trim();
  const src = design?.src;
  const fallbacks = JSON.stringify(fallbackFonts.map(({ family, src }) => ({ family, src })));
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    if (!src) return;
    const handle = delayRender(`Loading the ${family} font`);
    const faces = [{ family, src: staticFile(src) }, ...JSON.parse(fallbacks) as { family: string; src: string }[]];
    void Promise.all(faces.map(face => loadPlainFace(face.family, face.src, face.family === family && design?.italic === true)))
      .finally(() => continueRender(handle));
  }, [family, src, fallbacks, design?.italic, delayRender, continueRender]);
  const names = fallbackFonts.map(font => `"${font.family}"`);
  return { family: [`"${picked?.family ?? family}"`, ...names, "sans-serif"].join(", "), weight: picked?.weight ?? design?.weight ?? 700,
    italic: picked?.italic ?? design?.italic === true, color: look?.color ?? design?.color ?? "#ffffff", size: design?.size ?? .054, glow: design?.glow === true,
    silver: design?.silver === true && !look?.color, textCase: look?.textCase, wordGap: look?.wordGap };
};

/** Lockups stay on their layer; a chunk without one hands the frame to the plain line. */
export const PlainLayers: React.FC<{
  pages: PlainPage[];
  place: Omit<React.ComponentProps<typeof CaptionLayer>, "children">;
  ink?: React.ReactNode;
  inkLook?: React.CSSProperties;
  plain: Omit<React.ComponentProps<typeof PlainLine>, "page">;
  children: React.ReactNode;
}> = ({ pages, place, ink, inkLook, plain, children }) => {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const page = pages.find(item => now >= item.startMs && now < item.endMs);
  return <>
    <CaptionLayer {...place} measured={!page} hidden={!!page}>{children}</CaptionLayer>
    {ink ? <CaptionLayer {...place} look={inkLook ?? place.look} blend hidden={!!page}>{ink}</CaptionLayer> : null}
    {pages.length ? <CaptionLayer {...place} measured={!!page}><PlainLine {...plain} page={page} /></CaptionLayer> : null}
  </>;
};

/** A chunk without a main word reads as a normal caption, centered where the caption sits. */
export const PlainLine: React.FC<{
  page?: PlainPage;
  font: PlainFont;
  width: number;
  anchorY: number;
  words?: Record<string, number>;
  reduced?: boolean;
}> = ({ page, font, width, anchorY, words, reduced }) => {
  const frame = useCurrentFrame(), { fps, width: frameWidth } = useVideoConfig();
  const now = frame * 1000 / fps;
  const unit = frameWidth / 720;
  useCueMotion(page?.startMs, page?.endMs);
  const chosen = useChosenEntrance();
  if (!page) return null;
  return <div style={{ position: "absolute", top: `${anchorY * 100}%`, left: `${(1 - width) * 50}%`, width: `${width * 100}%`,
    transform: "translateY(-50%)", textAlign: "center", textWrap: "balance", fontFamily: font.family, fontWeight: font.weight,
    fontStyle: font.italic ? "italic" : "normal", fontSize: frameWidth * font.size, letterSpacing: `${font.tracking ?? 0}em`, lineHeight: 1.16,
    textTransform: font.textCase && font.textCase !== "preserve" ? font.textCase : undefined, wordSpacing: font.wordGap ? `${font.wordGap}em` : undefined, color: font.color, fontSynthesis: "none",
    textShadow: font.glow ? `0 ${unit}px ${2 * unit}px #080a0e, 0 0 ${2 * unit}px ${font.color}88, 0 0 ${7 * unit}px ${font.color}55`
      : font.silver ? undefined : "0 2px 14px rgba(0,0,0,.6)", pointerEvents: "none" }}>
    {page.words.map((word, index) => {
      const age = now - word.startMs;
      const shown = reduced || chosen(word.id) ? Number(age >= 0) : age < 0 ? 0 : ease(age / ENTRANCE_MS);
      return <React.Fragment key={word.id}>
        {index > 0 ? " " : null}
        <span data-motion-word={word.id} data-plain data-start={word.startMs} style={{ display: "inline-block", fontSize: words?.[word.id] ? `${words[word.id]}em` : undefined }}>
          <span style={{ display: "inline-block", opacity: shown, transform: `translateY(${(1 - shown) * RISE}em)`, filter: shown < 1 ? `blur(${(1 - shown) * BLUR}em)` : undefined,
            ...(font.silver ? { backgroundImage: SILVER, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              // Room above and below, so vowel signs (Hindi) are painted too; the layout doesn't move.
              padding: ".3em 0 .26em", margin: "-.3em 0 -.26em" } : {}) }}>{word.text}</span>
        </span>
      </React.Fragment>;
    })}
  </div>;
};
