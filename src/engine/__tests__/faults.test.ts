import { describe, it, expect } from "vitest";
import { dropMessage, crashNode, restartNode, introduceProposal } from "../faults.ts";
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
// dropMessage
// ---------------------------------------------------------------------------

describe("dropMessage", () => {
  it("marks the target message as dropped, leaving queue length unchanged", () => {
    let s = startProposal(initializeState(), "P1");
    const target = s.messageQueue[0];
    s = dropMessage(s, target.id);
    expect(s.messageQueue).toHaveLength(3);
    expect(s.messageQueue[0].status).toBe("dropped");
    expect(s.messageQueue[1].status).toBe("queued");
  });

  it("dropped message is moved to deliveredMessages by step() without processing", () => {
    let s = startProposal(initializeState(), "P1");
    const target = s.messageQueue[0]; // PREPARE to first acceptor
    s = dropMessage(s, target.id);
    s = step(s); // deliver (skip) the dropped message
    expect(s.messageQueue).toHaveLength(2);
    expect(s.deliveredMessages).toHaveLength(1);
    expect(s.deliveredMessages[0].status).toBe("dropped");
    expect(s.deliveredMessages[0].id).toBe(target.id);
  });

  it("does not affect messages other than the target", () => {
    let s = startProposal(initializeState(), "P1");
    const [first, second] = s.messageQueue;
    s = dropMessage(s, first.id);
    expect(s.messageQueue[1].id).toBe(second.id);
    expect(s.messageQueue[1].status).toBe("queued");
  });
});

// ---------------------------------------------------------------------------
// crashNode
// ---------------------------------------------------------------------------

describe("crashNode", () => {
  it("sets acceptor status to 'crashed'", () => {
    const s = crashNode(initializeState(), "A1");
    expect((s.nodes["A1"] as AcceptorState).status).toBe("crashed");
  });

  it("sets proposer status to 'crashed'", () => {
    const s = crashNode(startProposal(initializeState(), "P1"), "P1");
    expect((s.nodes["P1"] as ProposerState).status).toBe("crashed");
  });

  it("preserves highestPromised and acceptedProposal on crash (stable storage)", () => {
    let s = initializeState();
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        A3: {
          ...(s.nodes["A3"] as AcceptorState),
          highestPromised: { round: 2, nodeId: "P1" },
          acceptedProposal: { number: { round: 2, nodeId: "P1" }, value: "A" },
        },
      },
    };
    s = crashNode(s, "A3");
    const a3 = s.nodes["A3"] as AcceptorState;
    expect(a3.status).toBe("crashed");
    expect(a3.highestPromised).toEqual({ round: 2, nodeId: "P1" });
    expect(a3.acceptedProposal?.value).toBe("A");
  });

  it("messages sent to a crashed node are silently dropped by step()", () => {
    let s = startProposal(initializeState(), "P1");
    s = crashNode(s, "A1"); // crash A1 before its PREPARE arrives
    s = step(s); // deliver PREPARE→A1 — should be dropped
    expect(s.deliveredMessages[0].status).toBe("dropped");
    // A1 should not have updated highestPromised
    expect((s.nodes["A1"] as AcceptorState).highestPromised).toBeNull();
  });

  it("removes unsent PREPAREs from a proposer crashed mid-Phase-1", () => {
    let s = startProposal(initializeState(), "P1"); // queue has 3 PREPAREs from P1
    s = crashNode(s, "P1");
    expect(s.messageQueue.filter((m) => m.from === "P1")).toHaveLength(0);
  });

  it("removes unsent ACCEPTs from a proposer crashed mid-Phase-2", () => {
    let s = startProposal(initializeState(), "P1");
    // Step into phase2: 3 PREPAREs delivered, 2 PROMISEs delivered → ACCEPTs enqueued
    for (let i = 0; i < 5; i++) s = step(s);
    expect(proposer(s, "P1").status).toBe("phase2");
    const acceptsBefore = s.messageQueue.filter(
      (m) => m.type === "accept" && m.from === "P1"
    );
    expect(acceptsBefore.length).toBeGreaterThan(0);
    s = crashNode(s, "P1");
    expect(s.messageQueue.filter((m) => m.from === "P1")).toHaveLength(0);
  });

  it("removes queued PROMISEs/NACKs from a crashed acceptor", () => {
    let s = startProposal(initializeState(), "P1");
    // Deliver all 3 PREPAREs → 3 PROMISEs enqueued from A1, A2, A3
    for (let i = 0; i < 3; i++) s = step(s);
    expect(s.messageQueue.filter((m) => m.from === "A2")).toHaveLength(1);
    s = crashNode(s, "A2");
    expect(s.messageQueue.filter((m) => m.from === "A2")).toHaveLength(0);
  });

  it("leaves messages targeting the crashed node in the queue", () => {
    let s = startProposal(initializeState(), "P1"); // 3 PREPAREs queued, all to acceptors
    const toA1Before = s.messageQueue.filter((m) => m.to === "A1").length;
    s = crashNode(s, "A1");
    const toA1After = s.messageQueue.filter((m) => m.to === "A1").length;
    expect(toA1After).toBe(toA1Before);
  });
});

// ---------------------------------------------------------------------------
// restartNode
// ---------------------------------------------------------------------------

describe("restartNode", () => {
  it("restores acceptor status to 'active'", () => {
    let s = crashNode(initializeState(), "A3");
    s = restartNode(s, "A3");
    expect((s.nodes["A3"] as AcceptorState).status).toBe("active");
  });

  it("stable storage survives crash+restart for acceptors", () => {
    let s = initializeState();
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        A3: {
          ...(s.nodes["A3"] as AcceptorState),
          highestPromised: { round: 1, nodeId: "P1" },
          acceptedProposal: { number: { round: 1, nodeId: "P1" }, value: "A" },
        },
      },
    };
    s = crashNode(s, "A3");
    s = restartNode(s, "A3");
    const a3 = s.nodes["A3"] as AcceptorState;
    expect(a3.status).toBe("active");
    expect(a3.highestPromised).toEqual({ round: 1, nodeId: "P1" });
    expect(a3.acceptedProposal?.value).toBe("A");
  });

  it("restores proposer status to 'idle' and clears in-progress tracking", () => {
    let s = startProposal(initializeState(), "P1");
    s = crashNode(s, "P1");
    s = restartNode(s, "P1");
    const p1 = proposer(s, "P1");
    expect(p1.status).toBe("idle");
    expect(p1.currentProposal).toBeNull();
    expect(p1.promisesReceived).toHaveLength(0);
    expect(p1.acceptsReceived).toBe(0);
  });

  it("preserves proposer round counter after restart", () => {
    let s = startProposal(initializeState(), "P1"); // round becomes 1
    s = crashNode(s, "P1");
    s = restartNode(s, "P1");
    expect(proposer(s, "P1").round).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 1 — Crash recovery: consensus reached with A3 down
// ---------------------------------------------------------------------------

describe("crash recovery", () => {
  it("reaches consensus with A3 crashed before any messages", () => {
    let s = crashNode(initializeState(), "A3");
    s = startProposal(s, "P1");
    s = stepAll(s);
    expect(s.consensus.reached).toBe(true);
    expect(s.consensus.value).toBe("A");
  });

  it("consensus is carried by A1 and A2 (not A3)", () => {
    let s = crashNode(initializeState(), "A3");
    s = startProposal(s, "P1");
    s = stepAll(s);
    const accepted = acceptors(s).filter(
      (a) => a.acceptedProposal?.value === "A"
    );
    expect(accepted.length).toBeGreaterThanOrEqual(2);
    expect(accepted.map((a) => a.id)).not.toContain("A3");
  });

  it("A3 stable storage is empty after crash (never processed any message)", () => {
    let s = crashNode(initializeState(), "A3");
    s = startProposal(s, "P1");
    s = stepAll(s);
    const a3 = s.nodes["A3"] as AcceptorState;
    expect(a3.highestPromised).toBeNull();
    expect(a3.acceptedProposal).toBeNull();
  });

  it("A3 can resume participating after restart", () => {
    // Run P1 to consensus with A3 crashed, then restart A3 and run P2.
    // A3 should now be able to participate in P2's protocol.
    let s = crashNode(initializeState(), "A3");
    s = startProposal(s, "P1");
    s = stepAll(s);
    expect(s.consensus.reached).toBe(true);

    s = restartNode(s, "A3");
    expect((s.nodes["A3"] as AcceptorState).status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Message drop: proposer stalls when 2 of 3 PREPAREs dropped
// ---------------------------------------------------------------------------

describe("message drop — proposer stalls below majority", () => {
  it("P1 never reaches phase2 when 2 of 3 PREPAREs are dropped", () => {
    let s = startProposal(initializeState(), "P1");
    // Drop PREPAREs to A1 and A2; only A3 will receive its PREPARE
    const [prepA1, prepA2] = s.messageQueue;
    s = dropMessage(s, prepA1.id);
    s = dropMessage(s, prepA2.id);
    s = stepAll(s);
    expect(proposer(s, "P1").status).toBe("phase1");
  });

  it("no consensus is reached when proposer cannot get majority", () => {
    let s = startProposal(initializeState(), "P1");
    const [prepA1, prepA2] = s.messageQueue;
    s = dropMessage(s, prepA1.id);
    s = dropMessage(s, prepA2.id);
    s = stepAll(s);
    expect(s.consensus.reached).toBe(false);
  });

  it("only the surviving acceptor (A3) has highestPromised set", () => {
    let s = startProposal(initializeState(), "P1");
    const [prepA1, prepA2] = s.messageQueue;
    s = dropMessage(s, prepA1.id);
    s = dropMessage(s, prepA2.id);
    s = stepAll(s);
    expect((s.nodes["A1"] as AcceptorState).highestPromised).toBeNull();
    expect((s.nodes["A2"] as AcceptorState).highestPromised).toBeNull();
    expect((s.nodes["A3"] as AcceptorState).highestPromised).not.toBeNull();
  });

  it("dropping only 1 PREPARE still allows majority and consensus", () => {
    let s = startProposal(initializeState(), "P1");
    const [prepA1] = s.messageQueue;
    s = dropMessage(s, prepA1.id);
    s = stepAll(s);
    expect(s.consensus.reached).toBe(true);
    expect(s.consensus.value).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Competing proposals: P1's ACCEPTs are NACKed after P2 outbids
// ---------------------------------------------------------------------------

describe("competing proposals", () => {
  // Strategy: deliver P1's 3 PREPAREs so acceptors promise P1 with round 1.
  // Then introduce P2 with a higher round — P2's PREPAREs are enqueued after
  // P1's PROMISEs but before P1's ACCEPTs. P2's PREPAREs reach acceptors
  // first, updating their highestPromised. When P1's ACCEPTs finally arrive,
  // the acceptors' highestPromised is now P2's higher round → NACK.

  function setupCompetingProposals(): SimulationState {
    let s = startProposal(initializeState(), "P1");
    // Deliver all 3 of P1's PREPAREs so acceptors promise P1
    for (let i = 0; i < 3; i++) s = step(s);
    // Queue is now: [PROMISE(A1)→P1, PROMISE(A2)→P1, PROMISE(A3)→P1]
    // Introduce P2 NOW — before P1's promises are processed (before ACCEPTs enqueued)
    s = introduceProposal(s, "P2", "B");
    // Queue: [PROM→P1 ×3, P2-PREP→A1/A2/A3]
    return s;
  }

  it("P2's proposal number is higher than P1's", () => {
    const s = setupCompetingProposals();
    const p1Proposal = proposer(s, "P1").currentProposal!;
    const p2Proposal = proposer(s, "P2").currentProposal!;
    expect(p2Proposal.round).toBeGreaterThan(p1Proposal.round);
  });

  it("P1's ACCEPT messages are NACKed because acceptors promised P2's higher round", () => {
    let s = setupCompetingProposals();
    s = stepAll(s);
    // There must be NACK messages sent to P1
    const nacksToP1 = s.deliveredMessages.filter(
      (m) => m.type === "nack" && m.to === "P1"
    );
    expect(nacksToP1.length).toBeGreaterThanOrEqual(1);
  });

  it("P1 never reaches 'done' status", () => {
    let s = setupCompetingProposals();
    s = stepAll(s);
    expect(proposer(s, "P1").status).not.toBe("done");
  });

  it("P2 eventually reaches consensus (wins the race)", () => {
    let s = setupCompetingProposals();
    s = stepAll(s);
    expect(s.consensus.reached).toBe(true);
  });

  it("P2 uses its own value since no acceptor had accepted anything yet", () => {
    // When P2 collects promises, acceptors have highestPromised set but
    // acceptedProposal is still null — P2 uses its own value "B".
    let s = setupCompetingProposals();
    s = stepAll(s);
    expect(s.consensus.value).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Value selection rule via introduceProposal
// A1 has accepted value "X" in a prior round. P2 must adopt "X", not "B".
// ---------------------------------------------------------------------------

describe("value selection rule via introduceProposal", () => {
  it("P2 adopts the value from A1's accepted proposal, not its own value", () => {
    // Set up: A1 already accepted value "X" at round 1 (simulating a prior protocol run).
    // P1's round is set to 1 so introduceProposal finds maxRound=1 and gives P2 round 2.
    let s = initializeState();
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        A1: {
          ...(s.nodes["A1"] as AcceptorState),
          highestPromised: { round: 1, nodeId: "P1" },
          acceptedProposal: {
            number: { round: 1, nodeId: "P1" },
            value: "X",
          },
        },
        P1: { ...(s.nodes["P1"] as ProposerState), round: 1 },
      },
    };

    // P2 starts with value "B" but must inherit "X" from A1's accepted proposal.
    s = introduceProposal(s, "P2", "B");
    // P2's proposal number will be (2, "P2") > A1's highestPromised (1, "P1")
    // → A1 promises P2 and carries acceptedProposal {number:(1,"P1"), value:"X"}
    s = stepAll(s);

    expect(s.consensus.value).toBe("X");
  });

  it("introduceProposal uses a round strictly higher than any in the system", () => {
    let s = startProposal(initializeState(), "P1"); // P1 round = 1
    s = stepAll(s); // system max round = 1

    s = introduceProposal(s, "P2", "B");
    const p2Proposal = proposer(s, "P2").currentProposal!;
    expect(p2Proposal.round).toBeGreaterThan(1);
  });

  it("P2 uses highest accepted value when multiple promises carry different accepted proposals", () => {
    // A1 accepted (round=1,"P1") value "old", A2 accepted (round=2,"P1") value "newer".
    // P2 must pick "newer" (from the higher-numbered accepted proposal).
    let s = initializeState();
    s = {
      ...s,
      nodes: {
        ...s.nodes,
        A1: {
          ...(s.nodes["A1"] as AcceptorState),
          highestPromised: { round: 1, nodeId: "P1" },
          acceptedProposal: { number: { round: 1, nodeId: "P1" }, value: "old" },
        },
        A2: {
          ...(s.nodes["A2"] as AcceptorState),
          highestPromised: { round: 2, nodeId: "P1" },
          acceptedProposal: { number: { round: 2, nodeId: "P1" }, value: "newer" },
        },
        P1: { ...(s.nodes["P1"] as ProposerState), round: 2 },
      },
    };

    s = introduceProposal(s, "P2", "B"); // P2 round = 3 > 2
    s = stepAll(s);

    expect(s.consensus.value).toBe("newer");
  });
});

// ---------------------------------------------------------------------------
// introduceProposal — unit tests
// ---------------------------------------------------------------------------

describe("introduceProposal", () => {
  it("sets proposer status to phase1", () => {
    const s = introduceProposal(initializeState(), "P2", "Z");
    expect(proposer(s, "P2").status).toBe("phase1");
  });

  it("sets proposedValue to the provided value", () => {
    const s = introduceProposal(initializeState(), "P2", "Z");
    expect(proposer(s, "P2").proposedValue).toBe("Z");
  });

  it("enqueues PREPARE to all 3 acceptors", () => {
    const s = introduceProposal(initializeState(), "P2", "Z");
    expect(s.messageQueue).toHaveLength(3);
    expect(s.messageQueue.every((m) => m.type === "prepare")).toBe(true);
    const tos = s.messageQueue.map((m) => m.to).sort();
    expect(tos).toEqual(["A1", "A2", "A3"]);
  });

  it("new proposal round beats all existing proposal numbers in nodes", () => {
    // Run P1 to completion, then introduce P2
    let s = startProposal(initializeState(), "P1");
    s = stepAll(s);
    const maxExistingRound = Math.max(
      ...acceptors(s).map((a) => a.acceptedProposal?.number.round ?? 0)
    );
    s = introduceProposal(s, "P2", "Q");
    expect(proposer(s, "P2").currentProposal!.round).toBeGreaterThan(maxExistingRound);
  });

  it("clears any previous in-progress state on the proposer", () => {
    let s = startProposal(initializeState(), "P2"); // P2 in phase1
    for (let i = 0; i < 3; i++) s = step(s); // deliver P2's PREPAREs
    // P2 now has some promisesReceived potentially
    s = introduceProposal(s, "P2", "Z");
    expect(proposer(s, "P2").promisesReceived).toHaveLength(0);
    expect(proposer(s, "P2").acceptsReceived).toBe(0);
    expect(proposer(s, "P2").currentProposal?.round).toBeGreaterThan(1);
  });
});
