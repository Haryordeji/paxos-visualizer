import { useRef } from "react";
import type { ChangeEvent } from "react";
import { useSimulation } from "../../state/context.tsx";
import { parseAndValidate } from "../../script/validate.ts";

export function ScriptControls() {
  const { state, dispatch } = useSimulation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = () => inputRef.current?.click();

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      dispatch({
        type: "LOAD_SCRIPT_ERROR",
        errors: [`Could not read file: ${(err as Error).message}`],
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const result = parseAndValidate(text);
    if (result.ok) {
      dispatch({ type: "LOAD_SCRIPT", script: result.script, warnings: result.warnings });
    } else {
      dispatch({ type: "LOAD_SCRIPT_ERROR", errors: result.errors });
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="script-controls">
      <span className="script-label">Script:</span>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleChange}
      />
      <button
        className="btn btn-script"
        onClick={handlePick}
        title="Load a scripted scenario from a JSON file"
      >
        Load script…
      </button>
      {state.script && (
        <button
          className="btn btn-secondary btn-script-clear"
          onClick={() => dispatch({ type: "CLEAR_SCRIPT" })}
          title="Clear loaded script"
        >
          Clear
        </button>
      )}
    </div>
  );
}
