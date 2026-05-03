import { describe, it, expect } from "vitest";
import { initializeState, startProposal, step, stepAll } from "../simulation.ts";
import type { AcceptorState, ProposerState, SimulationState } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function acceptors(state: SimulationState): AcceptorState[] {
  return Object.values(state.nodes).filter(
    (n) => n.role === "acceptor"
  ) as AcceptorState[];
}

function proposer(state: SimulationState, id: string): ProposerState {
  return state.nodes[id] as ProposerState;
}

// ---------------------------------------------------------------------------
// initializeState
// ---------------------------------------------------------------------------

describe("initializeState", () => {
  it("creates 2 proposers and 3 acceptors", () => {
    const s = initializeState();
    const nodes = Object.values(s.nodes);
    expect(nodes.filter((n) => n.role === "proposer")).toHaveLength(2);
    expect(nodes.filter((n) => n.role === "acceptor")).toHaveLength(3);
  });

  it("proposers start idle with correct values", () => {
    const s = initializeState();
    expect(proposer(s, "P1").proposedValue).toBe("A");
    expect(proposer(s, "P2").proposedValue).toBe("B");
    expect(proposer(s, "P1").status).toBe("idle");
    expect(proposer(s, "P2").status).toBe("idle");
  });

  it("acceptors start active with null state", () => {
    const s = initializeState();
    for (const a of acceptors(s)) {
      expect(a.status).toBe("active");
      expect(a.highestPromised).toBeNull();
      expect(a.acceptedProposal).toBeNull();
    }
  });

  it("starts with empty queues and no consensus", () => {
    const s = initializeState();
    expect(s.messageQueue).toHaveLength(0);
    expect(s.deliveredMessages).toHaveLength(0);
    expect(s.consensus.reached).toBe(false);
    expect(s.stepCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// startProposal
// ---------------------------------------------------------------------------

describe("startProposal", () => {
  it("sets proposer to phase1 and enqueues 3 PREPARE messages", () => {
    const s = startProposal(initializeState(), "P1");
    expect(proposer(s, "P1").status).toBe("phase1");
    expect(s.messageQueue).toHaveLength(3);
    expect(s.messageQueue.every((m) => m.type === "prepare")).toBe(true);
    expect(s.messageQueue.every((m) => m.from === "P1")).toBe(true);
    // One PREPARE per acceptor
    const tos = s.messageQueue.map((m) => m.to).sort();
    expect(tos).toEqual(["A1", "A2", "A3"]);
  });

  it("sets proposal number with round=1 on first call", () => {
    const s = startProposal(initializeState(), "P1");
    expect(proposer(s, "P1").currentProposal).toEqual({ round: 1, nodeId: "P1" });
    expect(s.messageQueue[0].proposalNumber).toEqual({ round: 1, nodeId: "P1" });
  });

  it("increments round on successive calls", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s); // run to completion
    s = startProposal(s, "P1");
    expect(proposer(s, "P1").currentProposal?.round).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Happy path — P1 proposes "A", all 3 acceptors active, no faults
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("reaches consensus on P1's value 'A'", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    expect(s.consensus.reached).toBe(true);
    expect(s.consensus.value).toBe("A");
  });

  it("consensus is accepted by at least 2 acceptors", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    expect(s.consensus.acceptedBy.length).toBeGreaterThanOrEqual(2);
  });

  it("P1 ends in 'done' status", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    expect(proposer(s, "P1").status).toBe("done");
  });

  it("at least 2 acceptors have accepted 'A'", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    const accepted = acceptors(s).filter(
      (a) => a.acceptedProposal?.value === "A"
    );
    expect(accepted.length).toBeGreaterThanOrEqual(2);
  });

  it("completes within a bounded number of steps", () => {
    let s = startProposal(initializeState(), "P1");
    let steps = 0;
    while (s.messageQueue.length > 0 && steps < 20) {
      s = step(s);
      steps++;
    }
    expect(s.consensus.reached).toBe(true);
    expect(steps).toBeLessThanOrEqual(15);
  });

  it("stepCount increments once per step call", () => {
    let s = startProposal(initializeState(), "P1");
    let steps = 0;
    while (s.messageQueue.length > 0) {
      s = step(s);
      steps++;
    }
    expect(s.stepCount).toBe(steps);
  });

  it("all delivered messages end up in deliveredMessages", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    // Every delivered message should have status delivered or dropped
    for (const m of s.deliveredMessages) {
      expect(["delivered", "dropped"]).toContain(m.status);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 1 majority logic
// ---------------------------------------------------------------------------

describe("phase 1 majority", () => {
  it("P1 transitions to phase2 after receiving 2 promises", () => {
    // Each step delivers exactly one message. After startProposal:
    // steps 1-3: deliver 3 PREPAREs → 3 PROMISEs enqueued
    // step 4: deliver PROMISE #1 → 1 promise, still phase1
    // step 5: deliver PROMISE #2 → majority → phase2
    let s = startProposal(initializeState(), "P1");
    for (let i = 0; i < 4; i++) s = step(s);
    expect(proposer(s, "P1").status).toBe("phase1");
    s = step(s); // 5th step — 2nd promise
    expect(proposer(s, "P1").status).toBe("phase2");
  });

  it("enqueues ACCEPT messages to all acceptors", () => {
    let s = startProposal(initializeState(), "P1");
    // Run through Phase 1 completely
    for (let i = 0; i < 5; i++) s = step(s);
    // After 5 steps, P1 is in phase2. Queue now has: [PROMISE#3, ACCEPT→A1, ACCEPT→A2, ACCEPT→A3]
    const acceptMsgs = s.messageQueue.filter((m) => m.type === "accept");
    expect(acceptMsgs).toHaveLength(3);
    expect(acceptMsgs.every((m) => m.from === "P1")).toBe(true);
    const destinations = acceptMsgs.map((m) => m.to).sort();
    expect(destinations).toEqual(["A1", "A2", "A3"]);
  });

  it("stale PROMISE after phase2 transition is ignored", () => {
    let s = startProposal(initializeState(), "P1");
    for (let i = 0; i < 5; i++) s = step(s); // P1 now in phase2
    const acceptsReceivedBefore = proposer(s, "P1").acceptsReceived;
    // Next step delivers the 3rd PROMISE (stale — P1 is in phase2)
    s = step(s);
    expect(proposer(s, "P1").status).toBe("phase2");
    expect(proposer(s, "P1").acceptsReceived).toBe(acceptsReceivedBefore);
    // No extra ACCEPT messages should have been enqueued
    const acceptMsgs = s.messageQueue.filter((m) => m.type === "accept");
    expect(acceptMsgs).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 majority logic
// ---------------------------------------------------------------------------

describe("phase 2 majority", () => {
  it("P1 transitions to 'done' after receiving 2 ACCEPTEDs", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    expect(proposer(s, "P1").status).toBe("done");
    expect(proposer(s, "P1").acceptsReceived).toBeGreaterThanOrEqual(2);
  });

  it("consensus is detected immediately when 2nd acceptor accepts", () => {
    let s = startProposal(initializeState(), "P1");
    // Run until just before consensus
    while (!s.consensus.reached && s.messageQueue.length > 0) {
      s = step(s);
    }
    expect(s.consensus.reached).toBe(true);
    expect(s.consensus.value).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// Value selection rule (P2b from Lamport)
// ---------------------------------------------------------------------------

describe("value selection rule (P2b)", () => {
  it("proposer uses own value when no promise carries an accepted proposal", () => {
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    // All acceptors' acceptedProposals should carry "A"
    const accepted = acceptors(s).filter((a) => a.acceptedProposal !== null);
    expect(accepted.every((a) => a.acceptedProposal!.value === "A")).toBe(true);
  });

  it("proposer adopts the value from the highest-numbered accepted proposal among promises", () => {
    // Setup: run P1 to completion so A1 and A2 have acceptedProposal value "A".
    // Then start P2 (round 1, nodeId "P2"). P2's proposal number (1, "P2") is
    // higher than P1's (1, "P1") lexicographically.
    // When P2 collects promises from A1 and A2 (both carrying accepted "A"),
    // it must propose "A" — NOT its own value "B".
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);

    // Sanity: A1 and A2 have accepted "A"
    expect((s.nodes["A1"] as AcceptorState).acceptedProposal?.value).toBe("A");
    expect((s.nodes["A2"] as AcceptorState).acceptedProposal?.value).toBe("A");

    // P2 starts a new proposal. Its round 1 is the same as P1's, but "P2" > "P1"
    // so (1, "P2") > (1, "P1") — acceptors will promise P2.
    s = startProposal(s, "P2");
    s = stepAll(s);

    // P2 must have proposed "A" (inherited from accepted proposals), not "B"
    expect(s.consensus.value).toBe("A");

    // Verify: every acceptor that accepted in P2's round has value "A"
    const finalAccepted = acceptors(s).filter((a) => a.acceptedProposal !== null);
    expect(finalAccepted.every((a) => a.acceptedProposal!.value === "A")).toBe(true);
  });

  it("selects value from highest proposal number when promises carry different accepted values", () => {
    // Craft a state manually: A1 accepted (round=1,"P1") with "A",
    // A2 accepted (round=2,"P1") with "X" (higher round).
    // When P2 collects promises from A1 and A2, it must pick "X".
    let s = initializeState();

    // Manually set acceptor state
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        A1: {
          ...(s.nodes["A1"] as AcceptorState),
          highestPromised: { round: 1, nodeId: "P1" },
          acceptedProposal: {
            number: { round: 1, nodeId: "P1" },
            value: "A",
          },
        },
        A2: {
          ...(s.nodes["A2"] as AcceptorState),
          highestPromised: { round: 2, nodeId: "P1" },
          acceptedProposal: {
            number: { round: 2, nodeId: "P1" },
            value: "X",
          },
        },
        // Update P1's round so P2 can outbid both
        P1: { ...(s.nodes["P1"] as ProposerState), round: 2 },
      },
    };

    // P2 starts with round 1, but we need it to beat highestPromised of (2,"P1").
    // Manually bump P2's round so its proposal number beats (2,"P1").
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        P2: { ...(s.nodes["P2"] as ProposerState), round: 2 },
      },
    };

    s = startProposal(s, "P2"); // P2 uses round 3, nodeId "P2" → (3, "P2")
    s = stepAll(s);

    // P2 collected promises from A1 (accepted value "A" at round 1) and
    // A2 (accepted value "X" at round 2). Must pick "X" (higher round).
    expect(s.consensus.value).toBe("X");
  });
});

// ---------------------------------------------------------------------------
// step() with empty queue
// ---------------------------------------------------------------------------

describe("step with empty queue", () => {
  it("returns state unchanged when queue is empty", () => {
    const s = initializeState();
    const s2 = step(s);
    expect(s2).toBe(s); // exact same reference
  });
});

// ---------------------------------------------------------------------------
// Immutability — step never mutates input state
// ---------------------------------------------------------------------------

describe("immutability", () => {
  it("step returns a new state object", () => {
    const s = startProposal(initializeState(), "P1");
    const s2 = step(s);
    expect(s2).not.toBe(s);
    expect(s.messageQueue).toHaveLength(3); // original unchanged
  });
});
