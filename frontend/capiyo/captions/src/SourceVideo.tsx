import { useCallback, useEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { AbsoluteFill, getRemotionEnvironment, Html5Video, OffthreadVideo, Sequence, useVideoConfig } from "remotion";
import { lookFilter, useVideoFrame, VideoShades, type VideoFrameValue } from "./VideoFrame";

type Props = ComponentProps<typeof Html5Video>;

/**
 * Remotion logs every playback hiccup as an error before handing it to onError, and in the editor
 * the dev overlay turns that log into an error popup, though SourceVideo already reloads the video.
 * In the editor it becomes a warning instead.
 */
let quieted = false;
function quietRecoveredErrors() {
  if (quieted || typeof window === "undefined") return;
  quieted = true;
  const report = console.error.bind(console);
  console.error = (...args: unknown[]) =>
    typeof args[0] === "string" && args[0].startsWith("Error occurred in video") ? console.warn(...args) : report(...args);
}

/** The plain video element: in the editor a dropped read reloads it instead of breaking the preview. */
function BaseVideo(props: Props) {
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const recover = useCallback((error: Error) => {
    console.warn("Reloading the video after a playback error:", error.message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAttempt((value) => value + 1), 250);
  }, []);
  // A render reads each exact frame through Remotion's compositor instead of seeking a <video> in Chrome, which is
  // several times faster and never shows a frame the browser had not finished seeking to.
  if (getRemotionEnvironment().isRendering) return <OffthreadVideo {...(props as ComponentProps<typeof OffthreadVideo>)} />;
  quietRecoveredErrors();
  return <Html5Video key={attempt} onError={recover} {...props} />;
}

const FULL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

/** The video placed the way the user framed it, with the cut scenes left out. */
function FramedVideo({ frame, ...props }: Props & { frame: VideoFrameValue }) {
  const { fps } = useVideoConfig();
  const fit = frame.fit === "fit";
  const zoom = Math.max(1, Math.min(4, frame.zoom || 1));
  const at = `${frame.x}% ${frame.y}%`;
  const main: CSSProperties = {
    ...props.style, ...FULL, objectFit: fit ? "contain" : "cover", objectPosition: at,
    transformOrigin: at, transform: `${zoom !== 1 ? `scale(${zoom})` : ""}${frame.flipX ? " scaleX(-1)" : ""}`.trim() || undefined,
    filter: lookFilter(frame.look),
  };
  // A fitted video sits on a soft, darkened copy of itself (or a plain color), like a pro reframe.
  const blurred = fit && frame.backdrop === "blur";
  const back: CSSProperties = { ...FULL, objectFit: "cover", filter: "blur(28px) brightness(0.62) saturate(1.15)", transform: "scale(1.18)" };
  const layer = (style: CSSProperties, muted: boolean, key: string) => {
    // The editor's reframe drag moves the main layer directly, found by this mark.
    const shared = { ...props, style, "data-video-layer": key, ...(muted ? { muted: true, volume: 0 } : {}) } as Props;
    if (!frame.segments) return <BaseVideo key={key} {...shared} />;
    // Each kept scene plays its own stretch of the source, back to back; the next one loads ahead.
    let from = 0;
    return frame.segments.map((segment, index) => {
      const start = from;
      const length = Math.max(1, Math.round((segment.end - segment.start) * fps));
      from += length;
      return <Sequence key={`${key}${index}`} from={start} durationInFrames={length} premountFor={Math.round(fps)}>
        <BaseVideo {...shared} trimBefore={Math.round(segment.start * fps)} />
      </Sequence>;
    });
  };
  return <AbsoluteFill style={{ overflow: "hidden", background: fit && frame.backdrop === "color" ? frame.backdropColor : "#000" }}>
    {blurred && layer(back, true, "back")}
    {layer(main, !!props.muted, "main")}
    <VideoShades frame={frame} />
  </AbsoluteFill>;
}

/**
 * The footage under a caption. In the editor, a dropped read (a seek the browser could not finish, a dev
 * server reload) reloads the video at the same spot instead of breaking the whole preview. A render still
 * fails loudly, so a broken file never turns into a black video. When the project frames or cuts its video,
 * every template's footage follows; clips a template trims itself (b-roll) are left alone.
 */
export function SourceVideo(props: Props) {
  const frame = useVideoFrame();
  if (!frame || props.trimBefore !== undefined) return <BaseVideo {...props} />;
  return <FramedVideo {...props} frame={frame} />;
}
