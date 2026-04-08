import { useSimulation } from "../../state/context.tsx";
import type { ProposerState, AcceptorState, ProposalNumber, AcceptedProposal } from "../../engine/types.ts";

function formatPN(pn: ProposalNumber | null): string {
  if (!pn) return "—";
  return `(${pn.round}, ${pn.nodeId})`;
}

function formatAccepted(ap: AcceptedProposal | null): string {
  if (!ap) return "—";
  return `${formatPN(ap.number)} = "${ap.value}"`;
}

interface NodeCardProps {
  nodeId: string;
}

export function NodeCard({ nodeId }: NodeCardProps) {
  const { state, dispatch } = useSimulation();
  const node = state.sim.nodes[nodeId];
  const inConsensus = state.sim.consensus.acceptedBy.includes(nodeId);

  const cardClass = [
    "node-card",
    node.status === "crashed" ? "crashed" : "",
    inConsensus ? "consensus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusClass = `status-badge status-${node.status}`;

  return (
    <div className={cardClass}>
      <div className="node-card-header">
        <span>
          <span className="node-id">{nodeId}</span>
          <span className="node-role">{node.role}</span>
        </span>
        <span className={statusClass}>{node.status}</span>
      </div>

      <div className="node-fields">
        {node.role === "proposer" ? (
          <ProposerFields node={node as ProposerState} />
        ) : (
          <AcceptorFields node={node as AcceptorState} />
        )}
      </div>

      {node.role === "proposer" && (
        <div className="node-card-actions">
          <StartProposalButton nodeId={nodeId} node={node as ProposerState} dispatch={dispatch} />
        </div>
      )}
    </div>
  );
}

function ProposerFields({ node }: { node: ProposerState }) {
  return (
    <>
      <div className="node-field">
        <span className="field-label">value</span>
        <span className="field-value highlight">"{node.proposedValue}"</span>
      </div>
      <div className="node-field">
        <span className="field-label">proposal</span>
        <span className="field-value">{formatPN(node.currentProposal)}</span>
      </div>
      <div className="node-field">
        <span className="field-label">promises</span>
        <span className="field-value">{node.promisesReceived.length}/3</span>
      </div>
      <div className="node-field">
        <span className="field-label">accepts</span>
        <span className="field-value">{node.acceptsReceived}/3</span>
      </div>
    </>
  );
}

function AcceptorFields({ node }: { node: AcceptorState }) {
  return (
    <>
      <div className="node-field">
        <span className="field-label">promised</span>
        <span className="field-value">{formatPN(node.highestPromised)}</span>
      </div>
      <div className="node-field">
        <span className="field-label">accepted</span>
        <span className="field-value">{formatAccepted(node.acceptedProposal)}</span>
      </div>
    </>
  );
}

function StartProposalButton({
  nodeId,
  node,
  dispatch,
}: {
  nodeId: string;
  node: ProposerState;
  dispatch: ReturnType<typeof useSimulation>["dispatch"];
}) {
  const canStart = node.status === "idle" || node.status === "done";
  return (
    <button
      className="btn-start-proposal"
      disabled={!canStart}
      onClick={() => dispatch({ type: "START_PROPOSAL", proposerId: nodeId })}
    >
      {node.status === "phase1" || node.status === "phase2"
        ? "Proposing…"
        : "Start Proposal"}
    </button>
  );
}
