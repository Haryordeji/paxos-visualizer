import { useEffect } from "react";
import { useSimulation } from "../state/context.tsx";

/**
 * Drives auto-play: dispatches STEP on an interval while autoPlay is enabled
 * and the message queue is non-empty. Automatically stops when the queue drains.
 */
export function useAutoPlay(): void {
  const { state, dispatch } = useSimulation();
  const { autoPlay, speedMs } = state;
  const canStep = state.sim.messageQueue.length > 0;

  useEffect(() => {
    if (!autoPlay || !canStep) return;
    const id = setInterval(() => dispatch({ type: "STEP" }), speedMs);
    return () => clearInterval(id);
  }, [autoPlay, canStep, speedMs, dispatch]);

  // Stop auto-play when queue drains so the button resets to "Auto-play"
  useEffect(() => {
    if (autoPlay && !canStep) {
      dispatch({ type: "TOGGLE_AUTOPLAY" });
    }
  }, [autoPlay, canStep, dispatch]);
}
