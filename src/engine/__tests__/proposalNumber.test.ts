import { describe, it, expect } from "vitest";
import { compareProposalNumbers, isGreaterThan, isGreaterThanOrEqual } from "../proposalNumber.ts";
import type { ProposalNumber } from "../types.ts";

const p = (round: number, nodeId: string): ProposalNumber => ({ round, nodeId });

describe("compareProposalNumbers", () => {
  it("orders by round first: (2,P1) > (1,P2) > (1,P1)", () => {
    expect(compareProposalNumbers(p(2, "P1"), p(1, "P2"))).toBe(1);
    expect(compareProposalNumbers(p(1, "P2"), p(1, "P1"))).toBe(1);
    expect(compareProposalNumbers(p(2, "P1"), p(1, "P1"))).toBe(1);
  });

  it("returns -1 for lesser proposal", () => {
    expect(compareProposalNumbers(p(1, "P1"), p(1, "P2"))).toBe(-1);
    expect(compareProposalNumbers(p(1, "P1"), p(2, "P1"))).toBe(-1);
  });

  it("returns 0 for equal proposals", () => {
    expect(compareProposalNumbers(p(1, "P1"), p(1, "P1"))).toBe(0);
    expect(compareProposalNumbers(p(3, "P2"), p(3, "P2"))).toBe(0);
  });

  it("uses nodeId as tiebreaker when rounds are equal", () => {
    // lexicographic: "P1" < "P2"
    expect(compareProposalNumbers(p(1, "P1"), p(1, "P2"))).toBe(-1);
    expect(compareProposalNumbers(p(1, "P2"), p(1, "P1"))).toBe(1);
  });

  it("full ordering: (1,P1) < (1,P2) < (2,P1)", () => {
    const a = p(1, "P1");
    const b = p(1, "P2");
    const c = p(2, "P1");
    expect(compareProposalNumbers(a, b)).toBe(-1);
    expect(compareProposalNumbers(b, c)).toBe(-1);
    expect(compareProposalNumbers(a, c)).toBe(-1);
  });
});

describe("isGreaterThan", () => {
  it("returns true when a > b", () => {
    expect(isGreaterThan(p(2, "P1"), p(1, "P2"))).toBe(true);
    expect(isGreaterThan(p(1, "P2"), p(1, "P1"))).toBe(true);
  });

  it("returns false when a <= b", () => {
    expect(isGreaterThan(p(1, "P1"), p(1, "P1"))).toBe(false);
    expect(isGreaterThan(p(1, "P1"), p(2, "P1"))).toBe(false);
  });
});

describe("isGreaterThanOrEqual", () => {
  it("returns true when a >= b", () => {
    expect(isGreaterThanOrEqual(p(2, "P1"), p(1, "P2"))).toBe(true);
    expect(isGreaterThanOrEqual(p(1, "P1"), p(1, "P1"))).toBe(true);
  });

  it("returns false when a < b", () => {
    expect(isGreaterThanOrEqual(p(1, "P1"), p(1, "P2"))).toBe(false);
    expect(isGreaterThanOrEqual(p(1, "P1"), p(2, "P1"))).toBe(false);
  });
});
