import { useSimulation } from "../../state/context.tsx";
import type { PresetName } from "../../state/reducer.ts";

const PRESETS: { name: PresetName; label: string; title: string }[] = [
  {
    name:  "happy-path",
    label: "Happy Path",
    title: "P1 proposes and reaches consensus with no faults. ~7 steps.",
  },
  {
    name:  "competing-proposals",
    label: "Competing Proposals",
    title:
      "P1 and P2 both propose. P2 uses a higher round number, causing " +
      "P1's ACCEPTs to be NACKed. Classic livelock demonstration.",
  },
  {
    name:  "crash-recovery",
    label: "Crash Recovery",
    title:
      "P1 reaches phase2 with a majority (A1+A2). A3 is crashed. " +
      "Consensus is still reached — majority does not require all acceptors.",
  },
  {
    name:  "message-loss",
    label: "Message Loss",
    title:
      "2 of P1's 3 PREPAREs are pre-dropped. P1 only receives 1 PROMISE " +
      "and cannot reach majority — it stalls in phase1.",
  },
];

export function PresetControls() {
  const { dispatch } = useSimulation();

  return (
    <div className="preset-controls">
      <span className="preset-label">Presets:</span>
      {PRESETS.map(({ name, label, title }) => (
        <button
          key={name}
          className="btn btn-preset"
          title={title}
          onClick={() => dispatch({ type: "LOAD_PRESET", preset: name })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
