import { useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { useSimulation } from "../../state/context.tsx";
import type {
  NodeState,
  ProposerState,
  AcceptorState,
  ProposalNumber,
  AcceptedProposal,
} from "../../engine/types.ts";

// ─── Background colours used by Framer Motion ────────────────────────────────
const BG = {
  normal:    "rgba(28, 32, 56, 1)",
  crashed:   "rgba(255, 107, 107, 0.12)",
  consensus: "rgba(195, 232, 141, 0.07)",
  flash:     "rgba(130, 170, 255, 0.22)",
  restart:   "rgba(195, 232, 141, 0.25)",
} as const;

const SHADOW = {
  none:      "0 0 0 0px rgba(195, 232, 141, 0)",
  consensus: "0 0 0 1.5px rgba(195, 232, 141, 0.55), 0 0 18px 3px rgba(195, 232, 141, 0.18)",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPN(pn: ProposalNumber | null): string {
  return pn ? `(${pn.round}, ${pn.nodeId})` : "—";
}

function formatAccepted(ap: AcceptedProposal | null): string {
  return ap ? `${formatPN(ap.number)} = "${ap.value}"` : "—";
}

function restingBg(status: string, inConsensus: boolean): string {
  if (inConsensus) return BG.consensus;
  if (status === "crashed") return BG.crashed;
  return BG.normal;
}

/** A stable string representing the parts of node state we care about animating. */
function fingerprint(node: NodeState, inConsensus: boolean): string {
  if (node.role === "proposer") {
    const p = node as ProposerState;
    return `${p.status}|${p.promisesReceived.length}|${p.acceptsReceived}|${inConsensus}`;
  }
  const a = node as AcceptorState;
  const hp = a.highestPromised
    ? `${a.highestPromised.round},${a.highestPromised.nodeId}`
    : "null";
  const ap = a.acceptedProposal
    ? `${a.acceptedProposal.number.round},${a.acceptedProposal.number.nodeId},${a.acceptedProposal.value}`
    : "null";
  return `${a.status}|${hp}|${ap}|${inConsensus}`;
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────

interface NodeCardProps { nodeId: string }

export function NodeCard({ nodeId }: NodeCardProps) {
  const { state, dispatch } = useSimulation();
  const node        = state.sim.nodes[nodeId];
  const inConsensus = state.sim.consensus.acceptedBy.includes(nodeId);
  const controls    = useAnimation();

  const fp            = fingerprint(node, inConsensus);
  const prevFpRef     = useRef<string>("");
  const prevStatusRef = useRef<string>(node.status);
  const prevConsRef   = useRef<boolean>(inConsensus);

  useEffect(() => {
    if (prevFpRef.current === "") {
      prevFpRef.current     = fp;
      prevStatusRef.current = node.status;
      prevConsRef.current   = inConsensus;
      return;
    }
    if (fp === prevFpRef.current) return;

    const wasCrashed    = prevStatusRef.current === "crashed";
    const isCrashed     = node.status === "crashed";
    const justCrashed   = isCrashed && !wasCrashed;
    const justRestarted = !isCrashed && wasCrashed;
    const justConsensus = inConsensus && !prevConsRef.current;
    const target        = restingBg(node.status, inConsensus);

    if (justCrashed) {
      void controls.start({
        backgroundColor: BG.crashed,
        x: [0, -7, 7, -5, 5, -2, 2, 0],
        transition: { duration: 0.45, ease: "easeOut" },
      });
    } else if (justRestarted) {
      void controls.start({
        scale: [1, 1.04, 1],
        backgroundColor: [BG.restart, target],
        transition: { duration: 0.5, ease: "easeOut" },
      });
    } else if (justConsensus) {
      void controls.start({
        backgroundColor: BG.consensus,
        boxShadow: SHADOW.consensus,
        transition: { duration: 0.55 },
      });
    } else {
      void controls.start({
        backgroundColor: [BG.flash, target],
        boxShadow: inConsensus ? SHADOW.consensus : SHADOW.none,
        transition: { duration: 0.45, times: [0, 1] },
      });
    }

    prevFpRef.current     = fp;
    prevStatusRef.current = node.status;
    prevConsRef.current   = inConsensus;
  }, [fp, node.status, inConsensus, controls]);

  function handleCardClick(e: React.MouseEvent) {
    // Let button clicks pass through — only respond to card-level clicks
    if ((e.target as HTMLElement).closest("button")) return;
    if (node.status === "crashed") {
      dispatch({ type: "RESTART_NODE", nodeId });
    } else {
      dispatch({ type: "CRASH_NODE", nodeId });
    }
  }

  const cardClass = [
    "node-card",
    node.status === "crashed" ? "crashed" : "",
    inConsensus ? "consensus" : "",
  ].filter(Boolean).join(" ");

  return (
    <motion.div
      className={cardClass}
      animate={controls}
      initial={{ backgroundColor: restingBg(node.status, inConsensus), boxShadow: inConsensus ? SHADOW.consensus : SHADOW.none }}
      onClick={handleCardClick}
      title={node.status === "crashed" ? "Click to restart" : "Click to crash"}
      style={{ cursor: "pointer" }}
    >
      <div className="node-card-header">
        <span>
          <span className="node-id">{nodeId}</span>
          <span className="node-role">{node.role}</span>
        </span>
        <span className="node-card-header-right">
          <span className={`status-badge status-${node.status}`}>{node.status}</span>
          <span className="crash-hint">
            {node.status === "crashed" ? "↺" : "×"}
          </span>
        </span>
      </div>

      <div className="node-fields">
        {node.role === "proposer"
          ? <ProposerFields node={node as ProposerState} />
          : <AcceptorFields node={node as AcceptorState} />}
      </div>

      {node.role === "proposer" && (
        <div className="node-card-actions">
          <StartProposalButton nodeId={nodeId} node={node as ProposerState} dispatch={dispatch} />
          <NewProposalButton   nodeId={nodeId} node={node as ProposerState} dispatch={dispatch} />
        </div>
      )}
    </motion.div>
  );
}

// ─── Field sub-components ─────────────────────────────────────────────────────

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
  const inFlight = node.status === "phase1" || node.status === "phase2";
  return (
    <button
      className="btn-start-proposal"
      disabled={!canStart}
      onClick={() => dispatch({ type: "START_PROPOSAL", proposerId: nodeId })}
    >
      {inFlight ? "Proposing…" : "Start Proposal"}
    </button>
  );
}

function NewProposalButton({
  nodeId,
  node,
  dispatch,
}: {
  nodeId: string;
  node: ProposerState;
  dispatch: ReturnType<typeof useSimulation>["dispatch"];
}) {
  const disabled = node.status === "crashed";
  return (
    <button
      className="btn-new-proposal"
      disabled={disabled}
      onClick={() => dispatch({ type: "NEW_PROPOSAL", proposerId: nodeId })}
      title="Introduce a competing proposal with a higher round number"
    >
      New Proposal
    </button>
  );
}
