import { NodeCard } from "./NodeCard.tsx";

const NODE_ORDER = ["P1", "P2", "A1", "A2", "A3"] as const;

export function NodePanel() {
  return (
    <aside className="node-panel">
      <div className="node-panel-title">Nodes</div>
      {NODE_ORDER.map((id) => (
        <NodeCard key={id} nodeId={id} />
      ))}
    </aside>
  );
}
