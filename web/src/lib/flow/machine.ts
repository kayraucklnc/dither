import { evaluate, summarise, type Condition, type Context, type Trace } from "./conditions";

/**
 * The flow: a small state machine per device.
 *
 * A list of rules has no memory, so it cannot express "switch to checking
 * every five minutes until my train has gone, then go back". A machine can,
 * because it knows where it currently is. That memory is the only thing that
 * makes this more than an ordered list, and it is the reason it is worth the
 * extra concept.
 *
 * Two things keep it from becoming a wiring nightmare:
 *
 *   - a transition with no `from` fires from anywhere, so a rule that should
 *     always win needs one edge rather than one per state;
 *   - a state with no matching transition falls back to the initial state,
 *     so the way home never has to be drawn.
 */

export interface State {
  id: number;
  name: string;
  screenId: number | null;
  refreshSeconds: number | null;
  isInitial: boolean;
  minDwellSeconds: number;
}

export interface Transition {
  id: number;
  fromStateId: number | null;
  toStateId: number;
  condition: Condition;
  priority: number;
}

/** Everything that happened during one decision, in the order it happened. */
export interface Step {
  transitionId: number;
  toStateId: number;
  label: string;
  trace: Trace;
  /** Set when the condition held but the machine stayed put anyway. */
  blockedBy?: "dwell";
}

export interface Decision {
  state: State;
  /** True when the decision moved the device somewhere new. */
  moved: boolean;
  previousStateId: number | null;
  refreshSeconds: number;
  steps: Step[];
  /** Plain-language account of the outcome, shown in the dashboard. */
  reason: string;
}

export interface Position {
  currentStateId: number | null;
  stateEnteredAt: Date | null;
}

function initialState(states: State[]): State | undefined {
  return states.find((state) => state.isInitial) ?? states[0];
}

/**
 * Transitions that could fire from where we are: the ones leaving this state,
 * plus the global ones. Sorted so that priority decides, and a tie is broken
 * by specificity - an edge out of this state beats a from-anywhere edge,
 * because the specific answer is the one the author was thinking about.
 */
function candidates(transitions: Transition[], fromStateId: number | null): Transition[] {
  return transitions
    .filter((transition) => transition.fromStateId === null || transition.fromStateId === fromStateId)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const specificity = Number(b.fromStateId !== null) - Number(a.fromStateId !== null);
      return specificity !== 0 ? specificity : a.id - b.id;
    });
}

export function decide(
  states: State[],
  transitions: Transition[],
  position: Position,
  context: Context,
  defaultRefreshSeconds: number,
): Decision | undefined {
  const home = initialState(states);
  if (!home) return undefined;

  const current = states.find((state) => state.id === position.currentStateId) ?? home;
  const steps: Step[] = [];

  const dwellRemaining = (() => {
    if (!position.stateEnteredAt || current.minDwellSeconds <= 0) return 0;
    const elapsed = (context.now.getTime() - position.stateEnteredAt.getTime()) / 1000;
    return Math.max(0, current.minDwellSeconds - elapsed);
  })();

  for (const transition of candidates(transitions, current.id)) {
    const target = states.find((state) => state.id === transition.toStateId);
    if (!target) continue;

    const trace = evaluate(transition.condition, context);
    const label = `${summarise(transition.condition, context)} → ${target.name}`;

    if (!trace.holds) {
      steps.push({ transitionId: transition.id, toStateId: target.id, label, trace });
      continue;
    }

    // Already here: the condition holding is what keeps us here, not a move.
    if (target.id === current.id) {
      steps.push({ transitionId: transition.id, toStateId: target.id, label, trace });
      return {
        state: current,
        moved: false,
        previousStateId: current.id,
        refreshSeconds: current.refreshSeconds ?? defaultRefreshSeconds,
        steps,
        reason: `Staying on ${current.name}: ${trace.sentence}${trace.actual ? ` (${trace.actual})` : ""}.`,
      };
    }

    if (dwellRemaining > 0) {
      steps.push({ transitionId: transition.id, toStateId: target.id, label, trace, blockedBy: "dwell" });
      return {
        state: current,
        moved: false,
        previousStateId: current.id,
        refreshSeconds: current.refreshSeconds ?? defaultRefreshSeconds,
        steps,
        reason:
          `${target.name} is ready, but ${current.name} holds for another ` +
          `${Math.ceil(dwellRemaining)}s so the display does not flicker.`,
      };
    }

    steps.push({ transitionId: transition.id, toStateId: target.id, label, trace });

    return {
      state: target,
      moved: true,
      previousStateId: current.id,
      refreshSeconds: target.refreshSeconds ?? defaultRefreshSeconds,
      steps,
      reason: `Moved to ${target.name}: ${trace.sentence}${trace.actual ? ` (${trace.actual})` : ""}.`,
    };
  }

  // Nothing fired. Anywhere that is not home falls back to home on its own,
  // which is what makes "and then go back" free rather than something you draw.
  if (current.id !== home.id && dwellRemaining <= 0) {
    return {
      state: home,
      moved: true,
      previousStateId: current.id,
      refreshSeconds: home.refreshSeconds ?? defaultRefreshSeconds,
      steps,
      reason: `Nothing kept ${current.name} active, so the display returned to ${home.name}.`,
    };
  }

  return {
    state: current,
    moved: false,
    previousStateId: current.id,
    refreshSeconds: current.refreshSeconds ?? defaultRefreshSeconds,
    steps,
    reason: steps.length
      ? `Staying on ${current.name}: nothing else matched.`
      : `Staying on ${current.name}: nothing else is set up.`,
  };
}
