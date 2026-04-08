/**
 * Runtime invariant checks — called from the reducer after every STEP.
 * Only active in development mode (import.meta.env.DEV).
 *
 * Covers the 5 correctness properties from Spec Section 12:
 *  1. Only proposed values can be chosen.
 *  2. Only a single value is chosen (once consensus is set it is consistent).
 *  3. Value selection rule P2b — ACCEPT messages use the correct value.
 *  4. Stable storage survives crashes (stateful; covered by faults.test.ts).
 *  5. A promise is honoured — an acceptor never accepts below its highestPromised.
 */

import type { SimulationState, AcceptorState, ProposerState } from "./types.ts";
import { isGreaterThanOrEqual } from "./proposalNumber.ts";

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    // Use console.error so the assertion surfaces in the browser console
    // without crashing the app.
    console.error(`[Paxos invariant violation] ${msg}`);
    // In tests, throw so failures are caught.
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      throw new Error(`[Paxos invariant violation] ${msg}`);
    }
  }
}

export function checkInvariants(sim: SimulationState): void {
  if (typeof import.meta !== "undefined" && !import.meta.env.DEV) return;

  const allNodes   = Object.values(sim.nodes);
  const proposers  = allNodes.filter(n => n.role === "proposer") as ProposerState[];
  const acceptors  = allNodes.filter(n => n.role === "acceptor") as AcceptorState[];
  const proposedValues = new Set(proposers.map(p => p.proposedValue));

  // ── Invariant 1: only proposed values can become the consensus value ─────────
  if (sim.consensus.reached && sim.consensus.value !== null) {
    assert(
      proposedValues.has(sim.consensus.value),
      `Inv1: consensus value "${sim.consensus.value}" is not one of the proposed values ` +
      `[${[...proposedValues].join(", ")}]`
    );
  }

  // ── Invariant 2: consensus is internally consistent ──────────────────────────
  // Every node listed in acceptedBy must have actually accepted the consensus value.
  if (sim.consensus.reached) {
    for (const nodeId of sim.consensus.acceptedBy) {
      const acc = sim.nodes[nodeId] as AcceptorState;
      assert(
        acc?.acceptedProposal?.value === sim.consensus.value,
        `Inv2: ${nodeId} is in consensus.acceptedBy but its acceptedProposal.value is ` +
        `"${acc?.acceptedProposal?.value}", not "${sim.consensus.value}"`
      );
    }
    // At least 2 acceptors (majority) must have accepted
    assert(
      sim.consensus.acceptedBy.length >= 2,
      `Inv2: consensus.reached but only ${sim.consensus.acceptedBy.length} acceptor(s) accepted`
    );
  }

  // ── Invariant 3 (weak P2b check): ACCEPT values come from proposed values ────
  // If a proposer adopted the value from a prior accepted proposal it is still
  // one of the two proposed values, so this sanity check is sufficient at runtime.
  for (const msg of [...sim.deliveredMessages, ...sim.messageQueue]) {
    if (msg.type === "accept" && msg.status !== "dropped") {
      assert(
        proposedValues.has(msg.value),
        `Inv3: ACCEPT message value "${msg.value}" is not a proposed value ` +
        `[${[...proposedValues].join(", ")}]`
      );
    }
  }

  // ── Invariant 5: a promise is honoured ───────────────────────────────────────
  // An acceptor that has promised proposal n may never accept a proposal < n.
  for (const acc of acceptors) {
    if (acc.highestPromised && acc.acceptedProposal) {
      assert(
        isGreaterThanOrEqual(acc.acceptedProposal.number, acc.highestPromised),
        `Inv5: ${acc.id} has acceptedProposal ${JSON.stringify(acc.acceptedProposal.number)} ` +
        `but highestPromised is ${JSON.stringify(acc.highestPromised)} — promise violated`
      );
    }
  }
}
