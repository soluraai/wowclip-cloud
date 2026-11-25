import type { Scene } from "./scenes/types";

// The AI edit plan the backend writes (backend/optional_extras/ai_edit). Every time is in SOURCE seconds — anchored to the words of the
// clip — and the engine maps it onto the cut reel itself, so switching the pause cuts off never breaks an insert.

export type EditTransition = "cut" | "zoom" | "slide" | "flash" | "fade";

export type EditMedia = {
  kind: "image" | "video";
  src: string;
  width: number;
  height: number;
  duration?: number;
  /** Where the subject sits in the picture (0-1), so a crop keeps it in frame. */
  focusX?: number;
  focusY?: number;
  /** A still of a video, for lists. */
  poster?: string;
  /** Where it was found (Pinterest, Bing...). */
  from?: string;
};

export type EditInsertType = "broll" | "split" | "graphic" | "card" | "template";

/** A full-screen template copied from the Remotion library, filled from the director's short JSON. */
export type EditTemplate = {
  name: "news" | "person" | "timeline" | "versus" | "checklist" | "showcase" | "headline";
  topic?: string;
  headline?: string;
  description?: string;
  source?: string;
  date?: string;
  title?: string;
  subtitle?: string;
  milestones?: { date: string; title: string; description: string }[];
  active?: number;
  left?: string;
  right?: string;
  rows?: { label: string; left: string; right: string; winner: "left" | "right" | "none" }[];
  items?: string[];
  marker?: "number" | "check";
  text?: string;
  emphasis?: string;
};

export type EditInsert = {
  id: string;
  type: EditInsertType;
  start: number;
  end: number;
  media?: EditMedia;
  scene?: Scene;
  template?: EditTemplate;
  motion?: "in" | "out" | "left" | "right";
  enter?: EditTransition;
  exit?: EditTransition;
  label?: string;
  /** What the director asked the picture search for. */
  query?: string;
  off?: boolean;
};

export type EditZoom = {
  id: string;
  at: number;
  end: number;
  style: "punch" | "push";
  off?: boolean;
};

export type EditPlan = {
  version: 1;
  sourceDuration: number;
  /** Kept ranges of the clip after dead air, breaths and stumbles are cut. */
  keep: [number, number][];
  /** false: play the clip uncut (the user switched the cuts off). */
  trims: boolean;
  accent: string;
  zooms: EditZoom[];
  inserts: EditInsert[];
  /** Where the speaker's face sits in the 9:16 clip (0-1). */
  face?: { x: number; y: number };
};
