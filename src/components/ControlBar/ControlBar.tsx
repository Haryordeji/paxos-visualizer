import { useSimulation } from "../../state/context.tsx";
import { useAutoPlay } from "../../hooks/useAutoPlay.ts";

export function ControlBar() {
  const { state, dispatch } = useSimulation();
  const { sim, autoPlay, speedMs } = state;

  useAutoPlay();

  const canStep = sim.messageQueue.length > 0;

  // Slider: left = slow (2000ms), right = fast (200ms)
  // sliderValue = 2200 - speedMs → speedMs = 2200 - sliderValue
  const sliderValue = 2200 - speedMs;

  return (
    <footer className="control-bar">
      <div className="control-row">
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
            min={200}
            max={2000}
            step={100}
            value={sliderValue}
            onChange={(e) =>
              dispatch({ type: "SET_SPEED", ms: 2200 - Number(e.target.value) })
            }
          />
          <span>{speedMs}ms</span>
        </div>

        <div className="control-divider" />

        <button
          className="btn btn-danger"
          onClick={() => dispatch({ type: "RESET" })}
        >
          ↺ Reset
        </button>

        <div className="control-divider" />

        <span className="fault-label">
          Click node to crash/restart · Click queued message to drop
        </span>
      </div>
    </footer>
  );
}
