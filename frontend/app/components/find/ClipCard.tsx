import { formatTime } from "../../lib/time";
import { scoreLevel } from "../../lib/score";
import type { Clip } from "../../lib/types";
import { Icon } from "../shared/Icon";

type Props = { clip: Clip; rank: number; featured?: boolean; onOpen: () => void };

// The score as a ring that fills up to the score, with the number in the middle.
function ScoreRing({ score, big = false }: { score: number; big?: boolean }) {
  return (
    <span className={`moment-ring${big ? " big" : ""}`} style={{ "--score": score } as React.CSSProperties}>
      <strong>{score}</strong>
    </span>
  );
}

// One moment in the results. The frame is the card: its bottom fades into the page and the title sits on the fade.
// The best moment is shown bigger, with its hook line and what happens in it.
export function ClipCard({ clip, rank, featured = false, onOpen }: Props) {
  const level = scoreLevel(clip.viralityScore);
  const length = formatTime(clip.endSeconds - clip.startSeconds);
  const image = clip.thumbnail ? `url(${clip.thumbnail})` : undefined;

  if (featured) {
    return (
      <button type="button" className={`moment featured ${level.name}`} onClick={onOpen} aria-label={`Open clip ${rank}: ${clip.title}`}>
        <span className={`moment-frame ${clip.frameQuality}`} style={{ backgroundImage: image }}>
          <span className="moment-fade" />
          <span className="moment-play"><Icon name="play" size={22} /></span>
          <span className="moment-chips">
            <span><Icon name="clock" size={12} /> {length}</span>
            <span>at {formatTime(clip.startSeconds)}</span>
          </span>
        </span>
        <span className="moment-story">
          <span className="moment-top">
            <span className="moment-rank">01</span>
            <span className="moment-badge">Best moment</span>
            <ScoreRing score={clip.viralityScore} big />
          </span>
          <span className="moment-title">{clip.title}</span>
          {clip.hookLine && <span className="moment-hook">“{clip.hookLine}”</span>}
          {clip.summary && <span className="moment-summary">{clip.summary}</span>}
          <span className="moment-tags">
            {clip.category.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}
          </span>
          <span className="moment-open">Open this clip <Icon name="arrow" size={15} /></span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" className={`moment ${level.name}`} onClick={onOpen} aria-label={`Open clip ${rank}: ${clip.title}`}>
      <span className={`moment-frame ${clip.frameQuality}`} style={{ backgroundImage: image }}>
        <span className="moment-fade" />
        <span className="moment-rank">{String(rank).padStart(2, "0")}</span>
        <ScoreRing score={clip.viralityScore} />
        <span className="moment-play"><Icon name="play" size={18} /></span>
        <span className="moment-caption">
          <span className="moment-title">{clip.title}</span>
          <span className="moment-chips">
            <span><Icon name="clock" size={11} /> {length}</span>
            <span>at {formatTime(clip.startSeconds)}</span>
            {clip.category && <span>{clip.category.split(",")[0].trim()}</span>}
          </span>
        </span>
      </span>
      {clip.hookLine && <span className="moment-hook small">“{clip.hookLine}”</span>}
    </button>
  );
}
