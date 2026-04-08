import { ConsensusStatus } from "./ConsensusStatus.tsx";
import { EventLog } from "./EventLog.tsx";
import { ProtocolExplainer } from "./ProtocolExplainer.tsx";

export function InfoPanel() {
  return (
    <aside className="info-panel">
      <ConsensusStatus />
      <EventLog />
      <ProtocolExplainer />
    </aside>
  );
}
