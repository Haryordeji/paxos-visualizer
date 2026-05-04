import { useSimulation } from "../../state/context.tsx";
import type { Message, SimulationState } from "../../engine/types.ts";
import { explainMessage } from "./ProtocolExplainer.tsx";

function formatPN(round: number, nodeId: string): string {
  return `(${round},${nodeId})`;
}

function messageLabel(msg: Message): string {
  const pn = formatPN(msg.proposalNumber.round, msg.proposalNumber.nodeId);
  switch (msg.type) {
    case "prepare":  return `P${pn}`;
    case "promise":  return msg.accepted
      ? `PR${pn} → "${msg.accepted.value}"`
      : `PR${pn}`;
    case "accept":   return `A${pn} "${msg.value}"`;
    case "accepted": return `OK${pn} "${msg.value}"`;
    case "nack":     return `✗${pn}`;
  }
}

function messageCssClass(msg: Message): string {
  if (msg.status === "dropped") return "msg-dropped";
  return `msg-${msg.type}`;
}

function DeliveredEntry({ msg, sim }: { msg: Message; sim: SimulationState }) {
  const isDropped = msg.status === "dropped";
  return (
    <div
      className={`event-entry ${isDropped ? "event-dropped" : "event-delivered"}`}
      title={explainMessage(msg, sim)}
    >
      <span className="event-icon">{isDropped ? "✗" : "✓"}</span>
      <div className="event-body">
        <span className="event-route">
          {msg.from} → {msg.to}
        </span>
        <span className={`event-label ${messageCssClass(msg)}`}>
          {messageLabel(msg)}
        </span>
      </div>
    </div>
  );
}

function QueuedEntry({
  msg,
  sim,
  onDrop,
}: {
  msg: Message;
  sim: SimulationState;
  onDrop: (id: string) => void;
}) {
  const alreadyDropped = msg.status === "dropped";
  const cssClass = alreadyDropped ? "msg-dropped" : `msg-${msg.type}`;

  return (
    <div
      className={`queue-entry ${alreadyDropped ? "" : "queue-entry-droppable"}`}
      onClick={alreadyDropped ? undefined : () => onDrop(msg.id)}
      title={explainMessage(msg, sim)}
    >
      <span className="queue-dot" />
      <span className={cssClass}>
        {msg.from} → {msg.to}: {messageLabel(msg)}
      </span>
      {alreadyDropped ? (
        <span className="queue-dropped-tag">[dropped]</span>
      ) : (
        <span className="queue-drop-hint">✗</span>
      )}
    </div>
  );
}

export function EventLog() {
  const { state, dispatch } = useSimulation();
  const { deliveredMessages, messageQueue } = state.sim;

  const delivered = [...deliveredMessages].reverse();

  function handleDrop(messageId: string) {
    dispatch({ type: "DROP_MESSAGE", messageId });
  }

  return (
    <div className="event-log">
      <div className="event-log-title">Event Log</div>

      {delivered.length === 0 && (
        <div className="event-log-empty">No messages yet.</div>
      )}

      {delivered.map((msg) => (
        <DeliveredEntry key={msg.id} msg={msg} sim={state.sim} />
      ))}

      {messageQueue.length > 0 && (
        <div className="queue-section">
          <div className="queue-title">
            Queued ({messageQueue.length})
            <span className="queue-title-hint"> — click to drop</span>
          </div>
          {messageQueue.map((msg) => (
            <QueuedEntry key={msg.id} msg={msg} sim={state.sim} onDrop={handleDrop} />
          ))}
        </div>
      )}
    </div>
  );
}
