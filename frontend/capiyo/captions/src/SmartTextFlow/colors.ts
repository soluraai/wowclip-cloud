import type { FlowCue, FlowSettings, FlowToken } from "./types";

// Lightened versions of SmartTextView's palette stay readable over real footage.
export const FLOW_PALETTE = ["#67E8F9", "#FBBF77", "#C4B5FD", "#FDA4AF", "#6EE7B7"];
const NAMED_COLORS: Record<string, string> = {
  primary: "#F8FAFC", slate: "#CBD5E1", blue: "#93C5FD", amber: "#FCD34D",
  rose: "#FDA4AF", emerald: "#6EE7B7", violet: "#C4B5FD", teal: "#5EEAD4",
  orange: "#FDBA74", cyan: "#67E8F9", white: "#FFFFFF", black: "#0F172A",
};
export const flowColor = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) return named;
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map(c => c + c).join("")}`;
  return undefined;
};
export const flowCueAccent = (cue: FlowCue, settings: FlowSettings) => {
  if (settings.colorMode !== "palette") return settings.accent;
  const focus = cue.tokens.find(token => token.id === cue.focusId);
  const explicit = flowColor(focus?.emphasisColor) ?? flowColor(focus?.color);
  if (explicit) return explicit;
  let hash = 0;
  for (const c of cue.id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return settings.palette[hash % settings.palette.length] ?? settings.accent;
};
export const flowTokenInk = (token: FlowToken, settings: FlowSettings, fallback: string) =>
  settings.colorMode === "palette" ? flowColor(token.color) ?? fallback : fallback;
