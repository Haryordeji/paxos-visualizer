import { AnimatePresence, motion } from "framer-motion";
import { useSimulation } from "../../state/context.tsx";
import type { AcceptorState } from "../../engine/types.ts";

const ACCEPTOR_IDS = ["A1", "A2", "A3"];

export function ConsensusStatus() {
  const { state } = useSimulation();
  const { consensus, nodes } = state.sim;

  // Count crashed acceptors to detect the "no majority available" edge case.
  const crashedAcceptors = ACCEPTOR_IDS.filter(
    id => (nodes[id] as AcceptorState | undefined)?.status === "crashed"
  ).length;
  // With 3 acceptors, majority = 2. If ≥2 are crashed, consensus is impossible.
  const impossible = !consensus.reached && crashedAcceptors >= 2;

  return (
    <div className="consensus-banner-wrap">
      <AnimatePresence mode="wait">
        {consensus.reached ? (
          <motion.div
            key="reached"
            className="consensus-banner consensus-banner-reached"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <motion.span
              className="consensus-dot"
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="consensus-value">
              &ldquo;{consensus.value}&rdquo;
            </span>
            <span className="consensus-acceptors">
              {consensus.acceptedBy.join(", ")}
            </span>
          </motion.div>
        ) : impossible ? (
          <motion.div
            key="impossible"
            className="consensus-banner consensus-banner-impossible"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span className="consensus-impossible-icon">⚠</span>
            Consensus impossible — no majority available
          </motion.div>
        ) : (
          <motion.div
            key="none"
            className="consensus-banner consensus-banner-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            No consensus yet
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
