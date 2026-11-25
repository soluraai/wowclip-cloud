// Loads YouTube's IFrame Player API once. We hide all of YouTube's own buttons (controls=0)
// and draw our own play button and clip-only timeline on top (see use-clip-player.ts).

export type YouTubePlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};

type PlayerAPI = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady(event: { target: YouTubePlayer }): void;
        onStateChange(event: { data: number }): void;
        onError(): void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: PlayerAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PLAYING = 1;

let pending: Promise<PlayerAPI> | null = null;

export function loadYouTubePlayer(): Promise<PlayerAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      pending = null;
      script.remove();
      reject(new Error("The YouTube player could not load."));
    };
    document.head.appendChild(script);
  });
  return pending;
}
