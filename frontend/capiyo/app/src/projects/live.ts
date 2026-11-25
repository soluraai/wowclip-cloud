"use client";

// wowclip version of this file. Capiyo's original listened to Firestore, so a screen changed the moment the server
// wrote a project's or an export's new status. wowclip has no Firestore: this asks the wowclip backend every
// 2 seconds instead, and calls onChange with the same { status } data whenever it changes.

const EVERY_MS = 2000;

type Data = Record<string, unknown> | null;
type Watched = { url: string; read: (answer: { project?: { status: string }; render?: { status: string } | null }) => Data };

function renderStatus(status: string) {
  if (status === "ready" || status === "failed") return status;
  return "rendering";
}

function watchedOf(path: string): Watched | null {
  const render = path.match(/^projects\/([^/]+)\/renders\/[^/]+$/);
  if (render) {
    return {
      url: `/api/projects/${render[1]}/render`,
      read: (answer) => (answer.render ? { status: renderStatus(answer.render.status) } : null),
    };
  }
  const project = path.match(/^projects\/([^/]+)$/);
  if (project) {
    return { url: `/api/projects/${project[1]}?light=1`, read: (answer) => (answer.project ? { status: answer.project.status } : null) };
  }
  return null;
}

export function watchMine(path: string, onChange: (data: Data) => void, onError: () => void) {
  const watched = watchedOf(path);
  if (!watched) {
    onError();
    return () => undefined;
  }
  let stopped = false;
  let last = "";
  const timer = window.setInterval(async () => {
    try {
      const response = await fetch(watched.url, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const data = watched.read(await response.json());
      const key = JSON.stringify(data);
      if (key !== last && !stopped) {
        last = key;
        onChange(data);
      }
    } catch {
      return;
    }
  }, EVERY_MS);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
