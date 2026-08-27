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
import {
  Check,
  ChevronDown,
  FlaskConical,
  ChevronUp,
  CornerDownRight,
  GitBranch,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  blankCondition,
  ConditionEditor,
  type EditorSource,
  type SourceKind,
} from "@/components/flow/condition-editor";
import { ContextMenu, type MenuItem } from "@/components/flow/context-menu";
import { DevicePanel, type DeviceDetails } from "@/components/flow/device-panel";
import { NoticesPanel } from "@/components/flow/notices-panel";
import { NO_SIMULATION, TestPanel, type Simulation } from "@/components/flow/test-panel";
import { QuestionNode, ScreenNode, type QuestionData, type ScreenData } from "@/components/flow/nodes";
import { ScreenPreview } from "@/components/screen-preview";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { summarise, type Condition } from "@/lib/flow/conditions";
import { layout } from "@/lib/flow/layout";
import type { Source } from "@/lib/flow/sources";
import type { Node } from "@/lib/flow/tree";

export interface ScreenOption {
  id: number;
  name: string;
}

interface Trace {
  simulated: boolean;
  at: string;
  leafId: number | null;
  reason: string;
  held: boolean;
  steps: { nodeId: number; question: string; answer: boolean; actual?: string }[];
  notices: { icon: string; text: string; loud: boolean }[];
}

const control =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

function TreeCanvas({
  device,
  deviceId,
  deviceRefreshSeconds,
  modelId,
  panel,
  screens: initialScreens,
  sources: initialSources,
  sourceKinds,
  initialNodes,
  initialRootId,
}: {
  device: DeviceDetails;
  deviceId: number;
  deviceRefreshSeconds: number;
  modelId: number;
  panel: { width: number; height: number };
  screens: ScreenOption[];
  sources: EditorSource[];
  sourceKinds: SourceKind[];
  initialNodes: Node[];
  initialRootId: number | null;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [rootId, setRootId] = useState(initialRootId);
  const [screens, setScreens] = useState(initialScreens);
  const [sources, setSources] = useState(initialSources);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trace, setTrace] = useState<Trace>();
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string>();
  const [nextId, setNextId] = useState(-1);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] }>();
  const [tab, setTab] = useState<"decide" | "notices" | "device" | "test">("decide");
  const [simulation, setSimulation] = useState<Simulation>(NO_SIMULATION);
  const [refreshing, setRefreshing] = useState(false);

  const nodeTypes = useMemo(() => ({ question: QuestionNode, screen: ScreenNode }), []);
  const selected = nodes.find((node) => node.id === selectedId);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  /* ------------------------------------------------------------------ trace */

  const refreshTrace = useCallback(async () => {
    // Simulating asks the same question of a moment and some values that are
    // not real; the device carries on deciding for itself either way.
    const response = simulation.active
      ? await fetch(`/api/devices/${deviceId}/trace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            at: simulation.at ? new Date(simulation.at).toISOString() : undefined,
            overrides: simulation.overrides,
          }),
        })
      : await fetch(`/api/devices/${deviceId}/trace`);

    if (!response.ok) return;

    const body = await response.json();
    setTrace(body);
    // The trace carries live values, so the check editor can show what each
    // source currently reads without a second request.
    if (body.sources) setSources(body.sources);
  }, [deviceId, simulation]);

  useEffect(() => {
    refreshTrace();
    const timer = setInterval(refreshTrace, 20_000);
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

  /* ----------------------------------------------------------------- shapes */

  const update = (id: number, patch: Partial<Node>) =>
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch } : node)));

  const parentOf = useCallback(
    (id: number) =>
      nodes.find((node) => node.kind === "question" && (node.yesNodeId === id || node.noNodeId === id)),
    [nodes],
  );

  /**
   * Insert a check above whatever is at `above`.
   *
   * Everything already there slides into the "no" branch untouched, which is
   * how "whatever else is going on, when it rains show the weather" is one
   * gesture rather than an edge out of every screen.
   */
  const addCheck = useCallback(
    (above: number | null) => {
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
        condition: blankCondition(sources),
        yesNodeId: leafId,
        noNodeId: above,
        screenId: null,
        refreshSeconds: null,
        holdSeconds: 0,
      };

      setNodes((current) => {
        const withNew = [...current, leaf, question];
        if (above === rootId || above === null) return withNew;

        return withNew.map((node) =>
          node.id === questionId
            ? node
            : node.yesNodeId === above
              ? { ...node, yesNodeId: questionId }
              : node.noNodeId === above
                ? { ...node, noNodeId: questionId }
                : node,
        );
      });

      if (above === rootId || above === null) setRootId(questionId);
      setSelectedId(questionId);
    },
    [nextId, screens, sources, rootId],
  );

  /** Removing a check splices it out, keeping its "no" branch. */
  const removeQuestion = useCallback(
    (id: number) => {
      const question = byId.get(id);
      if (!question || question.kind !== "question") return;

      const survivor = question.noNodeId;

      // The "yes" branch goes with it, so collect everything only it reached.
      const doomed = new Set<number>([id]);
      const collect = (from: number | null) => {
        if (from === null || doomed.has(from) || from === survivor) return;
        doomed.add(from);
        const node = byId.get(from);
        collect(node?.yesNodeId ?? null);
        collect(node?.noNodeId ?? null);
      };
      collect(question.yesNodeId);

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
    },
    [byId, rootId],
  );

  /**
   * Swap a check with the check directly under it on the "no" path.
   *
   * Their "yes" branches travel with them, so only the order of the questions
   * changes. This is what the up and down arrows do, and it is the only way
   * priority is ever edited: priority *is* depth.
   */
  const swapDown = useCallback(
    (upperId: number) => {
      const upper = byId.get(upperId);
      const lowerId = upper?.noNodeId ?? null;
      const lower = lowerId === null ? undefined : byId.get(lowerId);

      if (!upper || upper.kind !== "question" || !lower || lower.kind !== "question") return;

      const above = parentOf(upperId);

      setNodes((current) =>
        current.map((node) => {
          if (node.id === upperId) return { ...node, noNodeId: lower.noNodeId };
          if (node.id === lower.id) return { ...node, noNodeId: upperId };
          if (above && node.id === above.id) {
            return above.yesNodeId === upperId
              ? { ...node, yesNodeId: lower.id }
              : { ...node, noNodeId: lower.id };
          }
          return node;
        }),
      );

      if (rootId === upperId) setRootId(lower.id);
    },
    [byId, parentOf, rootId],
  );

  const move = useCallback(
    (id: number, direction: "up" | "down") => {
      if (direction === "down") return swapDown(id);

      const above = parentOf(id);
      if (above?.kind === "question" && above.noNodeId === id) swapDown(above.id);
    },
    [parentOf, swapDown],
  );

  const canMove = useCallback(
    (id: number) => {
      const node = byId.get(id);
      const above = parentOf(id);
      const below = node?.noNodeId === null || node?.noNodeId === undefined ? undefined : byId.get(node.noNodeId);

      return {
        up: above?.kind === "question" && above.noNodeId === id,
        down: below?.kind === "question",
      };
    },
    [byId, parentOf],
  );

  /* ---------------------------------------------------------------- sources */

  const addSource = useCallback(
    async (extension: string) => {
      const response = await fetch(`/api/devices/${deviceId}/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension }),
      });

      if (!response.ok) return setError((await response.json())?.error ?? "Could not add that.");

      await refreshTrace();

      // Point the check being edited at the source that was just created.
      const { trigger } = await response.json();
      if (selected?.kind === "question" && trigger) {
        update(selected.id, {
          condition: { kind: "fact", sourceId: String(trigger.id), factKey: "", operator: "present" },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deviceId, refreshTrace, selected],
  );

  const editSource = useCallback(
    async (id: string, settings: Record<string, unknown>) => {
      setSources((current) =>
        current.map((source) => (source.id === id ? { ...source, settings } : source)),
      );

      await fetch(`/api/devices/${deviceId}/triggers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id), settings }),
      });

      refreshTrace();
    },
    [deviceId, refreshTrace],
  );

  const addScreen = useCallback(
    async (forNodeId: number) => {
      const response = await fetch("/api/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New screen" }),
      });

      if (!response.ok) return;

      const { screen } = await response.json();
      setScreens((current) => [...current, screen]);
      update(forNodeId, { screenId: screen.id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ------------------------------------------------------------------ graph */

  const sourceMap = useMemo(
    () =>
      new Map<string, Source>(
        sources.map((source) => [
          source.id,
          {
            id: source.id,
            label: source.label,
            group: source.group,
            facts: source.facts,
            payload: {},
            fetchedAt: null,
          },
        ]),
      ),
    [sources],
  );

  const answered = useMemo(
    () => new Map(trace?.steps.map((step) => [step.nodeId, step]) ?? []),
    [trace],
  );

  const flowNodes: RFNode[] = useMemo(() => {
    const positions = layout(nodes, rootId);

    return nodes.map<RFNode>((node) => {
      const at = positions.get(node.id) ?? { x: 0, y: 0 };
      const step = answered.get(node.id);

      if (node.kind === "question") {
        const moves = canMove(node.id);

        return {
          id: String(node.id),
          type: "question",
          position: at,
          selected: selectedId === node.id,
          data: {
            question: node.condition
              ? summarise(node.condition, { sources: sourceMap })
              : "No check set",
            actual: step?.actual,
            answer: step?.answer,
            isRoot: rootId === node.id,
            canMoveUp: moves.up,
            canMoveDown: moves.down,
            onMove: (direction: "up" | "down") => move(node.id, direction),
          } satisfies QuestionData,
        };
      }

      return {
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
          deviceId,
        } satisfies ScreenData,
      };
    });
  }, [
    nodes, rootId, selectedId, answered, trace, screens, panel, modelId,
    deviceRefreshSeconds, sourceMap, canMove, move,
  ]);

  const flowEdges: Edge[] = useMemo(() => {
    const result: Edge[] = [];

    for (const node of nodes) {
      if (node.kind !== "question") continue;
      const step = answered.get(node.id);

      const edge = (branch: "yes" | "no", target: number | null) => {
        if (target === null) return;

        const taken = step?.answer === (branch === "yes");
        const colour = branch === "yes" ? "oklch(0.76 0.16 155)" : "oklch(0.74 0.13 20)";

        result.push({
          id: `${node.id}-${branch}`,
          source: String(node.id),
          sourceHandle: branch,
          target: String(target),
          animated: taken,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: colour },
          style: { stroke: colour, strokeWidth: taken ? 2.4 : 1.4, opacity: taken ? 1 : 0.45 },
        });
      };

      edge("yes", node.yesNodeId);
      edge("no", node.noNodeId);
    }

    return result;
  }, [nodes, answered]);

  /* ------------------------------------------------------------- right click */

  const menuFor = useCallback(
    (id: number | null): MenuItem[] => {
      if (id === null) {
        return [
          {
            id: "top",
            label: "Add a check at the top",
            icon: GitBranch,
            hint: "Asked before everything else",
            onSelect: () => addCheck(rootId),
          },
        ];
      }

      const node = byId.get(id);
      if (!node) return [];

      if (node.kind === "screen") {
        return [
          {
            id: "before",
            label: "Ask something before this",
            icon: GitBranch,
            hint: "Shows a different screen when it holds",
            onSelect: () => addCheck(id),
          },
          {
            id: "screen",
            label: "Make a new screen for this",
            icon: ImagePlus,
            onSelect: () => addScreen(id),
          },
        ];
      }

      const moves = canMove(id);

      return [
        {
          id: "yes",
          label: "Add a check on the yes branch",
          icon: CornerDownRight,
          onSelect: () => addCheck(node.yesNodeId),
        },
        {
          id: "no",
          label: "Add a check on the no branch",
          icon: CornerDownRight,
          onSelect: () => addCheck(node.noNodeId),
        },
        { id: "up", label: "Ask this earlier", icon: ChevronUp, disabled: !moves.up, onSelect: () => move(id, "up") },
        { id: "down", label: "Ask this later", icon: ChevronDown, disabled: !moves.down, onSelect: () => move(id, "down") },
        { id: "delete", label: "Remove this check", icon: Trash2, danger: true, onSelect: () => removeQuestion(id) },
      ];
    },
    [byId, canMove, addCheck, addScreen, move, removeQuestion, rootId],
  );

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
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              setSelectedId(Number(node.id));
              setMenu({ at: { x: event.clientX, y: event.clientY }, items: menuFor(Number(node.id)) });
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              const pointer = event as unknown as MouseEvent;
              setMenu({ at: { x: pointer.clientX, y: pointer.clientY }, items: menuFor(null) });
            }}
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
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                trace?.simulated ? "bg-accent" : trace ? "bg-live" : "bg-faint",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-2 text-[13px] leading-relaxed">
                {trace?.simulated && (
                  <span className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-bright">
                    <FlaskConical size={9} />
                    Pretending{simulation.at ? ` · ${simulation.at.replace("T", " ")}` : ""}
                  </span>
                )}
                <span>{trace?.reason ?? "Working out what this device would show…"}</span>
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
                            : "border-no/30 bg-no/5 text-no",
                        )}
                      >
                        {step.question}
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

          {trace && trace.notices.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
              <span className="text-[11px] text-faint">Also showing:</span>
              {trace.notices.map((notice) => (
                <span
                  key={notice.text}
                  className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] text-muted"
                >
                  {notice.text}
                </span>
              ))}
            </div>
          )}

          {error && <p className="mt-2 pl-5 text-[12px] text-danger">{error}</p>}
        </div>
      </div>

      <aside className="flex w-84 shrink-0 flex-col border-l border-line bg-surface">
        <div className="flex shrink-0 gap-1 border-b border-line p-2">
          {(["decide", "notices", "device", "test"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                tab === name ? "bg-raised text-ink" : "text-faint hover:text-muted",
              )}
            >
              <span className="flex items-center justify-center gap-1">
                {name === "test" && <FlaskConical size={11} />}
                {{ decide: "Decide", notices: "Notices", device: "Device", test: "Test" }[name]}
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "test" ? (
          <TestPanel sources={sources} simulation={simulation} onChange={setSimulation} />
        ) : tab === "device" ? (
          <DevicePanel device={device} />
        ) : tab === "notices" ? (
          <NoticesPanel
            deviceId={deviceId}
            sources={sources}
            sourceKinds={sourceKinds}
            sourceMap={sourceMap}
            onChanged={refreshTrace}
          />
        ) : (
        <>
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
            Asked before everything else, so this is how you say &ldquo;whatever else is going on,
            when it rains show the weather&rdquo;. Right-click anything for more.
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
              condition={selected.condition ?? blankCondition(sources)}
              sources={sources}
              kinds={sourceKinds}
              onChange={(condition) => update(selected.id, { condition })}
              onAddSource={addSource}
              onEditSource={editSource}
            />
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
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-medium">Shows</p>
                <button
                  type="button"
                  onClick={() => addScreen(selected.id)}
                  className="flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink"
                >
                  <Plus size={11} />
                  New screen
                </button>
              </div>

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
                        src={`/api/preview/screen/${screen.id}?modelId=${modelId}&deviceId=${deviceId}`}
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
              <label className="mb-1.5 block text-[12px] font-medium">Wake every</label>
              <Select
                value={selected.refreshSeconds ?? 0}
                ariaLabel="Wake every"
                options={[
                  { value: 0, label: `Device default (${deviceRefreshSeconds / 60} min)` },
                  { value: 60, label: "Every minute" },
                  { value: 300, label: "Every 5 minutes" },
                  { value: 600, label: "Every 10 minutes" },
                  { value: 900, label: "Every 15 minutes" },
                  { value: 1800, label: "Every 30 minutes" },
                  { value: 3600, label: "Every hour" },
                ]}
                onChange={(seconds) =>
                  update(selected.id, { refreshSeconds: seconds === 0 ? null : seconds })
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium">Once shown, keep it</label>
              <Select
                value={selected.holdSeconds}
                ariaLabel="Hold"
                options={[
                  { value: 0, label: "No minimum", hint: "Switch as soon as something else applies" },
                  { value: 300, label: "At least 5 minutes" },
                  { value: 600, label: "At least 10 minutes" },
                  { value: 1200, label: "At least 20 minutes" },
                  { value: 3600, label: "At least an hour" },
                ]}
                onChange={(holdSeconds) => update(selected.id, { holdSeconds })}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Stops the display flipping back and forth when a value sits on its threshold.
              </p>
            </div>

            <button
              type="button"
              onClick={() => addCheck(selected.id)}
              className={cn(control, "text-center text-[12px] text-muted hover:text-ink")}
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

            {sources.filter((source) => source.group === "trigger").length > 0 && (
              <>
                <div className="mt-5 mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                    Sources on this device
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setRefreshing(true);
                      await fetch(`/api/devices/${deviceId}/triggers/refresh`, { method: "POST" });
                      await refreshTrace();
                      setRefreshing(false);
                    }}
                    className="flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink"
                  >
                    <RefreshCw size={11} className={cn(refreshing && "animate-spin")} />
                    Fetch now
                  </button>
                </div>
                <div className="space-y-2">
                  {sources
                    .filter((source) => source.group === "trigger")
                    .map((source) => (
                      <div key={source.id} className="rounded-lg border border-line bg-raised p-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] font-medium">{source.label}</span>
                          <span className="shrink-0 text-[10px] text-faint">
                            {source.extensionLabel}
                          </span>
                        </div>
                        <dl className="mt-1.5 space-y-0.5">
                          {source.facts.slice(0, 4).map((fact) => (
                            <div key={fact.key} className="flex justify-between gap-2 text-[11px]">
                              <dt className="truncate text-faint">{fact.label}</dt>
                              <dd className="shrink-0 font-mono text-muted">
                                {source.values[fact.key] ?? "—"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
        </>
        )}
        </div>
      </aside>

      {menu && <ContextMenu at={menu.at} items={menu.items} onClose={() => setMenu(undefined)} />}
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
