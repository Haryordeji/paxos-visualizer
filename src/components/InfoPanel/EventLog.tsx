import { useSimulation } from "../../state/context.tsx";
import type { Message, SimulationState } from "../../engine/types.ts";
import type { ScriptLogEntry } from "../../script/types.ts";
import { explainMessage } from "./ProtocolExplainer.tsx";
import { describeScriptEvent } from "../../script/runner.ts";

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

function ScriptEntry({ entry }: { entry: ScriptLogEntry }) {
  if (entry.kind === "system") {
    return (
      <div
        className="event-entry event-script event-script-warning"
        title={entry.warning}
      >
        <span className="event-icon">⚠</span>
        <div className="event-body">
          <span className="event-route">Script · step {entry.firedAtStep}</span>
          <span className="event-label">{entry.warning}</span>
        </div>
      </div>
    );
  }
  const isWarning = typeof entry.outcome === "object";
  const description = describeScriptEvent(entry.event);
  const detail =
    typeof entry.outcome === "object" ? entry.outcome.warning : description;
  return (
    <div
      className={`event-entry event-script ${isWarning ? "event-script-warning" : ""}`}
      title={detail}
    >
      <span className="event-icon">{isWarning ? "⚠" : "▸"}</span>
      <div className="event-body">
        <span className="event-route">Script · step {entry.firedAtStep}</span>
        <span className="event-label">
          {isWarning ? detail : description}
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

type LogItem =
  | { kind: "msg"; msg: Message; key: string }
  | { kind: "script"; entry: ScriptLogEntry; key: string };

function buildInterleavedLog(
  delivered: readonly Message[],
  scriptLog: readonly ScriptLogEntry[]
): LogItem[] {
  const items: LogItem[] = [];
  let scriptIdx = 0;
  // Script entries with precedingDeliveredCount === 0 render at the top.
  while (
    scriptIdx < scriptLog.length &&
    scriptLog[scriptIdx].precedingDeliveredCount === 0
  ) {
    items.push({
      kind: "script",
      entry: scriptLog[scriptIdx],
      key: `s${scriptIdx}`,
    });
    scriptIdx++;
  }
  for (let i = 0; i < delivered.length; i++) {
    const msg = delivered[i];
    items.push({ kind: "msg", msg, key: msg.id });
    while (
      scriptIdx < scriptLog.length &&
      scriptLog[scriptIdx].precedingDeliveredCount === i + 1
    ) {
      items.push({
        kind: "script",
        entry: scriptLog[scriptIdx],
        key: `s${scriptIdx}`,
      });
      scriptIdx++;
    }
  }
  // Any trailing script entries beyond the delivered count.
  while (scriptIdx < scriptLog.length) {
    items.push({
      kind: "script",
      entry: scriptLog[scriptIdx],
      key: `s${scriptIdx}`,
    });
    scriptIdx++;
  }
  return items;
}

export function EventLog() {
  const { state, dispatch } = useSimulation();
  const { deliveredMessages, messageQueue } = state.sim;
  const { scriptLog } = state;

  const items = buildInterleavedLog(deliveredMessages, scriptLog);
  const reversed = [...items].reverse();

  function handleDrop(messageId: string) {
    dispatch({ type: "DROP_MESSAGE", messageId });
  }

  return (
    <div className="event-log">
      <div className="event-log-title">Event Log</div>

      {reversed.length === 0 && (
        <div className="event-log-empty">No messages yet.</div>
      )}

      {reversed.map((item) =>
        item.kind === "msg" ? (
          <DeliveredEntry key={item.key} msg={item.msg} sim={state.sim} />
        ) : (
          <ScriptEntry key={item.key} entry={item.entry} />
        )
      )}

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
