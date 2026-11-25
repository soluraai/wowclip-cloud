"use client";

import { useCallback, useEffect, useState } from "react";

import { prepareClip, projectId, startReelRender } from "../../lib/api";

// The clip file on our server, for videos YouTube won't play outside youtube.com. Asking for it starts the download.
async function clipFromServer(jobId: string, clipId: string) {
  for (let tries = 0; tries < 120; tries++) {
    const response = await fetch(`/api/projects/${projectId(jobId, clipId)}/preview`, { cache: "no-store" });
    if (response.ok) {
      const preview = await response.json();
      if (preview.previewUrl) return preview.previewUrl as string;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("The clip did not download in time");
}
import { formatTime } from "../../lib/time";
import type { Clip } from "../../lib/types";
import { useClipPlayer } from "../../lib/use-clip-player";
import { CaptionEditorPane } from "./CaptionEditorPane";
import { ClipAnalysis } from "./ClipAnalysis";
import { ClipCaptions } from "./ClipCaptions";
import { ClipPlayer } from "./ClipPlayer";
import { Icon } from "../shared/Icon";
import { PrepareView } from "../reel/PrepareView";
import { AiEditView } from "../reel/AiEditView";
import { RenderView } from "../reel/RenderView";

type Mode = "watch" | "prepare" | "edit" | "ai" | "render";
type ReelRender = { renderId: string; styleName: string };
type ReelRequest = { request: { inputProps?: Record<string, unknown> } & Record<string, unknown>; styleName: string };

type Props = {
  clips: Clip[];
  index: number;
  videoId: string;
  jobId: string;
  onChange: (index: number) => void;
  onClose: () => void;
};

// The overlay window for one clip, with five views in the same window:
// watch (player + transcript + analysis) -> prepare (download, then Deepgram words and the Modal GPU crop side by side)
// -> edit (Capiyo's caption editor) -> ai (the AI edit: B-roll, graphics, zooms and cuts, made while the captions were
// picked) -> render (the AWS Lambdas filling up, then the reel to watch and download).
// The editor stays open behind the render, so going back to it keeps every change.
export function ClipOverlay({ clips, index, videoId, jobId, onChange, onClose }: Props) {
  const clip = clips[index];
  const [mode, setMode] = useState<Mode>("watch");
  const [reel, setReel] = useState<ReelRender | null>(null);
  const [pending, setPending] = useState<ReelRequest | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    setMode("watch");
    setReel(null);
    setPending(null);
    setRenderError(null);
    setEditorOpen(false);
  }, [clip.id]);

  // Next in the caption editor: render the reel with these captions straight away (the AI edit step is switched off).
  const next = useCallback(async (request: object, styleName: string) => {
    setPending(null);
    setRenderError(null);
    try {
      const renderId = await startReelRender(jobId, clip.id, { ...(request as ReelRequest["request"]), edit: false });
      setReel({ renderId, styleName });
      setMode("render");
    } catch (error) {
      setRenderError((error as Error).message);
    }
  }, [jobId, clip.id]);

  const render = useCallback(async (withEdit: boolean) => {
    if (!pending) return;
    setRenderError(null);
    try {
      const renderId = await startReelRender(jobId, clip.id, { ...pending.request, edit: withEdit });
      setReel({ renderId, styleName: withEdit ? `AI edit · ${pending.styleName}` : pending.styleName });
      setMode("render");
    } catch (error) {
      setRenderError((error as Error).message);
    }
  }, [jobId, clip.id, pending]);

  // Escape closes, the arrow keys move between clips; the page behind does not scroll.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.closest?.("input, textarea, select");
      const onTimeline = target.closest?.('[role="slider"]');
      if (mode !== "watch") return;
      if (event.key === "Escape" && !typing) onClose();
      if (onTimeline) return;
      if (event.key === "ArrowRight" && index < clips.length - 1) onChange(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onChange(index - 1);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, clips.length, mode, onChange, onClose]);

  const big = mode !== "watch";
  const openEditor = useCallback(() => {
    setEditorOpen(true);
    setMode("edit");
  }, []);
  const stepName = {
    watch: "",
    prepare: "Step 2 · Get the clip ready",
    edit: "Step 3 · Pick the caption style",
    ai: "Step 4 · AI edit",
    render: "Step 4 · Render on AWS Lambda",
  }[mode];

  return (
    <div className="overlay" onClick={big ? undefined : onClose}>
      <div className={`overlay-window${big ? " editing" : ""}`} role="dialog" aria-modal="true" aria-label={clip.title}
        onClick={(event) => event.stopPropagation()}>
        <header className="overlay-bar">
          {mode === "watch" ? (
            <p>Clip {index + 1} <span>of {clips.length}</span></p>
          ) : (
            <button type="button" className="ghost-button small" onClick={() => setMode("watch")}>
              <Icon name="back" size={13} /> Back to clip
            </button>
          )}
          {mode !== "watch" && <p className="overlay-step">{stepName}</p>}
          <div className="overlay-nav">
            {mode === "watch" && (
              <>
                <button type="button" disabled={index === 0} onClick={() => onChange(index - 1)} aria-label="Previous clip">
                  <Icon name="back" size={15} />
                </button>
                <button type="button" disabled={index === clips.length - 1} onClick={() => onChange(index + 1)} aria-label="Next clip">
                  <Icon name="arrow" size={15} />
                </button>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close">
              <Icon name="close" size={15} />
            </button>
          </div>
        </header>

        {mode === "watch" && (
          <ClipWatch key={clip.id} clip={clip} rank={index + 1} videoId={videoId} jobId={jobId}
            rendering={!!reel}
            onMakeReel={() => (editorOpen ? setMode("edit") : setMode("prepare"))}
            onViewReel={() => setMode("render")} />
        )}

        {mode === "prepare" && (
          <div className="overlay-scroll">
            <PrepareView jobId={jobId} clip={clip} onReady={openEditor} />
          </div>
        )}

        {editorOpen && (
          <div className="editor-holder" hidden={mode !== "edit"}>
            {renderError && <div className="message-box error">{renderError}</div>}
            <CaptionEditorPane key={clip.id} projectId={projectId(jobId, clip.id)} onRender={next} />
          </div>
        )}

        {(mode === "ai" || (mode === "render" && !reel)) && pending && (
          <div className="overlay-scroll">
            <AiEditView projectId={projectId(jobId, clip.id)} clip={clip} styleName={pending.styleName}
              captions={pending.request.inputProps ?? null} error={renderError} onRender={render} onBack={() => setMode("edit")} />
          </div>
        )}

        {mode === "render" && reel && (
          <div className="overlay-scroll">
            <RenderView key={reel.renderId} renderId={reel.renderId} clip={clip} styleName={reel.styleName}
              onBack={() => setMode(pending ? "ai" : "edit")} backLabel={pending ? "Back to the AI edit" : "Back to the caption editor"} />
          </div>
        )}
      </div>
    </div>
  );
}

type WatchProps = {
  clip: Clip;
  rank: number;
  videoId: string;
  jobId: string;
  rendering: boolean;
  onMakeReel: () => void;
  onViewReel: () => void;
};

// Watch the clip with our own player, read the transcript beside it and see why the AI chose it.
function ClipWatch({ clip, rank, videoId, jobId, rendering, onMakeReel, onViewReel }: WatchProps) {
  const loadBackup = useCallback(() => clipFromServer(jobId, clip.id), [jobId, clip.id]);
  const player = useClipPlayer(videoId, clip.startSeconds, clip.endSeconds, loadBackup);
  const { seek } = player;
  const seekAndPlay = useCallback((seconds: number) => seek(seconds, true), [seek]);
  const youtubeLink = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(clip.startSeconds)}s`;

  // If the user stays on this clip for 3 seconds, the server starts downloading and cropping it already,
  // so the caption editor opens with the video and the word timings straight away. Flicking through clips with the arrows does not trigger it.
  useEffect(() => {
    const timer = setTimeout(() => prepareClip(jobId, clip.id).catch(() => {}), 3000);
    return () => clearTimeout(timer);
  }, [jobId, clip.id]);

  return (
    <div className="overlay-body">
      <div className="overlay-main">
        <ClipPlayer
          hostRef={player.hostRef}
          poster={clip.thumbnail}
          start={clip.startSeconds}
          end={clip.endSeconds}
          time={player.time}
          ready={player.ready}
          started={player.started}
          playing={player.playing}
          ended={player.ended}
          error={player.error}
          notice={player.notice}
          onToggle={player.toggle}
          onSeek={seek}
        />

        <div className="clip-head">
          <div className="clip-head-text">
            <p className="clip-meta">
              <span>#{rank}</span>
              {clip.category && <span>{clip.category}</span>}
              <span>{formatTime(clip.startSeconds)} – {formatTime(clip.endSeconds)}</span>
              <span>{formatTime(clip.endSeconds - clip.startSeconds)} long</span>
            </p>
            <h2>{clip.title}</h2>
          </div>
          <div className="clip-actions">
            {rendering && (
              <button type="button" className="cta small" onClick={() => {
                if (player.playing) player.toggle();
                onViewReel();
              }}>
                <Icon name="film" size={14} /> View reel
              </button>
            )}
            <button type="button" className={rendering ? "ghost-button small" : "cta make-reel"} onClick={() => {
              if (player.playing) player.toggle();
              onMakeReel();
            }}>
              <Icon name="film" size={rendering ? 14 : 18} /> {rendering ? "Edit captions" : "Make reel"}
            </button>
            <a className="ghost-button small" href={youtubeLink} target="_blank" rel="noreferrer" aria-label="Open on YouTube">
              <Icon name="external" size={13} />
            </a>
          </div>
        </div>

        <ClipAnalysis clip={clip} />
      </div>

      <ClipCaptions words={clip.words} clipStart={clip.startSeconds} time={player.time} onSeek={seekAndPlay} />
    </div>
  );
}
