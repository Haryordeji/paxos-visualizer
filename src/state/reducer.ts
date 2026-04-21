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
    speedMs: 500,
    resetKey: 0,
  };
}

// ─── Preset factory ───────────────────────────────────────────────────────────

function buildPreset(preset: PresetName, speedMs: number, resetKey: number): AppState {
  switch (preset) {
    case "happy-path": {
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      return { sim, autoPlay: true, speedMs, resetKey };
    }

    case "competing-proposals": {
      // P1 starts; deliver its 3 PREPAREs so PROMISEs are queued;
      // then P2 introduces a competing proposal with a higher round.
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      sim = step(sim); sim = step(sim); sim = step(sim); // deliver 3 PREPAREs
      sim = introduceProposal(
        sim, "P2",
        (sim.nodes["P2"] as ProposerState).proposedValue
      );
      return { sim, autoPlay: true, speedMs, resetKey };
    }

    case "crash-recovery": {
      // P1 starts; deliver 3 PREPAREs then 2 PROMISEs so P1 reaches majority
      // and moves to phase2; then crash A3 before its ACCEPT arrives.
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      sim = step(sim); sim = step(sim); sim = step(sim); // deliver 3 PREPAREs → PROMISEs enqueued
      sim = step(sim); sim = step(sim);                  // deliver 2 PROMISEs → P1 reaches phase2
      sim = crashNode(sim, "A3");
      return { sim, autoPlay: true, speedMs, resetKey };
    }

    case "message-loss": {
      // P1 starts; drop 2 of 3 PREPAREs so P1 can only get ≤1 promise and stalls.
      let sim = initializeState();
      sim = startProposal(sim, "P1");
      const toDrop = sim.messageQueue
        .filter(m => m.type === "prepare")
        .slice(1); // keep first PREPARE (P1→A1), drop the other two
      for (const m of toDrop) sim = dropMessage(sim, m.id);
      return { sim, autoPlay: false, speedMs, resetKey };
    }
  }
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
