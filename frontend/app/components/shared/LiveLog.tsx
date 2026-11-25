"use client";

import { useEffect, useRef } from "react";

import type { LogLine } from "../../lib/types";

// What the server is doing right now, line by line, like a terminal. It keeps itself scrolled to the newest line.
export function LiveLog({ lines, working, title = "Live log" }: { lines: LogLine[]; working: boolean; title?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = box.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <section className="live-log" aria-label={title}>
      <header>
        <span className={working ? "live-dot on" : "live-dot"} />
        {title}
      </header>
      <div className="live-log-lines" ref={box}>
        {lines.length === 0 && <p className="live-log-line muted">Starting…</p>}
        {lines.map((line, index) => (
          <p key={index} className="live-log-line">
            <span>{line.at.toFixed(1).padStart(5, " ")}s</span>
            {line.text}
          </p>
        ))}
        {working && lines.length > 0 && <p className="live-log-line muted caret">_</p>}
      </div>
    </section>
  );
}
