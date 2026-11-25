import type { Cue } from "../app/CaptionTimeline";
import type { PreviewAspectRatio } from "../remotion/adapter";
import type { HearingOptions } from "../language/languages";

/** uploading → uploaded → transcribing → ready. A failed transcription can be retried. */
export type ProjectStatus = "uploading" | "uploaded" | "transcribing" | "ready" | "failed";

export type Project = {
  id: string;
  title: string;
  status: ProjectStatus;
  duration: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  /** The latest export, when there is one. */
  render?: { status: "rendering" | "ready" | "failed" | "expired"; at: number; expiresAt?: number };
  /** Exports started so far; the first one is included with the captions. */
  exports?: number;
  /** Short-lived signed links, added by the server for each response. */
  videoUrl?: string;
  thumbUrl?: string;
};

/** The words ElevenLabs heard, before the user has edited anything. */
export type Transcript = {
  cues: Cue[];
  duration: number;
  aspectRatio: PreviewAspectRatio;
  /** ISO 639-1 code ElevenLabs heard (or the user picked). */
  language?: string;
  /** How sure ElevenLabs was of the language, 0-1. */
  languageProbability?: number;
  /** Scripts other than Latin found in the words ("deva"), so a mixed video is known. */
  scripts?: string[];
  /** The words written each way are on the cues (`forms`). False when that pass failed or wasn't needed. */
  forms?: boolean;
  /** English captions, made when first asked for. */
  english?: Cue[];
  /** Translations made when asked for, by language code ("en", "ta", "es"), kept so a second pick is free. */
  translations?: Record<string, Cue[]>;
  /** What was asked of ElevenLabs. */
  hearing?: HearingOptions;
};

export const UPLOAD_LIMITS = {
  /** 4 minutes. Render pieces, AI chunks and timeouts are sized for this (server/renders.ts, server/language.ts). */
  seconds: 240,
  bytes: 1024 ** 3,
  types: ["video/mp4", "video/quicktime"],
  thumbBytes: 512 * 1024,
  /** A saved draft stays well under Firestore's 1 MB document limit. */
  draftBytes: 900 * 1024,
};
export const MAX_MINUTES = UPLOAD_LIMITS.seconds / 60;
export const TOO_LONG = `This video is longer than ${MAX_MINUTES} minutes. Please trim it and upload again.`;

export const aspectFor = (width: number, height: number): PreviewAspectRatio =>
  width / height < 0.7 ? "9:16" : width / height < 0.9 ? "4:5" : width / height > 1.25 ? "16:9" : "1:1";
