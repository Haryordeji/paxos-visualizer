// --- Proposal numbers ---
export interface ProposalNumber {
  round: number;
  nodeId: string;
}

// --- Accepted proposal (stored by acceptors) ---
export interface AcceptedProposal {
  number: ProposalNumber;
  value: string;
}

// --- Promise info (collected by proposers during Phase 1) ---
export interface PromiseInfo {
  from: string;
  accepted: AcceptedProposal | null;
}

// --- Node types ---
export interface ProposerState {
  id: string;
  role: "proposer";
  status: "idle" | "phase1" | "phase2" | "done" | "crashed";
  currentProposal: ProposalNumber | null;
  proposedValue: string;
  promisesReceived: PromiseInfo[];
  acceptsReceived: number;
  round: number;
}

export interface AcceptorState {
  id: string;
  role: "acceptor";
  status: "active" | "crashed";
  highestPromised: ProposalNumber | null;
  acceptedProposal: AcceptedProposal | null;
}

export type NodeState = ProposerState | AcceptorState;

// --- Message status ---
export type MessageStatus = "queued" | "in-flight" | "delivered" | "dropped";

// --- Messages ---
export type Message =
  | { id: string; type: "prepare";  from: string; to: string; proposalNumber: ProposalNumber; status: MessageStatus }
  | { id: string; type: "promise";  from: string; to: string; proposalNumber: ProposalNumber; accepted: AcceptedProposal | null; status: MessageStatus }
  | { id: string; type: "accept";   from: string; to: string; proposalNumber: ProposalNumber; value: string; status: MessageStatus }
  | { id: string; type: "accepted"; from: string; to: string; proposalNumber: ProposalNumber; value: string; status: MessageStatus }
  | { id: string; type: "nack";     from: string; to: string; proposalNumber: ProposalNumber; highestPromised: ProposalNumber; status: MessageStatus }

// --- Top-level simulation state ---
export interface SimulationState {
  nodes: Record<string, NodeState>;
  messageQueue: Message[];
  deliveredMessages: Message[];
  stepCount: number;
  consensus: {
    reached: boolean;
    value: string | null;
    acceptedBy: string[];
  };
}
