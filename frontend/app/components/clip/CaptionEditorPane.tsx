"use client";

import dynamic from "next/dynamic";

import "./capiyo-theme.css";

// Capiyo's caption editor (frontend/capiyo), drawn inside the clip window with wowclip's colors.
// It only runs in the browser: it plays the video and draws the captions with Remotion.
const Editor = dynamic(() => import("../../../capiyo/app/src/app/Editor"), {
  ssr: false,
  loading: () => (
    <div className="capiyo-wait">
      <span className="spinner" />
      <p>Loading the caption editor…</p>
    </div>
  ),
});

type Props = { projectId: string; onRender: (request: object, styleName: string) => void };

export function CaptionEditorPane({ projectId, onRender }: Props) {
  return (
    <div className="capiyo-scope">
      <Editor projectId={projectId} onRender={onRender} />
    </div>
  );
}
