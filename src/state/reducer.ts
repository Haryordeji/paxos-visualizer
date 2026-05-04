import type { SimulationState, ProposerState } from "../engine/types.ts";
import { initializeState, startProposal, step } from "../engine/simulation.ts";
import { dropMessage, crashNode, restartNode, introduceProposal } from "../engine/faults.ts";
import { checkInvariants } from "../engine/invariants.ts";

export type PresetName =
  | "happy-path"
  | "competing-proposals"
  | "crash-recovery"
  | "message-loss";

export type Action =
  | { type: "STEP" }
  | { type: "START_PROPOSAL"; proposerId: string }
  | { type: "DROP_MESSAGE"; messageId: string }
  | { type: "CRASH_NODE"; nodeId: string }
  | { type: "RESTART_NODE"; nodeId: string }
  | { type: "NEW_PROPOSAL"; proposerId: string }
  | { type: "RESET" }
  | { type: "SET_SPEED"; ms: number }
  | { type: "TOGGLE_AUTOPLAY" }
  | { type: "LOAD_PRESET"; preset: PresetName };

export interface AppState {
  sim: SimulationState;
  autoPlay: boolean;
  speedMs: number;
  /** Incremented on every RESET and LOAD_PRESET so D3 knows to clear the SVG. */
  resetKey: number;
}

export function initialAppState(): AppState {
  return {
    sim: initializeState(),
    autoPlay: false,
    speedMs: 1250,
    resetKey: 0,
  };
}

// ─── Preset factory ───────────────────────────────────────────────────────────
//
// Each preset returns an initial SimulationState with the scenario *setup*
// applied (crashed nodes, queued messages, pre-dropped messages) but with
// zero engine steps executed. The user clicks Auto-play (or Step) to see
// the scenario unfold from the very first message delivery.

type Preset = {
  autoPlay: boolean;
  build:    () => SimulationState;
};

const PRESETS: Record<PresetName, Preset> = {
  "happy-path": {
    autoPlay: true,
    build: () => startProposal(initializeState(), "P1"),
  },

  "competing-proposals": {
    autoPlay: true,
    build: () => {
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      sim = introduceProposal(
        sim, "P2",
        (sim.nodes["P2"] as ProposerState).proposedValue
      );
      return sim;
    },
  },

  "crash-recovery": {
    autoPlay: true,
    build: () => {
      let sim = initializeState();
      sim = crashNode(sim, "A3");          // A3 down before any traffic
      sim = startProposal(sim, "P1");      // PREPAREs to A1, A2, A3 queued
      return sim;
    },
  },

  "message-loss": {
    autoPlay: true,
    build: () => {
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      const prepareToA2 = sim.messageQueue.find(
        (m) => m.type === "prepare" && m.to === "A2"
      )!;
      sim = dropMessage(sim, prepareToA2.id);
      return sim;
    },
  },
};

function buildPreset(preset: PresetName, speedMs: number, resetKey: number): AppState {
  const def = PRESETS[preset];
  return { sim: def.build(), autoPlay: def.autoPlay, speedMs, resetKey };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "STEP": {
      const sim = step(state.sim);
      checkInvariants(sim);
      return { ...state, sim };
    }

    case "START_PROPOSAL":
      return { ...state, sim: startProposal(state.sim, action.proposerId) };

    case "DROP_MESSAGE":
      return { ...state, sim: dropMessage(state.sim, action.messageId) };

    case "CRASH_NODE":
      return { ...state, sim: crashNode(state.sim, action.nodeId) };

    case "RESTART_NODE":
      return { ...state, sim: restartNode(state.sim, action.nodeId) };

    case "NEW_PROPOSAL": {
      const node  = state.sim.nodes[action.proposerId];
      const value = node.role === "proposer"
        ? (node as ProposerState).proposedValue
        : "?";
      return { ...state, sim: introduceProposal(state.sim, action.proposerId, value) };
    }

    case "RESET":
      return {
        ...initialAppState(),
        speedMs:  state.speedMs,
        resetKey: state.resetKey + 1,
      };

    case "SET_SPEED":
      return { ...state, speedMs: action.ms };

    case "TOGGLE_AUTOPLAY":
      return { ...state, autoPlay: !state.autoPlay };

    case "LOAD_PRESET":
      return buildPreset(action.preset, state.speedMs, state.resetKey + 1);
  }
}
