import { scoreLevel } from "../../lib/score";
import type { Clip } from "../../lib/types";

const PARTS: { key: keyof Clip["scores"]; label: string }[] = [
  { key: "hook", label: "Hook" },
  { key: "emotion", label: "Emotion" },
  { key: "shareability", label: "Shareable" },
  { key: "clarity", label: "Clarity" },
];

// Why the AI picked this clip, kept short: the score, the hook line and one line of why.
// Everything else the AI wrote is folded under "More about this clip".
export function ClipAnalysis({ clip }: { clip: Clip }) {
  const level = scoreLevel(clip.viralityScore);
  const hasMore = clip.summary || clip.watchOut || clip.audience;

  return (
    <section className={`insight ${level.name}`} aria-label="Why this clip">
      <div className="insight-scores">
        <span className="moment-ring insight-ring" style={{ "--score": clip.viralityScore } as React.CSSProperties}>
          <strong>{clip.viralityScore}</strong>
        </span>
        {PARTS.map((part) => (
          <div key={part.key} className="insight-part">
            <span>{part.label}</span>
            <b>{clip.scores[part.key]}</b>
            <i style={{ width: `${clip.scores[part.key]}%` }} />
          </div>
        ))}
      </div>

      {clip.hookLine && <p className="insight-hook">“{clip.hookLine}”</p>}

      {clip.whyViral && <p className="insight-why">{clip.whyViral}</p>}

      {clip.strengths.length > 0 && (
        <ul className="insight-tags">
          {clip.strengths.slice(0, 3).map((strength) => <li key={strength}>{strength}</li>)}
        </ul>
      )}

      {hasMore && (
        <details className="insight-more">
          <summary>More about this clip</summary>
          <dl>
            {clip.summary && <><dt>What happens</dt><dd>{clip.summary}</dd></>}
            {clip.watchOut && <><dt>Watch out</dt><dd>{clip.watchOut}</dd></>}
            {clip.audience && <><dt>Who will share it</dt><dd>{clip.audience}</dd></>}
          </dl>
        </details>
      )}
    </section>
  );
}
