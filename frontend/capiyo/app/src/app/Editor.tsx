"use client";

import { renderRequest } from "../remotion/renderRequest";
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import type { PlayerRef } from "@remotion/player";
import PlayerTimeline from "../remotion/PlayerTimeline";
import { heroWords } from "../remotion/adapter";
import { PREVIEW_FPS, frameSizeOf, pagedCues } from "../remotion/adapter";
import { aspectFor } from "../projects/types";
import { pageOf } from "../editor/captionPages";
import {
  type EditorDraft,
} from "../editor/draft";
import { useProjectSync, type Opened } from "../editor/useProjectSync";
import { PhoneNotice, usePhone } from "../editor/ProjectGate";
import { applyLook, mixFormOf } from "../language/looks";
import type { CaptionScript } from "../language/languages";
import { languageWords } from "../projects/api";
import { restoreFont, restorePartFonts, restoreWordFonts } from "../fonts/runtime";
import { useEditorHistory } from "../editor/useEditorHistory";
import {
  defaultStyleSettings,
  replaceWordText,
  resetWordEdits,
  updateWordHighlight,
  updateWordFormat,
  hasCustomFormat,
  settingsDiffer,
  carryPlacement,
  wordSettings,
} from "../editor/words";
import {
  DEFAULT_HIGHLIGHTS,
  type EmphasisSettings,
  type HighlightSettings,
} from "./captionSettings";
import type { WordEditingContext } from "./WordInspector";
import type { HighlightContext } from "./HighlightControls";
import StyleLibrary, { CAPTION_STYLES } from "./StyleLibrary";
import { captionStyle, resolveCaptionStyleId } from "./styleCatalog";
import { resolveEmphasis, styleCapabilities } from "./styleCapabilities";
import type { OverviewContext } from "./StyleOverview";
import PreviewStage from "./PreviewStage";
import AspectPicker from "./AspectPicker";
import PreviewTools, { PlacementReset, type GuideControls } from "./PreviewTools";
import { DEFAULT_GUIDES, type PreviewGuides } from "./previewGuides";
import { type CaptionSettings } from "./captionSettings";
import s from "./LayoutWorkspace.module.css";
import type { Cue } from "./CaptionTimeline";
import VideoPanel from "./VideoPanel";
import {
  DEFAULT_CAPTION_Y,
  DEFAULT_VIDEO_FRAME,
  isWhole,
  keptSegments,
  mapCues,
  outputLength,
  unmapCues,
  type AspectId,
} from "./videoSettings";

import { VideoPreviewSkeleton } from "./Skeleton";
import { applyCaptionAI } from "../ai/captionAI";
import { enhanceCues } from "../ai/pipeline";
import { useSession } from "../auth/AuthGate";
import type { EmphasisContext, AIState } from "./EmphasisControls";
import { saveMyStyle, useMyStyles, type MyStyle } from "../styles/myStyles";
import { SAMPLE_LANGUAGES, sampleCues, type SampleLanguage } from "../styles/sampleWords";

/**
 * What My styles' sample captions sit on: a plain dark canvas (the styles panel's grey), 16 seconds, no sound.
 * It is a video file so the player, timeline and playback work exactly as they do on real footage.
 */
const STUDIO_VIDEO = "/studio-canvas.mp4";

// The settings panel is big and only shows once a style is picked, so it loads on its own,
// fetched in the background right after the editor opens.
const loadSettingsPanel = () => import("./CaptionSettingsPanel");
if (typeof window !== "undefined") {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1200));
  idle(() => { void loadSettingsPanel(); });
}
const CaptionSettingsPanel = dynamic(loadSettingsPanel, {
  ssr: false,
  loading: () => <div style={{ flex: 1, minHeight: 0 }} aria-busy="true" />,
});

const POSITION_KEYS: (keyof CaptionSettings)[] = ["x", "y", "rotation"];
const SIZE_KEYS: (keyof CaptionSettings)[] = ["size", "maxWidth"];

/** Sample videos for My styles' studio are cut to this length. */
const STUDIO_SECONDS = 16;

/**
 * The editor. With `studio` it is My styles' studio instead: no project, sample captions in a language the user
 * picks over a sample video, and Save (to My styles) where Export would be.
 */
// wowclip: the editor sits inside wowclip's clip window. It gets the clip's project id, and Export hands the
// render request to wowclip (onRender), which shows its own render screen.
export default function Editor({ studio, projectId: clipProject = "", onRender }: {
  studio?: { styleId: string };
  projectId?: string;
  onRender?: (request: object, styleName: string) => void;
} = {}) {
  // Words, settings and the chosen style share one undo history.
  const {
    cues,
    settings: captionSettings,
    styleId: selectedStyleId,
    changeCues,
    changeSettings: setCaptionSettings,
    video,
    changeVideo,
    replace,
    restore,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorHistory(() => ({
    cues: [],
    settings: defaultStyleSettings(CAPTION_STYLES[0].id),
    styleId: CAPTION_STYLES[0].id,
    video: DEFAULT_VIDEO_FRAME,
  }));
  const [aspectRatio, setAspectRatio] = useState<AspectId>("9:16");
  /** The uploaded video's own size; the preview frame always takes its shape. */
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const frameSize = useMemo(
    () => frameSizeOf(videoSize.width, videoSize.height, aspectRatio, video.ratio),
    [videoSize.width, videoSize.height, aspectRatio, video.ratio],
  );
  // Caption defaults (position, app guides) follow the frame's shape.
  useEffect(() => {
    if (videoSize.width > 0 && videoSize.height > 0) setAspectRatio(aspectFor(frameSize.width, frameSize.height));
  }, [frameSize.width, frameSize.height, videoSize.width, videoSize.height]);
  const pickShape = useCallback((ratio: number | undefined) => changeVideo((previous) => ({
    ...previous, ratio,
    // A new shape shows the whole video in the middle (no crop, no stretch); back to the original fills it again.
    fit: ratio ? "fit" : "fill", zoom: 1, x: 50, y: 50,
  }), "video:ratio"), [changeVideo]);
  /** The right panel edits the captions or the video itself (framing, scenes, shades). */
  const [panelTab, setPanelTab] = useState<"captions" | "video">("captions");
  const [guides, setGuides] = useState<PreviewGuides>(DEFAULT_GUIDES);

  // ── Layout Panel Resizing & Visibility States ──
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  // Opens when a template is picked.
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  // Phones get one column: the video on top, and the styles or the settings in a sheet under it.
  const isPhone = useSyncExternalStore(subscribePhone, readPhone, () => false);
  const [mobileSheet, setMobileSheet] = useState<"styles" | "edit" | null>(null);

  // The template list opens wide enough to read each card at a glance.
  const [leftWidth, setLeftWidth] = useState(480);
  const [rightWidth, setRightWidth] = useState(360);
  const [timelineHeight, setTimelineHeight] = useState(136);
  // On a narrow window the side panels give way so the video preview always keeps a usable width.
  const [viewportWidth, setViewportWidth] = useState(1440);
  useEffect(() => {
    // One read per frame while the window is being resized.
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportWidth(window.innerWidth));
    };
    read();
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", read);
    };
  }, []);
  const PREVIEW_MIN = 360;
  const shownRightWidth = Math.max(240, Math.min(rightWidth, viewportWidth - PREVIEW_MIN - (showLeftPanel ? 220 : 0)));
  const shownLeftWidth = Math.max(220, Math.min(leftWidth, viewportWidth - PREVIEW_MIN - (showRightPanel ? shownRightWidth : 0)));
  const [activeSplitter, setActiveSplitter] = useState<
    "left" | "right" | "bottom" | null
  >(null);

  // Playback State
  const playerRef = useRef<PlayerRef | null>(null);
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [media, setMedia] = useState<EditorDraft["media"]>("uploaded");
  const [mediaId, setMediaId] = useState<string>();
  // The captions' language look (as spoken, native script, English letters, Mix, English) and the spoken language.
  const [script, setScript] = useState<CaptionScript>("spoken");
  const [language, setLanguage] = useState<string>();
  // With the Translated look: the language the captions are in now.
  const [translatedTo, setTranslatedTo] = useState<string>();
  const [videoSrc, setVideoSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [resetRevision, setResetRevision] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    at: number;
  } | null>(null);
  const selectedWord = useMemo(
    () => cues.find((cue) => cue.id === selectedWordId) ?? null,
    [cues, selectedWordId],
  );
  const cap = useMemo(() => styleCapabilities(selectedStyleId), [selectedStyleId]);
  const emphasis = useMemo(
    () => resolveEmphasis(captionSettings, selectedStyleId),
    [captionSettings, selectedStyleId],
  );
  // A selected word takes every change; styles that format all words together have no word level.
  const effectiveScope = selectedWord && cap.wordFormat ? "word" : "all";

  // ── AI caption pass (punctuation, digits, emphasis words, phrase breaks) ──
  const [aiState, setAIState] = useState<AIState>({ status: "idle" });
  const aiRequest = useRef<AbortController | null>(null);
  const latestCues = useRef(cues);
  useEffect(() => {
    latestCues.current = cues;
  }, [cues]);
  const runAI = useCallback(async () => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAIState({ status: "running" });
    try {
      const { result, sentText } = await enhanceCues(latestCues.current, controller.signal);
      if (controller.signal.aborted) return;
      // Stats come from the same application the history records.
      const applied = applyCaptionAI(latestCues.current, result, sentText);
      replace({ cues: applied.cues });
      setAIState({ status: "done", model: result.model, stats: applied.stats, at: Date.now() });
    } catch (error) {
      if (controller.signal.aborted) return;
      setAIState({
        status: "error",
        message: error instanceof Error ? error.message : "AI pass failed.",
      });
    }
  }, [replace]);
  useEffect(() => () => aiRequest.current?.abort(), []);
  const effectiveSettings = useMemo(
    () =>
      effectiveScope !== "all"
        ? wordSettings(captionSettings, selectedWord)
        : captionSettings,
    [captionSettings, selectedWord, effectiveScope],
  );
  // Cut scenes come out of the video, so the preview and timeline run on the edited clock.
  const segments = useMemo(() => keptSegments(video, duration || 1), [video, duration]);
  const whole = isWhole(segments, duration || 1);
  const outputDuration = whole ? duration : outputLength(segments);
  const timelineCues = useMemo(() => mapCues(cues, segments, duration || 1), [cues, segments, duration]);
  const changeTimeline = useCallback(
    (next: Cue[]) => changeCues((previous) => unmapCues(next, timelineCues, previous, segments, duration || 1)),
    [changeCues, timelineCues, segments, duration],
  );
  const videoFrame = useMemo(() => (whole ? video : { ...video, segments }), [video, segments, whole]);
  const previewCues = useMemo(
    () => timelineCues.map((cue) => {
      const { id, start, end, hero, lead, trail, format, highlighted, highlight, chunkId, emoji } = cue;
      // Mix: the English form rides along; a key or main word shows it when drawn.
      const mix = script === "mix" ? mixFormOf(cue) : undefined;
      const latin = mix ? cue.forms?.roman : undefined;
      const base = { id, start, end, hero, lead, trail, highlighted, highlight, chunkId, emoji, ...(mix && { mix }), ...(latin && { latin }) };
      return format ? { ...base, format } : base;
    }),
    [timelineCues, script],
  );
  const selectWord = useCallback((id: string) => {
    setSelectedWordId(id);
    setFocusRequest(null);
    setShowRightPanel(true);
  }, []);
  const editWord = useCallback(
    (id: string) => {
      selectWord(id);
      setFocusRequest({ id, at: Date.now() });
    },
    [selectWord],
  );
  const setWordHighlight = useCallback(
    (id: string, value: boolean | undefined) =>
      changeCues(
        (previous) =>
          previous.map((cue) =>
            cue.id === id ? { ...cue, highlighted: value, aiEmphasis: undefined } : cue,
          ),
        `mark:${id}`,
      ),
    [changeCues],
  );
  const resetWord = useCallback(
    (id: string) => {
      setResetRevision((revision) => revision + 1);
      changeCues(
        (previous) => resetWordEdits(previous, id),
        `reset:${id}`,
      );
    },
    [changeCues],
  );
  const handleSettingsChange = useCallback(
    (next: CaptionSettings) => {
      if (effectiveScope !== "all" && selectedWord) {
        // Apply only what changed, so words keep their own other overrides.
        const base = wordSettings(captionSettings, selectedWord);
        const patch = Object.fromEntries(
          (Object.keys(next) as (keyof CaptionSettings)[]).filter(
            (key) => JSON.stringify(next[key]) !== JSON.stringify(base[key]),
          ).map((key) => [key, next[key]]),
        ) as Partial<CaptionSettings>;
        changeCues(
          (previous) =>
            previous.map((cue) =>
              cue.id === selectedWord.id
                ? updateWordFormat(cue, captionSettings, { ...wordSettings(captionSettings, cue), ...patch })
                : cue,
            ),
          `format:${selectedWord.id}`,
        );
      } else setCaptionSettings(next);
    },
    [effectiveScope, selectedWord, captionSettings, changeCues, setCaptionSettings],
  );
  const setEmphasis = useCallback(
    (patch: Partial<EmphasisSettings>) =>
      setCaptionSettings((previous) => ({
        ...previous,
        emphasis: { ...resolveEmphasis(previous, selectedStyleId), ...patch },
      })),
    [selectedStyleId, setCaptionSettings],
  );
  // Marking a word has to show, so it also turns emphasis on.
  const markWord = useCallback(
    (id: string, value: boolean | undefined) => {
      if (value === true && !emphasis.enabled) setEmphasis({ enabled: true });
      setWordHighlight(id, value);
    },
    [emphasis.enabled, setEmphasis, setWordHighlight],
  );
  const setHighlights = useCallback(
    (highlights: HighlightSettings) =>
      setCaptionSettings((previous) => ({ ...previous, highlights })),
    [setCaptionSettings],
  );
  // Only a style that reads key words marks them on the timeline.
  const keyWordsShown = cap.emphasis !== "none" && cap.emphasisPanel !== false && emphasis.enabled;
  const wordContext: WordEditingContext = {
    revision: resetRevision,
    word: selectedWord,
    scope: effectiveScope,
    wordFormat: cap.wordFormat,
    focusRequest:
      focusRequest?.id === selectedWord?.id ? (focusRequest?.at ?? 0) : 0,
    onClose: () => setSelectedWordId(null),
    fixedMotion: !!selectedWord && !!cap.fixedHero && heroWords(selectedStyleId, cues, captionSettings.maxWords).has(selectedWord.id),
    emphasis: selectedWord && cap.emphasis !== "none" && cap.emphasisPanel !== false
      ? { on: selectedWord.highlighted === true,
          onToggle: () => markWord(selectedWord.id, selectedWord.highlighted === true ? false : true) }
      : undefined,
    onText: (text) => {
      if (!selectedWord) return null;
      try {
        changeCues(
          (previous) => replaceWordText(previous, selectedWord.id, text),
          `text:${selectedWord.id}`,
        );
        return null;
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "This word could not be updated.";
      }
    },
    onReset: () => {
      if (selectedWord) resetWord(selectedWord.id);
    },
  };
  const highlightContext: HighlightContext = {
    global: captionSettings,
    styleId: selectedStyleId,
    onGlobal: setHighlights,
    word: effectiveScope === "word" ? selectedWord : null,
    onWord: (patch) => {
      if (selectedWord)
        changeCues(
          (previous) =>
            previous.map((cue) =>
              cue.id !== selectedWord.id
                ? cue
                : patch
                  ? updateWordHighlight(cue, captionSettings, patch)
                  : { ...cue, highlight: undefined },
            ),
          `accent:${selectedWord.id}`,
        );
    },
  };
  const placementDefaults = defaultStyleSettings(selectedStyleId, aspectRatio);
  const resetPlacement = (keys: (keyof CaptionSettings)[]) =>
    setCaptionSettings((previous) => ({
      ...previous,
      ...Object.fromEntries(keys.map((key) => [key, placementDefaults[key]])),
    }));
  // Starts playing from the caption under the playhead, so a motion is seen right after picking it.
  const previewMotion = () => {
    const current = playerRef.current;
    if (!current) return;
    const time = current.getCurrentFrame() / PREVIEW_FPS;
    const pages = pagedCues(timelineCues, captionSettings, resolveCaptionStyleId(selectedStyleId));
    const cue = pages.find((item) => item.id === selectedWord?.id) ?? pages.find((item) => item.end >= time) ?? pages[0];
    if (!cue) return;
    const page = pageOf(pages, cue.id);
    if (!page.length) return;
    const start = page[0].start;
    current.seekTo(Math.max(0, Math.round((start - 0.1) * PREVIEW_FPS)));
    current.play();
  };
  const guideControls: GuideControls = {
    guides,
    aspect: aspectRatio,
    onGuides: (patch) => setGuides((previous) => ({ ...previous, ...patch })),
  };
  // ── Full screen: the preview area alone fills the screen; the frame inside sizes itself to it. ──
  const viewport = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void viewport.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    // Esc and the browser's own exit leave full screen without our button: the state follows the browser.
    const sync = () => setFullscreen(!!viewport.current && document.fullscreenElement === viewport.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')))
        return;
      event.preventDefault();
      toggleFullscreen();
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleFullscreen]);
  // Black around the video in full screen, the usual grey in the editor.
  const backdrop = fullscreen ? "#000000" : "#232323";
  const moveCaption = useCallback(
    (patch: Partial<CaptionSettings>) =>
      setCaptionSettings((previous) => ({ ...previous, ...patch })),
    [setCaptionSettings],
  );
  const emphasisContext: EmphasisContext = {
    script,
    // Only the words still in the video: words in scenes cut out of it are not listed or counted as key words.
    cues: timelineCues,
    emphasis,
    onEmphasis: setEmphasis,
    onFocusWord: (id) => {
      // Jumping to a key word must not silently narrow what the panel edits.
      setSelectedWordId(null);
      setFocusRequest(null);
      const cue = timelineCues.find((item) => item.id === id);
      if (cue) playerRef.current?.seekTo(Math.round(Math.max(cue.start, Math.min(cue.start + 0.3, cue.end - 0.02)) * PREVIEW_FPS));
    },
    onMark: markWord,
    onClear: () =>
      changeCues(
        (previous) =>
          previous.map((cue) =>
            cue.highlighted === true ? { ...cue, highlighted: undefined, aiEmphasis: undefined } : cue,
          ),
        "emphasis-clear",
      ),
  };
  const accent = { ...DEFAULT_HIGHLIGHTS, ...captionSettings.highlights };
  const overview: OverviewContext = {
    switches: [
      ...(cap.accent?.toggle
        ? [{ id: "accent", label: cap.accent.toggle, checked: accent.enabled,
            onChange: (enabled: boolean) => setHighlights({ ...accent, enabled }) }]
        : []),
      ...(cap.emphasis !== "none" && cap.emphasisToggle
        ? [{ id: "emphasis", label: "Emphasis", checked: emphasis.enabled,
            onChange: (enabled: boolean) => setEmphasis({ enabled }) }]
        : []),
      ...cap.features.map((feature) => ({
        id: feature.id,
        label: feature.label,
        checked: captionSettings.features?.[feature.id] !== false,
        onChange: (on: boolean) =>
          setCaptionSettings((previous) => ({
            ...previous,
            features: { ...previous.features, [feature.id]: on },
          })),
      })),
    ],
    changed: settingsDiffer(captionSettings, defaultStyleSettings(selectedStyleId)),
    onReset: () => {
      setResetRevision((revision) => revision + 1);
      setCaptionSettings(defaultStyleSettings(selectedStyleId, aspectRatio));
    },
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    customWords: cues.filter(hasCustomFormat).length,
    onClearWords: () =>
      changeCues(
        (previous) => previous.filter(hasCustomFormat).reduce((next, cue) => resetWordEdits(next, cue.id), previous),
        "reset-all-words",
      ),
  };
  // My styles: a copy of the saved look goes into this project; editing it here never changes the saved one.
  const [appliedMine, setAppliedMine] = useState<string>();
  const chooseStyle = useCallback(
    (id: string) => {
      setShowRightPanel(true);
      setAppliedMine(undefined);
      if (id === selectedStyleId) return;
      replace({ styleId: id, settings: carryPlacement(captionSettings, selectedStyleId, id, aspectRatio) });
    },
    [selectedStyleId, captionSettings, replace, aspectRatio],
  );
  const applyMine = useCallback(async (style: MyStyle) => {
    setShowRightPanel(true);
    const styleId = resolveCaptionStyleId(style.styleId);
    const saved = { ...defaultStyleSettings(styleId, aspectRatio), ...structuredClone(style.settings) };
    // Styles are made on a tall frame; other shapes keep the project's own placement.
    const placed = aspectRatio === "9:16" ? saved : { ...saved, x: captionSettings.x, y: captionSettings.y, rotation: captionSettings.rotation };
    const settings = await restorePartFonts(await restoreFont(placed));
    replace({ styleId, settings });
    setAppliedMine(style.id);
  }, [aspectRatio, captionSettings.x, captionSettings.y, captionSettings.rotation, replace]);

  const projectId = clipProject;
  const { refreshAccount, account } = useSession();
  const [title, setTitle] = useState("");
  const pendingAI = useRef(false);
  // wowclip: the editor opens at once on a sample video while the clip is cut and transcribed;
  // the look the user picks meanwhile is kept when the real clip and its words arrive.
  const [warm, setWarm] = useState(false);
  const chosenLook = useRef<Pick<EditorDraft, "styleId" | "settings"> | null>(null);
  const opened = useRef(false);

  const openProject = useCallback(
    async ({ project, draft, transcript, script: picked }: Opened) => {
      opened.current = true;
      const look = chosenLook.current;
      setTitle(project.title);
      // A project opened for the first time starts from the ElevenLabs words with the default style.
      const fresh = !draft && transcript;
      const source: EditorDraft = draft ?? {
        version: 1,
        styleId: look?.styleId ?? CAPTION_STYLES[0].id,
        settings: look?.settings ?? defaultStyleSettings(CAPTION_STYLES[0].id),
        cues: applyLook(transcript?.cues ?? [], picked ?? "spoken"),
        script: picked,
        language: transcript?.language,
        aspectRatio: transcript?.aspectRatio ?? "9:16",
        duration: transcript?.duration ?? project.duration,
        media: "uploaded",
        mediaId: project.id,
      };
      const styleId = resolveCaptionStyleId(source.styleId);
      const saved = styleId === source.styleId ? source.settings : defaultStyleSettings(styleId);
      const settings = await restorePartFonts(await restoreFont(saved));
      const words = await restoreWordFonts(source.cues, settings);
      // In its own shape the video fills the frame; a picked shape keeps its framing.
      const video = source.video?.ratio ? { ...DEFAULT_VIDEO_FRAME, ...source.video }
        : { ...DEFAULT_VIDEO_FRAME, ...source.video, fit: "fill" as const, zoom: 1, x: 50, y: 50, flipX: undefined };
      restore({ cues: words, settings, styleId, video });
      const known = project.width > 0 && project.height > 0;
      setVideoSize(known ? { width: project.width, height: project.height } : { width: 0, height: 0 });
      setAspectRatio(known ? aspectFor(project.width, project.height) : source.aspectRatio);
      setDuration(project.duration || source.duration);
      setMedia("uploaded");
      setMediaId(project.id);
      setVideoSrc(project.videoUrl ?? "");
      setScript(source.script ?? "spoken");
      setLanguage(source.language ?? transcript?.language);
      setTranslatedTo(source.script === "english" ? source.translatedTo ?? "en" : undefined);
      // Fresh words get the AI pass (punctuation, emphasis, phrase breaks) once they're on screen.
      if (fresh) pendingAI.current = true;
      // A project already styled reopens with its settings at hand.
      if (draft) setShowRightPanel(true);
    },
    [restore],
  );

  const project = useMemo<EditorDraft>(
    () => ({
      version: 1,
      styleId: selectedStyleId,
      settings: captionSettings,
      cues,
      aspectRatio,
      duration,
      media,
      mediaId,
      video,
      script,
      language,
      ...(script === "english" && translatedTo && { translatedTo }),
    }),
    [
      script,
      language,
      translatedTo,
      video,
      selectedStyleId,
      captionSettings,
      cues,
      aspectRatio,
      duration,
      media,
      mediaId,
    ],
  );
  const sync = useProjectSync(projectId, project, openProject, refreshAccount, !!studio);
  chosenLook.current = warm && sync.phase !== "ready" ? { styleId: selectedStyleId, settings: captionSettings } : null;
  const clipReady = sync.phase === "ready";
  useEffect(() => {
    if (studio || warm || opened.current || sync.phase !== "transcribing" || !projectId) return;
    setWarm(true);
  }, [studio, warm, clipReady, sync.phase, projectId]);
  // While the clip is cut on Modal and Deepgram listens, the editor shows the downloaded clip center-cropped
  // with YouTube's words, so the user can already pick a style. openProject swaps in the real clip and words.
  useEffect(() => {
    if (!warm || clipReady || !projectId) return;
    let live = true;
    let shownWords = false;
    let shownVideo = false;
    const look = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/preview`, { cache: "no-store" });
        if (!response.ok || !live || opened.current) return;
        const preview = await response.json();
        if (!shownWords) {
          shownWords = true;
          const styleId = CAPTION_STYLES[0].id;
          const settings = await restorePartFonts(await restoreFont(defaultStyleSettings(styleId, "9:16")));
          const words = await restoreWordFonts(preview.cues ?? [], settings);
          if (!live || opened.current) return;
          restore({ cues: words, settings, styleId, video: { ...DEFAULT_VIDEO_FRAME, fit: "fill" as const, zoom: 1, x: 50, y: 50 } });
          setTitle(preview.title ?? "");
          setVideoSize({ width: 1080, height: 1920 });
          setAspectRatio("9:16");
          setDuration(preview.duration || STUDIO_SECONDS);
          setMedia("demo");
          setShowRightPanel(true);
        }
        if (preview.previewUrl && !shownVideo && live && !opened.current) {
          shownVideo = true;
          setVideoSrc(preview.previewUrl);
        }
      } catch {
        return;
      }
    };
    void look();
    const timer = window.setInterval(look, 1500);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [warm, clipReady, projectId, restore]);
  const phone = usePhone();

  // ── My styles' studio ──
  const myStyles = useMyStyles();
  const [studioName, setStudioName] = useState("");
  const [studioId, setStudioId] = useState<string | undefined>(studio && studio.styleId !== "new" ? studio.styleId : undefined);
  const [sampleLanguage, setSampleLanguage] = useState<SampleLanguage>("en");
  const [studioSave, setStudioSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [studioError, setStudioError] = useState("");
  const studioOpened = useRef(false);
  useEffect(() => {
    if (!studio || studioOpened.current) return;
    const editing = studio.styleId !== "new";
    if (editing && myStyles === undefined) return;
    studioOpened.current = true;
    void (async () => {
      const saved = editing ? myStyles?.find((item) => item.id === studio.styleId) : undefined;
      // A link to a style that doesn't exist (deleted, mistyped) opens a new one instead of a blank "edit".
      if (editing && !saved) {
        setStudioId(undefined);
        window.history.replaceState(null, "", "/styles/edit?id=new");
      }
      const styleId = resolveCaptionStyleId(saved?.styleId ?? CAPTION_STYLES[0].id);
      const base = defaultStyleSettings(styleId, "9:16");
      const settings = await restorePartFonts(await restoreFont(saved ? { ...base, ...structuredClone(saved.settings) } : base));
      // The sample video's own length, at most STUDIO_SECONDS.
      const length = await new Promise<number>((resolve) => {
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(Math.min(STUDIO_SECONDS, probe.duration || STUDIO_SECONDS));
        probe.onerror = () => resolve(STUDIO_SECONDS);
        probe.src = STUDIO_VIDEO;
      });
      restore({ cues: sampleCues("en", length), settings, styleId, video: DEFAULT_VIDEO_FRAME });
      setStudioName(saved?.name ?? "");
      setVideoSize({ width: 1080, height: 1920 });
      setAspectRatio("9:16");
      setDuration(length);
      setMedia("demo");
      setVideoSrc(STUDIO_VIDEO);
      setShowRightPanel(true);
    })();
  }, [studio, myStyles, restore]);
  const pickSampleLanguage = useCallback((next: SampleLanguage) => {
    setSampleLanguage(next);
    replace({ cues: sampleCues(next, duration || STUDIO_SECONDS) });
  }, [replace, duration]);
  const saveStudio = useCallback(async () => {
    const name = studioName.trim() || `${captionStyle(selectedStyleId)?.name ?? "My"} style`;
    setStudioSave("saving");
    setStudioError("");
    try {
      const saved = await saveMyStyle({ id: studioId, name, styleId: selectedStyleId, settings: captionSettings });
      setStudioName(saved.name);
      if (!studioId) {
        setStudioId(saved.id);
        window.history.replaceState(null, "", `/styles/edit?id=${saved.id}`);
      }
      setStudioSave("saved");
    } catch (error) {
      setStudioSave("error");
      setStudioError(error instanceof Error ? error.message : "This style couldn't be saved.");
    }
  }, [studioName, studioId, selectedStyleId, captionSettings]);
  // Any change after a save shows Save again.
  useEffect(() => {
    setStudioSave((state) => (state === "saved" ? "idle" : state));
  }, [captionSettings, selectedStyleId, studioName]);
  const draftReady = sync.phase === "ready" || warm;

  useEffect(() => {
    if (!pendingAI.current || !cues.length) return;
    pendingAI.current = false;
    void runAI();
  }, [cues, runAI]);

  // ── Caption language look ──
  const [lookBusy, setLookBusy] = useState(false);
  /** `to` is the language for the Translated look. */
  const heardCues = useRef<Cue[]>(undefined);
  const changeLook = useCallback(async (next: CaptionScript, to?: string) => {
    if (lookBusy || (next === script && (next !== "english" || to === translatedTo))) return;
    setLookBusy(true);
    try {
      if (next === "english") {
        // New words, timed across each phrase.
        const target = to ?? "en";
        const { cues: translated, spent } = await languageWords(projectId, "translate", { to: target });
        // Languages past the included ones take a little credit; the header shows the new balance.
        if (spent) void refreshAccount();
        // The heard words, key words and fixes included, wait here for coming back; the translation marks its own key words.
        if (script !== "english") heardCues.current = latestCues.current;
        replace({ cues: translated });
        setTranslatedTo(target);
      } else {
        let base = latestCues.current;
        // Coming back uses the words kept from before the translation, so the AI pass doesn't run again.
        const kept = script === "english" ? heardCues.current : undefined;
        if (script === "english") base = kept ?? (await languageWords(projectId, "original")).cues;
        // Smart Mix, English letters and the native script need each word written each way. That is made now,
        // from the words as they are (numbers already digits, fixes kept), once; it rides along on the words.
        if (next !== "spoken" && !base.some((cue) => cue.forms?.native || cue.forms?.roman)) {
          const words = base.filter((cue) => cue.hero.trim()).map(({ id, hero, start, end }) => ({ id, hero, start, end }));
          // The AI model sometimes fails on its first call (a cold or busy provider) and answers the next:
          // one quiet second try, so the user doesn't see an error for something that works on a re-pick.
          const ask = () => languageWords(projectId, "forms", { words });
          const { cues: formed } = await ask().catch(ask);
          const forms = new Map(formed.map((cue) => [cue.id, cue.forms]));
          base = base.map((cue) => (forms.get(cue.id) ? { ...cue, forms: forms.get(cue.id) } : cue));
        }
        if (script === "english" && !kept) pendingAI.current = true;
        replace({ cues: applyLook(base, next) });
        setTranslatedTo(undefined);
      }
      setScript(next);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The captions couldn't switch language. Please try again.");
    } finally {
      setLookBusy(false);
    }
  }, [script, translatedTo, lookBusy, projectId, replace, refreshAccount]);

  useEffect(() => {
    const onHistoryKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onHistoryKey);
    return () => window.removeEventListener("keydown", onHistoryKey);
  }, [undo, redo]);

  useEffect(() => {
    const onSpace = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
          ))
      )
        return;

      const currentPlayer = playerRef.current;
      if (!currentPlayer) return;
      event.preventDefault();
      if (currentPlayer.isPlaying()) {
        currentPlayer.pause();
      } else {
        if (currentPlayer.getCurrentFrame() >= Math.ceil(outputDuration * PREVIEW_FPS) - 1)
          currentPlayer.seekTo(0);
        currentPlayer.play();
      }
    };

    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [outputDuration]);

  useEffect(
    () => () => {
      if (videoSrc.startsWith("blob:")) URL.revokeObjectURL(videoSrc);
    },
    [videoSrc],
  );

  // ── 3-WAY RESIZING CONTROLLERS WITH CONTROLLED BOUNDS ──
  const startResizeLeft = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setActiveSplitter("left");
      const startX = e.clientX;
      const startW = shownLeftWidth;
      let nextWidth = startW;
      let resizeFrame: number | null = null;

      const onMove = (ev: PointerEvent) => {
        // Safe limits: min 220px, max 640px. One layout per frame, however fast the pointer moves.
        nextWidth = Math.max(
          220,
          Math.min(640, startW + (ev.clientX - startX)),
        );
        if (resizeFrame === null)
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            setLeftWidth(nextWidth);
          });
      };
      const onUp = () => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        setLeftWidth(nextWidth);
        setActiveSplitter(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [shownLeftWidth],
  );

  const startResizeRight = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setActiveSplitter("right");
      const startX = e.clientX;
      const startW = shownRightWidth;
      let nextWidth = startW;
      let resizeFrame: number | null = null;

      const onMove = (ev: PointerEvent) => {
        // Safe limits: min 240px, max 460px
        nextWidth = Math.max(
          240,
          Math.min(460, startW + (startX - ev.clientX)),
        );
        if (resizeFrame === null)
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            setRightWidth(nextWidth);
          });
      };
      const onUp = () => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        setRightWidth(nextWidth);
        setActiveSplitter(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [shownRightWidth],
  );

  const startResizeBottom = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setActiveSplitter("bottom");
      const startY = e.clientY;
      const startH = timelineHeight;
      let nextHeight = startH;
      let resizeFrame: number | null = null;

      const onMove = (ev: PointerEvent) => {
        // Safe limits: min 95px, max 280px. One layout per frame.
        nextHeight = Math.max(
          95,
          Math.min(280, startH + (startY - ev.clientY)),
        );
        if (resizeFrame === null)
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            setTimelineHeight(nextHeight);
          });
      };
      const onUp = () => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        setTimelineHeight(nextHeight);
        setActiveSplitter(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [timelineHeight],
  );

  if (sync.phase === "error")
    return (
      <div className="capiyo-wait">
        <p>{sync.error}</p>
        <button type="button" onClick={sync.retry}>Try again</button>
      </div>
    );
  if (sync.phase !== "ready" && !warm)
    return (
      <div className="capiyo-wait">
        <span className="spinner" />
        <p>Getting the clip ready: cutting it, following the speaker and timing every word…</p>
      </div>
    );
  // The editor needs room (preview, timeline, settings side by side). Phones can upload and make captions; editing waits for a computer.
  if (phone) return <PhoneNotice />;

  return (
    <div
      aria-busy={!draftReady}
      inert={!draftReady}
      style={{
        display: "flex",
        flexDirection: "column",
        // The visible height on phones, where the browser bar comes and goes.
        height: "100%",
        background: "var(--bg-app)",
        overflow: "hidden",
        userSelect: activeSplitter ? "none" : "auto",
        cursor:
          activeSplitter === "left" || activeSplitter === "right"
            ? "col-resize"
            : activeSplitter === "bottom"
              ? "row-resize"
              : "auto",
      }}
    >
      {/* 1. TOP HEADER */}
      <header
        className={s.editorHeader}
        style={{
          height: 52,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          background: "linear-gradient(90deg, #0d0f13 0%, #111419 50%, #0f1217 100%)",
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1, marginRight: 16 }}>
          {studio ? (
            <input className={s.styleName} value={studioName} onChange={(event) => setStudioName(event.target.value)}
              placeholder="Name this style, e.g. Brand Bold" aria-label="Style name" maxLength={60} />
          ) : (
            <span className={s.tagline} title={title}>{title}</span>
          )}
        </div>

        <div className={s.headerActions} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Layout Panel Toggles: phones use the bottom bar instead */}
          {!isPhone && <div
            className={s.toggleGroup}
            role="toolbar"
            aria-label="Layout panels"
          >
            {/* Toggle Left Sidebar */}
            <button
              type="button"
              className={`${s.toggleBtn} ${showLeftPanel ? s.toggleBtnActive : ""}`}
              onClick={() => setShowLeftPanel((prev) => !prev)}
              title={
                showLeftPanel
                  ? "Hide Left Sidebar (Styles)"
                  : "Show Left Sidebar (Styles)"
              }
              aria-label="Toggle Left Panel"
              aria-pressed={showLeftPanel}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1.5"
                  y="2"
                  width="13"
                  height="12"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M1.5 4.5C1.5 3.12 2.62 2 4 2H6V14H4C2.62 14 1.5 12.88 1.5 11.5V4.5Z"
                  fill="currentColor"
                  opacity={showLeftPanel ? 0.95 : 0.25}
                />
              </svg>
            </button>

            {/* Toggle Bottom Timeline */}
            <button
              type="button"
              className={`${s.toggleBtn} ${showTimeline ? s.toggleBtnActive : ""}`}
              onClick={() => setShowTimeline((prev) => !prev)}
              title={
                showTimeline
                  ? "Hide Bottom Panel (Timeline)"
                  : "Show Bottom Panel (Timeline)"
              }
              aria-label="Toggle Bottom Panel"
              aria-pressed={showTimeline}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1.5"
                  y="2"
                  width="13"
                  height="12"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M1.5 10H14.5V11.5C14.5 12.88 13.38 14 12 14H4C2.62 14 1.5 12.88 1.5 11.5V10Z"
                  fill="currentColor"
                  opacity={showTimeline ? 0.95 : 0.25}
                />
              </svg>
            </button>

            {/* Toggle Right Sidebar */}
            <button
              type="button"
              className={`${s.toggleBtn} ${showRightPanel ? s.toggleBtnActive : ""}`}
              onClick={() => setShowRightPanel((prev) => !prev)}
              title={
                showRightPanel
                  ? "Hide Right Sidebar (Settings)"
                  : "Show Right Sidebar (Settings)"
              }
              aria-label="Toggle Right Panel"
              aria-pressed={showRightPanel}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1.5"
                  y="2"
                  width="13"
                  height="12"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M10 2H12C13.38 2 14.5 3.12 14.5 4.5V11.5C14.5 12.88 13.38 14 12 14H10V2Z"
                  fill="currentColor"
                  opacity={showRightPanel ? 0.95 : 0.25}
                />
              </svg>
            </button>
          </div>}

          {studio ? (
            <>
              <label className={s.sampleSelect}>
                <span>Sample words</span>
                <select value={sampleLanguage} onChange={(event) => pickSampleLanguage(event.target.value as SampleLanguage)}>
                  {SAMPLE_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {studioSave === "error" && <span className={s.studioError} role="alert" title={studioError}>Not saved</span>}
              <button type="button" className={s.exportButton} data-phase={studioSave === "saved" ? "ready" : "idle"}
                onClick={() => void saveStudio()} disabled={studioSave === "saving" || !cues.length} title="Save this look to My styles">
                {studioSave === "saving" ? "Saving…" : studioSave === "saved" ? "Saved" : studioId ? "Save changes" : "Save style"}
              </button>
            </>
          ) : (
            <>
            <button
              type="button"
              className={s.exportButton}
              data-phase="idle"
              onClick={() => {
                playerRef.current?.pause();
                onRender?.(
                  renderRequest({ cues: previewCues, settings: captionSettings, styleId: selectedStyleId, video, duration: outputDuration }),
                  captionStyle(selectedStyleId)?.name ?? "Custom",
                );
              }}
              disabled={!clipReady || !cues.length}
              title={clipReady ? "Next: render the reel on AWS Lambda" : "Your clip is still being prepared"}
            >
              {clipReady ? <>Next<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></> : "Preparing clip…"}
            </button>

            </>
          )}

        </div>
      </header>


      {/* 2. DYNAMIC RESIZABLE WORKSPACE */}
      <div className={`${s.workspace} ${isPhone ? s.phone : ""}`}>
        {/* ========================================================= */}
        {/* PANEL 1 (LEFT): TEMPLATES IN RESIZABLE VIEW */}
        {/* ========================================================= */}
        {(isPhone ? mobileSheet === "styles" : showLeftPanel) && (
          <div className={s.leftPanel} style={{ width: isPhone ? undefined : shownLeftWidth }}>
            {isPhone && <SheetBar title="Styles" onClose={() => setMobileSheet(null)} />}
            <StyleLibrary selectedId={selectedStyleId} onSelect={chooseStyle} />
          </div>
        )}

        {/* LEFT SPLITTER DIVIDER (COL-RESIZE) */}
        {!isPhone && showLeftPanel && (
          <div
            className={`${s.colResizer} ${activeSplitter === "left" ? s.colResizerActive : ""}`}
            onPointerDown={startResizeLeft}
            onDoubleClick={() => setLeftWidth(480)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 64 : 16;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setLeftWidth(Math.max(220, Math.min(640, shownLeftWidth + (event.key === "ArrowRight" ? step : -step))));
              }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize styles panel"
            aria-valuenow={Math.round(shownLeftWidth)}
            aria-valuemin={220}
            aria-valuemax={640}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
          />
        )}

        {/* ========================================================= */}
        {/* CENTER MAIN AREA: PREVIEW & BOTTOM TIMELINE */}
        {/* ========================================================= */}
        <main className={s.mainArea}>
          {/* Preview Header */}
          <div
            className={s.previewBar}
            style={{
              height: 52,
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-library)",
              flexShrink: 0,
            }}
          >
            <PlacementReset
                positionChanged={settingsDiffer(captionSettings, placementDefaults, POSITION_KEYS)}
                sizeChanged={settingsDiffer(captionSettings, placementDefaults, SIZE_KEYS)}
                onResetPosition={() => resetPlacement(POSITION_KEYS)}
                onResetSize={() => resetPlacement(SIZE_KEYS)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, marginLeft: "auto" }}>
              {videoSize.width > 0 && (
                <AspectPicker value={video.ratio} original={videoSize.width / videoSize.height} onChange={pickShape} />
              )}
              <PreviewTools {...guideControls} />
            </div>
          </div>

          {/* Video Viewport Area: a plain mid-tone backdrop that contrasts with the square frame */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: fullscreen ? 0 : isPhone ? "10px" : "16px 20px",
              position: "relative",
              overflow: "hidden",
              containerType: "size",
              // Lighter than any video frame, so the square edge always reads clearly.
              backgroundColor: backdrop,
              backgroundImage: fullscreen ? "none" : "radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)",
              backgroundSize: "4px 4px",
            }}
            ref={viewport}
            // A click on the grey around the frame lets go of the selected word.
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedWordId(null);
            }}
          >
            {/* The Aspect Ratio Box — Embedded in Steel with Sharp Square Bounds & Soft Light Focus */}
            <div
              style={{
                position: "relative",
                width: `min(100cqw, calc(100cqh * ${frameSize.width / frameSize.height}))`,
                height: "auto",
                maxHeight: "100%",
                maxWidth: "100%",
                aspectRatio: `${frameSize.width} / ${frameSize.height}`,
                borderRadius: 0,
                background: "#000000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {draftReady ? (
                <PreviewStage
                  playerRef={playerRef}
                  onReady={setPlayer}
                  player={player}
                  cues={previewCues}
                  settings={captionSettings}
                  src={videoSrc}
                  duration={outputDuration}
                  aspectRatio={aspectRatio}
                  frameSize={frameSize}
                  styleId={selectedStyleId}
                  video={videoFrame}
                  cap={cap}
                  guides={guides}
                  bestY={DEFAULT_CAPTION_Y[aspectRatio]}
                  onChange={moveCaption}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                  <VideoPreviewSkeleton aspectRatio={aspectRatio} label="Restoring your project…" />
                </div>
              )}

              {/* The frame's size lands between screen pixels, so the browser rounds the video and what is drawn
                  over it (shades, the vignette) to different pixels: a bright hairline of bare video then shows
                  along an edge, coming and going with the window size. A thin ring in the backdrop's own grey
                  sits over that outermost pixel on every side, under the guides and the caption handles. */}
              <div aria-hidden style={{ position: "absolute", inset: -1, border: `2px solid ${backdrop}`, pointerEvents: "none", zIndex: 1 }} />

              {/* Sample Video Badge: only the demo is marked; a user's own video shows clean. */}
              {media === "demo" && !studio && !clipReady && <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  right: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: 0,
                    background: "rgba(0, 0, 0, 0.65)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#cbd5e1",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <span className="spinner" style={{ width: 10, height: 10, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} />
                  PREVIEW: CENTER CROP + YOUTUBE WORDS · FINDING THE SPEAKER AND LISTENING FOR THE EXACT WORDS…
                </div>
              </div>}
            </div>
            {/* Full screen: bottom right of the preview, the words first and then the icon. The same button leaves it. */}
            <button type="button" className={s.fullscreenButton} onClick={toggleFullscreen}
              title={fullscreen ? "Exit full screen (Esc or F)" : "Watch the video full screen (F)"}>
              {fullscreen ? "Exit full screen" : "Full screen"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={fullscreen ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
              </svg>
            </button>
          </div>

          {sync.saveState === "offline" && (
            <div
              role="alert"
              style={{
                padding: "8px 16px",
                background: "linear-gradient(90deg, rgba(52, 42, 60, 0.9), rgba(42, 34, 50, 0.95))",
                color: "#e2d8ef",
                fontSize: 11,
                fontWeight: 500,
                borderTop: "1px solid rgba(200, 180, 230, 0.08)",
              }}
            >
              You&apos;re offline. Your changes are safe in this browser and will save to your account when you&apos;re back online.
            </div>
          )}

          {/* BOTTOM SPLITTER DIVIDER (ROW-RESIZE) */}
          {!isPhone && showTimeline && (
            <div
              className={`${s.rowResizer} ${activeSplitter === "bottom" ? s.rowResizerActive : ""}`}
              onPointerDown={startResizeBottom}
              onDoubleClick={() => setTimelineHeight(136)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 48 : 12;
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setTimelineHeight((height) => Math.max(95, Math.min(280, height + (event.key === "ArrowUp" ? step : -step))));
                }
              }}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize timeline"
              aria-valuenow={Math.round(timelineHeight)}
              aria-valuemin={95}
              aria-valuemax={280}
              tabIndex={0}
              title="Drag to resize. Double-click to reset."
            />
          )}

          {/* BOTTOM TIMELINE (RESIZABLE & COLLAPSIBLE) */}
          {(isPhone ? mobileSheet === null : showTimeline) && (
            <div
              className={s.timelineWrapper}
              style={{ height: isPhone ? 118 : timelineHeight }}
            >
              <PlayerTimeline
                key={videoSrc}
                player={player}
                cues={timelineCues}
                onChange={changeTimeline}
                duration={outputDuration}
                selectedId={selectedWord?.id ?? null}
                onSelect={selectWord}
                onEdit={editWord}
                onHighlight={markWord}
                onResetWord={resetWord}
                onUndo={undo}
                onRedo={redo}
                highlightsEnabled={keyWordsShown}
                aiState={aiState}
              />
            </div>
          )}
        </main>

        {/* RIGHT SPLITTER DIVIDER (COL-RESIZE) */}
        {!isPhone && showRightPanel && (
          <div
            className={`${s.colResizer} ${activeSplitter === "right" ? s.colResizerActive : ""}`}
            onPointerDown={startResizeRight}
            onDoubleClick={() => setRightWidth(360)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 64 : 16;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setRightWidth(Math.max(240, Math.min(460, shownRightWidth + (event.key === "ArrowLeft" ? step : -step))));
              }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize settings panel"
            aria-valuenow={Math.round(shownRightWidth)}
            aria-valuemin={240}
            aria-valuemax={460}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
          />
        )}

        {/* ========================================================= */}
        {/* PANEL 3 (RIGHT): EMPTY TAB */}
        {(isPhone ? mobileSheet === "edit" : showRightPanel) && (
          <aside
            className={s.rightPanel}
            style={{ width: isPhone ? undefined : shownRightWidth }}
            aria-label="Caption style settings"
          >
            {isPhone && <SheetBar title={panelTab === "video" ? "Video" : "Captions"} onClose={() => setMobileSheet(null)} />}
            <div className={s.panelTabs} role="tablist" aria-label="Edit">
              {(["captions", "video"] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={panelTab === tab}
                  className={s.panelTab} onClick={() => setPanelTab(tab)}>
                  {tab === "captions" ? "Captions" : "Video"}
                </button>
              ))}
            </div>
            {panelTab === "video" ? (
              <VideoPanel
                video={video}
                onChange={changeVideo}
                duration={duration}
                player={player}
                segments={segments}
              />
            ) : (
            <CaptionSettingsPanel
              key={selectedStyleId}
              settings={effectiveSettings}
              onChange={handleSettingsChange}
              wordContext={wordContext}
              highlightContext={highlightContext}
              emphasisContext={emphasisContext}
              overview={overview}
              onPreviewMotion={previewMotion}
            />
            )}
          </aside>
        )}
      </div>

      {/* Phones: one bar to open the styles, the caption settings or the video settings under the preview. */}
      {isPhone && (
        <nav className={s.phoneNav} aria-label="Editor panels">
          {PHONE_TABS.map((tab) => {
            const active = tab.id === "styles" ? mobileSheet === "styles" : mobileSheet === "edit" && panelTab === tab.id;
            return (
              <button key={tab.id} type="button" aria-pressed={active}
                onClick={() => {
                  if (active) return setMobileSheet(null);
                  if (tab.id === "styles") return setMobileSheet("styles");
                  setPanelTab(tab.id);
                  setMobileSheet("edit");
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{tab.icon}</svg>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

const PHONE_QUERY = "(max-width: 760px)";
const subscribePhone = (update: () => void) => {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
};
const readPhone = () => window.matchMedia(PHONE_QUERY).matches;

const PHONE_TABS: { id: "styles" | "captions" | "video"; label: string; icon: React.ReactNode }[] = [
  { id: "styles", label: "Styles", icon: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></> },
  { id: "captions", label: "Captions", icon: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M7 12h4M13 12h4M7 15.5h7" /></> },
  { id: "video", label: "Video", icon: <><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></> },
];

/** Top of a phone sheet: its name and a Done button that closes it. */
function SheetBar({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={s.sheetBar}>
      <strong>{title}</strong>
      <button type="button" onClick={onClose}>Done</button>
    </div>
  );
}

const ExportIcon = ({ done = false }: { done?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {done ? <><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 20h14" /></> : <><path d="M12 15V4" /><path d="M7 8.5l5-5 5 5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>}
  </svg>
);
