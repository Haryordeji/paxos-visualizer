import { AnimatePresence, motion } from "framer-motion";
import { useSimulation } from "../../state/context.tsx";

export function ConsensusStatus() {
  const { state } = useSimulation();
  const { consensus } = state.sim;

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
