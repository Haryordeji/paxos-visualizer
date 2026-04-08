import type { SimulationState, ProposerState } from "../engine/types.ts";
import { initializeState, startProposal, step } from "../engine/simulation.ts";
import { dropMessage, crashNode, restartNode, introduceProposal } from "../engine/faults.ts";

export type Action =
  | { type: "STEP" }
  | { type: "START_PROPOSAL"; proposerId: string }
  | { type: "DROP_MESSAGE"; messageId: string }
  | { type: "CRASH_NODE"; nodeId: string }
  | { type: "RESTART_NODE"; nodeId: string }
  | { type: "NEW_PROPOSAL"; proposerId: string }
  | { type: "RESET" }
  | { type: "SET_SPEED"; ms: number }
  | { type: "TOGGLE_AUTOPLAY" };

export interface AppState {
  sim: SimulationState;
  autoPlay: boolean;
  speedMs: number;
}

export function initialAppState(): AppState {
  return {
    sim: initializeState(),
    autoPlay: false,
    speedMs: 800,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "STEP":
      return { ...state, sim: step(state.sim) };

    case "START_PROPOSAL":
      return { ...state, sim: startProposal(state.sim, action.proposerId) };

    case "DROP_MESSAGE":
      return { ...state, sim: dropMessage(state.sim, action.messageId) };

    case "CRASH_NODE":
      return { ...state, sim: crashNode(state.sim, action.nodeId) };

    case "RESTART_NODE":
      return { ...state, sim: restartNode(state.sim, action.nodeId) };

    case "NEW_PROPOSAL": {
      const node = state.sim.nodes[action.proposerId];
      const value = node.role === "proposer"
        ? (node as ProposerState).proposedValue
        : "?";
      return { ...state, sim: introduceProposal(state.sim, action.proposerId, value) };
    }

    case "RESET":
      return { ...initialAppState(), speedMs: state.speedMs };

    case "SET_SPEED":
      return { ...state, speedMs: action.ms };

    case "TOGGLE_AUTOPLAY":
      return { ...state, autoPlay: !state.autoPlay };
  }
}
