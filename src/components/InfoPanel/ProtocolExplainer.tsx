import { useSimulation } from "../../state/context.tsx";
import type { Message } from "../../engine/types.ts";

function formatPN(round: number, nodeId: string): string {
  return `(${round}, ${nodeId})`;
}

function explain(msg: Message): string {
  const pn = formatPN(msg.proposalNumber.round, msg.proposalNumber.nodeId);
  const dropped = msg.status === "dropped";

  if (dropped) {
    return `Message from ${msg.from} to ${msg.to} was dropped and ignored.`;
  }

  switch (msg.type) {
    case "prepare":
      return `${msg.from} sent PREPARE ${pn} to ${msg.to}, asking it to promise not to accept lower proposals.`;

    case "promise":
      if (msg.accepted) {
        return `${msg.from} promised ${pn} to ${msg.to}, and reported a prior accepted value: "${msg.accepted.value}" at ${formatPN(msg.accepted.number.round, msg.accepted.number.nodeId)}.`;
      }
      return `${msg.from} promised ${pn} to ${msg.to}. No prior accepted value.`;

    case "accept":
      return `${msg.from} sent ACCEPT ${pn} "${msg.value}" to ${msg.to} — requesting acceptance of this value.`;

    case "accepted":
      return `${msg.from} accepted proposal ${pn} and committed value "${msg.value}". Notifying ${msg.to}.`;

    case "nack":
      return `${msg.from} rejected ${pn} — it has already promised ${formatPN(msg.highestPromised.round, msg.highestPromised.nodeId)}. Notifying ${msg.to}.`;
  }
}

export function ProtocolExplainer() {
  const { state } = useSimulation();
  const { deliveredMessages, consensus } = state.sim;
  const last = deliveredMessages[deliveredMessages.length - 1];

  let text: string;
  if (consensus.reached) {
    text = `Consensus reached on value "${consensus.value}", accepted by ${consensus.acceptedBy.join(" and ")}.`;
  } else if (last) {
    text = explain(last);
  } else {
    text = 'Click "Start Proposal" on a proposer node to begin, then click Step to advance the simulation.';
  }

  return (
    <div className="protocol-explainer">
      <div className="explainer-title">Last step</div>
      {text}
    </div>
  );
}
