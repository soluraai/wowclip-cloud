import defaultConfig from "./reference-stack.config.json";
import { clamp, finite } from "../CaptionEngine/types";

export type StackRoleName =
  | "body"
  | "serif"
  | "italic"
  | "hero"
  | "label"
  | "strong";

export type StackRevealMode = "word" | "character";

export type StackFontConfig = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  src?: string;
};

export type StackRoleConfig = {
  font: "sans" | "serif" | "italic";
  size: number;
  tracking: number;
  widthScale?: number;
};

export type StackConfig = {
  fonts: {
    sans: StackFontConfig;
    serif: StackFontConfig;
    italic: StackFontConfig;
  };
  roles: Record<StackRoleName, StackRoleConfig>;
  layout: {
    positionX: number;
    baselineY: number;
    maxWidth: number;
    safeMargin: number;
    lineStep: number;
    overlapFactor: number;
    /** Vertical glyph stretch around the reading baseline; width stays measured separately. */
    heightScale?: number;
  };
  phrasing: {
    maxWords: number;
    maxDurationMs: number;
    maxGapMs: number;
    lingerMs: number;
  };
  motion: {
    entryMs: number;
    letterStaggerMs: number;
    rise: number;
    blur: number;
    variation: number;
    scaleFrom: number;
    exitMs: number;
    settleScale: number;
    settleMs: number;
    settleLift: number;
    initialWordsVisible: boolean;
  };
  depth: {
    overlap?: number;
    perspective?: number;
    recedeZ?: number;
    tilt?: number;
    restBlur?: number;
    arriveZ?: number;
    enabled: boolean;
    frequency: number;
    recedeMs: number;
    liftPx: number;
    pushPx?: number;
    /** How far the arriving line starts below its slot (720-wide px). */
    risePx?: number;
    /** Focus-pull blur while the arriving line descends (720-wide px). */
    arrivalBlur?: number;
    shadowBlurPx: number;
    shadowRisePx: number;
    shadowOpacity: number;
    shadowLightOpacity: number;
  };
  focus: {
    enabled: boolean;
    previousLineOpacity: number;
    handoffDelayMs: number;
    transitionMs: number;
    arrivalGlowMs: number;
    arrivalGlowOpacity: number;
  };
  color: string;
  ink: { top: string; middle: string; bottom: string };
  glow: {
    enabled: boolean;
    color: string;
    radius: number;
    opacity: number;
    roles: Record<StackRoleName, number>;
  };
  background: {
    dim: number;
    objectFit: "cover" | "contain";
    scrim?: {
      enabled?: boolean;
      opacity?: number;
    };
  };
};

export type StackWordInput = {
  id?: string;
  text?: string;
  word?: string;
  startMs?: number;
  endMs?: number;
  start?: number;
  end?: number;
  pageBreakAfter?: boolean;
};

export type StackWord = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  pageBreakAfter?: boolean;
};

export type StackPlanLine = {
  wordIds: string[];
  role: StackRoleName;
  offsetX?: number;
  baseline?: number;
  size?: number;
  reveal?: StackRevealMode;
};

export type StackPlanCue = {
  wordIds: string[];
  lines: StackPlanLine[];
};

export type StackPlan = {
  cues: StackPlanCue[];
};

export type StackSource = {
  transcript: unknown;
  plan?: StackPlan;
  durationMs?: number;
  designSeed?: string | number;
  background?: {
    src: string;
    muted?: boolean;
    volume?: number;
  };
};

export type CompiledStackLine = {
  words: StackWord[];
  role: StackRoleName;
  offsetX: number;
  baseline?: number;
  size?: number;
  reveal: StackRevealMode;
};

export type CompiledStackCue = {
  id: string;
  words: StackWord[];
  lines: CompiledStackLine[];
  startMs: number;
  endMs: number;
  depthEnabled?: boolean;
};

export type CompiledReferenceStack = {
  words: StackWord[];
  cues: CompiledStackCue[];
  durationMs: number;
  diagnostics: string[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "its",
  "that",
  "this",
  "these",
  "those",
  "my",
  "your",
  "our",
  "their",
  "his",
  "her",
  "me",
  "you",
  "we",
  "they",
  "i",
  "so",
  "as",
  "just",
  "not",
  "no",
  "yes",
  "do",
  "did",
  "does",
  "had",
  "has",
  "have",
  "got",
  "get",
  "from",
]);

const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export const resolveStackConfig = (override?: unknown): StackConfig => {
  const base = defaultConfig as StackConfig;
  if (!isObject(override)) return base;

  const mergeSection = <T extends Record<string, unknown>>(
    target: T,
    source: unknown,
  ): T => {
    if (!isObject(source)) return target;
    return { ...target, ...source } as T;
  };

  const fontsOverride = isObject(override.fonts) ? override.fonts : {};
  const rolesOverride = isObject(override.roles) ? override.roles : {};

  return {
    fonts: {
      sans: mergeSection(base.fonts.sans, fontsOverride.sans),
      serif: mergeSection(base.fonts.serif, fontsOverride.serif),
      italic: mergeSection(base.fonts.italic, fontsOverride.italic),
    },
    roles: {
      body: mergeSection(base.roles.body, rolesOverride.body),
      serif: mergeSection(base.roles.serif, rolesOverride.serif),
      italic: mergeSection(base.roles.italic, rolesOverride.italic),
      hero: mergeSection(base.roles.hero, rolesOverride.hero),
      label: mergeSection(base.roles.label, rolesOverride.label),
      strong: mergeSection(base.roles.strong, rolesOverride.strong),
    },
    layout: mergeSection(base.layout, override.layout),
    phrasing: mergeSection(base.phrasing, override.phrasing),
    motion: mergeSection(base.motion, override.motion),
    depth: mergeSection(base.depth, override.depth),
    focus: mergeSection(base.focus, override.focus),
    color: typeof override.color === "string" ? override.color : base.color,
    ink:
      typeof override.color === "string" && !isObject(override.ink)
        ? {
            top: override.color,
            middle: override.color,
            bottom: override.color,
          }
        : mergeSection(base.ink, override.ink),
    glow: {
      ...mergeSection(base.glow, override.glow),
      roles: mergeSection(
        base.glow.roles,
        isObject(override.glow) ? override.glow.roles : undefined,
      ),
    },
    background: mergeSection(base.background, override.background),
  };
};

const cleanWordText = (raw: string): string => {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed;
};

const extractRawWords = (transcript: unknown): StackWordInput[] => {
  if (Array.isArray(transcript)) return transcript as StackWordInput[];
  if (isObject(transcript)) {
    if (Array.isArray(transcript.captions))
      return transcript.captions as StackWordInput[];
    if (Array.isArray(transcript.words)) {
      return transcript.words as StackWordInput[];
    }
    if (Array.isArray(transcript.segments)) {
      const flattened: StackWordInput[] = [];
      for (const seg of transcript.segments) {
        if (isObject(seg) && Array.isArray(seg.words)) {
          flattened.push(...(seg.words as StackWordInput[]));
        }
      }
      if (flattened.length > 0) return flattened;
    }
  }
  return [];
};

export const normalizeTranscript = (
  transcript: unknown,
  diagnostics: string[],
): StackWord[] => {
  const rawList = extractRawWords(transcript);
  if (!rawList.length)
    diagnostics.push(
      "Supply a word-timed transcript; plain text needs speech timestamps first.",
    );
  const words: StackWord[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!isObject(item)) continue;

    const rawText =
      typeof item.text === "string"
        ? item.text
        : typeof item.word === "string"
          ? item.word
          : "";
    const text = cleanWordText(rawText);
    if (!text) continue;

    let startMs =
      typeof item.startMs === "number"
        ? item.startMs
        : typeof item.start === "number"
          ? item.start * 1000
          : NaN;
    let endMs =
      typeof item.endMs === "number"
        ? item.endMs
        : typeof item.end === "number"
          ? item.end * 1000
          : NaN;

    if (!Number.isFinite(startMs) && words.length > 0) {
      startMs = words[words.length - 1].endMs;
    }
    if (!Number.isFinite(startMs)) startMs = 0;
    if (!Number.isFinite(endMs) || endMs < startMs) {
      endMs = startMs + 180;
    }

    startMs = Math.max(0, startMs);
    const baseId =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `w${words.length}`;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix++}`;
    }
    usedIds.add(id);

    words.push({
      id,
      text,
      startMs: Math.max(0, startMs),
      endMs: Math.max(startMs + 1, endMs),
      pageBreakAfter: Boolean(item.pageBreakAfter),
    });
  }

  return words.sort((a, b) => a.startMs - b.startMs);
};

// A design seed is chosen once for a caption job (for example, from its user ID).
// Every frame of that job then receives the same composition.
const seededRandom = (key: string) => {
  let state = 2166136261;
  for (const char of key)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  if (!state) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

const bareWord = (text: string): string =>
  text.replace(/[^\p{L}\p{M}\p{N}']/gu, "").toLowerCase();

const scoreWordImpact = (
  word: StackWord,
  indexInCue: number,
  totalInCue: number,
): number => {
  const clean = bareWord(word.text);
  if (!clean) return 0;
  let score = clean.length * 1.25;
  if (STOPWORDS.has(clean)) score -= 6;
  if (/[!?,.;:]$/.test(word.text)) score += 2.5;
  const duration = word.endMs - word.startMs;
  if (duration > 340) score += 3;
  if (indexInCue === totalInCue - 1) score += 2.2;
  return score;
};

const groupWordsIntoPhrases = (
  words: StackWord[],
  settings: StackConfig,
): StackWord[][] => {
  const groups: StackWord[][] = [];
  let current: StackWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prev = current[current.length - 1];

    if (prev) {
      const gap = word.startMs - prev.endMs;
      const duration = word.endMs - current[0].startMs;
      const sentenceEnd = /[.!?]$/.test(prev.text);
      const clauseEnd = /[,;:—]$/.test(prev.text) && current.length >= 3;

      if (
        word.startMs > current[0].startMs &&
        (prev.pageBreakAfter ||
          gap > settings.phrasing.maxGapMs ||
          current.length >= settings.phrasing.maxWords ||
          duration > settings.phrasing.maxDurationMs ||
          (sentenceEnd && current.length >= 2) ||
          clauseEnd)
      ) {
        groups.push(current);
        current = [];
      }
    }

    current.push(word);
  }

  if (current.length > 0) groups.push(current);
  return groups;
};

const buildDynamicEditorialLines = (
  cueWords: StackWord[],
  cueIndex: number,
  settings: StackConfig,
  designSeed: string | number,
): CompiledStackLine[] => {
  const n = cueWords.length;
  const random = seededRandom(
    `${designSeed}:${cueIndex}:${cueWords.map((w) => w.id).join("/")}`,
  );
  const choice = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const countRoll = random();
  const lineCount =
    n === 1
      ? 1
      : n === 2
        ? countRoll < 0.48
          ? 1
          : 2
        : n === 3
          ? countRoll < 0.8
            ? 2
            : 3
          : n === 4
            ? countRoll < 0.65
              ? 2
              : 3
            : countRoll < 0.4
              ? 2
              : 3;

  // Enumerate short, ordered line breaks. This is at most 64 candidates for
  // seven words, and preserves the source transcript exactly.
  const candidates: StackWord[][][] = [];
  const collect = (start: number, remaining: number, lines: StackWord[][]) => {
    if (remaining === 1) {
      candidates.push([...lines, cueWords.slice(start)]);
      return;
    }
    for (let end = start + 1; end <= n - remaining + 1; end++) {
      collect(end, remaining - 1, [...lines, cueWords.slice(start, end)]);
    }
  };
  collect(0, lineCount, []);
  const totalChars =
    cueWords.reduce((sum, word) => sum + word.text.length, 0) + n - lineCount;
  const idealChars = totalChars / lineCount;
  const bestIndex = cueWords.reduce(
    (best, word, index) =>
      scoreWordImpact(word, index, n) > scoreWordImpact(cueWords[best], best, n)
        ? index
        : best,
    0,
  );
  const impactWord = cueWords[bestIndex];
  const scored = candidates
    .map((parts) => {
      let penalty = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const chars = part.map((word) => word.text).join(" ").length;
        penalty += Math.abs(chars - idealChars) * 0.32;
        penalty += Math.max(0, chars - 19) * 1.5;
        // Never isolate a single connector, pronoun, or stopword onto its own line
        if (part.length === 1 && STOPWORDS.has(bareWord(part[0].text)))
          penalty += 45;
        if (i < parts.length - 1) {
          const tail = part[part.length - 1];
          if (STOPWORDS.has(bareWord(tail.text))) penalty += 5;
          if (/[,;:!?]$/.test(tail.text)) penalty -= 1.5;
        }
        if (
          part.includes(impactWord) &&
          bareWord(impactWord.text).length >= 6
        ) {
          penalty -= part.length === 1 ? 4 : part.length === 2 ? 1.5 : 0;
        }
      }
      return { parts, penalty };
    })
    .sort((a, b) => a.penalty - b.penalty);
  const shortlist = scored
    .filter((item) => item.penalty <= scored[0].penalty + 0.9)
    .slice(0, 3);
  const parts = choice(shortlist).parts;
  const emphasisLine = parts.findIndex((part) => part.includes(impactWord));
  const side = random() < 0.5 ? -1 : 1;

  const lines = parts.map((part, index): CompiledStackLine => {
    const chars = part.map((word) => word.text).join(" ").length;
    const impact = Math.max(
      ...part.map((word) => scoreWordImpact(word, cueWords.indexOf(word), n)),
    );
    const mostlyHelpers = part.every((word) =>
      STOPWORDS.has(bareWord(word.text)),
    );
    let roles: StackRoleName[];
    if (mostlyHelpers) roles = ["body", "body", "serif"];
    else if (index === emphasisLine) {
      roles =
        chars > 16
          ? ["serif", "italic", "strong"]
          : part.length === 1
            ? ["hero", "serif", "italic", "strong"]
            : ["serif", "italic", "strong", "hero"];
    } else if (impact < 5)
      roles =
        index === 0 ? ["body", "strong", "serif"] : ["body", "body", "serif"];
    else
      roles =
        chars > 18
          ? ["body", "serif", "italic"]
          : ["body", "serif", "italic", "strong"];
    const role = choice(roles);
    const centered = lineCount === 1 || random() < 0.18;
    const offsetX = centered
      ? 0
      : side * (index % 2 === 0 ? 1 : -1) * (0.035 + random() * 0.07);
    const baseSize = settings.roles[role].size;
    // Keep automatic typography within the enlarged role-size range.
    const size = Math.round(
      clamp(
        baseSize * (lineCount === 3 ? 0.96 : 1) * (0.97 + random() * 0.06),
        49,
        70,
      ),
    );
    return {
      words: part,
      role,
      offsetX: Math.round(offsetX * 1000) / 1000,
      size,
      reveal:
        role === "hero" && part.length === 1 && chars <= 10
          ? "character"
          : "word",
    };
  });
  if (
    lines.length > 1 &&
    lines.every(
      (line) =>
        settings.roles[line.role].font === settings.roles[lines[0].role].font,
    )
  ) {
    const contrast =
      settings.roles[lines[0].role].font === "sans" ? "serif" : "body";
    lines[emphasisLine].role = contrast;
    lines[emphasisLine].size = Math.round(
      clamp(
        settings.roles[contrast].size * (lineCount === 3 ? 0.96 : 1),
        49,
        70,
      ),
    );
    lines[emphasisLine].reveal = "word";
  }
  return lines;
};

const compilePlannedCues = (
  words: StackWord[],
  plan: StackPlan,
  settings: StackConfig,
  diagnostics: string[],
): CompiledStackCue[] | null => {
  if (!plan || !Array.isArray(plan.cues) || plan.cues.length === 0) {
    return null;
  }

  const wordMap = new Map<string, { word: StackWord; index: number }>();
  words.forEach((word, index) => wordMap.set(word.id, { word, index }));

  const compiledCues: CompiledStackCue[] = [];

  for (let c = 0; c < plan.cues.length; c++) {
    const rawCue = plan.cues[c];
    if (
      !rawCue ||
      !Array.isArray(rawCue.wordIds) ||
      rawCue.wordIds.length === 0
    ) {
      diagnostics.push(
        `Cue ${c} has no wordIds; falling back to automatic layout.`,
      );
      return null;
    }

    const cueWords: StackWord[] = [];
    let prevIndex = -1;
    for (const id of rawCue.wordIds) {
      const entry = wordMap.get(id);
      if (!entry) {
        diagnostics.push(`Cue ${c} references unknown wordId "${id}".`);
        return null;
      }
      if (prevIndex !== -1 && entry.index !== prevIndex + 1) {
        diagnostics.push(`Cue ${c} wordIds are not consecutive at "${id}".`);
        return null;
      }
      prevIndex = entry.index;
      cueWords.push(entry.word);
    }

    const flatLineIds: string[] = [];
    const compiledLines: CompiledStackLine[] = [];

    if (!Array.isArray(rawCue.lines)) return null;
    for (const line of rawCue.lines) {
      if (!line || !Array.isArray(line.wordIds)) return null;
      const lineWords: StackWord[] = [];
      for (const id of line.wordIds ?? []) {
        const entry = wordMap.get(id);
        if (!entry) return null;
        lineWords.push(entry.word);
        flatLineIds.push(id);
      }
      if (lineWords.length === 0) continue;

      const role: StackRoleName =
        line.role &&
        Object.prototype.hasOwnProperty.call(settings.roles, line.role)
          ? line.role
          : "body";

      compiledLines.push({
        words: lineWords,
        role,
        offsetX: finite(line.offsetX, 0),
        baseline: typeof line.baseline === "number" ? line.baseline : undefined,
        size: typeof line.size === "number" ? line.size : undefined,
        reveal: line.reveal === "character" ? "character" : "word",
      });
    }

    if (
      flatLineIds.length !== rawCue.wordIds.length ||
      flatLineIds.some((id, idx) => id !== rawCue.wordIds[idx])
    ) {
      diagnostics.push(`Cue ${c} line wordIds do not match cue wordIds.`);
      return null;
    }

    const startMs = cueWords[0].startMs;
    const rawEndMs = Math.max(...cueWords.map((word) => word.endMs));

    compiledCues.push({
      id: `cue-${c}`,
      words: cueWords,
      lines: compiledLines,
      startMs,
      endMs: rawEndMs,
    });
  }

  const selectedIds = compiledCues.flatMap((cue) =>
    cue.words.map((word) => word.id),
  );
  if (
    selectedIds.length !== words.length ||
    selectedIds.some((id, i) => id !== words[i]?.id)
  ) {
    diagnostics.push(
      "Plan must cover every word once in transcript order; using automatic layout.",
    );
    return null;
  }
  return compiledCues;
};

export const compileReferenceStack = (
  source: StackSource | undefined,
  settings: StackConfig = resolveStackConfig(),
): CompiledReferenceStack => {
  const diagnostics: string[] = [];
  const words = normalizeTranscript(source?.transcript, diagnostics);

  let cues: CompiledStackCue[] | null = source?.plan
    ? compilePlannedCues(words, source.plan, settings, diagnostics)
    : null;

  if (!cues) {
    const groups = groupWordsIntoPhrases(words, settings);
    cues = groups.map((group, idx) => ({
      id: `auto-cue-${idx}`,
      words: group,
      lines: buildDynamicEditorialLines(
        group,
        idx,
        settings,
        source?.designSeed ?? "reference-stack",
      ).map((line) => ({
        ...line,
        // Automatic baselines follow the actual font metrics; plans remain explicit.
        baseline: undefined,
      })),
      startMs: group[0].startMs,
      endMs: Math.max(...group.map((word) => word.endMs)),
    }));
  }

  // Pick the layered treatment once per cue and seed, never during rendering.
  // Single-line cues stay clean and some multi-line cues retain a flatter rhythm.
  cues.forEach((cue) => {
    const roll = seededRandom(
      `${source?.designSeed ?? "reference-stack"}:depth:${cue.id}`,
    )();
    cue.depthEnabled =
      settings.depth.enabled &&
      cue.lines.length > 1 &&
      roll < clamp(finite(settings.depth.frequency, 0.68), 0, 1);
  });

  // Apply lingerMs without overlapping the next cue's startMs
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const nextStart = i + 1 < cues.length ? cues[i + 1].startMs : Infinity;
    const lingered =
      cue.endMs + clamp(finite(settings.phrasing.lingerMs, 90), 0, 500);
    cue.endMs = Math.min(Math.max(cue.startMs + 1, lingered), nextStart);
  }

  const lastWordEnd =
    words.length > 0 ? words[words.length - 1].endMs + 200 : 1000;
  const durationMs = Math.max(
    1,
    finite(source?.durationMs, lastWordEnd),
    ...cues.map((cue) => cue.endMs),
  );

  return {
    words,
    cues,
    durationMs,
    diagnostics,
  };
};
