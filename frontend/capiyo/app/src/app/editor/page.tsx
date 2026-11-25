import { Suspense } from "react";
import EditorOnly from "./EditorOnly";
import { WorkspaceSkeleton } from "../Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <EditorOnly />
    </Suspense>
  );
}
