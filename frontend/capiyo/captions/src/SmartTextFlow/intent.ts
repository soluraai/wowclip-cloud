import type { FlowCue, FlowEmphasis, FlowToken } from "./types";

export const flowSegmentId = (token: FlowToken) => token.id.startsWith("s") ? token.id.split("-").slice(0, 2).join("-") : token.id;
const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const statementWords = new Set("dream dreams identity potential courage confidence meaning success change believe growth मेहनत पहचान सपने हिम्मत".split(" "));
export const flowEffect = (cue: FlowCue, token: FlowToken): FlowEmphasis => {
  if (token.emphasis !== "none") return token.emphasis;
  if (token.id !== cue.focusId) return "none";
  if (token.number) return "textColor";
  if (cue.tokens.some((word) => /[?？]$/u.test(word.text))) return "circle";
  if (["focus", "attention", "protect", "potential", "identity"].includes(plain(token.text))) return "bracket";
  if (token.role === "expressive" || token.role === "script" || ["grow", "growth", "progress", "steps", "story", "chapter", "powerful"].includes(plain(token.text))) return "underline";
  return "marker";
};

export const flowScene = (cue: FlowCue) => {
  // Authored multi-line geometry takes precedence over an automatic hero stage.
  const explicitLines = cue.tokens.slice(1).filter((word) => word.breakBefore).length;
  if (cue.metricId && explicitLines < 2) return { kind: "metric" as const, heroIds: [cue.metricId] };
  if (explicitLines) return { kind: "prose" as const, heroIds: [] as string[] };
  const focus = cue.tokens.find((word) => word.id === cue.focusId);
  if (!focus) return { kind: "prose" as const, heroIds: [] as string[] };
  const group = cue.tokens.filter((word) => flowSegmentId(word) === flowSegmentId(focus));
  const editorial = group.some((word) => word.role === "expressive" || word.role === "script" || word.marked) ||
    (focus.role === "strong" && statementWords.has(plain(focus.text)) && cue.tokens.length <= 7);
  const index = cue.tokens.indexOf(group[0]), after = cue.tokens.length - index - group.length;
  if (editorial && cue.tokens.length >= 3 && group.length <= 3 && index <= 4 && after <= 4 && group.map((word) => word.text).join(" ").length <= 24) {
    return { kind: "statement" as const, heroIds: group.map((word) => word.id) };
  }
  return { kind: "prose" as const, heroIds: [] as string[] };
};

export const flowReveal = (cue: FlowCue, token: FlowToken) => token.number ? "soft" :
  token.role === "script" || token.role === "expressive" ? "ink" :
    token.role === "strong" && flowEffect(cue, token) !== "none" ? "lift-mask" : "soft";
