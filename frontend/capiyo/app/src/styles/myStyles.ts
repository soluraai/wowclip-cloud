"use client";

import { useEffect, useSyncExternalStore } from "react";
import { authHeaders } from "../auth/client";
import type { CaptionSettings } from "../app/captionSettings";

/** A look saved in My styles: a template and the settings the user gave it. Applying one copies it into a project. */
export type MyStyle = { id: string; name: string; styleId: string; settings: CaptionSettings; createdAt: number; updatedAt: number };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(await authHeaders()), "Content-Type": "application/json", ...init.headers } });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status}).`);
  return data as T;
}

// One list for the whole app (Home's My styles page and the editor's library), loaded once and kept in step.
let list: MyStyle[] | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const set = (next: MyStyle[]) => {
  list = next;
  emit();
};

export function loadMyStyles(force = false) {
  if (loading && !force) return loading;
  loading = call<{ styles: MyStyle[] }>("/api/styles").then((data) => set(data.styles), () => set(list ?? []));
  return loading;
}

/** The saved styles (undefined while the first load runs). */
export function useMyStyles() {
  const value = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, () => list, () => undefined);
  useEffect(() => {
    if (list === undefined) void loadMyStyles();
  }, []);
  return value;
}

export async function saveMyStyle(style: { id?: string; name: string; styleId: string; settings: CaptionSettings }) {
  const body = JSON.stringify({ name: style.name, styleId: style.styleId, settings: style.settings });
  const { style: saved } = style.id
    ? await call<{ style: MyStyle }>(`/api/styles/${style.id}`, { method: "PATCH", body })
    : await call<{ style: MyStyle }>("/api/styles", { method: "POST", body });
  set([saved, ...(list ?? []).filter((item) => item.id !== saved.id)]);
  return saved;
}

export async function renameMyStyle(id: string, name: string) {
  const { style } = await call<{ style: MyStyle }>(`/api/styles/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  set((list ?? []).map((item) => (item.id === id ? style : item)));
}

export async function deleteMyStyle(id: string) {
  const before = list ?? [];
  set(before.filter((item) => item.id !== id));
  await call<void>(`/api/styles/${id}`, { method: "DELETE" }).catch((error) => {
    set(before);
    throw error;
  });
}
