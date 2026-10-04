// Shown when the browser refused the last autosave (full or blocked storage).

import { useProject } from "@/state/project-store";

export function SaveWarning() {
  const { saveFailed } = useProject();
  if (!saveFailed) return null;
  return (
    <span className="shrink-0 text-[12px] text-danger" title="This browser's storage is full or blocked. Save to a file to keep your work.">
      Not saved in this browser
    </span>
  );
}
