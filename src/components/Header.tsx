import { useSimulation } from "../state/context.tsx";

export function Header() {
  const { state } = useSimulation();
  return (
    <header className="app-header">
      <h1>Paxos Consensus Visualizer</h1>
      <span className="step-badge">Step {state.sim.stepCount}</span>
    </header>
  );
}
