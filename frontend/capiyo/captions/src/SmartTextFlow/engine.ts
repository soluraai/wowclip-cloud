import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { clamp, finite, isRecord } from "../CaptionEngine/types";
import defaults from "./smart-text-flow.config.json";
import { FLOW_PALETTE, flowColor } from "./colors";
import { formatFlowNumber, segmentNumber, textNumber } from "./numbers";
import type { FlowCue, FlowEmphasis, FlowRole, FlowSettings, FlowSource, FlowStyle, FlowToken } from "./types";

const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
export const resolveFlowStyle = (style: FlowStyle = {}): FlowSettings => ({
  accent: color(style.accent, defaults.accent), text: color(style.text, defaults.text), canvas: color(style.canvas, defaults.canvas),
  positionY: clamp(finite(style.positionY, defaults.positionY), 0.2, 0.82),
  maxWidth: clamp(finite(style.maxWidth, defaults.maxWidth), 0.5, 0.9),
  fontSize: clamp(finite(style.fontSize, defaults.fontSize), 30, 60),
  maxWords: Math.round(clamp(finite(style.maxWords, defaults.maxWords), 3, 12)),
  maxCharacters: Math.round(clamp(finite(style.maxCharacters, defaults.maxCharacters), 24, 80)),
  maxDurationMs: clamp(finite(style.maxDurationMs, defaults.maxDurationMs), 800, 5000),
  maxGapMs: clamp(finite(style.maxGapMs, defaults.maxGapMs), 100, 1000),
  wordMs: clamp(finite(style.wordMs, defaults.wordMs), 100, 700),
  holdMs: clamp(finite(style.holdMs, defaults.holdMs), 100, 900),
  maxLines: Math.round(clamp(finite(style.maxLines, defaults.maxLines), 2, 3)),
  glow: clamp(finite(style.glow, defaults.glow), 0, 1.5),
  scrimOpacity: clamp(finite(style.scrimOpacity, defaults.scrimOpacity), 0, 1),
  transparent: style.transparent === true,
  numberLayout: style.numberLayout === "inline" ? "inline" : "hero",
  colorMode: style.colorMode === "palette" ? "palette" : "single",
  palette: Array.isArray(style.palette) && style.palette.some(value => flowColor(value))
    ? style.palette.map(value => flowColor(value)).filter((value): value is string => Boolean(value)).slice(0, 8) : FLOW_PALETTE,
});

const common = new Set("a an and are as at be been but by can do for from has have i in is it its just my of on or our so that the their this to was we were will with you your है हैं का की के को में और तो ये एक से पर नहीं".split(" "));
const emphasis = new Set("why dreams dream life change grow growth believe potential identity consistency question success failure courage मेहनत पहचान सपने हिम्मत".split(" "));
const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const focusToken = (tokens: FlowToken[]) => {
  const ranked = tokens.map((token, index) => ({ token, score:
    (token.marked ? 50 : 0) + (token.number ? 25 : 0) + (token.role === "expressive" ? 8 : token.role === "strong" ? 5 : 0) +
    (emphasis.has(bare(token.text)) ? 7 : 0) +
    Math.min(9, [...bare(token.text)].length) - (common.has(bare(token.text)) ? 12 : 0) + (index === tokens.length - 1 ? 1 : 0),
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 4 ? ranked[0].token.id : null;
};

const roleOf = (style: unknown): FlowRole => style === "bold" ? "strong" : style === "cursive" ? "script" :
  ["italic", "serif", "italic-serif"].includes(String(style)) ? "expressive" : "body";
const emphasisOf = (value: unknown, highlight: unknown): FlowEmphasis =>
  ["marker", "underline", "box", "textColor", "circle", "bracket", "strike"].includes(String(value)) ? value as FlowEmphasis : highlight === true ? "marker" : "none";

/** `mixFocus`: in Mix captions the focus word shows its English-letters spelling (Smart Text). Editorial Type picks its own big word. */
export const compileSmartTextFlow = (source: FlowSource, settings = resolveFlowStyle(), fps = 30, mixFocus = true) => {
  const diagnostics: string[] = [];
  const tokens: FlowToken[] = [];
  if (source.transcript !== undefined) {
    const normalized = normalizeTranscript(source.transcript);
    diagnostics.push(...normalized.diagnostics);
    const keyWords = new Set((Array.isArray(source.transcript) ? source.transcript as { id?: string; emphasis?: boolean }[] : [])
      .filter((word) => word.emphasis && word.id).map((word) => word.id));
    tokens.push(...normalized.words.map((word) => {
      const number = textNumber(word.text);
      return { id: word.id, text: word.text, startMs: word.startMs, endMs: word.endMs,
        role: number ? "number" as const : "body" as const, number, marked: keyWords.has(word.id), emphasis: "none" as const, large: false,
        breakBefore: false, breakAfter: word.pageBreakAfter === true, ...(word.mix ? { mix: word.mix } : {}) };
    }));
  } else {
    const pages = Array.isArray(source.cues) ? source.cues : [{ segments: source.segments ?? [] }];
    let cursor = 0;
    pages.forEach((page, pageIndex) => {
      if (!isRecord(page) || !Array.isArray(page.segments)) { diagnostics.push(`Ignored invalid cue ${pageIndex}.`); return; }
      const cueStart = Math.max(cursor, finite(page.startMs, cursor));
      cursor = cueStart;
      const firstIndex = tokens.length;
      page.segments.forEach((segment: unknown, segmentIndex: number) => {
        if (!isRecord(segment) || !["text", "number"].includes(String(segment.type))) {
          diagnostics.push(`Ignored invalid segment ${pageIndex}:${segmentIndex}.`); return;
        }
        const number = segment.type === "number" ? segmentNumber(segment) : null;
        if (segment.type === "number" && !number) { diagnostics.push(`Ignored invalid numeric segment ${pageIndex}:${segmentIndex}.`); return; }
        let value = number ? formatFlowNumber(number) : typeof segment.value === "string" ? segment.value.trim() : "";
        if (segment.case === "uppercase") value = value.toUpperCase();
        if (segment.case === "lowercase") value = value.toLowerCase();
        if (segment.case === "title") value = value.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
        const words = number ? [value] : value.split(/\s+/u).filter(Boolean);
        const start = Math.max(cursor, finite(segment.startMs, cursor), cueStart + Math.max(0, finite(segment.delayFrames, 0)) * 1000 / fps);
        const duration = Math.max(words.length * 80, finite(segment.endMs, start + words.length * settings.wordMs) - start);
        words.forEach((text, wordIndex) => {
          const numeric = number ?? textNumber(text);
          tokens.push({ id: `s${pageIndex}-${segmentIndex}-${wordIndex}`, text,
            startMs: start + duration * wordIndex / words.length, endMs: start + duration * (wordIndex + 1) / words.length,
            role: numeric ? "number" : roleOf(segment.style), number: numeric,
            emphasis: emphasisOf(segment.emphasis, segment.highlight), large: segment.display === "hero",
            marked: segment.highlight === true || (typeof segment.emphasis === "string" && segment.emphasis !== "none"),
            breakBefore: segment.lineBreak === true && wordIndex === 0, breakAfter: false,
            ...(settings.colorMode === "palette" && flowColor(segment.color) ? { color: flowColor(segment.color) } : {}),
            ...(settings.colorMode === "palette" && flowColor(segment.emphasisColor) ? { emphasisColor: flowColor(segment.emphasisColor) } : {}) });
        });
        if (words.length) cursor = start + duration;
      });
      if (tokens.length > firstIndex) {
        const last = tokens[tokens.length - 1];
        last.endMs = Math.max(last.endMs, finite(page.endMs, last.endMs));
        last.breakAfter = true;
        cursor = last.endMs + settings.holdMs + 150;
      }
    });
  }
  const groups: FlowToken[][] = [];
  let pending: FlowToken[] = [];
  const flush = () => { if (pending.length) groups.push(pending); pending = []; };
  for (const token of tokens) {
    const previous = pending[pending.length - 1];
    const characters = pending.reduce((sum, item) => sum + item.text.length + 1, 0) + token.text.length;
    if (previous && (pending.length >= settings.maxWords || characters > settings.maxCharacters ||
      (token.breakBefore && 1 + pending.slice(1).filter((item) => item.breakBefore).length >= settings.maxLines) ||
      token.startMs - pending[0].startMs > settings.maxDurationMs || token.startMs - previous.endMs > settings.maxGapMs)) flush();
    pending.push(token);
    if (token.breakAfter || /[.!?;।]$/u.test(token.text)) flush();
  }
  flush();
  // Avoid a one-word leftover solely caused by the chunk capacity limit.
  for (let index = 1; index < groups.length; index++) {
    const group = groups[index], previous = groups[index - 1];
    while (group.length < 3 && previous.length > 4 && !previous[previous.length - 1].breakAfter &&
      !group[0].breakBefore && !previous[previous.length - 1].breakBefore &&
      !/[.!?;।]$/u.test(previous[previous.length - 1].text) &&
      group[0].startMs - previous[previous.length - 1].endMs <= settings.maxGapMs) {
      const candidate = previous[previous.length - 1];
      if ([candidate, ...group].map((token) => token.text).join(" ").length > settings.maxCharacters ||
        group[group.length - 1].startMs - candidate.startMs > settings.maxDurationMs) break;
      previous.pop(); group.unshift(candidate);
    }
  }
  const cues: FlowCue[] = groups.map((group, index) => {
    // Explicit emphasis survives compilation; ordinary speech gets a real marker focus.
    const focusId = focusToken(group);
    const typed = group.some((token) => token.role !== "body");
    const editorial = settings.colorMode === "palette" && group.length <= 7 && group.some(token => emphasis.has(bare(token.text)));
    const expressiveRole: FlowRole = editorial && index % 4 === 1 ? "expressive" : editorial && index % 4 === 3 ? "script" : "strong";
    const styled = group.map((token) => token.id === focusId && !typed && !token.number
      ? { ...token, role: expressiveRole, text: mixFocus && token.mix ? token.mix : token.text }
      : token.id === focusId && !token.number && mixFocus && token.mix ? { ...token, text: token.mix } : token);
    const metric = group.filter((token) => token.number && (token.large || token.number.prefix.length > 0 || token.number.suffix.includes("%") || Math.abs(token.number.value) >= 1000 ||
      token.number.divisor > 1 || /(?:^[kmb]$|lakh|crore|\bcr\b|लाख|करोड़)/iu.test(token.number.suffix)))
      .sort((a, b) => Number(b.large) - Number(a.large) || Math.abs(b.number!.value) - Math.abs(a.number!.value))[0];
    return { id: `flow-${group[0].id}`, tokens: styled, focusId, metricId: metric?.id ?? null, startMs: group[0].startMs,
      endMs: Math.min(Math.max(...group.map((token) => token.endMs)) + settings.holdMs,
        groups[index + 1]?.[0].startMs ?? Infinity) };
  });
  if (!tokens.length && !diagnostics.length) diagnostics.push("No valid text or number segments were supplied.");
  return { tokens, cues, diagnostics, durationMs: Math.max(1000, finite(source.durationMs, 0),
    finite(source.composition?.durationSeconds, 0) * 1000, cues[cues.length - 1]?.endMs ?? 0) };
};

export const currentFlowCue = (cues: FlowCue[], now: number): FlowCue | null => {
  let low = 0, high = cues.length - 1, index = -1;
  while (low <= high) { const middle = (low + high) >>> 1;
    if (cues[middle].startMs <= now) { index = middle; low = middle + 1; } else high = middle - 1; }
  return index >= 0 && now < cues[index].endMs ? cues[index] : null;
};
