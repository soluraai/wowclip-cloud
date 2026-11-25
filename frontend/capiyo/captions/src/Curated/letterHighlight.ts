/// <reference lib="es2022.intl" />
import { letterPieces } from "../Script/scripts";

/** Use graphemes so a Hindi syllable or an accented letter stays intact. */
export const measureLetterEdges = (ctx: CanvasRenderingContext2D, text: string, inkWidth: number): number[] => {
  const letters = letterPieces(text);
  const edges = [0]; let prefix = "";
  for (const letter of letters) {
    prefix += letter;
    edges.push(Math.max(edges[edges.length - 1], Math.min(1, ctx.measureText(prefix).width / Math.max(1, inkWidth))));
  }
  edges[edges.length - 1] = 1;
  return edges;
};

/** Advance through measured letters in order, settling briefly at each edge.
 * The finished highlight holds until the cue changes. */
export const letterHighlightProgress = (now: number, startMs: number, endMs: number, edges: number[], reduced = false) => {
  if (now < startMs) return 0;
  if (reduced || now >= endMs || edges.length < 2) return 1;
  const count = edges.length - 1, progress = Math.max(0, Math.min(1, (now - startMs) / Math.max(1, endMs - startMs)));
  const letter = Math.min(count - 1, Math.floor(progress * count));
  const t = Math.min(1, (progress * count - letter) / .8);
  const eased = t * t * (3 - 2 * t);
  return edges[letter] + (edges[letter + 1] - edges[letter]) * eased;
};
