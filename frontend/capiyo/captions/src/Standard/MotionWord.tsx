import React from "react";

/**
 * Wraps one word of a style that draws its own words. Its transform belongs to the editor, so a
 * chosen entrance, color or shadow never touches the transforms the style sets on the word itself.
 * startMs is the moment the word appears, which a line or chunk reveal moves. A main word takes the
 * main word's motion, or keeps the style's own when none was chosen. A fixed word is driven by the
 * design itself and takes no chosen entrance.
 */
export const MotionWord: React.FC<{ id: string; startMs: number; size: number; html?: boolean; main?: boolean; fixed?: boolean; children: React.ReactNode }> =
  ({ id, startMs, size, html, main, fixed, children }) => html
    ? <div data-motion-word={id} data-start={startMs} data-main={main ? "" : undefined} data-fixed={fixed ? "" : undefined} style={{ position: "absolute", inset: 0, fontSize: size }}>{children}</div>
    : <g data-motion-word={id} data-start={startMs} data-main={main ? "" : undefined} data-fixed={fixed ? "" : undefined} style={{ fontSize: size, transformBox: "fill-box", transformOrigin: "center" }}>{children}</g>;
