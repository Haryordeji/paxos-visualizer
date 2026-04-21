// Shared layout constants used by both SimulationCanvas (lanes) and
// useD3Animation (arrow positioning). Centralised so both always agree.

export const NODE_IDS = ["P1", "P2", "A1", "A2", "A3"] as const;
export type NodeId = (typeof NODE_IDS)[number];

/** Horizontal padding: distance from SVG edge to the outermost lane centre. */
export const PAD_X = 64;

/** Vertical space at the top reserved for node-ID labels. */
export const HEADER_H = 58;

/** Vertical pixels allocated to each simulation step. */
export const STEP_H = 46;

export const LANE_COLOR: Record<NodeId, string> = {
  P1: "#82aaff", // blue   – proposer
  P2: "#c099ff", // purple – proposer
  A1: "#4fd6be", // teal   – acceptor
  A2: "#4fd6be",
  A3: "#4fd6be",
};

export const ROLE_LABEL: Record<NodeId, string> = {
  P1: "proposer", P2: "proposer",
  A1: "acceptor", A2: "acceptor", A3: "acceptor",
};

/** X coordinate of a node's lane for a given SVG width. */
export function laneX(nodeId: string, svgWidth: number): number {
  const idx = NODE_IDS.indexOf(nodeId as NodeId);
  if (idx < 0) return 0;
  return PAD_X + (idx / (NODE_IDS.length - 1)) * (svgWidth - 2 * PAD_X);
}
