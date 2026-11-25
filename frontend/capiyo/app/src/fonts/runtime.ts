import { captionFontFamily, loadCaptionFont } from "@caption-font-loader";
import type { CaptionSettings } from "../app/captionSettings";
import {
  closestFace,
  fontFaces,
  resolveFontAsset,
  type FontFamily,
  type FontFaceOption,
} from "./catalog";
import { database } from "../editor/draft";
import type { Cue } from "../app/CaptionTimeline";
import { wordSettings } from "../editor/words";

type UploadedFont = {
  id: string;
  family: string;
  weight: number;
  italic: boolean;
  weights?: number[];
  file: File;
};
const uploaded = new Map<string, UploadedFont>();
const urls = new Map<string, string>();
let initialized: Promise<void> | undefined;
const urlFor = (font: UploadedFont) => {
  let url = urls.get(font.id);
  if (!url) {
    url = URL.createObjectURL(font.file);
    urls.set(font.id, url);
  }
  return url;
};
export function loadUploadedFonts() {
  if (!initialized)
    initialized = (async () => {
      const db = await database();
      const entries = await new Promise<UploadedFont[]>((resolve, reject) => {
        const request = db.transaction("fonts").objectStore("fonts").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const entry of entries) uploaded.set(entry.id, entry);
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  return initialized;
}
export function uploadedFamilies(): FontFamily[] {
  const families = new Map<string, FontFamily>();
  for (const entry of [...uploaded.values()].sort(
    (a, b) =>
      Number(!!b.weights) - Number(!!a.weights) || a.id.localeCompare(b.id),
  )) {
    const id = `upload:${entry.family.toLowerCase()}`;
    const font: FontFamily = families.get(id) ?? {
      id,
      family: entry.family,
      category: "sans-serif",
      source: "upload",
      subsets: [],
      files: {},
      faces: [],
    };
    const variant = entry.weights
      ? entry.italic
        ? "italic"
        : "regular"
      : `${entry.weight}${entry.italic ? "italic" : ""}`;
    font.files[variant] = urlFor(entry);
    font.previewSrc ??= urlFor(entry);
    const faces = fontFaces({
      ...font,
      faces: undefined,
      weights: entry.weights,
      files: { [variant]: urlFor(entry) },
    });
    for (const face of faces)
      font.faces = [
        ...font.faces!.filter((item) => item.value !== face.value),
        face,
      ];
    families.set(id, font);
  }
  return [...families.values()];
}
export const fontUploadId = (src: string) =>
  [...urls].find(([, url]) => url === src)?.[0];
export async function prepareFace(
  font: FontFamily,
  face: FontFaceOption,
): Promise<Partial<CaptionSettings>> {
  await loadCaptionFont(face.src, font.family, face.weight, face.italic);
  releasePicker(captionFontFamily(face.src, font.family, face.weight, face.italic));
  return {
    font: font.family,
    fontAsset: face.src,
    fontUploadId: fontUploadId(face.src),
    weight: face.weight,
    italic: face.italic,
  };
}
export async function restoreFont(
  settings: CaptionSettings,
): Promise<CaptionSettings> {
  let src =
    settings.fontAsset ||
    resolveFontAsset(settings.font, settings.weight, settings.italic);
  if (settings.fontUploadId) {
    await loadUploadedFonts();
    const entry = uploaded.get(settings.fontUploadId);
    if (!entry)
      throw new Error(
        "Your saved custom font is missing from browser storage. Upload the font again to restore this draft.",
      );
    src = urlFor(entry);
  }
  // A slow or stalled font request must not hold the whole project on "Restoring…":
  // after a few seconds the draft opens and the font keeps loading in the background.
  await Promise.race([
    loadCaptionFont(
      src,
      settings.font,
      settings.weight ?? 800,
      settings.italic,
    ).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  return { ...settings, fontAsset: src };
}
/** A saved part font comes back the same way as the caption's own. */
export async function restorePartFonts(settings: CaptionSettings): Promise<CaptionSettings> {
  if (!settings.parts) return settings;
  const parts = await Promise.all(
    Object.entries(settings.parts).map(async ([id, part]) => {
      if (!part?.font) return [id, part];
      const restored = await restoreFont({ ...settings, ...part, font: part.font });
      return [id, { ...part, fontAsset: restored.fontAsset }];
    }),
  );
  return { ...settings, parts: Object.fromEntries(parts) };
}
export async function restoreWordFonts(
  cues: Cue[],
  settings: CaptionSettings,
): Promise<Cue[]> {
  return Promise.all(
    cues.map(async (cue) => {
      if (
        !cue.format ||
        !["font", "fontUploadId", "fontAsset"].some((key) => key in cue.format!)
      )
        return cue;
      const restored = await restoreFont(wordSettings(settings, cue));
      return {
        ...cue,
        format: {
          ...cue.format,
          fontAsset: restored.fontAsset,
          fontUploadId: restored.fontUploadId ?? "",
        },
      };
    }),
  );
}
/**
 * Fonts loaded only to draw the picker's rows. The captions' script layer (ScriptFonts) skips them: pairing
 * one remounted the preview, so scrolling the list flashed the video black. A font picked for the captions
 * is released, and the layer pairs it then.
 */
type PickerGlobal = { __capiyoPickerFonts?: Set<string>; __capiyoPickerVersion?: number };
const pickerFonts = () => ((globalThis as PickerGlobal).__capiyoPickerFonts ??= new Set<string>());
const markPicker = (family: string) => { if (family) pickerFonts().add(family); };
const releasePicker = (family: string) => {
  if (!pickerFonts().delete(family)) return;
  const global = globalThis as PickerGlobal;
  global.__capiyoPickerVersion = (global.__capiyoPickerVersion ?? 0) + 1;
};
// Load only the small menu subset for visible rows, not an entire font family.
const readyPreviews = new Set<string>();
export const fontPreviewReady = (font: FontFamily) =>
  readyPreviews.has(font.previewSrc ?? font.id);
export const previewFamily = (font: FontFamily) =>
  captionFontFamily(font.previewSrc ?? "", font.family, 400, false);
export const loadFontPreview = async (font: FontFamily) => {
  if (!font.previewSrc || fontPreviewReady(font)) return;
  markPicker(previewFamily(font));
  await loadCaptionFont(font.previewSrc, font.family, 400);
  readyPreviews.add(font.previewSrc);
};
/** The font's regular face, for a sample in the captions' own script (the menu subset only has the name's letters). */
const readySamples = new Set<string>();
export const sampleFamily = (font: FontFamily) => {
  const face = closestFace(font, 400, false);
  return face ? captionFontFamily(face.src, font.family, face.weight, face.italic) : "";
};
export const fontSampleReady = (font: FontFamily) => readySamples.has(font.id);
export const loadFontSample = async (font: FontFamily) => {
  if (fontSampleReady(font)) return;
  await preloadFace(font, 400, false);
  readySamples.add(font.id);
};
export const preloadFace = (
  font: FontFamily,
  weight?: number,
  italic?: boolean,
) => {
  const face = closestFace(font, weight, italic);
  // Only a face nothing has loaded yet: one the captions already use stays theirs.
  const name = face && captionFontFamily(face.src, font.family, face.weight, face.italic);
  if (name && ![...document.fonts].some((loaded) => loaded.family.replace(/^["']|["']$/g, "") === name)) markPicker(name);
  return face
    ? loadCaptionFont(face.src, font.family, face.weight, face.italic)
    : Promise.resolve();
};
export async function importFont(
  file: File,
): Promise<{ font: FontFamily; face: FontFaceOption }> {
  if (
    !/\.(ttf|otf|woff2?)$/i.test(file.name) ||
    file.size > 10 * 1024 * 1024 ||
    file.size === 0
  )
    throw new Error("Choose a TTF, OTF, WOFF or WOFF2 font under 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { create } = await import("fontkit");
  let parsed: ReturnType<typeof create>;
  try {
    parsed = create(bytes as Buffer);
  } catch {
    throw new Error("This file could not be read as a font.");
  }
  if (!("familyName" in parsed))
    throw new Error(
      "Choose a single font file, rather than a font collection.",
    );
  const family = parsed.familyName?.trim();
  if (!family || family.length > 150)
    throw new Error("The font has no valid family name.");
  const axis = parsed.variationAxes.wght;
  const os2 = (parsed as unknown as Record<string, { usWeightClass?: number }>)[
    "OS/2"
  ];
  const weight = Math.max(
    100,
    Math.min(
      900,
      os2?.usWeightClass ??
        (axis?.default || (/bold/i.test(parsed.subfamilyName) ? 700 : 400)),
    ),
  );
  const italic =
    parsed.italicAngle !== 0 || /italic|oblique/i.test(parsed.subfamilyName);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const id = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const entry: UploadedFont = {
    id,
    family,
    weight,
    italic,
    file,
    ...(axis
      ? { weights: [Math.max(100, axis.min), Math.min(900, axis.max)] }
      : {}),
  };
  await loadUploadedFonts();
  const url = urlFor(entry);
  try {
    await loadCaptionFont(url, family, weight, italic);
  } catch {
    URL.revokeObjectURL(url);
    urls.delete(id);
    throw new Error("Your browser could not load this font.");
  }
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("fonts", "readwrite");
    tx.objectStore("fonts").put(entry, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error("The font could not be saved. Check browser storage."));
    tx.onabort = () => reject(new Error("Font storage was interrupted."));
  });
  uploaded.set(id, entry);
  const font = uploadedFamilies().find(
    (font) => font.id === `upload:${family.toLowerCase()}`,
  )!;
  const face = closestFace(
    {
      ...font,
      faces: undefined,
      weights: entry.weights,
      files: {
        [entry.weights
          ? italic
            ? "italic"
            : "regular"
          : `${weight}${italic ? "italic" : ""}`]: url,
      },
    },
    weight,
    italic,
  )!;
  return { font, face };
}
