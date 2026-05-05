import type { ProposerState, Message } from "../engine/types.ts";
import { introduceProposal, crashNode, restartNode, dropMessage } from "../engine/faults.ts";
import { checkInvariants } from "../engine/invariants.ts";
import type { AppState } from "../state/reducer.ts";
import type { ScriptEvent, ScriptLogEntry } from "./types.ts";

export function applyScriptEvent(state: AppState, event: ScriptEvent): AppState {
  const firedAtStep = state.sim.stepCount;
  const precedingDeliveredCount = state.sim.deliveredMessages.length;

  let warning: string | null = null;
  let nextSim = state.sim;

  switch (event.do) {
    case "propose": {
      const node = state.sim.nodes[event.node];
      if (node.status === "crashed") {
        warning = `propose ${event.node}: node is crashed (no-op)`;
      } else {
        const value = (node as ProposerState).proposedValue;
        nextSim = introduceProposal(state.sim, event.node, value);
      }
      break;
    }
    case "crash": {
      const node = state.sim.nodes[event.node];
      if (node.status === "crashed") {
        warning = `crash ${event.node}: already crashed (no-op)`;
      } else {
        nextSim = crashNode(state.sim, event.node);
      }
      break;
    }
    case "restart": {
      const node = state.sim.nodes[event.node];
      if (node.status !== "crashed") {
        warning = `restart ${event.node}: not crashed (no-op)`;
      } else {
        nextSim = restartNode(state.sim, event.node);
      }
      break;
    }
    case "drop": {
      const target = state.sim.messageQueue.find((m) => matchesDrop(m, event));
      if (!target) {
        warning = `drop ${describeDropMatch(event)}: no matching queued message (no-op)`;
      } else {
        nextSim = dropMessage(state.sim, target.id);
      }
      break;
    }
  }

  const entry: ScriptLogEntry = {
    kind: "event",
    firedAtStep,
    precedingDeliveredCount,
    event,
    outcome: warning === null ? "applied" : { warning },
  };

  return {
    ...state,
    sim: nextSim,
    scriptLog: [...state.scriptLog, entry],
  };
}

function matchesDrop(
  msg: Message,
  event: Extract<ScriptEvent, { do: "drop" }>
): boolean {
  if (msg.status !== "queued") return false;
  if (event.to !== undefined && msg.to !== event.to) return false;
  if (event.from !== undefined && msg.from !== event.from) return false;
  if (event.type !== undefined && msg.type !== event.type) return false;
  return true;
}

function describeDropMatch(event: Extract<ScriptEvent, { do: "drop" }>): string {
  const parts: string[] = [];
  if (event.from !== undefined) parts.push(`from=${event.from}`);
  if (event.to !== undefined) parts.push(`to=${event.to}`);
  if (event.type !== undefined) parts.push(`type=${event.type}`);
  return parts.join(",");
}

export function describeScriptEvent(event: ScriptEvent): string {
  switch (event.do) {
    case "propose":
      return `propose ${event.node}`;
    case "crash":
      return `crash ${event.node}`;
    case "restart":
      return `restart ${event.node}`;
    case "drop":
      return `drop ${describeDropMatch(event)}`;
  }
}

const SAFETY_CAP = 200;

export function runScriptTick(state: AppState): AppState {
  if (!state.script) return state;

  let s = state;
  while (
    s.script &&
    s.script.nextEventIndex < s.script.events.length &&
    s.script.events[s.script.nextEventIndex].at <= s.sim.stepCount
  ) {
    const event = s.script.events[s.script.nextEventIndex];
    s = applyScriptEvent(s, event);
    checkInvariants(s.sim);
    s = {
      ...s,
      script: { ...s.script!, nextEventIndex: s.script!.nextEventIndex + 1 },
    };
  }

  // Post-tick: queue empty with events still pending → emit a one-shot warning.
  if (
    s.script &&
    s.sim.messageQueue.length === 0 &&
    s.script.nextEventIndex < s.script.events.length
  ) {
    const alreadyWarned = s.scriptLog.some(
      (e) => e.kind === "system" && e.warning.startsWith("queue empty")
    );
    if (!alreadyWarned) {
      const remaining = s.script.events.length - s.script.nextEventIndex;
      s = {
        ...s,
        scriptLog: [
          ...s.scriptLog,
          {
            kind: "system",
            firedAtStep: s.sim.stepCount,
            precedingDeliveredCount: s.sim.deliveredMessages.length,
            warning:
              `queue empty with ${remaining} script event(s) un-fired ` +
              `(events scheduled past step ${s.sim.stepCount} can never fire)`,
          },
        ],
      };
    }
  }

  // Post-tick: safety cap on stepCount while a script is loaded.
  if (s.script && s.sim.stepCount >= SAFETY_CAP && s.autoPlay) {
    const alreadyCapped = s.scriptLog.some(
      (e) => e.kind === "system" && e.warning.startsWith("safety cap")
    );
    if (!alreadyCapped) {
      s = {
        ...s,
        autoPlay: false,
        scriptLog: [
          ...s.scriptLog,
          {
            kind: "system",
            firedAtStep: s.sim.stepCount,
            precedingDeliveredCount: s.sim.deliveredMessages.length,
            warning: `safety cap of ${SAFETY_CAP} steps reached — autoplay paused`,
          },
        ],
      };
    }
  }

  return s;
}
