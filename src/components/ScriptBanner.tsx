import { useSimulation } from "../state/context.tsx";

export function ScriptBanner() {
  const { state, dispatch } = useSimulation();
  const { script, scriptError } = state;

  if (scriptError && scriptError.length > 0) {
    return (
      <div className="script-banner script-banner-error">
        <div className="script-banner-body">
          <strong>Script load failed</strong>
          <ul>
            {scriptError.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
        <button
          className="script-banner-dismiss"
          onClick={() => dispatch({ type: "CLEAR_SCRIPT" })}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  if (script) {
    const total = script.events.length;
    const fired = script.nextEventIndex;
    return (
      <div className="script-banner script-banner-loaded">
        <div className="script-banner-body">
          <span className="script-banner-name">{script.name}</span>
          {script.description && (
            <span className="script-banner-desc">{script.description}</span>
          )}
          <span className="script-banner-progress">
            {fired}/{total} event{total === 1 ? "" : "s"} fired
          </span>
        </div>
      </div>
    );
  }

  return null;
}
