"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { WorkspaceSkeleton } from "../Skeleton";

// The editor needs the signed-in user, so it only draws in the browser: the page itself is a ready-made file.
const Editor = dynamic(() => import("../Editor"), { ssr: false, loading: () => <WorkspaceSkeleton /> });

/** /editor?id=… — a fresh editor for each project (the key), so nothing carries over between projects. */
export default function EditorOnly() {
  const id = useSearchParams().get("id") ?? "";
  return <Editor key={id} />;
}
