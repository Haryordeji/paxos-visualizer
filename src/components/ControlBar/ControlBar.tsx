import { useEffect, useRef } from "react";
import { useSimulation } from "../../state/context.tsx";
import { FaultControls } from "./FaultControls.tsx";

export function ControlBar() {
  const { state, dispatch } = useSimulation();
  const { sim, autoPlay, speedMs } = state;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canStep = sim.messageQueue.length > 0;

  // Auto-play: step on interval while enabled and messages remain
  useEffect(() => {
    if (autoPlay && canStep) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: "STEP" });
      }, speedMs);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoPlay, canStep, speedMs, dispatch]);

  // Stop auto-play when queue drains
  useEffect(() => {
    if (autoPlay && !canStep) {
      dispatch({ type: "TOGGLE_AUTOPLAY" });
    }
  }, [autoPlay, canStep, dispatch]);

  return (
    <footer className="control-bar">
      <div className="control-row">
        {/* Primary simulation controls */}
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "STEP" })}
          disabled={!canStep}
        >
          ▶ Step
        </button>

        <button
          className={`btn ${autoPlay ? "btn-active" : "btn-secondary"}`}
          onClick={() => dispatch({ type: "TOGGLE_AUTOPLAY" })}
          disabled={!canStep && !autoPlay}
        >
          {autoPlay ? "⏸ Pause" : "▶▶ Auto-play"}
        </button>

        <div className="speed-control">
          <span>Speed</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={2100 - speedMs}
            onChange={(e) =>
              dispatch({ type: "SET_SPEED", ms: 2100 - Number(e.target.value) })
            }
          />
          <span>{speedMs}ms</span>
        </div>

        <div className="control-divider" />

        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: "RESET" })}
        >
          ↺ Reset
        </button>

        <div className="control-divider" />

        <span className="fault-label">Faults:</span>
        <FaultControls />
      </div>
    </footer>
  );
}
