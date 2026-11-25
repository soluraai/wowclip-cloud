"use client";

import { authHeaders } from "../auth/client";
import type { Project, Transcript } from "./types";
import type { Cue } from "../app/CaptionTimeline";
import type { HearingOptions } from "../language/languages";

export type StoredDraft = { draft: unknown; savedAt: number };
export type ProjectPayload = { project: Project; transcript?: Transcript; draft?: StoredDraft };

/** Every request gives up after `timeoutMs`, so no screen can wait forever on a server that went quiet. */
async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal: AbortSignal.timeout(timeoutMs), ...init, headers: { ...(await authHeaders()), ...init.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("The server took too long to answer. Please try again.");
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Couldn't reach Capiyo. Check your internet connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status}).`);
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

export const listProjects = () => call<{ projects: Project[] }>("/api/projects").then((data) => data.projects);

/** Reserves a project and returns signed links: the video (and thumbnail) go straight to storage, not through our server. */
export const createProject = (info: { title: string; type: string; size: number; duration: number; width: number; height: number; thumbSize?: number }) =>
  call<{ project: Project; upload: { video: string; thumb?: string } }>("/api/projects", { method: "POST", ...json(info) });

/** Tells the server the upload finished; the project moves on to the caption setup. */
export const confirmUpload = (id: string) =>
  call<{ project: Project }>(`/api/projects/${id}/uploaded`, { method: "POST" }).then((data) => data.project);

export const getProject = (id: string) => call<ProjectPayload>(`/api/projects/${id}`);

export const transcribeProject = (id: string, hearing: HearingOptions = {}) =>
  // Usually answers at once (202, no transcript): the editor then watches the project until it's ready. On a computer
  // without a public address the server finishes in the same request, which can take a couple of minutes.
  call<{ project: Project; transcript?: Transcript }>(`/api/projects/${id}/transcribe`, { method: "POST", ...json({ hearing }) }, 6 * 60_000);

/** Words for another caption look (see api/projects/[id]/language). */
/**
 * original: the words as heard. forms: `words` (the editor's current ones) written each way.
 * translate: the captions in language `to`.
 */
export const languageWords = (id: string, want: "original" | "forms" | "translate", extra: { to?: string; words?: Pick<Cue, "id" | "hero" | "start" | "end">[] } = {}) =>
  call<{ cues: Cue[]; language?: string; spent?: number }>(`/api/projects/${id}/language`, { method: "POST", ...json({ want, ...extra }) }, 6 * 60_000);

export const deleteProject = (id: string) => call<void>(`/api/projects/${id}`, { method: "DELETE" });

/** The thumbnail, to its signed storage link. */
export async function uploadThumbnail(url: string, thumb: Blob) {
  const response = await fetch(url, { method: "PUT", body: thumb, headers: { "Content-Type": "image/jpeg" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("The thumbnail didn't upload.");
}

/** Saves the draft. `keepalive` lets a small save finish even while the tab is closing. */
export async function saveProjectDraft(id: string, draft: unknown, savedAt: number, keepalive = false) {
  const body = JSON.stringify({ draft, savedAt });
  return call<{ savedAt: number }>(`/api/projects/${id}`, {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
    // Browsers cap keepalive bodies at 64 KB.
    keepalive: keepalive && body.length < 60_000,
  });
}

/**
 * Uploads the video straight to storage (S3) through its signed link, with progress (fetch can't report upload progress yet).
 * The link was signed for this exact type and size.
 */
export async function uploadVideo(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    // A connection that stops sending for a minute won't come back by itself: stop and say so.
    let heard = Date.now();
    const watchdog = window.setInterval(() => {
      if (Date.now() - heard > 60_000) xhr.abort();
    }, 5000);
    xhr.onloadend = () => window.clearInterval(watchdog);
    xhr.onabort = () => reject(new Error("The upload stalled. Check your internet and try again."));
    xhr.upload.onprogress = (event) => {
      heard = Date.now();
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // S3 answers in XML; an expired link (403) means the upload took over 6 hours.
      reject(new Error(xhr.status === 403 ? "The upload link expired. Please upload the video again." : "The upload didn't finish. Please try again."));
    };
    xhr.onerror = () => reject(new Error("The upload didn't finish. Check your internet and try again."));
    xhr.send(file);
  });
}

export type RenderView = {
  id: string;
  status: "queued" | "rendering" | "finishing" | "ready" | "failed" | "expired";
  frames: number;
  total: number;
  url?: string;
  expiresAt?: number;
  mb?: number;
  error?: string;
  /** When it started and about how long it takes (seconds): progress is drawn from these. */
  startedAt?: number;
  eta?: number;
};

export type RenderQuote = { id: string; cost: number; reuse: boolean; first: boolean; width: number; height: number; fps: number; seconds: number;
  /** Credits a minute a changed export costs with this style (its measured render cost plus margin). */
  rate: number };
export type RenderItem = { id: string; status: RenderView["status"]; createdAt: number; expiresAt?: number; mb?: number; url?: string; paid?: number };
export type ExportItem = RenderItem & { project: { id: string; title: string; duration: number; thumbUrl?: string } };

/** Export: starts the render on AWS, or returns the same one when nothing changed (server/renders.ts). */
export const startRender = (id: string, request: unknown) =>
  call<{ render: RenderView }>(`/api/projects/${id}/render`, { method: "POST", ...json(request) }).then((data) => data.render);

/** What exporting now would cost (free first export, reuse, or credits), without starting it. */
export const quoteRender = (id: string, request: object) =>
  call<{ quote: RenderQuote }>(`/api/projects/${id}/render`, { method: "POST", ...json({ ...request, quote: true }) }).then((data) => data.quote);

export const renderStatus = (id: string) =>
  call<{ render: RenderView | null }>(`/api/projects/${id}/render`, { cache: "no-store" }).then((data) => data.render);

/** The latest export and the project's past exports. */
export const renderHistory = (id: string) =>
  call<{ render: RenderView | null; history: RenderItem[] }>(`/api/projects/${id}/render?history=1`, { cache: "no-store" });

/** Every export of every project, newest first. */
export const listExports = () => call<{ renders: ExportItem[] }>("/api/renders", { cache: "no-store" }).then((data) => data.renders);

/** Credits left, credit lots with their expiry, and the usage history (see api/usage). */
export const getUsage = () => call<import("../app/api/usage/route").Usage>("/api/usage");

export type BillingOrder = { orderId: string; amount: number; currency: "INR"; keyId: string; packs: number; credits: number; prefill: { email?: string; name?: string } };
export const getBilling = () => call<{ payments: import("../server/billing").PaymentView[]; mode: "test" | "live" }>("/api/billing");
export const createBillingOrder = (packs: number) => call<BillingOrder>("/api/billing/order", { method: "POST", ...json({ packs }) });
export const verifyBillingPayment = (body: { orderId: string; paymentId: string; signature: string }) =>
  call<{ status: string; credits: number }>("/api/billing/verify", { method: "POST", ...json(body) });
