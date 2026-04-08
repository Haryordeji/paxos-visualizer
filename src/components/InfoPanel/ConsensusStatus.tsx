import { useSimulation } from "../../state/context.tsx";

export function ConsensusStatus() {
  const { state } = useSimulation();
  const { consensus } = state.sim;

  if (!consensus.reached) {
    return (
      <div className="consensus-status consensus-none">
        No consensus yet
      </div>
    );
  }

  return (
    <div className="consensus-status consensus-reached">
      <span className="consensus-dot" />
      Consensus: &ldquo;{consensus.value}&rdquo; — accepted by{" "}
      {consensus.acceptedBy.join(", ")}
    </div>
  );
}
