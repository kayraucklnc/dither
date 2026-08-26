// Probe: confirms React and React Flow build in this pipeline before the real
// editor is written against them.
import { createRoot } from "react-dom/client";
import { ReactFlow } from "@xyflow/react";

const host = document.getElementById("rule-flow");

if (host) {
  createRoot(host).render(<ReactFlow nodes={[]} edges={[]} />);
}
