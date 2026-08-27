"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Loader2, Plus, Trash2, TriangleAlert, Zap } from "lucide-react";

import { ConditionEditor, type WidgetFactGroup } from "@/components/flow/condition-editor";
import { StateNode, type StateNodeData } from "@/components/flow/state-node";
import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { summarise, type Condition } from "@/lib/flow/conditions";

export interface FlowState {
  id: number;
  name: string;
  screenId: number | null;
  refreshSeconds: number | null;
  isInitial: boolean;
  minDwellSeconds: number;
  x: number;
  y: number;
}

export interface FlowTransition {
  id: number;
  fromStateId: number | null;
  toStateId: number;
  condition: Condition;
  priority: number;
}

export interface ScreenOption {
  id: number;
  name: string;
  widgetCount: number;
}

interface Trace {
  stateId: number | null;
  reason: string;
  steps: { transitionId: number; holds: boolean; sentence: string; actual?: string; blockedBy?: string }[];
  values: { widgetId: number; widgetLabel: string; key: string; label: string; unit: string; value: string }[];
}

/** The origin of every "from anywhere" transition, drawn so it is not invisible. */
const ANYWHERE = "anywhere";

function AnywhereNode() {
  return (
    <div className="w-40 rounded-xl border border-dashed border-line-strong bg-raised px-3 py-3 text-center">
      <p className="text-[12px] font-medium text-muted">Any state</p>
      <p className="mt-1 text-[10px] leading-relaxed text-faint">
        Edges from here fire wherever the device currently is.
      </p>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-line-strong" />
    </div>
  );
}

const control =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors focus:border-accent/70";

function FlowCanvas({
  deviceId,
  deviceRefreshSeconds,
  modelId,
  panel,
  screens,
  factGroups,
  initialStates,
  initialTransitions,
}: {
  deviceId: number;
  deviceRefreshSeconds: number;
  modelId: number;
  panel: { width: number; height: number };
  screens: ScreenOption[];
  factGroups: WidgetFactGroup[];
  initialStates: FlowState[];
  initialTransitions: FlowTransition[];
}) {
  const [states, setStates] = useState(initialStates);
  const [transitions, setTransitions] = useState(initialTransitions);
  const [selected, setSelected] = useState<{ kind: "state" | "transition"; id: number } | null>(null);
  const [trace, setTrace] = useState<Trace>();
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string>();
  const [nextId, setNextId] = useState(-1);

  const nodeTypes = useMemo(() => ({ state: StateNode, anywhere: AnywhereNode }), []);

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
      const response = await fetch(`/api/devices/${deviceId}/flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ states, transitions }),
      });

      if (!response.ok) {
        setError((await response.json())?.error ?? "Could not save.");
        return setSave("failed");
      }

      const body = (await response.json()) as { states: FlowState[]; transitions: FlowTransition[] };
      setError(undefined);
      setSave("saved");

      // Rows created on the server come back with real ids; adopting them
      // keeps the next save from inserting duplicates.
      if (states.some((state) => state.id < 0) || transitions.some((t) => t.id < 0)) {
        settled.current = false;
        setStates(body.states);
        setTransitions(
          body.transitions.map((transition) => ({
            ...transition,
            condition: transition.condition as Condition,
          })),
        );
      }

      refreshTrace();
    }, 700);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, transitions, deviceId]);

  /* ------------------------------------------------------------------ graph */

  const nodes: Node[] = useMemo(() => {
    const hasGlobal = transitions.some((transition) => transition.fromStateId === null);

    const stateNodes = states.map<Node>((state) => ({
      id: String(state.id),
      type: "state",
      position: { x: state.x, y: state.y },
      selected: selected?.kind === "state" && selected.id === state.id,
      data: {
        name: state.name,
        screenId: state.screenId,
        screenName: screens.find((screen) => screen.id === state.screenId)?.name ?? null,
        refreshSeconds: state.refreshSeconds,
        deviceRefreshSeconds,
        isInitial: state.isInitial,
        isCurrent: trace?.stateId === state.id,
        panel,
        modelId,
      } satisfies StateNodeData,
    }));

    if (!hasGlobal) return stateNodes;

    return [
      {
        id: ANYWHERE,
        type: "anywhere",
        position: { x: 40, y: -40 },
        draggable: true,
        data: {},
      },
      ...stateNodes,
    ];
  }, [states, transitions, screens, trace, panel, modelId, deviceRefreshSeconds, selected]);

  // summarise() needs the widgets to turn a fact condition into a sentence;
  // without them every fact edge reads "Extension value".
  const summariseContext = useMemo(
    () => ({
      widgets: new Map(
        factGroups.map((group) => [
          group.widgetId,
          { payload: {}, facts: group.facts, label: group.label, fetchedAt: null },
        ]),
      ),
    }),
    [factGroups],
  );

  const edges: Edge[] = useMemo(
    () =>
      transitions.map<Edge>((transition) => {
        const step = trace?.steps.find((candidate) => candidate.transitionId === transition.id);
        const live = step?.holds;

        return {
          id: String(transition.id),
          source: transition.fromStateId === null ? ANYWHERE : String(transition.fromStateId),
          target: String(transition.toStateId),
          label: summarise(transition.condition, summariseContext),
          selected: selected?.kind === "transition" && selected.id === transition.id,
          animated: live,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: {
            stroke: live ? "oklch(0.76 0.16 155)" : "oklch(0.40 0.011 260)",
            strokeWidth: live ? 2 : 1.5,
          },
          labelStyle: { fill: "oklch(0.97 0.003 260)", fontSize: 11 },
          labelBgStyle: { fill: "oklch(0.245 0.008 260)" },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 5,
        };
      }),
    [transitions, trace, selected, summariseContext],
  );

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges);

  useEffect(() => setFlowNodes(nodes), [nodes, setFlowNodes]);
  useEffect(() => setFlowEdges(edges), [edges, setFlowEdges]);

  /* -------------------------------------------------------------- mutations */

  const addState = () => {
    const state: FlowState = {
      id: nextId,
      name: `State ${states.length + 1}`,
      screenId: screens[0]?.id ?? null,
      refreshSeconds: null,
      isInitial: states.length === 0,
      minDwellSeconds: 0,
      x: 80 + states.length * 300,
      y: 320,
    };

    setNextId((value) => value - 1);
    setStates((current) => [...current, state]);
    setSelected({ kind: "state", id: state.id });
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const transition: FlowTransition = {
        id: nextId,
        fromStateId: connection.source === ANYWHERE ? null : Number(connection.source),
        toStateId: Number(connection.target),
        condition: { kind: "always" },
        priority: 0,
      };

      setNextId((value) => value - 1);
      setTransitions((current) => [...current, transition]);
      setSelected({ kind: "transition", id: transition.id });
      setFlowEdges((current) => addEdge(connection, current));
    },
    [nextId, setFlowEdges],
  );

  const updateState = (id: number, patch: Partial<FlowState>) =>
    setStates((current) =>
      current.map((state) =>
        state.id === id
          ? { ...state, ...patch }
          : patch.isInitial
            ? { ...state, isInitial: false }
            : state,
      ),
    );

  const updateTransition = (id: number, patch: Partial<FlowTransition>) =>
    setTransitions((current) =>
      current.map((transition) => (transition.id === id ? { ...transition, ...patch } : transition)),
    );

  const selectedState = selected?.kind === "state" ? states.find((s) => s.id === selected.id) : undefined;
  const selectedTransition =
    selected?.kind === "transition" ? transitions.find((t) => t.id === selected.id) : undefined;

  /* ------------------------------------------------------------------- view */

  return (
    <div className="flex h-screen">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) =>
              node.id !== ANYWHERE && setSelected({ kind: "state", id: Number(node.id) })
            }
            onEdgeClick={(_event, edge) => setSelected({ kind: "transition", id: Number(edge.id) })}
            onPaneClick={() => setSelected(null)}
            onNodeDragStop={(_event, node) =>
              node.id !== ANYWHERE &&
              updateState(Number(node.id), { x: node.position.x, y: node.position.y })
            }
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            className="bg-ground"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="oklch(0.31 0.009 260)" />
            <Controls className="!border-line !bg-surface [&_button]:!border-line [&_button]:!bg-surface [&_button]:!fill-muted" />
          </ReactFlow>
        </div>

        {/* The live trace: what the flow decides right now, and why. */}
        <div className="border-t border-line bg-surface px-5 py-3.5">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                trace ? "bg-live" : "bg-faint",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed">
                {trace?.reason ?? "Working out what this device would show…"}
              </p>

              {trace && trace.steps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {trace.steps.map((step) => (
                    <span
                      key={step.transitionId}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px]",
                        step.holds
                          ? "border-live/40 bg-live/10 text-live"
                          : "border-line bg-raised text-faint",
                      )}
                    >
                      {step.sentence}
                      {step.actual && <span className="opacity-70"> · {step.actual}</span>}
                      {step.blockedBy === "dwell" && <span className="opacity-70"> · held</span>}
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

      {/* Inspector */}
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface">
        <div className="border-b border-line p-4">
          <button
            type="button"
            onClick={addState}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            Add a state
          </button>
          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            Drag from a state&apos;s right edge to another to say when the display should switch.
          </p>
        </div>

        {selectedState && (
          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <input
                value={selectedState.name}
                onChange={(event) => updateState(selectedState.id, { name: event.target.value })}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent py-0.5 text-[14px] font-semibold outline-none hover:border-line focus:border-accent/70"
              />
              {!selectedState.isInitial && (
                <button
                  type="button"
                  onClick={() => {
                    setTransitions((current) =>
                      current.filter(
                        (t) => t.fromStateId !== selectedState.id && t.toStateId !== selectedState.id,
                      ),
                    );
                    setStates((current) => current.filter((s) => s.id !== selectedState.id));
                    setSelected(null);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-faint hover:bg-danger/15 hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div>
              <p className="mb-2 text-[12px] font-medium">Shows</p>
              <div className="grid grid-cols-2 gap-2">
                {screens.map((screen) => {
                  const active = screen.id === selectedState.screenId;
                  return (
                    <button
                      key={screen.id}
                      type="button"
                      onClick={() => updateState(selectedState.id, { screenId: screen.id })}
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
              <label className="mb-1.5 block text-[12px] font-medium">
                Wake every (seconds, while here)
              </label>
              <input
                type="number"
                min={30}
                value={selectedState.refreshSeconds ?? ""}
                placeholder={String(deviceRefreshSeconds)}
                onChange={(event) =>
                  updateState(selectedState.id, {
                    refreshSeconds: event.target.value ? event.target.valueAsNumber : null,
                  })
                }
                className={control}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium">Stay at least (seconds)</label>
              <input
                type="number"
                min={0}
                value={selectedState.minDwellSeconds}
                onChange={(event) =>
                  updateState(selectedState.id, { minDwellSeconds: event.target.valueAsNumber || 0 })
                }
                className={control}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Stops the display flickering between two states when a value sits near its threshold.
              </p>
            </div>

            {!selectedState.isInitial && (
              <button
                type="button"
                onClick={() => updateState(selectedState.id, { isInitial: true })}
                className="w-full rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
              >
                Make this the starting state
              </button>
            )}
          </div>
        )}

        {selectedTransition && (
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Zap size={13} className="text-accent" />
                Switch to{" "}
                {states.find((state) => state.id === selectedTransition.toStateId)?.name ?? "…"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTransitions((current) =>
                    current.filter((t) => t.id !== selectedTransition.id),
                  );
                  setSelected(null);
                }}
                className="shrink-0 rounded-md p-1.5 text-faint hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <ConditionEditor
              condition={selectedTransition.condition}
              groups={factGroups}
              onChange={(condition) => updateTransition(selectedTransition.id, { condition })}
            />

            <div>
              <label className="mb-1.5 block text-[12px] font-medium">Priority</label>
              <input
                type="number"
                value={selectedTransition.priority}
                onChange={(event) =>
                  updateTransition(selectedTransition.id, {
                    priority: event.target.valueAsNumber || 0,
                  })
                }
                className={control}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Lower goes first. When two conditions both hold, the lower number wins.
              </p>
            </div>
          </div>
        )}

        {!selected && (
          <div className="p-4">
            <p className="text-[13px] leading-relaxed text-faint">
              Pick a state to choose what it shows, or an arrow to change when it fires.
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

export function DeviceFlow(props: Parameters<typeof FlowCanvas>[0]) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
