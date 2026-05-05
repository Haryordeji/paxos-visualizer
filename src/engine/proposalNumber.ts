import type { ProposalNumber } from "./types.ts";

/**
 * Compare two proposal numbers lexicographically: round first, then nodeId.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareProposalNumbers(a: ProposalNumber, b: ProposalNumber): -1 | 0 | 1 {
  if (a.round !== b.round) {
    return a.round < b.round ? -1 : 1;
  }
  if (a.nodeId !== b.nodeId) {
    return a.nodeId < b.nodeId ? -1 : 1;
  }
  return 0;
}

export function isGreaterThan(a: ProposalNumber, b: ProposalNumber): boolean {
  return compareProposalNumbers(a, b) === 1;
}

export function isGreaterThanOrEqual(a: ProposalNumber, b: ProposalNumber): boolean {
  return compareProposalNumbers(a, b) >= 0;
}
