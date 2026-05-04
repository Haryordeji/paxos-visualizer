import { describe, it, expect } from "vitest";
import { reducer, initialAppState } from "../../state/reducer.ts";
import type { AppState } from "../../state/reducer.ts";
import type { LoadedScript } from "../types.ts";
import type { AcceptorState, ProposerState } from "../../engine/types.ts";

function script(
  events: LoadedScript["events"],
  extras: Partial<LoadedScript> = {}
): LoadedScript {
  return {
    name: "Test",
    events,
    nextEventIndex: 0,
    ...extras,
  };
}

function loadScript(s: AppState, sc: LoadedScript, warnings: string[] = []): AppState {
  return reducer(s, { type: "LOAD_SCRIPT", script: sc, warnings });
}

function step(s: AppState): AppState {
  return reducer(s, { type: "STEP" });
}

describe("LOAD_SCRIPT", () => {
  it("fires at:0 events immediately on load", () => {
    let s = initialAppState();
    s = loadScript(s, script([{ at: 0, do: "propose", node: "P1" }]));
    expect(s.script?.nextEventIndex).toBe(1);
    // PREPAREs queued
    expect(s.sim.messageQueue.length).toBe(3);
    expect(s.sim.messageQueue.every((m) => m.type === "prepare")).toBe(true);
  });

  it("applies initial_state.crashed", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([], { initial_state: { crashed: ["A3"] } })
    );
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
  });

  it("does not auto-start playback", () => {
    let s = initialAppState();
    s = loadScript(s, script([{ at: 0, do: "propose", node: "P1" }]));
    expect(s.autoPlay).toBe(false);
  });

  it("seeds scriptLog with load-time warnings", () => {
    let s = initialAppState();
    s = loadScript(s, script([]), ["this script has no propose"]);
    expect(s.scriptLog.length).toBe(1);
    expect(s.scriptLog[0]).toMatchObject({
      kind: "system",
      warning: "this script has no propose",
    });
  });

  it("clears prior scriptError when loading successfully", () => {
    let s: AppState = { ...initialAppState(), scriptError: ["old"] };
    s = loadScript(s, script([]));
    expect(s.scriptError).toBeNull();
  });
});

describe("Event firing — timing", () => {
  it("does not fire at:5 event until stepCount reaches 5", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 5, do: "crash", node: "A2" },
      ])
    );
    // After load, only at:0 should have fired
    expect(s.script?.nextEventIndex).toBe(1);
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("active");
    // Step to stepCount=4
    for (let i = 0; i < 4; i++) s = step(s);
    expect(s.sim.stepCount).toBe(4);
    expect(s.script?.nextEventIndex).toBe(1); // still not fired
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("active");
    // Step to 5 — at:5 fires
    s = step(s);
    expect(s.sim.stepCount).toBe(5);
    expect(s.script?.nextEventIndex).toBe(2);
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("crashed");
  });

  it("multiple events at the same `at` fire in file order", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 0, do: "crash", node: "A2" },
        { at: 0, do: "crash", node: "A3" },
      ])
    );
    expect(s.script?.nextEventIndex).toBe(3);
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("crashed");
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
    // scriptLog should be in file order
    const order = s.scriptLog
      .filter((e) => e.kind === "event")
      .map((e) => (e.kind === "event" ? e.event.do : ""));
    expect(order).toEqual(["propose", "crash", "crash"]);
  });
});

describe("Drop event matching", () => {
  it("matches first queued message with all specified fields", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 0, do: "drop", to: "A2", type: "prepare" },
      ])
    );
    const droppedToA2 = s.sim.messageQueue.find(
      (m) => m.to === "A2" && m.status === "dropped"
    );
    expect(droppedToA2).toBeDefined();
    // The other two PREPAREs should still be queued
    const stillQueued = s.sim.messageQueue.filter((m) => m.status === "queued");
    expect(stillQueued.length).toBe(2);
  });

  it("logs warning and is a no-op when no match", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 0, do: "drop", type: "accepted" }, // no accepted in queue yet
      ])
    );
    const lastEntry = s.scriptLog[s.scriptLog.length - 1];
    expect(lastEntry.kind).toBe("event");
    if (lastEntry.kind === "event") {
      expect(typeof lastEntry.outcome).toBe("object");
      if (typeof lastEntry.outcome === "object") {
        expect(lastEntry.outcome.warning).toMatch(/no matching/);
      }
    }
    // Cursor still advanced
    expect(s.script?.nextEventIndex).toBe(2);
  });

  it("ignores already-dropped messages (matches the next queued)", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        // Two drops both targeting type=prepare. Each should drop a different msg.
        { at: 0, do: "drop", type: "prepare" },
        { at: 0, do: "drop", type: "prepare" },
      ])
    );
    const dropped = s.sim.messageQueue.filter((m) => m.status === "dropped");
    expect(dropped.length).toBe(2);
    const queued = s.sim.messageQueue.filter((m) => m.status === "queued");
    expect(queued.length).toBe(1);
  });
});

describe("Idempotence and ordering", () => {
  it("re-applying STEP at the same stepCount does not double-fire events", () => {
    // STEP advances stepCount; we check that an at:N event fires once even if
    // RUN_SCRIPT_TICK conceptually runs after each STEP.
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 3, do: "crash", node: "A2" },
      ])
    );
    // Step until stepCount=3
    for (let i = 0; i < 3; i++) s = step(s);
    expect(s.script?.nextEventIndex).toBe(2);
    // A second tick at the same stepCount would not fire anything new.
    const before = s.scriptLog.length;
    // Simulate effect re-running by stepping once more (which does change stepCount)
    s = step(s);
    expect(s.scriptLog.length).toBe(before); // no new fires
    expect(s.script?.nextEventIndex).toBe(2);
  });

  it("if stepCount jumps multiple steps, all skipped events fire", () => {
    // Engineered: load three events at:0,1,2 but the load fires only at:0
    // because stepCount=0 at load. Then step 3 times and check all fire.
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 1, do: "crash", node: "A2" },
        { at: 2, do: "crash", node: "A3" },
      ])
    );
    expect(s.script?.nextEventIndex).toBe(1);
    s = step(s); // stepCount=1, fires at:1
    expect(s.script?.nextEventIndex).toBe(2);
    s = step(s); // stepCount=2, fires at:2
    expect(s.script?.nextEventIndex).toBe(3);
  });
});

describe("Engine no-ops", () => {
  it("propose on a crashed proposer logs warning, does not start", () => {
    let s = initialAppState();
    s = reducer(s, { type: "CRASH_NODE", nodeId: "P1" });
    s = loadScript(
      s,
      // initial_state already crashed, but LOAD_SCRIPT resets the sim. Use a
      // script that crashes P1 itself first.
      script([
        { at: 0, do: "crash", node: "P1" },
        { at: 0, do: "propose", node: "P1" },
      ])
    );
    const lastEntry = s.scriptLog[s.scriptLog.length - 1];
    expect(lastEntry.kind).toBe("event");
    if (lastEntry.kind === "event") {
      expect(typeof lastEntry.outcome).toBe("object");
      if (typeof lastEntry.outcome === "object") {
        expect(lastEntry.outcome.warning).toMatch(/crashed/);
      }
    }
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("crashed");
  });

  it("crash on an already-crashed node logs warning", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "crash", node: "A2" },
        { at: 0, do: "crash", node: "A2" },
      ])
    );
    const last = s.scriptLog[s.scriptLog.length - 1];
    expect(last.kind).toBe("event");
    if (last.kind === "event" && typeof last.outcome === "object") {
      expect(last.outcome.warning).toMatch(/already crashed/);
    }
  });

  it("restart on a non-crashed node logs warning", () => {
    let s = initialAppState();
    s = loadScript(s, script([{ at: 0, do: "restart", node: "A1" }]));
    const last = s.scriptLog[s.scriptLog.length - 1];
    expect(last.kind).toBe("event");
    if (last.kind === "event" && typeof last.outcome === "object") {
      expect(last.outcome.warning).toMatch(/not crashed/);
    }
  });
});

describe("Reset / clear interactions", () => {
  it("LOAD_PRESET clears the loaded script", () => {
    let s = initialAppState();
    s = loadScript(s, script([{ at: 0, do: "propose", node: "P1" }]));
    expect(s.script).not.toBeNull();
    s = reducer(s, { type: "LOAD_PRESET", preset: "happy-path" });
    expect(s.script).toBeNull();
    expect(s.scriptLog).toEqual([]);
  });

  it("RESET preserves the loaded script and resets cursor", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 5, do: "crash", node: "A2" },
      ])
    );
    for (let i = 0; i < 6; i++) s = step(s);
    expect(s.script?.nextEventIndex).toBe(2);
    s = reducer(s, { type: "RESET" });
    expect(s.script).not.toBeNull();
    // After reset, at:0 fires immediately so cursor is 1
    expect(s.script?.nextEventIndex).toBe(1);
    expect(s.sim.stepCount).toBe(0);
    expect(s.scriptLog.filter((e) => e.kind === "event")).toHaveLength(1);
  });

  it("RESET re-applies initial_state", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([], { initial_state: { crashed: ["A3"] } })
    );
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
    // Manually restart A3
    s = reducer(s, { type: "RESTART_NODE", nodeId: "A3" });
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("active");
    // Reset — A3 should be crashed again
    s = reducer(s, { type: "RESET" });
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
  });

  it("RESET without a loaded script behaves as before", () => {
    let s = initialAppState();
    s = reducer(s, { type: "STEP" }); // no-op (empty queue)
    s = reducer(s, { type: "RESET" });
    expect(s.script).toBeNull();
    expect(s.sim.stepCount).toBe(0);
  });

  it("CLEAR_SCRIPT clears script, log, and error", () => {
    let s = initialAppState();
    s = loadScript(s, script([{ at: 0, do: "propose", node: "P1" }]));
    s = reducer(s, { type: "CLEAR_SCRIPT" });
    expect(s.script).toBeNull();
    expect(s.scriptLog).toEqual([]);
    expect(s.scriptError).toBeNull();
  });
});

describe("Post-tick warnings", () => {
  it("emits a warning when queue empties with events still pending", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 999, do: "crash", node: "A2" }, // never fires
      ])
    );
    // Run until queue empty
    while (s.sim.messageQueue.length > 0) s = step(s);
    const warning = s.scriptLog.find(
      (e) => e.kind === "system" && e.warning.startsWith("queue empty")
    );
    expect(warning).toBeDefined();
  });

  it("does not double-emit the queue-empty warning", () => {
    let s = initialAppState();
    s = loadScript(
      s,
      script([
        { at: 0, do: "propose", node: "P1" },
        { at: 999, do: "crash", node: "A2" },
      ])
    );
    while (s.sim.messageQueue.length > 0) s = step(s);
    // Run more steps (no-op since queue empty); the warning must remain a single entry
    s = step(s);
    s = step(s);
    const warnings = s.scriptLog.filter(
      (e) => e.kind === "system" && e.warning.startsWith("queue empty")
    );
    expect(warnings).toHaveLength(1);
  });
});

describe("LOAD_SCRIPT_ERROR", () => {
  it("sets scriptError without affecting the existing simulation", () => {
    let s = initialAppState();
    const beforeStep = s.sim.stepCount;
    s = reducer(s, { type: "LOAD_SCRIPT_ERROR", errors: ["bad json"] });
    expect(s.scriptError).toEqual(["bad json"]);
    expect(s.sim.stepCount).toBe(beforeStep);
    expect(s.script).toBeNull();
  });
});
