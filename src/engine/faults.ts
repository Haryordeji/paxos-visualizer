import type {
  SimulationState,
  NodeState,
  ProposerState,
  AcceptorState,
  Message,
  ProposalNumber,
} from "./types.ts";

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// dropMessage — mark a queued message as dropped; step() will skip it
// ---------------------------------------------------------------------------

export function dropMessage(
  state: SimulationState,
  messageId: string
): SimulationState {
  return {
    ...state,
    messageQueue: state.messageQueue.map((m) =>
      m.id === messageId ? { ...m, status: "dropped" as const } : m
    ),
  };
}

// ---------------------------------------------------------------------------
// crashNode — set status to "crashed"; stable storage (highestPromised,
// acceptedProposal) is preserved exactly as specified by the protocol.
// ---------------------------------------------------------------------------

export function crashNode(
  state: SimulationState,
  nodeId: string
): SimulationState {
  const node = state.nodes[nodeId];
  return {
    ...state,
    nodes: {
      ...state.nodes,
      [nodeId]: { ...node, status: "crashed" } as NodeState,
    },
  };
}

// ---------------------------------------------------------------------------
// restartNode — restore active/idle status; stable storage survives.
// Proposers clear any in-progress protocol tracking.
// ---------------------------------------------------------------------------

export function restartNode(
  state: SimulationState,
  nodeId: string
): SimulationState {
  const node = state.nodes[nodeId];

  if (node.role === "acceptor") {
    return {
      ...state,
      nodes: {
        ...state.nodes,
        [nodeId]: { ...node, status: "active" } as AcceptorState,
      },
    };
  }

  // Proposer: clear in-progress tracking, keep round counter
  const proposer = node as ProposerState;
  return {
    ...state,
    nodes: {
      ...state.nodes,
      [nodeId]: {
        ...proposer,
        status: "idle",
        currentProposal: null,
        promisesReceived: [],
        acceptsReceived: 0,
      } as ProposerState,
    },
  };
}

// ---------------------------------------------------------------------------
// introduceProposal — start a new proposal with a round number higher than
// any proposal number currently visible in the system (nodes + message queue).
// ---------------------------------------------------------------------------

function maxRoundInSystem(state: SimulationState): number {
  let max = 0;

  for (const node of Object.values(state.nodes)) {
    if (node.role === "proposer") {
      const p = node as ProposerState;
      max = Math.max(max, p.round);
      if (p.currentProposal) max = Math.max(max, p.currentProposal.round);
    } else {
      const a = node as AcceptorState;
      if (a.highestPromised) max = Math.max(max, a.highestPromised.round);
      if (a.acceptedProposal) max = Math.max(max, a.acceptedProposal.number.round);
    }
  }

  for (const msg of state.messageQueue) {
    max = Math.max(max, msg.proposalNumber.round);
    if (msg.type === "nack") max = Math.max(max, msg.highestPromised.round);
  }

  return max;
}

export function introduceProposal(
  state: SimulationState,
  proposerId: string,
  value: string
): SimulationState {
  const newRound = maxRoundInSystem(state) + 1;
  const proposalNumber: ProposalNumber = { round: newRound, nodeId: proposerId };
  const proposer = state.nodes[proposerId] as ProposerState;

  const acceptorIds = Object.values(state.nodes)
    .filter((n) => n.role === "acceptor")
    .map((n) => n.id);

  const prepareMessages: Message[] = acceptorIds.map((acceptorId) => ({
    id: newId(),
    type: "prepare" as const,
    from: proposerId,
    to: acceptorId,
    proposalNumber,
    status: "queued" as const,
  }));

  return {
    ...state,
    nodes: {
      ...state.nodes,
      [proposerId]: {
        ...proposer,
        round: newRound,
        currentProposal: proposalNumber,
        proposedValue: value,
        status: "phase1",
        promisesReceived: [],
        acceptsReceived: 0,
      } as ProposerState,
    },
    messageQueue: [...state.messageQueue, ...prepareMessages],
  };
}
