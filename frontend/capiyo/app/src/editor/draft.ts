import { MOTION_IN, MOTION_OUT } from "../../../captions/src/BasicCaption/motion";
import type { Cue } from "../app/CaptionTimeline";
import {
  BLEND_MODES,
  DEFAULT_CAPTION_SETTINGS,
  DEFAULT_HIGHLIGHTS,
  resolveEffects,
  type CaptionSettings,
  type TextEffects,
} from "../app/captionSettings";
import { WORD_FORMAT_KEYS } from "./words";
import type { PreviewAspectRatio } from "../remotion/adapter";
import { CAPTION_STYLES, isCaptionStyleId } from "../app/styleCatalog";
import { readVideoFrame, type VideoFrameSettings } from "../app/videoSettings";
import type { CaptionScript } from "../language/languages";

export type EditorDraft = {
  version: 1;
  styleId: string;
  cues: Cue[];
  settings: CaptionSettings;
  aspectRatio: PreviewAspectRatio;
  duration: number;
  media: "demo" | "uploaded";
  mediaId?: string;
  /** How the video is framed, shaded and cut. Older drafts have none: the whole video, filling the frame. */
  video?: VideoFrameSettings;
  /** The captions' language look (see language/languages.ts). Older drafts have none: as spoken. */
  script?: CaptionScript;
  /** With the "english" look (Translated): the language the captions were translated to. Older drafts: English. */
  translatedTo?: string;
  /** The language the speech was in (ISO 639-1). */
  language?: string;
};

let connection: Promise<IDBDatabase> | undefined;
export function database() {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("caption-studio-editor", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["drafts", "media", "fonts"])
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = undefined;
        reject(new Error("Draft storage is blocked by another tab."));
      };
    });
  return connection;
}

async function read<T>(store: string, key = "current"): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function write(store: string, value: unknown, key = "current") {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Draft save was interrupted."));
  });
}

function validHighlight(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.enabled === "boolean" &&
    typeof entry.color === "string" &&
    /^#[a-f0-9]{6}$/i.test(entry.color) &&
    typeof entry.backgroundColor === "string" &&
    /^#[a-f0-9]{6}$/i.test(entry.backgroundColor) &&
    ["text", "fill"].includes(String(entry.mode)) &&
    typeof entry.scale === "number" &&
    Number.isFinite(entry.scale) &&
    entry.scale >= 0.5 &&
    entry.scale <= 2.5
  );
}

const HEX = /^#[a-f0-9]{6}$/i;
const inRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
function validEffects(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fx = resolveEffects(value as Partial<TextEffects>);
  return (
    inRange(fx.opacity, 0, 100) &&
    BLEND_MODES.some((mode) => mode.id === fx.blend) &&
    typeof fx.stroke.on === "boolean" && HEX.test(fx.stroke.color) && inRange(fx.stroke.width, 0, 10) &&
    typeof fx.shadow.on === "boolean" && HEX.test(fx.shadow.color) && inRange(fx.shadow.opacity, 0, 100) &&
    inRange(fx.shadow.blur, 0, 30) && inRange(fx.shadow.x, -30, 30) && inRange(fx.shadow.y, -30, 30) &&
    typeof fx.glow.on === "boolean" && HEX.test(fx.glow.color) && inRange(fx.glow.opacity, 0, 100) &&
    inRange(fx.glow.blur, 0, 40) &&
    typeof fx.depth.on === "boolean" && HEX.test(fx.depth.color) && inRange(fx.depth.length, 0, 20) &&
    inRange(fx.depth.angle, 0, 360)
  );
}

export function validateCaptionSettings(
  value: CaptionSettings,
): CaptionSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const settings = {
    ...DEFAULT_CAPTION_SETTINGS,
    ...value,
    highlights: { ...DEFAULT_HIGHLIGHTS, ...value.highlights },
  };
  if (
    settings.weight !== undefined &&
    (!Number.isFinite(settings.weight) ||
      settings.weight < 100 ||
      settings.weight > 900)
  )
    return null;
  if (
    typeof settings.font !== "string" ||
    !settings.font.trim() ||
    settings.font.length > 150 ||
    !/^#[0-9a-f]{6}$/i.test(settings.color) ||
    !["none", "fade", "pop"].includes(settings.motion)
  )
    return null;
  if (settings.italic !== undefined && typeof settings.italic !== "boolean")
    return null;
  if (
    settings.fontUploadId !== undefined &&
    settings.fontUploadId !== "" &&
    (typeof settings.fontUploadId !== "string" ||
      !/^[a-f0-9]{64}$/.test(settings.fontUploadId))
  )
    return null;
  if (
    settings.fontAsset !== undefined &&
    typeof settings.fontAsset !== "string"
  )
    return null;
  if (
    settings.fontAsset &&
    !CAPTION_STYLES.some(style => style.fontSrc === settings.fontAsset) &&
    !/^\/fonts\/[a-z0-9/.-]+$/i.test(settings.fontAsset) &&
    !/^\/api\/caption-assets\/basic-(?:inter|poppins|instrument|serif|anton|devanagari|gorva|theboldfont|redressed)$/.test(settings.fontAsset) &&
    !/^https:\/\/fonts\.gstatic\.com\/[^\s]+$/i.test(settings.fontAsset) &&
    !(settings.fontUploadId && settings.fontAsset.startsWith("blob:"))
  )
    return null;
  if (
    !["solid", "gradient"].includes(settings.colorMode ?? "solid") ||
    !["word", "character"].includes(settings.gradientScope ?? "word")
  )
    return null;
  if (
    !Number.isFinite(settings.gradientAngle) ||
    settings.gradientAngle! < 0 ||
    settings.gradientAngle! > 360 ||
    !Number.isFinite(settings.letterSpacing) ||
    settings.letterSpacing! < -1 ||
    settings.letterSpacing! > 7.5 ||
    !Number.isFinite(settings.lineSpacing) ||
    settings.lineSpacing! < 0.8 ||
    settings.lineSpacing! > 3
  )
    return null;
  if (
    !["left", "center", "right"].includes(settings.textAlign ?? "center") ||
    (settings.wordSpacing !== undefined &&
      (!Number.isFinite(settings.wordSpacing) ||
        settings.wordSpacing < -1 ||
        settings.wordSpacing > 12)) ||
    (settings.autoFit !== undefined && typeof settings.autoFit !== "boolean") ||
    (settings.rotation !== undefined &&
      (!Number.isFinite(settings.rotation) ||
        settings.rotation < -180 ||
        settings.rotation > 180)) ||
    (settings.maxLines !== undefined &&
      (!Number.isInteger(settings.maxLines) ||
        settings.maxLines < 1 ||
        settings.maxLines > 4))
  )
    return null;
  if (
    !Array.isArray(settings.gradientStops) ||
    settings.gradientStops.length < 2 ||
    settings.gradientStops.length > 8 ||
    settings.gradientStops.some(
      (stop) =>
        !stop ||
        typeof stop.id !== "string" ||
        !/^#[a-f0-9]{6}$/i.test(stop.color) ||
        !Number.isFinite(stop.position) ||
        stop.position < 0 ||
        stop.position > 100,
    ) ||
    new Set(settings.gradientStops.map((stop) => stop.id)).size !==
      settings.gradientStops.length
  )
    return null;
  for (const [key, min, max] of [
    ["size", 6, 400],
    ["shadow", 0, 100],
    ["x", 0, 100],
    ["y", 0, 100],
    ["motionDuration", 80, 300],
  ] as const) {
    if (
      !Number.isFinite(settings[key]) ||
      settings[key] < min ||
      settings[key] > max
    )
      return null;
  }
  if (!validHighlight(settings.highlights)) return null;
  if (settings.emphasis !== undefined && !validHighlight(settings.emphasis)) return null;
  const motion = settings.animation;
  if (
    motion !== undefined &&
    (!motion ||
      typeof motion !== "object" ||
      !["caption", "word", "line", "key"].includes(motion.unit) ||
      !["style", ...MOTION_IN].includes(motion.in) ||
      (motion.keyIn !== undefined && !["same", ...MOTION_IN].includes(motion.keyIn)) ||
      (motion.keyOut !== undefined && !(["same", ...MOTION_OUT] as string[]).includes(motion.keyOut)) ||
      !(MOTION_OUT as readonly string[]).includes(motion.out))
  )
    return null;
  if (settings.wordIn !== undefined && !MOTION_IN.includes(settings.wordIn)) return null;
  if (settings.sizeScale !== undefined && !Number.isFinite(settings.sizeScale)) return null;
  if (
    settings.features !== undefined &&
    (!settings.features ||
      typeof settings.features !== "object" ||
      Object.values(settings.features).some((value) => typeof value !== "boolean"))
  )
    return null;
  if (!validEffects(settings.effects) || !validEffects(settings.restEffects)) return null;
  const box = settings.box;
  if (box !== undefined && (!box || typeof box !== "object" || Array.isArray(box) ||
    (["opacity", "frameWidth", "radius", "padding", "glow", "drawMs", "gradientAngle"] as const)
      .some((field) => box[field] !== undefined && !Number.isFinite(box[field]))))
    return null;
  const key = settings.keyFormat;
  if (key !== undefined && (!key || typeof key !== "object" || Array.isArray(key) ||
    (key.letterSpacing !== undefined && !Number.isFinite(key.letterSpacing)) || !validEffects(key.effects) ||
    (key.textCase !== undefined && !["preserve", "uppercase", "lowercase"].includes(key.textCase))))
    return null;
  return settings;
}

export function validateDraft(value: unknown): EditorDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<EditorDraft>;
  if (
    draft.version !== 1 ||
    !Array.isArray(draft.cues) ||
    !draft.settings ||
    !["9:16", "4:5", "16:9", "1:1"].includes(draft.aspectRatio ?? "") ||
    !Number.isFinite(draft.duration) ||
    draft.duration! <= 0 ||
    draft.duration! > 86400
  )
    return null;
  const ids = new Set<string>();
  for (const cue of draft.cues) {
    if (
      !cue ||
      typeof cue.id !== "string" ||
      ids.has(cue.id) ||
      typeof cue.hero !== "string" ||
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      cue.end > 86400
    )
      return null;
    ids.add(cue.id);
  }
  const settings = validateCaptionSettings(draft.settings);
  if (!settings) return null;
  for (const cue of draft.cues) {
    if (
      (cue.aiEmphasis !== undefined && typeof cue.aiEmphasis !== "boolean") ||
      (cue.pageBreak !== undefined && typeof cue.pageBreak !== "boolean") ||
      (cue.chunkId !== undefined && typeof cue.chunkId !== "string") ||
      (cue.aiOriginal !== undefined && typeof cue.aiOriginal !== "string") ||
      (cue.emoji !== undefined && typeof cue.emoji !== "string") ||
      (cue.original !== undefined && typeof cue.original?.hero !== "string") ||
      (cue.forms !== undefined && (!cue.forms || typeof cue.forms.spoken !== "string"))
    )
      return null;
    if (cue.highlighted !== undefined && typeof cue.highlighted !== "boolean")
      return null;
    if (
      cue.highlight !== undefined &&
      (!cue.highlight ||
        typeof cue.highlight !== "object" ||
        Array.isArray(cue.highlight) ||
        Object.keys(cue.highlight).some(
          (key) => !["color", "backgroundColor", "mode", "scale"].includes(key),
        ) ||
        !validHighlight({ ...DEFAULT_HIGHLIGHTS, ...cue.highlight }))
    )
      return null;
    if (
      cue.format !== undefined &&
      (!cue.format ||
        typeof cue.format !== "object" ||
        Array.isArray(cue.format) ||
        Object.keys(cue.format).some(
          (key) => !(WORD_FORMAT_KEYS as readonly string[]).includes(key),
        ) ||
        !validateCaptionSettings({ ...settings, ...cue.format }))
    )
      return null;
  }
  return {
    version: 1,
    cues: draft.cues,
    settings,
    styleId: isCaptionStyleId(draft.styleId) ? draft.styleId : "simple-text",
    aspectRatio: draft.aspectRatio!,
    duration: draft.duration!,
    media: draft.media === "uploaded" ? "uploaded" : "demo",
    mediaId: typeof draft.mediaId === "string" ? draft.mediaId : undefined,
    video: draft.video ? readVideoFrame(draft.video) : undefined,
    script: SCRIPTS.includes(draft.script as CaptionScript) ? draft.script : undefined,
    language: typeof draft.language === "string" ? draft.language : undefined,
    translatedTo: typeof draft.translatedTo === "string" && draft.translatedTo.length < 8 ? draft.translatedTo : undefined,
  };
}

const SCRIPTS: CaptionScript[] = ["spoken", "native", "roman", "mix", "english"];

export async function loadDraft() {
  const saved = await read<unknown>("drafts");
  const draft = validateDraft(saved);
  if (saved !== undefined && !draft) {
    if (saved && typeof saved === "object" && (saved as Record<string, unknown>).media === "demo") {
      return { draft: null, file: undefined };
    }
    throw new Error(
      "The saved draft could not be restored. It has been kept in browser storage; this session will not overwrite it.",
    );
  }
  const media =
    draft?.media === "uploaded"
      ? await read<{ id: string; file: File }>("media")
      : undefined;
  return {
    draft,
    file:
      media?.id === draft?.mediaId && media?.file instanceof Blob
        ? media.file
        : undefined,
  };
}

export const saveDraft = (draft: EditorDraft) => write("drafts", draft);

// Each cloud project also keeps an instant copy in this browser, so a power cut or a closed
// tab never loses more than the last fraction of a second of editing.
type LocalProject = { draft: unknown; savedAt: number };
export async function loadLocalProject(id: string) {
  const saved = await read<LocalProject>("drafts", `project:${id}`).catch(() => undefined);
  const draft = saved && validateDraft(saved.draft);
  return draft ? { draft, savedAt: saved.savedAt } : null;
}
export const saveLocalProject = (id: string, draft: EditorDraft, savedAt: number) =>
  write("drafts", { draft, savedAt } satisfies LocalProject, `project:${id}`);
// Video blobs are saved only on upload, never rewritten while dragging a slider.
export const saveUploadedVideo = (file: File, id: string) =>
  write("media", { id, file });

export function inspectVideo(
  file: File,
): Promise<{ url: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let finished = false;
    const timeout = window.setTimeout(
      () => finish(new Error("Video metadata took too long to load.")),
      15000,
    );
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      const duration = video.duration;
      video.removeAttribute("src");
      video.load();
      if (
        error ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 86400
      ) {
        URL.revokeObjectURL(url);
        reject(
          error ?? new Error("This file does not contain a supported video."),
        );
      } else resolve({ url, duration });
    }
    video.onloadedmetadata = () => finish();
    video.onerror = () =>
      finish(new Error("This video format could not be opened."));
    video.preload = "metadata";
    video.src = url;
  });
}
