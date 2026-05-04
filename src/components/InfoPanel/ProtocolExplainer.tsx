import { AnimatePresence, motion } from "framer-motion";
import { useSimulation } from "../../state/context.tsx";
import type { Message, SimulationState } from "../../engine/types.ts";

function pn(round: number, nodeId: string): string {
  return `(${round}, ${nodeId})`;
}

/**
 * Plain-English description of what a message means in protocol terms.
 * Position-independent: describes the message itself, not "what just happened."
 * Safe to call for delivered, queued, or dropped messages.
 */
export function explainMessage(msg: Message, _state: SimulationState): string {
  const n = pn(msg.proposalNumber.round, msg.proposalNumber.nodeId);

  if (msg.status === "dropped") {
    return `${msg.from}→${msg.to} ${msg.type.toUpperCase()} ${n} was dropped`;
  }

  switch (msg.type) {
    case "prepare":
      return `${msg.from} sent Prepare ${n} to ${msg.to} — asking it to promise not to accept lower proposals`;

    case "promise":
      if (msg.accepted) {
        const { round, nodeId } = msg.accepted.number;
        return `${msg.from} promised ${n} to ${msg.to} — prior accepted: "${msg.accepted.value}" at ${pn(round, nodeId)}`;
      }
      return `${msg.from} promised ${n} to ${msg.to} — no prior accepted value`;

    case "accept":
      return `${msg.from} sent Accept ${n} "${msg.value}" to ${msg.to} — requesting acceptance`;

    case "accepted":
      return `${msg.from} accepted proposal ${n} "${msg.value}" — notifying ${msg.to}`;

    case "nack":
      return `${msg.from} rejected ${n} — already promised ${pn(msg.highestPromised.round, msg.highestPromised.nodeId)}`;
  }
}

export function ProtocolExplainer() {
  const { state } = useSimulation();
  const { deliveredMessages, consensus } = state.sim;
  const last = deliveredMessages[deliveredMessages.length - 1];

  const text = consensus.reached
    ? `Consensus reached on "${consensus.value}", accepted by ${consensus.acceptedBy.join(", ")}.`
    : last
    ? explainMessage(last, state.sim)
    : 'Click "Start Proposal" on a proposer, then Step to advance.';

  const key = last ? last.id : "empty";

  return (
    <div className="protocol-explainer">
      <div className="explainer-title">Last step</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="explainer-text"
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
