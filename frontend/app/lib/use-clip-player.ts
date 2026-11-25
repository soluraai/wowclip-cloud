"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadYouTubePlayer, PLAYING, type YouTubePlayer } from "./youtube-player";

// Some owners do not let their video play outside youtube.com. Then the clip is played from our own server instead:
// the same file ClipsCutter downloads for the reel, which only holds the clip, so its time 0 is the clip's start.
function serverPlayer(video: HTMLVideoElement, start: number): YouTubePlayer {
  return {
    getCurrentTime: () => start + video.currentTime,
    getPlayerState: () => (video.paused ? 2 : PLAYING),
    seekTo: (seconds) => {
      video.currentTime = Math.max(0, seconds - start);
    },
    playVideo: () => void video.play().catch(() => undefined),
    pauseVideo: () => video.pause(),
    destroy: () => video.removeAttribute("src"),
  };
}

// Plays only one clip (start -> end) of a YouTube video, with no YouTube buttons.
// It gives back the current time ~20 times a second. YouTube itself only reports the time a few times
// a second, so between two reports we move the clock forward ourselves: that keeps the captions smooth.
export function useClipPlayer(videoId: string, start: number, end: number, loadBackup?: () => Promise<string>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const backupRef = useRef(loadBackup);
  backupRef.current = loadBackup;

  // Create the YouTube player inside hostRef.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const mount = document.createElement("div");
    host.appendChild(mount);
    setReady(false);
    setStarted(false);
    setError(null);
    setNotice(null);
    setTime(start);

    async function playFromServer() {
      const load = backupRef.current;
      if (!load) {
        setError("This video can't be played here. Try Open on YouTube.");
        return;
      }
      setNotice("YouTube does not allow this video outside youtube.com, so wowclip is fetching the clip to play it here…");
      try {
        const url = await load();
        if (cancelled || !host) return;
        player?.destroy();
        host.innerHTML = "";
        const video = document.createElement("video");
        video.src = url;
        video.playsInline = true;
        video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none";
        host.appendChild(video);
        const backup = serverPlayer(video, start);
        video.addEventListener("play", () => setPlaying(true));
        video.addEventListener("playing", () => setStarted(true));
        video.addEventListener("pause", () => setPlaying(false));
        video.addEventListener("loadeddata", () => {
          if (cancelled) return;
          player = backup;
          playerRef.current = backup;
          setNotice(null);
          setReady(true);
          backup.playVideo();
        }, { once: true });
      } catch {
        if (!cancelled) {
          setNotice(null);
          setError("This video can't be played here. Try Open on YouTube.");
        }
      }
    }

    loadYouTubePlayer()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId,
          playerVars: {
            start: Math.floor(start),
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.seekTo(start, true);
              event.target.playVideo();
              setReady(true);
            },
            onStateChange: (event) => {
              setPlaying(event.data === PLAYING);
              if (event.data === PLAYING) setStarted(true);
            },
            onError: () => void playFromServer(),
          },
        });
      })
      .catch((loadError: Error) => setError(loadError.message));

    return () => {
      cancelled = true;
      playerRef.current = null;
      player?.destroy();
      host.innerHTML = "";
    };
  }, [videoId, start]);

  // The clock: read YouTube's time, fill the gaps between its reports, and stop at the clip's end.
  useEffect(() => {
    let frame = 0;
    let lastReported = -1;
    let base = start;
    let baseAt = performance.now();
    let lastShown = -1;

    const tick = () => {
      const player = playerRef.current;
      if (player) {
        const reported = player.getCurrentTime();
        const now = performance.now();
        const isPlaying = player.getPlayerState() === PLAYING;
        if (reported !== lastReported) {
          lastReported = reported;
          base = reported;
          baseAt = now;
        }
        let current = isPlaying ? base + Math.min((now - baseAt) / 1000, 0.6) : reported;
        if (current >= end && isPlaying) {
          player.pauseVideo();
          current = end;
        }
        current = Math.max(start, Math.min(end, current));
        if (Math.abs(current - lastShown) >= 0.05) {
          lastShown = current;
          setTime(current);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, end]);

  const seek = useCallback(
    (seconds: number, andPlay = false) => {
      const player = playerRef.current;
      if (!player) return;
      const target = Math.max(start, Math.min(end - 0.1, seconds));
      player.seekTo(target, true);
      setTime(target);
      if (andPlay) player.playVideo();
    },
    [start, end],
  );

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === PLAYING) {
      player.pauseVideo();
      return;
    }
    if (player.getCurrentTime() >= end - 0.15) player.seekTo(start, true);
    player.playVideo();
  }, [start, end]);

  const ended = !playing && time >= end - 0.15;

  return { hostRef, ready, started, playing, ended, time, error, notice, seek, toggle };
}
