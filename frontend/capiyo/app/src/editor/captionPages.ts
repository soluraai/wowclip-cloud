import type { Cue } from "../app/CaptionTimeline";

/**
 * Splits words into caption pages in code, so pages follow the current font size, box width
 * and word limit instantly. The AI only marks small chunks ("why not you?") that stay whole.
 */
export type PageLimits = { maxWords: number; maxCharacters: number };

const MAX_GAP_SECONDS = 0.32;
const MAX_PAGE_SECONDS = 2.8;
const SENTENCE_END = /[.!?।॥…]["'”’)]*$/u;
const CLAUSE_END = /[,;:—]["'”’)]*$/u;
// A page should not stop on a word that leans into the next one.
const DANGLING = new Set(
  (
    "a an the to of in on at for from with by as and or but so if that this these those " +
    "my your our his her their is are was were be am can will would could should " +
    "have has had do does did i we they he she i'm we're you're they're i've you've"
  ).split(" "),
);

const text = (cue: Cue) =>
  [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" ").trim();
const length = (cues: Cue[]) =>
  cues.reduce((sum, cue, index) => sum + text(cue).length + (index ? 1 : 0), 0);
const isDangling = (cue: Cue) =>
  DANGLING.has(text(cue).toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""));

/** Words that must stay together; a chunk too wide for one page falls back to single words. */
function toUnits(cues: Cue[], limits: PageLimits) {
  const units: Cue[][] = [];
  for (const cue of cues) {
    const last = units[units.length - 1];
    // Very short pages are a deliberate choice (One Word), so chunks give way to them.
    if (limits.maxWords >= 3 && cue.chunkId && last?.[0].chunkId === cue.chunkId) last.push(cue);
    else units.push([cue]);
  }
  return units.flatMap((unit) =>
    length(unit) > limits.maxCharacters ? unit.map((cue) => [cue]) : [unit],
  );
}

/** True when only one word of the sentence remains from units[index] on. */
function leavesOrphan(units: Cue[][], index: number) {
  const unit = units[index];
  return unit.length === 1 && SENTENCE_END.test(text(unit[0]));
}

export function layoutCaptionPages(cues: Cue[], limits: PageLimits): Cue[] {
  const units = toUnits(cues, limits);
  const breaks = new Set<string>();
  let page: Cue[][] = [];
  const flush = () => {
    const words = page.flat();
    if (words.length) breaks.add(words[words.length - 1].id);
    page = [];
  };
  let index = 0;
  while (index < units.length) {
    const unit = units[index];
    const words = page.flat();
    const previous = words[words.length - 1];
    if (previous) {
      const next = [...words, ...unit];
      const full =
        next.length > limits.maxWords ||
        length(next) > limits.maxCharacters ||
        unit[unit.length - 1].end - words[0].start > MAX_PAGE_SECONDS;
      if (unit[0].start - previous.end > MAX_GAP_SECONDS) flush();
      else if (full) {
        // Hand trailing units to the next page rather than leave a dangling word or a
        // single-word page after this one.
        while (
          page.length > 1 &&
          page.flat().length >= 3 &&
          (isDangling(page[page.length - 1].at(-1)!) || leavesOrphan(units, index))
        ) {
          page.pop();
          index--;
        }
        flush();
        continue;
      }
    }
    page.push(unit);
    index++;
    const lastWord = text(unit[unit.length - 1]);
    if (
      SENTENCE_END.test(lastWord) ||
      (CLAUSE_END.test(lastWord) && page.flat().length >= 2)
    )
      flush();
  }
  flush();
  return cues.map((cue) => ({ ...cue, pageBreak: breaks.has(cue.id) || undefined }));
}

/**
 * Re-cuts each run of pages (pages with no sentence end or pause between them) into the same number
 * of pages with about the same number of letters, so one caption isn't far wider than the next.
 * A chunk the AI marked stays whole, and no page goes over the word limit.
 */
export function evenPages(cues: Cue[], maxWords: number): Cue[] {
  const breaks = new Set<string>();
  let start = 0;
  for (let index = 0; index < cues.length; index++) {
    const cue = cues[index], next = cues[index + 1];
    const hard = !next || SENTENCE_END.test(text(cue)) || next.start - cue.end > MAX_GAP_SECONDS;
    if (!hard) continue;
    const run = cues.slice(start, index + 1);
    const pages = run.filter((word, i) => word.pageBreak || i === run.length - 1).length;
    for (const id of evenRun(run, pages, maxWords)) breaks.add(id);
    start = index + 1;
  }
  return cues.map((cue) => ({ ...cue, pageBreak: breaks.has(cue.id) || undefined }));
}

function evenRun(run: Cue[], pages: number, maxWords: number): string[] {
  const n = run.length;
  const keep = run.filter((cue) => cue.pageBreak).map((cue) => cue.id);
  if (pages <= 1 || n > 80) return keep.length ? keep : [run[n - 1].id];
  // A break may follow word i (1-based count) unless it would split a marked chunk.
  const open = (i: number) => i === n || !run[i - 1].chunkId || run[i - 1].chunkId !== run[i].chunkId;
  const letters = (from: number, to: number) => length(run.slice(from, to));
  const cost: number[][] = Array.from({ length: pages + 1 }, () => Array(n + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: pages + 1 }, () => Array(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let p = 1; p <= pages; p++)
    for (let j = 1; j <= n; j++) {
      if (!open(j)) continue;
      for (let i = Math.max(0, j - maxWords); i < j; i++) {
        if (cost[p - 1][i] === Infinity) continue;
        // Ending on a word that leans into the next ("for", "the") costs as much as a lopsided page.
        const value = cost[p - 1][i] + letters(i, j) ** 2 + (j < n && isDangling(run[j - 1]) ? 300 : 0);
        if (value < cost[p][j]) { cost[p][j] = value; from[p][j] = i; }
      }
    }
  if (cost[pages][n] === Infinity) return keep;
  const ids: string[] = [];
  for (let p = pages, j = n; p > 0; j = from[p][j], p--) ids.push(run[j - 1].id);
  return ids;
}

/** The words sharing a page with `id`, given cues already run through layoutCaptionPages. */
export function pageOf(cues: Cue[], id: string): Cue[] {
  let page: Cue[] = [];
  for (const cue of cues) {
    page.push(cue);
    if (cue.pageBreak || SENTENCE_END.test(text(cue))) {
      if (page.some((word) => word.id === id)) return page;
      page = [];
    }
  }
  return page.some((word) => word.id === id) ? page : [];
}
