"use client";

import type { PlayerRef } from "@remotion/player";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildEditTimeline, EDIT_FPS, type EditTimeline } from "../../../edit/timeline";
import type { EditInsert, EditPlan } from "../../../edit/types";
import { getAiEdit, redoAiEdit, switchAiEdit } from "../../lib/api";
import { formatTime } from "../../lib/time";
import type { AiEdit, AiEditInfo, Clip } from "../../lib/types";
import { Icon } from "../shared/Icon";
import { LiveLog } from "../shared/LiveLog";
import { StepList } from "../shared/StepList";

const EditPreview = dynamic(() => import("./EditPreview").then((module) => module.EditPreview), {
  ssr: false,
  loading: () => <div className="ai-preview-wait"><span className="spinner" /></div>,
});

const TYPE_NAMES: Record<string, string> = { broll: "B-roll", split: "Split screen", card: "Photo card", graphic: "Motion graphic", template: "Template" };
const TEMPLATE_NAMES: Record<string, string> = { news: "News story", person: "Person profile", timeline: "Timeline", versus: "Versus", checklist: "Checklist", showcase: "Showcase", headline: "Kinetic headline" };
const FAMILY_NAMES: Record<string, string> = { explainer: "Explainer", story: "Story", emotional: "Emotional", funny: "Comedy" };
const POLL_MS = 1000;

type Props = {
  projectId: string;
  clip: Clip;
  styleName: string;
  captions: Record<string, unknown> | null;
  error: string | null;
  onRender: (withEdit: boolean) => Promise<void>;
  onBack: () => void;
};

const offIds = (plan: EditPlan) => [...plan.inserts, ...plan.zooms].filter((item) => item.off).map((item) => item.id);

function thumbOf(insert: EditInsert) {
  if (insert.media) return insert.media.kind === "video" ? insert.media.poster : insert.media.src;
  for (const element of insert.scene?.elements ?? []) {
    if (element.type === "image" || element.type === "portrait") return element.src;
    if (element.type === "gallery") return element.srcs[0];
  }
  return undefined;
}

function detailOf(insert: EditInsert) {
  if (insert.template) {
    const t = insert.template;
    const words = t.headline || t.title || t.text || (t.left && t.right ? `${t.left} vs ${t.right}` : "") || (t.items ?? []).join(" · ");
    return `${TEMPLATE_NAMES[t.name] ?? t.name}${words ? ` · ${words}` : ""}`;
  }
  if (insert.media) {
    const kind = insert.media.kind === "video" ? "video" : "photo";
    return `${insert.media.from ? `${insert.media.from} ${kind}` : kind}${insert.query ? ` · “${insert.query}”` : ""}`;
  }
  const words: string[] = [];
  for (const element of insert.scene?.elements ?? []) {
    if (element.type === "kicker" || element.type === "text" || element.type === "quote") words.push(element.value);
    if (element.type === "number") words.push(`${element.prefix ?? ""}${element.value}${element.suffix ?? ""}`);
    if (element.type === "table") words.push("table");
    if (element.type === "barGraph" || element.type === "lineGraph" || element.type === "pieChart") words.push("chart");
    if (element.type === "bullets") words.push(`${element.items.length} points`);
  }
  return words.join(" · ");
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label}
      className={`ai-switch${on ? " on" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}>
      <span />
    </button>
  );
}

type TrackProps = {
  plan: EditPlan;
  timeline: EditTimeline;
  info: AiEditInfo;
  player: PlayerRef | null;
  onToggle: (id: string) => void;
};

// The edit decision list: every visual on the reel's timeline, the cuts and zooms as marks, a playhead that follows
// the preview, and a switch on each row. Only this part redraws while the preview plays.
function EditTrack({ plan, timeline, player, onToggle }: TrackProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!player) return;
    const update = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    player.addEventListener("frameupdate", update);
    return () => player.removeEventListener("frameupdate", update);
  }, [player]);

  const total = Math.max(1, timeline.frames);
  const at = (value: number) => `${Math.min(100, (value / total) * 100).toFixed(3)}%`;
  const placed = new Map(timeline.inserts.map((insert) => [insert.id, insert]));
  const ordered = [...plan.inserts].sort((a, b) => a.start - b.start);
  const seek = (to: number) => {
    player?.seekTo(Math.max(0, Math.min(total - 1, Math.round(to))));
    player?.play();
  };

  return (
    <>
      <div className="ai-track" role="presentation" onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        seek(((event.clientX - box.left) / box.width) * total);
      }}>
        <div className="ai-track-lane">
          {timeline.inserts.map((insert) => (
            <span key={insert.id} className={`ai-block ${insert.type}`} style={{ left: at(insert.from), width: at(insert.frames) }}
              title={`${TYPE_NAMES[insert.type]} · ${insert.label ?? ""}`} />
          ))}
        </div>
        <div className="ai-track-marks">
          {timeline.zooms.map((zoom) => <i key={`z${zoom.from}`} className="ai-mark zoom" style={{ left: at(zoom.from) }} />)}
        </div>
        <span className="ai-playhead" style={{ left: at(frame) }} />
      </div>
      <p className="ai-track-legend">
        <span><i className="ai-dot broll" /> B-roll</span>
        <span><i className="ai-dot split" /> Split screen</span>
        <span><i className="ai-dot card" /> Photo card</span>
        <span><i className="ai-dot graphic" /> Motion graphic</span>
        <span><i className="ai-dot template" /> Template</span>
        <span><i className="ai-tick zoom" /> Zoom</span>
        <b>{formatTime(frame / EDIT_FPS)} / {formatTime(total / EDIT_FPS)}</b>
      </p>

      {ordered.length > 0 ? (
        <ul className="ai-list">
          {ordered.map((insert) => {
            const timed = placed.get(insert.id);
            const active = !!timed && frame >= timed.from && frame < timed.from + timed.frames;
            const thumb = thumbOf(insert);
            return (
              <li key={insert.id} className={`ai-item${insert.off ? " off" : ""}${active ? " active" : ""}`}>
                <button type="button" className="ai-item-main" disabled={!timed} onClick={() => timed && seek(timed.from)}>
                  <span className={`ai-thumb ${insert.type}`} style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}>
                    {!thumb && <Icon name="spark" size={16} />}
                    {insert.media?.kind === "video" && <span className="ai-thumb-play"><Icon name="play" size={10} /></span>}
                  </span>
                  <span className="ai-item-text">
                    <span className="ai-item-top">
                      <b className={`ai-badge ${insert.type}`}>{TYPE_NAMES[insert.type]}</b>
                      <span>{timed ? `${formatTime(timed.from / EDIT_FPS)} · ${(timed.frames / EDIT_FPS).toFixed(1)}s` : "off"}</span>
                    </span>
                    <strong>{insert.label || TYPE_NAMES[insert.type]}</strong>
                    <small>{detailOf(insert)}</small>
                  </span>
                </button>
                <Switch on={!insert.off} label={`${insert.off ? "Show" : "Hide"} ${insert.label || TYPE_NAMES[insert.type]}`}
                  onChange={() => onToggle(insert.id)} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ai-empty">No visuals in this edit: it keeps the speaker on screen with a few zooms.</p>
      )}

      <div className="ai-options">
        {plan.zooms.length > 0 && (
          <div className="ai-option">
            <div>
              <strong>Zooms on the strongest lines</strong>
              <span>A few smooth push-ins, never on ordinary words</span>
            </div>
            <div className="ai-chips">
              {plan.zooms.map((zoom) => (
                <button key={zoom.id} type="button" className={`ai-chip zoom${zoom.off ? " off" : ""}`} onClick={() => onToggle(zoom.id)}
                  title={zoom.off ? "Switched off" : "Click to switch off"}>
                  {zoom.style === "punch" ? "Punch" : "Push"} {formatTime(zoom.at)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Step 4: the AI edit. It is made on the server while the captions are picked (backend/optional_extras/ai_edit): an AI director plans the
// B-roll, motion graphics, split screens, zooms and cuts from the word timings, Scrappa finds the pictures and videos, a
// vision model picks the best ones. Here it plays with the chosen captions, every piece can be switched off, and the
// reel is rendered full-frame on the Lambdas.
export function AiEditView({ projectId, clip, styleName, captions, error, onRender, onBack }: Props) {
  const [edit, setEdit] = useState<AiEdit | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [starting, setStarting] = useState<"edit" | "plain" | null>(null);
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [poll, setPoll] = useState(0);
  const shownRound = useRef(-1);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const latest = await getAiEdit(projectId);
        if (stopped) return;
        setEdit(latest);
        setProblem(null);
        if (latest.status === "ready" && latest.plan && latest.round !== shownRound.current) {
          shownRound.current = latest.round;
          setPlan(latest.plan);
        }
        if (latest.status === "ready" || latest.status === "failed") return;
      } catch (checkError) {
        if (stopped) return;
        setProblem((checkError as Error).message);
      }
      timer = setTimeout(check, POLL_MS);
    }
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [projectId, poll]);

  const timeline = useMemo(() => (plan ? buildEditTimeline(plan) : null), [plan]);
  const video = `/api/projects/${projectId}/video`;

  const change = useCallback((next: EditPlan) => {
    setPlan(next);
    saving.current = saving.current
      .then(() => switchAiEdit(projectId, offIds(next), next.trims))
      .catch((saveError) => setProblem((saveError as Error).message));
  }, [projectId]);

  const toggle = useCallback((id: string) => {
    if (!plan) return;
    change({
      ...plan,
      inserts: plan.inserts.map((insert) => (insert.id === id ? { ...insert, off: !insert.off } : insert)),
      zooms: plan.zooms.map((zoom) => (zoom.id === id ? { ...zoom, off: !zoom.off } : zoom)),
    });
  }, [plan, change]);

  async function regenerate() {
    setPlan(null);
    shownRound.current = -1;
    try {
      setEdit(await redoAiEdit(projectId));
    } catch (redoError) {
      setProblem((redoError as Error).message);
    }
    setPoll((value) => value + 1);
  }

  async function render(withEdit: boolean) {
    setStarting(withEdit ? "edit" : "plain");
    await saving.current;
    await onRender(withEdit);
    setStarting(null);
  }

  const info = edit?.info;
  const ready = edit?.status === "ready" && !!plan && !!timeline && !!info;
  const shown = plan ? plan.inserts.filter((insert) => !insert.off).length : 0;
  const zooms = plan ? plan.zooms.filter((zoom) => !zoom.off).length : 0;

  const actions = (
    <div className="ai-actions">
      <button type="button" className="cta make-reel" onClick={() => render(true)} disabled={!ready || !!starting}>
        {starting === "edit" ? <><span className="spinner dark" /> Starting the Lambdas…</> : <><Icon name="cloud" size={18} /> Render reel</>}
      </button>
      <button type="button" className="ghost-button" onClick={() => render(false)} disabled={!!starting}>
        {starting === "plain" ? <><span className="spinner" /> Starting…</> : "Render without AI edit"}
      </button>
      <span className="ai-actions-gap" />
      {(edit?.status === "ready" || edit?.status === "failed") && (
        <button type="button" className="ghost-button" onClick={regenerate} disabled={!!starting} title="Ask the AI director for a new edit">
          <Icon name="replay" size={14} /> New edit
        </button>
      )}
      <button type="button" className="ghost-button" onClick={onBack} disabled={!!starting}>
        <Icon name="edit" size={14} /> Captions
      </button>
    </div>
  );

  if (!ready) {
    const failed = edit?.status === "failed";
    return (
      <div className="ai-edit">
        <div className="ai-left">
          <div className="ai-cover" style={{ backgroundImage: clip.thumbnail ? `url(${clip.thumbnail})` : undefined }}>
            {!failed && <span className="ai-scan" />}
            <span className="ai-cover-label">
              {failed ? "The AI edit stopped" : <><span className="spinner tiny" /> AI is editing</>}
            </span>
          </div>
        </div>
        <div className="ai-right">
          <div className="ai-head">
            <p className="eyebrow">AI edit</p>
            <h3>{clip.title}</h3>
            <p className="ai-sub">
              An AI director reads every word and pause, then plans B-roll, templates, motion graphics, split screens and zooms.
              The pictures and videos are searched and a vision model picks the best shot for each moment.
            </p>
          </div>
          {edit && edit.steps.length > 0 && <StepList steps={edit.steps} />}
          {failed && <div className="message-box error">{edit?.error}</div>}
          {problem && <div className="message-box error">{problem}</div>}
          {error && <div className="message-box error">{error}</div>}
          <LiveLog lines={edit?.log ?? []} working={!failed} title="What the AI editor is doing" />
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-edit">
      <div className="ai-left">
        <div className="ai-preview">
          <EditPreview plan={plan} video={video} captions={captions} onPlayer={setPlayer} />
        </div>
        <p className="ai-preview-note">Preview with your {styleName} captions. The render draws the same frames at 1080×1920.</p>
      </div>

      <div className="ai-right">
        <div className="ai-head">
          <p className="eyebrow">AI edit ready</p>
          <h3>{clip.title}</h3>
          <p className="ai-director">
            <span className="ai-model"><Icon name="spark" size={12} /> {info.model}</span>
            {!info.fallback && <span>{info.seconds}s{info.thinking ? ` · ${info.thinking.toLocaleString()} thinking tokens` : ""}</span>}
            <span>{FAMILY_NAMES[info.family] ?? info.family} style</span>
            <span>made in {info.made_in}s</span>
          </p>
        </div>

        {info.fallback && (
          <div className="message-box">The AI director did not answer, so this is the built-in edit: a few smooth zooms on
            key lines. Press New edit to ask the AI again.</div>
        )}
        {info.read && <blockquote className="ai-read">{info.read}</blockquote>}

        <dl className="render-start-facts ai-facts">
          <div><dt>Length</dt><dd>{formatTime(timeline.frames / EDIT_FPS)}</dd></div>
          <div><dt>Visuals</dt><dd>{shown}<small> of {plan.inserts.length}</small></dd></div>
          <div><dt>Zooms</dt><dd>{zooms}</dd></div>
          <div><dt>Templates</dt><dd>{plan.inserts.filter((insert) => insert.type === "template" && !insert.off).length}</dd></div>
        </dl>

        <EditTrack plan={plan} timeline={timeline} info={info} player={player} onToggle={toggle} />

        {problem && <div className="message-box error">{problem}</div>}
        {error && <div className="message-box error">{error}</div>}
        {actions}

        <details className="ai-log">
          <summary>How this edit was made</summary>
          <LiveLog lines={edit?.log ?? []} working={false} title="AI editor log" />
        </details>
      </div>
    </div>
  );
}
