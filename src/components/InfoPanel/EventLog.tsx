import { useSimulation } from "../../state/context.tsx";
import type { Message } from "../../engine/types.ts";

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

function DeliveredEntry({ msg }: { msg: Message }) {
  const isDropped = msg.status === "dropped";
  return (
    <div className={`event-entry ${isDropped ? "event-dropped" : "event-delivered"}`}>
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

function QueuedEntry({ msg }: { msg: Message }) {
  const cssClass = msg.status === "dropped" ? "msg-dropped" : `msg-${msg.type}`;
  return (
    <div className="queue-entry">
      <span className="queue-dot" />
      <span className={cssClass}>{msg.from} → {msg.to}: {messageLabel(msg)}</span>
      {msg.status === "dropped" && (
        <span style={{ fontSize: 10, color: "var(--red)", marginLeft: 4 }}>
          [dropped]
        </span>
      )}
    </div>
  );
}

export function EventLog() {
  const { state } = useSimulation();
  const { deliveredMessages, messageQueue } = state.sim;

  // Show delivered in reverse (most recent at top)
  const delivered = [...deliveredMessages].reverse();

  return (
    <div className="event-log">
      <div className="event-log-title">Event Log</div>

      {delivered.length === 0 && (
        <div className="event-log-empty">No messages yet.</div>
      )}

      {delivered.map((msg) => (
        <DeliveredEntry key={msg.id} msg={msg} />
      ))}

      {messageQueue.length > 0 && (
        <div className="queue-section">
          <div className="queue-title">Queued ({messageQueue.length})</div>
          {messageQueue.map((msg) => (
            <QueuedEntry key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
