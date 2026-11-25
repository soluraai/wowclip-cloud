"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ClipResults } from "../components/find/ClipResults";
import { Icon } from "../components/shared/Icon";
import { LiveLog } from "../components/shared/LiveLog";
import { OptionsPanel } from "../components/find/OptionsPanel";
import { StepList } from "../components/shared/StepList";
import { VideoCard } from "../components/find/VideoCard";
import { getJob, getVideoInfo, startJob } from "../lib/api";
import { DEFAULT_OPTIONS, getOptionsError } from "../lib/options";
import type { Job, Step, VideoInfo } from "../lib/types";
import { validateYouTubeUrl } from "../lib/youtube";

// The app has three screens: paste a link -> choose options -> see the clips.
type Screen = "link" | "setup" | "results";

const FIND_STEPS: Step[] = [
  { key: "transcript", label: "Read transcript", state: "running", seconds: 0 },
  { key: "finding", label: "AI picks the moments", state: "waiting", seconds: null },
  { key: "frames", label: "Cut frames", state: "waiting", seconds: null },
];

function failedJob(error: string): Job {
  return { id: "", status: "failed", steps: [], log: [], clips: [], error, hdFrames: "done" };
}

function framesNote(job: Job) {
  if (job.hdFrames === "done") return "Best first · click a clip to watch it";
  return "Best first · sharpening frames to 1080p…";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("link");

  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  // Is the typed link valid? (Only show the error once the user has typed something real.)
  const check = url.trim() ? validateYouTubeUrl(url) : null;
  const linkError = check && !check.ok && url.trim().length >= 11 ? check.error : null;
  const optionsError = video ? getOptionsError(options, video.durationSeconds) : null;

  // After a job is created, ask the backend for its progress until it finishes. Once the clips are shown we keep
  // asking a little slower, because the 1080p frames arrive in the background and replace the preview frames.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const latest = await getJob(jobId!);
        if (stopped) return;
        setJob(latest);
        if (latest.status === "failed" || (latest.status === "done" && latest.hdFrames === "done")) return;
        timer = setTimeout(check, latest.status === "done" ? 2000 : 600);
      } catch (error) {
        if (!stopped) setJob(failedJob((error as Error).message));
      }
    }
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  // Screen 1 -> 2: fetch the video details, then show the options.
  async function submitLink(event: React.FormEvent) {
    event.preventDefault();
    if (!check?.ok || loadingVideo) return;
    setLoadingVideo(true);
    setVideoError(null);
    try {
      setVideo(await getVideoInfo(check.videoId));
      setScreen("setup");
    } catch {
      setVideoError("We could not load this video. Check the link and try again.");
    } finally {
      setLoadingVideo(false);
    }
  }

  // Screen 2 -> 3: start the job with the chosen options.
  async function findClips() {
    if (!video || optionsError) return;
    setJob(null);
    setScreen("results");
    try {
      setJobId(await startJob(video.videoId, options));
    } catch (error) {
      setJob(failedJob((error as Error).message));
    }
  }

  function startOver() {
    setScreen("link");
    setVideo(null);
    setJobId(null);
    setJob(null);
    setUrl("");
  }

  function backToOptions() {
    setJobId(null);
    setJob(null);
    setScreen("setup");
  }

  async function pasteLink() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      /* clipboard blocked: the user can paste with Ctrl+V */
    }
  }

  if (screen === "link") {
    return (
      <main className="landing">
        <div className="watermark" aria-hidden="true">wowclip</div>
        <Link className="ghost-button small history-link" href="/history">
          <Icon name="clock" size={13} /> Render history
        </Link>
        <form className="link-card" onSubmit={submitLink}>
          <div className="input-row">
            <span className="input-prefix"><Icon name="link" size={16} /></span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Drop a YouTube link"
              aria-label="YouTube link"
              value={url}
              disabled={loadingVideo}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="button" className="paste-badge" disabled={loadingVideo} onClick={pasteLink}>Paste</button>
          </div>

          <button type="submit" className="cta" disabled={loadingVideo || !check?.ok}>
            {loadingVideo ? <><span className="spinner dark" /> Loading video…</> : <>Continue <Icon name="arrow" size={16} /></>}
          </button>

          {(linkError || videoError) && <p className="form-error" role="status">{linkError ?? videoError}</p>}
        </form>
      </main>
    );
  }

  if (screen === "setup" && video) {
    return (
      <main className="page">
        <VideoCard video={video} onChange={startOver} hero />
        <header className="page-title">
          <p className="page-step">Step 1 of 2 · Options</p>
          <h1>Set up your clips</h1>
          <p>Every option is optional. Leave them as they are and the AI picks the best moments.</p>
        </header>
        <OptionsPanel options={options} videoSeconds={video.durationSeconds} onChange={setOptions} />
        <div className="page-actions sticky">
          <p className="page-actions-note">
            {optionsError ?? "Ready. The AI reads the transcript, the comments and the replays, then cuts the best moments."}
          </p>
          <button type="button" className="cta" disabled={optionsError !== null} onClick={findClips}>
            Find my clips <Icon name="arrow" size={16} />
          </button>
        </div>
      </main>
    );
  }

  const finished = job?.status === "done";

  return (
    <main className="workspace">
      <header className="topbar">
        <button type="button" className="ghost-button" onClick={backToOptions}>
          <Icon name="back" size={14} /> Options
        </button>
        {video && (
          <div className="topbar-video">
            <p className="topbar-channel">{video.channel}</p>
            <p className="topbar-title">{video.title}</p>
          </div>
        )}
        <div className="topbar-actions">
          <a className="ghost-button" href="/history" target="_blank" rel="noreferrer">
            <Icon name="clock" size={14} /> History
          </a>
          <button type="button" className="ghost-button" onClick={startOver}>
            <Icon name="plus" size={14} /> New video
          </button>
        </div>
      </header>

      {!finished && (
        <section className="working-panel" aria-label="Progress">
          {video && <VideoCard video={video} onChange={startOver} />}
          <div className="working-head">
            {job?.status === "failed" ? <Icon name="close" size={16} /> : <span className="spinner" />}
            <h2>{job?.status === "failed" ? "Something went wrong" : "Finding your best moments"}</h2>
          </div>
          <StepList steps={job?.steps.length ? job.steps : FIND_STEPS} />
          {job?.status === "failed" && (
            <div className="message-box error" role="alert">
              <p>{job.error ?? "The job failed."}</p>
            </div>
          )}
          <LiveLog lines={job?.log ?? []} working={job?.status !== "failed"} />
        </section>
      )}

      {finished && job.notice && (
        <div className="message-box" role="status">
          <Icon name="info" size={16} />
          <p>{job.notice}</p>
        </div>
      )}

      {finished && video && job.clips.length > 0 && (
        <ClipResults video={video} jobId={job.id} clips={job.clips} framesNote={framesNote(job)} />
      )}
    </main>
  );
}
