"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node as RFNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, GitBranch, Loader2, Trash2, TriangleAlert } from "lucide-react";

import { ConditionEditor, type WidgetFactGroup } from "@/components/flow/condition-editor";
import { QuestionNode, ScreenNode, type QuestionData, type ScreenData } from "@/components/flow/nodes";
import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { summarise, type Condition } from "@/lib/flow/conditions";
import { layout } from "@/lib/flow/layout";
import type { Node } from "@/lib/flow/tree";

export interface ScreenOption {
  id: number;
  name: string;
}

interface Trace {
  leafId: number | null;
  reason: string;
  held: boolean;
  steps: { nodeId: number; question: string; answer: boolean; actual?: string; toNodeId: number | null }[];
  values: { widgetId: number; widgetLabel: string; key: string; label: string; unit: string; value: string }[];
}

const control =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

function TreeCanvas({
  deviceId,
  deviceRefreshSeconds,
  modelId,
  panel,
  screens,
  factGroups,
  initialNodes,
  initialRootId,
}: {
  deviceId: number;
  deviceRefreshSeconds: number;
  modelId: number;
  panel: { width: number; height: number };
  screens: ScreenOption[];
  factGroups: WidgetFactGroup[];
  initialNodes: Node[];
  initialRootId: number | null;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [rootId, setRootId] = useState(initialRootId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trace, setTrace] = useState<Trace>();
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string>();
  const [nextId, setNextId] = useState(-1);

  const nodeTypes = useMemo(() => ({ question: QuestionNode, screen: ScreenNode }), []);
  const selected = nodes.find((node) => node.id === selectedId);

  /* ------------------------------------------------------------------ trace */

  const refreshTrace = useCallback(async () => {
    const response = await fetch(`/api/devices/${deviceId}/trace`);
    if (response.ok) setTrace(await response.json());
  }, [deviceId]);

  useEffect(() => {
    refreshTrace();
    const timer = setInterval(refreshTrace, 15_000);
    return () => clearInterval(timer);
  }, [refreshTrace]);

  /* ------------------------------------------------------------------- save */

  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }

    setSave("saving");

    const timer = setTimeout(async () => {
      const positions = layout(nodes, rootId);

      const response = await fetch(`/api/devices/${deviceId}/tree`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootNodeId: rootId,
          nodes: nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: 0, y: 0 }) })),
        }),
      });

      if (!response.ok) {
        setError((await response.json())?.error ?? "Could not save.");
        return setSave("failed");
      }

      const body = await response.json();
      setError(undefined);
      setSave("saved");

      // Adopt server ids once, or the next save inserts duplicates.
      if (nodes.some((node) => node.id < 0)) {
        settled.current = false;
        setNodes(
          body.nodes.map(
            (node: Record<string, unknown>): Node => ({
              id: node.id as number,
              kind: node.kind === "question" ? "question" : "screen",
              label: node.label as string,
              condition: (node.condition as Condition) ?? null,
              yesNodeId: node.yesNodeId as number | null,
              noNodeId: node.noNodeId as number | null,
              screenId: node.screenId as number | null,
              refreshSeconds: node.refreshSeconds as number | null,
              holdSeconds: node.holdSeconds as number,
            }),
          ),
        );
        setRootId(body.rootNodeId);
      }

      refreshTrace();
    }, 700);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, rootId, deviceId]);

  /* -------------------------------------------------------------- mutations */

  const update = (id: number, patch: Partial<Node>) =>
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch } : node)));

  /**
   * Adding a check wraps whatever is currently there.
   *
   * "When it rains, show the weather" is one gesture at the top of the tree,
   * and everything already set up slides into the "no" branch untouched. This
   * is the move that a state machine needed an edge out of every state for.
   */
  const addCheck = (above: number | null) => {
    const leafId = nextId;
    const questionId = nextId - 1;
    setNextId((value) => value - 2);

    const leaf: Node = {
      id: leafId,
      kind: "screen",
      label: "New screen",
      condition: null,
      yesNodeId: null,
      noNodeId: null,
      screenId: screens[0]?.id ?? null,
      refreshSeconds: null,
      holdSeconds: 0,
    };

    const question: Node = {
      id: questionId,
      kind: "question",
      label: "Check",
      condition: factGroups.length
        ? {
            kind: "fact",
            widgetId: factGroups[0].widgetId,
            factKey: factGroups[0].facts[0]?.key ?? "",
            operator: "present",
            value: "",
          }
        : { kind: "always" },
      yesNodeId: leafId,
      noNodeId: above,
      screenId: null,
      refreshSeconds: null,
      holdSeconds: 0,
    };

    setNodes((current) => [...current, leaf, question]);

    // Re-point whoever used to lead here, or make it the new root.
    if (above === rootId) setRootId(questionId);
    else
      setNodes((current) =>
        current.map((node) =>
          node.yesNodeId === above
            ? { ...node, yesNodeId: questionId }
            : node.noNodeId === above
              ? { ...node, noNodeId: questionId }
              : node,
        ),
      );

    setSelectedId(questionId);
  };

  /** Removing a question splices it out, keeping its "no" branch. */
  const removeQuestion = (id: number) => {
    const question = nodes.find((node) => node.id === id);
    if (!question || question.kind !== "question") return;

    const survivor = question.noNodeId;

    // The "yes" branch goes with it, so collect everything only it reached.
    const doomed = new Set<number>();
    const collect = (from: number | null) => {
      if (from === null || doomed.has(from) || from === survivor) return;
      doomed.add(from);
      const node = nodes.find((candidate) => candidate.id === from);
      collect(node?.yesNodeId ?? null);
      collect(node?.noNodeId ?? null);
    };
    collect(question.yesNodeId);
    doomed.add(id);

    setNodes((current) =>
      current
        .filter((node) => !doomed.has(node.id))
        .map((node) => ({
          ...node,
          yesNodeId: node.yesNodeId === id ? survivor : node.yesNodeId,
          noNodeId: node.noNodeId === id ? survivor : node.noNodeId,
        })),
    );

    if (rootId === id) setRootId(survivor);
    setSelectedId(null);
  };

  /* ------------------------------------------------------------------ graph */

  const answered = useMemo(
    () => new Map(trace?.steps.map((step) => [step.nodeId, step]) ?? []),
    [trace],
  );

  const widgetMap = useMemo(
    () =>
      new Map(
        factGroups.map((group) => [
          group.widgetId,
          { payload: {}, facts: group.facts, label: group.label, fetchedAt: null },
        ]),
      ),
    [factGroups],
  );

  const flowNodes: RFNode[] = useMemo(() => {
    const positions = layout(nodes, rootId);

    return nodes.map<RFNode>((node) => {
      const at = positions.get(node.id) ?? { x: 0, y: 0 };
      const step = answered.get(node.id);

      return node.kind === "question"
        ? {
            id: String(node.id),
            type: "question",
            position: at,
            selected: selectedId === node.id,
            data: {
              question: node.condition ? summarise(node.condition, { widgets: widgetMap }) : "No question set",
              actual: step?.actual,
              answer: step?.answer,
              isRoot: rootId === node.id,
            } satisfies QuestionData,
          }
        : {
            id: String(node.id),
            type: "screen",
            position: at,
            selected: selectedId === node.id,
            data: {
              label: node.label,
              screenId: node.screenId,
              screenName: screens.find((screen) => screen.id === node.screenId)?.name ?? null,
              refreshSeconds: node.refreshSeconds,
              deviceRefreshSeconds,
              holdSeconds: node.holdSeconds,
              isShowing: trace?.leafId === node.id,
              isRoot: rootId === node.id,
              panel,
              modelId,
            } satisfies ScreenData,
          };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, rootId, selectedId, answered, trace, screens, panel, modelId, deviceRefreshSeconds, widgetMap]);

  const flowEdges: Edge[] = useMemo(() => {
    const result: Edge[] = [];

    for (const node of nodes) {
      if (node.kind !== "question") continue;
      const step = answered.get(node.id);

      const edge = (branch: "yes" | "no", target: number | null) => {
        if (target === null) return;
        const taken = step?.answer === (branch === "yes");

        result.push({
          id: `${node.id}-${branch}`,
          source: String(node.id),
          sourceHandle: branch,
          target: String(target),
          label: branch,
          animated: taken,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: {
            stroke: taken ? "oklch(0.76 0.16 155)" : "oklch(0.35 0.011 260)",
            strokeWidth: taken ? 2.2 : 1.4,
          },
          labelStyle: {
            fill: taken ? "oklch(0.76 0.16 155)" : "oklch(0.56 0.013 260)",
            fontSize: 10,
          },
          labelBgStyle: { fill: "oklch(0.16 0.006 260)" },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      };

      edge("yes", node.yesNodeId);
      edge("no", node.noNodeId);
    }

    return result;
  }, [nodes, answered]);

  /* ------------------------------------------------------------------- view */

  return (
    <div className="flex h-screen">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_event, node) => setSelectedId(Number(node.id))}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            className="bg-ground"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="oklch(0.29 0.009 260)" />
            <Controls
              showInteractive={false}
              className="!border-line !bg-surface [&_button]:!border-line [&_button]:!bg-surface [&_button]:!fill-muted"
            />
          </ReactFlow>
        </div>

        <div className="border-t border-line bg-surface px-5 py-3.5">
          <div className="flex items-start gap-3">
            <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", trace ? "bg-live" : "bg-faint")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed">
                {trace?.reason ?? "Working out what this device would show…"}
              </p>

              {trace && trace.steps.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {trace.steps.map((step, index) => (
                    <span key={step.nodeId} className="flex items-center gap-1.5">
                      {index > 0 && <span className="text-faint">→</span>}
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px]",
                          step.answer
                            ? "border-live/40 bg-live/10 text-live"
                            : "border-line bg-raised text-faint",
                        )}
                      >
                        {step.question}
                        <span className="opacity-70"> · {step.answer ? "yes" : "no"}</span>
                        {step.actual && <span className="opacity-70"> · {step.actual}</span>}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-faint">
              {save === "saving" && <Loader2 size={13} className="animate-spin" />}
              {save === "saved" && <Check size={13} className="text-live" />}
              {save === "failed" && <TriangleAlert size={13} className="text-danger" />}
              {{ idle: "", saving: "Saving", saved: "Saved", failed: "Not saved" }[save]}
            </span>
          </div>

          {error && <p className="mt-2 pl-5 text-[12px] text-danger">{error}</p>}
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface">
        <div className="border-b border-line p-4">
          <button
            type="button"
            onClick={() => addCheck(rootId)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            <GitBranch size={15} />
            Add a check at the top
          </button>
          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            It gets asked before everything else, so this is how you say &ldquo;whatever else is
            going on, when it rains show the weather&rdquo;. What is set up now moves into
            &ldquo;no&rdquo; untouched.
          </p>
        </div>

        {selected?.kind === "question" && (
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">This check</p>
              <button
                type="button"
                onClick={() => removeQuestion(selected.id)}
                title="Remove this check and everything on its yes branch"
                className="rounded-md p-1.5 text-faint hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <ConditionEditor
              condition={selected.condition ?? { kind: "always" }}
              groups={factGroups}
              onChange={(condition) => update(selected.id, { condition })}
            />

            <button
              type="button"
              onClick={() => addCheck(selected.noNodeId)}
              className="w-full rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Add another check under &ldquo;no&rdquo;
            </button>
          </div>
        )}

        {selected?.kind === "screen" && (
          <div className="space-y-4 p-4">
            <input
              value={selected.label}
              onChange={(event) => update(selected.id, { label: event.target.value })}
              className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-[14px] font-semibold outline-none hover:border-line focus:border-accent/70"
            />

            <div>
              <p className="mb-2 text-[12px] font-medium">Shows</p>
              <div className="grid grid-cols-2 gap-2">
                {screens.map((screen) => {
                  const active = screen.id === selected.screenId;
                  return (
                    <button
                      key={screen.id}
                      type="button"
                      onClick={() => update(selected.id, { screenId: screen.id })}
                      className={cn(
                        "rounded-lg border p-1.5 text-left transition-colors",
                        active ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ScreenPreview
                        src={`/api/preview/screen/${screen.id}?modelId=${modelId}`}
                        width={panel.width}
                        height={panel.height}
                        alt={screen.name}
                        className="rounded"
                      />
                      <p className="mt-1.5 truncate px-0.5 text-[11px]">{screen.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium">Wake every (seconds)</label>
              <input
                type="number"
                min={30}
                value={selected.refreshSeconds ?? ""}
                placeholder={String(deviceRefreshSeconds)}
                onChange={(event) =>
                  update(selected.id, {
                    refreshSeconds: event.target.value ? event.target.valueAsNumber : null,
                  })
                }
                className={control}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium">
                Once shown, keep it for (seconds)
              </label>
              <input
                type="number"
                min={0}
                value={selected.holdSeconds}
                onChange={(event) =>
                  update(selected.id, { holdSeconds: event.target.valueAsNumber || 0 })
                }
                className={control}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Stops the display flipping back and forth when a value sits on its threshold. Set 1200
                for &ldquo;stay on the weather for twenty minutes&rdquo;.
              </p>
            </div>

            <button
              type="button"
              onClick={() => addCheck(selected.id)}
              className="w-full rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Ask something before this screen
            </button>
          </div>
        )}

        {!selected && (
          <div className="p-4">
            <p className="text-[13px] leading-relaxed text-faint">
              Pick a check to change what it asks, or a screen to choose what it shows.
            </p>
            {trace && trace.values.length > 0 && (
              <>
                <p className="mt-5 mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
                  What this device knows right now
                </p>
                <dl className="space-y-1.5">
                  {trace.values.map((value) => (
                    <div
                      key={`${value.widgetId}-${value.key}`}
                      className="flex items-baseline justify-between gap-3 rounded-md bg-raised px-2.5 py-1.5"
                    >
                      <dt className="min-w-0 truncate text-[11px] text-muted">
                        {value.label}
                        <span className="block truncate text-[10px] text-faint">
                          {value.widgetLabel}
                        </span>
                      </dt>
                      <dd className="shrink-0 font-mono text-[11px] text-ink">
                        {value.value}
                        {value.unit && <span className="text-faint"> {value.unit}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export function DeviceTree(props: Parameters<typeof TreeCanvas>[0]) {
  return (
    <ReactFlowProvider>
      <TreeCanvas {...props} />
    </ReactFlowProvider>
  );
}
