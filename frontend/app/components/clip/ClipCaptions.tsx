"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatTime } from "../../lib/time";
import type { Word } from "../../lib/types";
import { Icon } from "../shared/Icon";

type Line = { start: number; first: number; words: Word[] };

const WORDS_PER_LINE = 12;
const SENTENCE_END = /[.!?।॥]["')]?$/;

// Groups the words into short lines: a new line after a sentence ends, after a long pause, or every 12 words.
function makeLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  words.forEach((word, index) => {
    const pause = index > 0 && word.start - words[index - 1].end > 1;
    if (!current || current.words.length >= WORDS_PER_LINE || pause) {
      current = { start: word.start, first: index, words: [] };
      lines.push(current);
    }
    current.words.push(word);
    if (SENTENCE_END.test(word.text)) current = null;
  });
  return lines;
}

// The word being spoken: the last word that has already started.
function findActiveWord(words: Word[], time: number) {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (words[middle].start <= time + 0.05) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

type LineProps = { line: Line; clipStart: number; activeWord: number; isActive: boolean; onSeek: (seconds: number) => void };

// One line only re-draws when its own highlighted word changes, so following the video stays smooth.
const CaptionLine = memo(function CaptionLine({ line, clipStart, activeWord, isActive, onSeek }: LineProps) {
  return (
    <div className={isActive ? "caption-line active" : "caption-line"} data-line>
      <button type="button" className="caption-time" onClick={() => onSeek(line.start)}>
        {formatTime(line.start - clipStart)}
      </button>
      <p>
        {line.words.map((word, offset) => {
          const index = line.first + offset;
          const state = index === activeWord ? "active" : isActive && index < activeWord ? "said" : "";
          return (
            <button key={index} type="button" className={`caption-word ${state}`} onClick={() => onSeek(word.start)}>
              {word.text}
            </button>
          );
        })}
      </p>
    </div>
  );
});

type Props = { words: Word[]; clipStart: number; time: number; onSeek: (seconds: number) => void };

export function ClipCaptions({ words, clipStart, time, onSeek }: Props) {
  const lines = useMemo(() => makeLines(words), [words]);
  const activeWord = findActiveWord(words, time);
  const activeLine = lines.findIndex((line) => activeWord >= line.first && activeWord < line.first + line.words.length);
  const box = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [copied, setCopied] = useState(false);

  // Keep the spoken line in the middle of the panel, unless the user is scrolling the panel themself.
  useEffect(() => {
    const element = box.current;
    if (!following || !element || activeLine < 0) return;
    const line = element.querySelectorAll<HTMLElement>("[data-line]")[activeLine];
    if (!line) return;
    const target = line.offsetTop - element.clientHeight / 2 + line.offsetHeight / 2;
    element.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeLine, following]);

  const seekFromText = useCallback(
    (seconds: number) => {
      setFollowing(true);
      onSeek(seconds);
    },
    [onSeek],
  );

  async function copyText() {
    await navigator.clipboard.writeText(words.map((word) => word.text).join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className="captions" aria-label="Captions">
      <header className="captions-head">
        <div>
          <h3>Transcript</h3>
          <p>{words.length} words · click any word to jump</p>
        </div>
        <button type="button" className="ghost-button small" onClick={copyText} disabled={words.length === 0}>
          <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Copy"}
        </button>
      </header>

      <div
        className="captions-text"
        ref={box}
        onWheel={() => setFollowing(false)}
        onTouchMove={() => setFollowing(false)}
      >
        {lines.length === 0 && <p className="captions-empty">No captions for this part of the video.</p>}
        {lines.map((line, index) => (
          <CaptionLine
            key={line.first}
            line={line}
            clipStart={clipStart}
            isActive={index === activeLine}
            activeWord={index === activeLine ? activeWord : -1}
            onSeek={seekFromText}
          />
        ))}
      </div>

      {!following && (
        <button type="button" className="captions-follow" onClick={() => setFollowing(true)}>
          Follow the video
        </button>
      )}
    </aside>
  );
}
