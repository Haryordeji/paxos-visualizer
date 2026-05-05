import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseAndValidate } from "../validate.ts";
import { reducer, initialAppState } from "../../state/reducer.ts";
import type { AppState } from "../../state/reducer.ts";
import type { AcceptorState, ProposerState } from "../../engine/types.ts";

const DEMO_DIR = resolve(__dirname, "../../../demo");

function loadScript(file: string): AppState {
  const text = readFileSync(resolve(DEMO_DIR, file), "utf8");
  const result = parseAndValidate(text);
  if (!result.ok) {
    throw new Error(`Validation failed for ${file}: ${result.errors.join("; ")}`);
  }
  let s = initialAppState();
  return reducer(s, { type: "LOAD_SCRIPT", script: result.script, warnings: result.warnings });
}

function stepUntilEmpty(s: AppState, cap = 200): AppState {
  let steps = 0;
  while (s.sim.messageQueue.length > 0 && steps < cap) {
    s = reducer(s, { type: "STEP" });
    steps++;
  }
  return s;
}

function loadAndPlay(file: string, cap = 200): AppState {
  return stepUntilEmpty(loadScript(file), cap);
}

describe("Demo scenario files validate cleanly", () => {
  const files = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".json"));
  it.each(files)("%s parses and validates", (file) => {
    const text = readFileSync(resolve(DEMO_DIR, file), "utf8");
    const result = parseAndValidate(text);
    if (!result.ok) {
      throw new Error(`Validation failed: ${result.errors.join("; ")}`);
    }
    expect(result.ok).toBe(true);
  });
});

describe("acceptor-restart-stable-storage.json", () => {
  it("P1 done at step 10, A1 keeps accepted across crash, P2 forced to A", () => {
    let s = loadScript("acceptor-restart-stable-storage.json");
    for (let i = 0; i < 10; i++) s = reducer(s, { type: "STEP" });
    // After step 10, at:10 events have fired: A1 crash+restart, P2 propose.
    expect(s.sim.stepCount).toBe(10);
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("done");
    expect((s.sim.nodes["A1"] as AcceptorState).status).toBe("active");
    expect((s.sim.nodes["A1"] as AcceptorState).acceptedProposal?.value).toBe("A");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("phase1");
    expect(s.sim.messageQueue.length).toBe(3);
    s = stepUntilEmpty(s);
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("done");
  });
});

describe("acceptor-restart-between-phases.json", () => {
  it("crashes/restarts A1 between phases; consensus on A still reached", () => {
    const s = loadAndPlay("acceptor-restart-between-phases.json");
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["A1"] as AcceptorState).status).toBe("active");
    expect((s.sim.nodes["A1"] as AcceptorState).acceptedProposal?.value).toBe("A");
  });
});

describe("dueling-proposers.json", () => {
  it("round numbers ratchet up through cycles", () => {
    let s = loadScript("dueling-proposers.json");
    expect((s.sim.nodes["P1"] as ProposerState).currentProposal?.round).toBe(1);
    for (let i = 0; i < 5; i++) s = reducer(s, { type: "STEP" });
    expect((s.sim.nodes["P2"] as ProposerState).currentProposal?.round).toBe(2);
    for (let i = 0; i < 8; i++) s = reducer(s, { type: "STEP" });
    expect((s.sim.nodes["P1"] as ProposerState).currentProposal?.round).toBe(3);
    for (let i = 0; i < 8; i++) s = reducer(s, { type: "STEP" });
    expect((s.sim.nodes["P2"] as ProposerState).currentProposal?.round).toBe(4);
    for (let i = 0; i < 8; i++) s = reducer(s, { type: "STEP" });
    expect((s.sim.nodes["P1"] as ProposerState).currentProposal?.round).toBe(5);
  });
});

describe("majority-crash.json", () => {
  it("stalls in phase1 with 1 of 3 promises after second proposal", () => {
    const s = loadAndPlay("majority-crash.json");
    expect(s.sim.consensus.reached).toBe(false);
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("phase1");
    expect((s.sim.nodes["P1"] as ProposerState).currentProposal?.round).toBe(2);
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("crashed");
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
  });
});

describe("majority-crash-with-recovery.json", () => {
  it("A3 restart restores quorum; consensus on A via A1+A3", () => {
    const s = loadAndPlay("majority-crash-with-recovery.json");
    expect(s.sim.consensus.value).toBe("A");
    expect(s.sim.consensus.acceptedBy).toEqual(expect.arrayContaining(["A1", "A3"]));
    expect(s.sim.consensus.acceptedBy).not.toContain("A2");
    expect((s.sim.nodes["A2"] as AcceptorState).status).toBe("crashed");
  });
});

describe("minority-crash.json", () => {
  it("consensus on A reached without A3", () => {
    const s = loadAndPlay("minority-crash.json");
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("crashed");
    expect(s.sim.consensus.acceptedBy).not.toContain("A3");
  });
});

describe("minority-crash-with-recovery.json", () => {
  it("P1 reaches A first; restarted A3 + P2 round preserves consensus on A", () => {
    const s = loadAndPlay("minority-crash-with-recovery.json");
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["A3"] as AcceptorState).status).toBe("active");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("done");
  });
});

describe("proposer-crash-after-partial-accepts.json", () => {
  it("A1 keeps accepted (1,P1)='A' through crash; P2 hijacked to A", () => {
    let s = loadScript("proposer-crash-after-partial-accepts.json");
    for (let i = 0; i < 7; i++) s = reducer(s, { type: "STEP" });
    // After step 7, at:7 fires — P1 crashes; only A1 has accepted.
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("crashed");
    expect((s.sim.nodes["A1"] as AcceptorState).acceptedProposal?.value).toBe("A");
    expect((s.sim.nodes["A2"] as AcceptorState).acceptedProposal).toBeNull();
    s = stepUntilEmpty(s);
    expect(s.sim.consensus.value).toBe("A");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("done");
  });
});

describe("proposer-crash-after-phase1.json", () => {
  it("P1 crashes after Phase 1; P2 reaches consensus on B (free choice)", () => {
    const s = loadAndPlay("proposer-crash-after-phase1.json");
    expect(s.sim.consensus.value).toBe("B");
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("crashed");
    expect((s.sim.nodes["P2"] as ProposerState).status).toBe("done");
  });
});

describe("proposer-crash-after-phase1-with-recovery.json", () => {
  it("after consensus on B, restarted P1 is forced to carry B forward", () => {
    const s = loadAndPlay("proposer-crash-after-phase1-with-recovery.json");
    expect(s.sim.consensus.value).toBe("B");
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("done");
  });
});

describe("value-hijacking.json", () => {
  it("P2 sends ACCEPTs with 'A' not 'B' despite proposedValue 'B'", () => {
    let s = loadScript("value-hijacking.json");
    for (let i = 0; i < 10; i++) s = reducer(s, { type: "STEP" });
    expect((s.sim.nodes["P1"] as ProposerState).status).toBe("done");
    expect(s.sim.consensus.value).toBe("A");
    expect(s.sim.messageQueue.filter((m) => m.type === "prepare").length).toBe(3);
    s = stepUntilEmpty(s);
    const p2Accepts = s.sim.deliveredMessages.filter(
      (m) => m.type === "accept" && m.from === "P2"
    );
    expect(p2Accepts.length).toBeGreaterThan(0);
    for (const m of p2Accepts) {
      if (m.type === "accept") expect(m.value).toBe("A");
    }
    expect((s.sim.nodes["P2"] as ProposerState).proposedValue).toBe("B");
  });
});
