"use client";

import { useCallback, useState } from "react";

import { formatTime } from "../../lib/time";
import type { Clip, VideoInfo } from "../../lib/types";
import { ClipCard } from "./ClipCard";
import { ClipOverlay } from "../clip/ClipOverlay";

type Props = { video: VideoInfo; jobId: string; clips: Clip[]; framesNote: string };

// The results: a banner made from the video's own thumbnail, the best moment shown big,
// then every other moment as a frame card. Clicking any of them opens the clip window.
export function ClipResults({ video, jobId, clips, framesNote }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const best = Math.max(...clips.map((clip) => clip.viralityScore));
  const seconds = clips.reduce((total, clip) => total + clip.endSeconds - clip.startSeconds, 0);
  const [first, ...rest] = clips;

  return (
    <section className="results" aria-label="Clips">
      <header className="results-banner" style={{ "--thumb": `url(${video.thumbnail})` } as React.CSSProperties}>
        <div className="results-banner-art" aria-hidden="true" />
        <div className="results-banner-text">
          <p className="results-kicker">Step 2 of 2 · Pick a moment</p>
          <h2>
            {clips.length} {clips.length === 1 ? "moment" : "moments"} worth posting
          </h2>
          <p className="results-source">from <strong>{video.title}</strong> · {video.channel}</p>
        </div>
        <dl className="results-stats">
          <div><dt>Moments</dt><dd>{clips.length}</dd></div>
          <div><dt>Best score</dt><dd>{best}</dd></div>
          <div><dt>Ready to post</dt><dd>{formatTime(seconds)}</dd></div>
        </dl>
      </header>

      <p className="results-hint">{framesNote}</p>

      {first && <ClipCard clip={first} rank={1} featured onOpen={() => setOpenIndex(0)} />}

      {rest.length > 0 && (
        <>
          <div className="results-divider"><span>More moments</span></div>
          <div className="moment-grid">
            {rest.map((clip, index) => (
              <ClipCard key={clip.id} clip={clip} rank={index + 2} onOpen={() => setOpenIndex(index + 1)} />
            ))}
          </div>
        </>
      )}

      {openIndex !== null && (
        <ClipOverlay clips={clips} index={openIndex} videoId={video.videoId} jobId={jobId} onChange={setOpenIndex} onClose={close} />
      )}
    </section>
  );
}
