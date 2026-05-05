import type {
  SimulationState,
  ProposerState,
  AcceptorState,
  Message,
  ProposalNumber,
} from "./types.ts";
import {
  compareProposalNumbers,
  isGreaterThan,
  isGreaterThanOrEqual,
} from "./proposalNumber.ts";

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// initializeState
// ---------------------------------------------------------------------------

export function initializeState(): SimulationState {
  return {
    nodes: {
      P1: {
        id: "P1",
        role: "proposer",
        status: "idle",
        currentProposal: null,
        proposedValue: "A",
        promisesReceived: [],
        acceptsReceived: 0,
        round: 0,
      },
      P2: {
        id: "P2",
        role: "proposer",
        status: "idle",
        currentProposal: null,
        proposedValue: "B",
        promisesReceived: [],
        acceptsReceived: 0,
        round: 0,
      },
      A1: { id: "A1", role: "acceptor", status: "active", highestPromised: null, acceptedProposal: null },
      A2: { id: "A2", role: "acceptor", status: "active", highestPromised: null, acceptedProposal: null },
      A3: { id: "A3", role: "acceptor", status: "active", highestPromised: null, acceptedProposal: null },
    },
    messageQueue: [],
    deliveredMessages: [],
    stepCount: 0,
    consensus: { reached: false, value: null, acceptedBy: [] },
  };
}

// ---------------------------------------------------------------------------
// startProposal — kicks off Phase 1 by enqueuing PREPARE to all acceptors
// ---------------------------------------------------------------------------

export function startProposal(
  state: SimulationState,
  proposerId: string
): SimulationState {
  const proposer = state.nodes[proposerId] as ProposerState;
  const newRound = proposer.round + 1;
  const proposalNumber: ProposalNumber = { round: newRound, nodeId: proposerId };

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
        status: "phase1",
        promisesReceived: [],
        acceptsReceived: 0,
      },
    },
    messageQueue: [...state.messageQueue, ...prepareMessages],
  };
}

// ---------------------------------------------------------------------------
// checkConsensus — called after every step
// ---------------------------------------------------------------------------

function checkConsensus(state: SimulationState): SimulationState {
  // Don't downgrade a consensus that's already been reached
  if (state.consensus.reached) return state;

  const acceptors = Object.values(state.nodes).filter(
    (n) => n.role === "acceptor"
  ) as AcceptorState[];

  const valueCounts = new Map<string, string[]>();
  for (const a of acceptors) {
    if (a.acceptedProposal !== null) {
      const v = a.acceptedProposal.value;
      const existing = valueCounts.get(v) ?? [];
      valueCounts.set(v, [...existing, a.id]);
    }
  }

  for (const [value, ids] of valueCounts) {
    if (ids.length >= 2) {
      return { ...state, consensus: { reached: true, value, acceptedBy: ids } };
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// step — deliver one message and process protocol rules
// ---------------------------------------------------------------------------

export function step(state: SimulationState): SimulationState {
  if (state.messageQueue.length === 0) return state;

  const [message, ...remainingQueue] = state.messageQueue;
  let s: SimulationState = {
    ...state,
    messageQueue: remainingQueue,
    stepCount: state.stepCount + 1,
  };

  // Pre-marked dropped — just log it
  if (message.status === "dropped") {
    return {
      ...s,
      deliveredMessages: [...s.deliveredMessages, message],
    };
  }

  const sender    = s.nodes[message.from];
  const recipient = s.nodes[message.to];

  // Crashed sender — message cannot be delivered
  if (sender.status === "crashed") {
    return {
      ...s,
      deliveredMessages: [
        ...s.deliveredMessages,
        { ...message, status: "dropped" },
      ],
    };
  }

  // Crashed recipient — message is lost
  if (recipient.status === "crashed") {
    return {
      ...s,
      deliveredMessages: [
        ...s.deliveredMessages,
        { ...message, status: "dropped" },
      ],
    };
  }

  const newMessages: Message[] = [];
  let updatedNodes = { ...s.nodes };

  switch (message.type) {
    case "prepare": {
      const acceptor = recipient as AcceptorState;
      if (
        acceptor.highestPromised === null ||
        isGreaterThan(message.proposalNumber, acceptor.highestPromised)
      ) {
        updatedNodes[acceptor.id] = {
          ...acceptor,
          highestPromised: message.proposalNumber,
        };
        newMessages.push({
          id: newId(),
          type: "promise",
          from: acceptor.id,
          to: message.from,
          proposalNumber: message.proposalNumber,
          accepted: acceptor.acceptedProposal,
          status: "queued",
        });
      } else {
        newMessages.push({
          id: newId(),
          type: "nack",
          from: acceptor.id,
          to: message.from,
          proposalNumber: message.proposalNumber,
          highestPromised: acceptor.highestPromised,
          status: "queued",
        });
      }
      break;
    }

    case "promise": {
      const proposer = recipient as ProposerState;
      // Stale check: must be in phase1 and proposal number must match
      if (
        proposer.status !== "phase1" ||
        proposer.currentProposal === null ||
        compareProposalNumbers(proposer.currentProposal, message.proposalNumber) !== 0
      ) {
        break;
      }

      const newPromises = [
        ...proposer.promisesReceived,
        { from: message.from, accepted: message.accepted },
      ];
      let updatedProposer: ProposerState = { ...proposer, promisesReceived: newPromises };

      if (newPromises.length >= 2) {
        // Value selection rule (P2b): use the value from the highest-numbered
        // accepted proposal among promises; fall back to own value if none.
        const withAccepted = newPromises.filter((p) => p.accepted !== null);
        let chosenValue = proposer.proposedValue;
        if (withAccepted.length > 0) {
          const highest = withAccepted.reduce((best, p) =>
            isGreaterThan(p.accepted!.number, best.accepted!.number) ? p : best
          );
          chosenValue = highest.accepted!.value;
        }

        updatedProposer = { ...updatedProposer, status: "phase2" };

        // Per Lamport: send ACCEPT only to acceptors that promised.
        for (const promise of newPromises) {
          newMessages.push({
            id: newId(),
            type: "accept",
            from: proposer.id,
            to: promise.from,
            proposalNumber: proposer.currentProposal,
            value: chosenValue,
            status: "queued",
          });
        }
      }

      updatedNodes[proposer.id] = updatedProposer;
      break;
    }

    case "nack": {
      const proposer = recipient as ProposerState;
      // Performance optimization: bump our round above the nack's highestPromised
      if (proposer.status === "phase1" || proposer.status === "phase2") {
        const newRound = Math.max(proposer.round, message.highestPromised.round) + 1;
        updatedNodes[proposer.id] = { ...proposer, round: newRound };
      }
      break;
    }

    case "accept": {
      const acceptor = recipient as AcceptorState;
      if (
        acceptor.highestPromised === null ||
        isGreaterThanOrEqual(message.proposalNumber, acceptor.highestPromised)
      ) {
        updatedNodes[acceptor.id] = {
          ...acceptor,
          highestPromised: message.proposalNumber,
          acceptedProposal: { number: message.proposalNumber, value: message.value },
        };
        newMessages.push({
          id: newId(),
          type: "accepted",
          from: acceptor.id,
          to: message.from,
          proposalNumber: message.proposalNumber,
          value: message.value,
          status: "queued",
        });
      } else {
        newMessages.push({
          id: newId(),
          type: "nack",
          from: acceptor.id,
          to: message.from,
          proposalNumber: message.proposalNumber,
          highestPromised: acceptor.highestPromised,
          status: "queued",
        });
      }
      break;
    }

    case "accepted": {
      const proposer = recipient as ProposerState;
      // Stale check
      if (
        proposer.status !== "phase2" ||
        proposer.currentProposal === null ||
        compareProposalNumbers(proposer.currentProposal, message.proposalNumber) !== 0
      ) {
        break;
      }
      const newAcceptsReceived = proposer.acceptsReceived + 1;
      updatedNodes[proposer.id] = {
        ...proposer,
        acceptsReceived: newAcceptsReceived,
        status: newAcceptsReceived >= 2 ? "done" : proposer.status,
      };
      break;
    }
  }

  s = {
    ...s,
    nodes: updatedNodes,
    messageQueue: [...s.messageQueue, ...newMessages],
    deliveredMessages: [...s.deliveredMessages, { ...message, status: "delivered" }],
  };

  return checkConsensus(s);
}

// ---------------------------------------------------------------------------
// stepAll — convenience helper for tests: run until queue is empty
// ---------------------------------------------------------------------------

export function stepAll(state: SimulationState): SimulationState {
  let s = state;
  while (s.messageQueue.length > 0) {
    s = step(s);
  }
  return s;
}
