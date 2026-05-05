import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAndValidate } from "../validate.ts";
import { reducer, initialAppState } from "../../state/reducer.ts";
import type { AppState } from "../../state/reducer.ts";

const SCENARIOS_DIR = resolve(__dirname, "../../../scenarios");

function loadAndPlay(file: string): AppState {
  const text = readFileSync(resolve(SCENARIOS_DIR, file), "utf8");
  const result = parseAndValidate(text);
  if (!result.ok) throw new Error(`Validation failed: ${result.errors.join("; ")}`);
  let s = initialAppState();
  s = reducer(s, { type: "LOAD_SCRIPT", script: result.script, warnings: result.warnings });
  let steps = 0;
  while (s.sim.messageQueue.length > 0 && steps < 200) {
    s = reducer(s, { type: "STEP" });
    steps++;
  }
  return s;
}

describe("Bundled scenario files", () => {
  it("happy-path.json reaches consensus on A", () => {
    const s = loadAndPlay("happy-path.json");
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
  });

  it("crash-recovery.json reaches consensus on A with A3 crashed", () => {
    const s = loadAndPlay("crash-recovery.json");
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
    expect(s.sim.consensus.acceptedBy).not.toContain("A3");
  });

  it("competing-proposals.json reaches consensus on B (P2 wins)", () => {
    const s = loadAndPlay("competing-proposals.json");
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("B");
  });

  it("message-loss.json reaches consensus on A despite a dropped PREPARE", () => {
    const s = loadAndPlay("message-loss.json");
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
  });
});
