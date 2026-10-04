import { useState } from "react";
import type { Project } from "@/project/schema";
import { ProjectProvider } from "@/state/project-store";
import { clearLocal, loadLocal, saveLocal } from "@/state/storage";
import { Welcome } from "@/ui/welcome/Welcome";
import { Workspace } from "@/ui/workspace/Workspace";

export function App() {
  const [project, setProject] = useState<Project | null>(() => loadLocal());
  // A new key remounts the store, so undo history never crosses projects.
  const [generation, setGeneration] = useState(0);

  if (!project) {
    return (
      <Welcome
        onDone={(p) => {
          saveLocal(p);
          setProject(p);
          setGeneration((g) => g + 1);
        }}
      />
    );
  }

  return (
    <ProjectProvider key={generation} initial={project}>
      <Workspace
        onNew={() => {
          clearLocal();
          setProject(null);
        }}
      />
    </ProjectProvider>
  );
}
