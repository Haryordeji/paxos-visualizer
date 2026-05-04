import { describe, it, expect } from "vitest";
import { reducer, initialAppState } from "../../state/reducer.ts";
import type { AppState } from "../../state/reducer.ts";
import type { LoadedScript } from "../types.ts";
import type { AcceptorState, ProposerState } from "../../engine/types.ts";

function asScript(events: LoadedScript["events"], extras: Partial<LoadedScript> = {}): LoadedScript {
  return { name: "T", events, nextEventIndex: 0, ...extras };
}

function loadAndRun(
  script: LoadedScript,
  cap: number = 100
): AppState {
  let s: AppState = initialAppState();
  s = reducer(s, { type: "LOAD_SCRIPT", script, warnings: [] });
  let steps = 0;
  while (s.sim.messageQueue.length > 0 && steps < cap) {
    s = reducer(s, { type: "STEP" });
    steps++;
  }
  return s;
}

describe("Integration — happy path script", () => {
  it("propose P1 at 0 reaches consensus on A", () => {
    const s = loadAndRun(asScript([{ at: 0, do: "propose", node: "P1" }]));
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
  });
});

describe("Integration — crash recovery script", () => {
  it("initial_state.crashed=[A3] still reaches consensus on A", () => {
    const s = loadAndRun(
      asScript([{ at: 0, do: "propose", node: "P1" }], {
        initial_state: { crashed: ["A3"] },
      })
    );
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
    expect(s.sim.consensus.acceptedBy).not.toContain("A3");
  });
});

describe("Integration — competing proposals script", () => {
  it("propose P1 at 0, propose P2 at 4 — P2 wins via higher round", () => {
    const s = loadAndRun(
      asScript([
        { at: 0, do: "propose", node: "P1" },
        { at: 4, do: "propose", node: "P2" },
      ])
    );
    // At step 4 (just after P1's 3rd PREP and 1st PROMISE deliver), P2 introduces
    // a higher-round proposal. Acceptors will promise P2 once P2's PREPAREs land.
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("B");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("done");
  });
});

describe("Integration — message loss script", () => {
  it("propose P1 at 0 with PREPARE→A2 dropped reaches consensus via A1+A3", () => {
    const s = loadAndRun(
      asScript([
        { at: 0, do: "propose", node: "P1" },
        { at: 0, do: "drop", to: "A2", type: "prepare" },
      ])
    );
    expect(s.sim.consensus.reached).toBe(true);
    expect(s.sim.consensus.value).toBe("A");
    // A2 should not appear in consensus.acceptedBy (its PREPARE was dropped)
    expect(s.sim.consensus.acceptedBy).not.toContain("A2");
  });

  it("propose P1 at 0, then drop two PREPAREs — stalls in phase1, no consensus", () => {
    const s = loadAndRun(
      asScript([
        { at: 0, do: "propose", node: "P1" },
        { at: 0, do: "drop", to: "A1", type: "prepare" },
        { at: 0, do: "drop", to: "A2", type: "prepare" },
      ])
    );
    expect(s.sim.consensus.reached).toBe(false);
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("phase1");
  });
});

describe("Integration — script log records every event", () => {
  it("scriptLog has one entry per fired event", () => {
    const s = loadAndRun(
      asScript([
        { at: 0, do: "propose", node: "P1" },
        { at: 4, do: "crash", node: "A2" },
      ])
    );
    const eventEntries = s.scriptLog.filter((e) => e.kind === "event");
    expect(eventEntries).toHaveLength(2);
  });

  it("scriptLog precedingDeliveredCount is correct relative to fire time", () => {
    const s = loadAndRun(
      asScript([
        { at: 0, do: "propose", node: "P1" },
        { at: 4, do: "crash", node: "A2" },
      ])
    );
    const events = s.scriptLog.filter((e) => e.kind === "event");
    // First event fires at stepCount=0 with 0 deliveries
    expect(events[0].precedingDeliveredCount).toBe(0);
    // Second event fires at stepCount=4 with 4 deliveries
    expect(events[1].precedingDeliveredCount).toBe(4);
  });
});
