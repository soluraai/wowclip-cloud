"use client";

import { useRef } from "react";

import { formatTime } from "../../lib/time";
import { Icon } from "../shared/Icon";

type Props = {
  hostRef: React.RefObject<HTMLDivElement | null>;
  poster: string;
  start: number;
  end: number;
  time: number;
  ready: boolean;
  started: boolean;
  playing: boolean;
  ended: boolean;
  error: string | null;
  notice?: string | null;
  onToggle: () => void;
  onSeek: (seconds: number, andPlay?: boolean) => void;
};

// Our own player: the YouTube video with every YouTube button hidden, a click-to-play surface
// and a timeline that only covers this clip.
export function ClipPlayer(props: Props) {
  const { hostRef, poster, start, end, time, ready, started, playing, ended, error, notice, onToggle, onSeek } = props;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const length = Math.max(0.1, end - start);
  const progress = Math.min(1, Math.max(0, (time - start) / length));

  function secondsAt(clientX: number) {
    const box = track.current!.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return start + fraction * length;
  }

  function pointerDown(event: React.PointerEvent) {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(secondsAt(event.clientX));
  }

  function pointerMove(event: React.PointerEvent) {
    if (dragging.current) onSeek(secondsAt(event.clientX));
  }

  function pointerUp() {
    dragging.current = false;
  }

  function keyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") onSeek(time + 5);
    if (event.key === "ArrowLeft") onSeek(time - 5);
  }

  return (
    <div className="player">
      <div className="player-frame">
        <div className="player-host" ref={hostRef} />
        <button type="button" className="player-surface" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
          {(!started || !ready) && <span className="player-poster" style={{ backgroundImage: `url(${poster})` }} />}
          {!playing && ready && (
            <span className={`player-big-button${ended ? " ended" : ""}`}>
              <Icon name={ended ? "replay" : "play"} size={22} />
            </span>
          )}
          {!ready && !error && <span className="spinner big" />}
        </button>
        {error && <p className="player-error">{error}</p>}
        {notice && !error && <p className="player-error player-notice">{notice}</p>}
      </div>

      <div className="player-bar">
        <button type="button" className={`player-button${ended && !playing ? " ended" : ""}`} onClick={onToggle} disabled={!ready} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : ended ? "replay" : "play"} size={15} />
        </button>
        <div
          className="player-track"
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Clip timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(length)}
          aria-valuenow={Math.round(time - start)}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onKeyDown={keyDown}
        >
          <div className="player-track-fill" style={{ width: `${progress * 100}%` }} />
          <div className="player-track-knob" style={{ left: `${progress * 100}%` }} />
        </div>
        <span className="player-time">
          {formatTime(time - start)} / {formatTime(length)}
        </span>
      </div>
    </div>
  );
}
