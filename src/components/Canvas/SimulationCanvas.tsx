import { useRef, useEffect } from "react";
import * as d3 from "d3";
import { useSimulation } from "../../state/context.tsx";

// ─── Lane layout constants ───────────────────────────────────────────────────
const NODE_IDS = ["P1", "P2", "A1", "A2", "A3"] as const;
type NodeId = (typeof NODE_IDS)[number];

const LANE_COLOR: Record<NodeId, string> = {
  P1: "#82aaff", // blue   — proposer
  P2: "#c099ff", // purple — proposer
  A1: "#4fd6be", // teal   — acceptor
  A2: "#4fd6be",
  A3: "#4fd6be",
};

const ROLE_LABEL: Record<NodeId, string> = {
  P1: "proposer", P2: "proposer",
  A1: "acceptor", A2: "acceptor", A3: "acceptor",
};

const PAD_X    = 64;  // horizontal padding: outermost lane centre from edge
const HEADER_H = 52;  // vertical space reserved for labels before the timeline

// ─── Component ───────────────────────────────────────────────────────────────

// React renders only the wrapper div and the bare <svg> element.
// D3 owns every SVG child — nothing is rendered in JSX inside <svg>.
export function SimulationCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const { state }    = useSimulation();

  useEffect(() => {
    const container = containerRef.current;
    const svgEl     = svgRef.current;
    if (!container || !svgEl) return;

    function draw() {
      const { width, height } = container!.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      const svg = d3.select(svgEl!)
        .attr("width",  width)
        .attr("height", height);

      // D3 owns everything inside — clear on every redraw.
      svg.selectAll("*").remove();

      const laneCount = NODE_IDS.length;

      // Compute the X position for each lane, evenly spaced.
      const laneX = (i: number) =>
        PAD_X + (i / (laneCount - 1)) * (width - 2 * PAD_X);

      NODE_IDS.forEach((id, i) => {
        const x       = laneX(i);
        const color   = LANE_COLOR[id];
        const crashed = state.sim.nodes[id]?.status === "crashed";
        const lineColor = crashed ? "#ff6b6b" : color;

        // ── crashed: semi-transparent red column behind the lane ────────────
        if (crashed) {
          svg.append("rect")
            .attr("x",      x - 10)
            .attr("y",      HEADER_H)
            .attr("width",  20)
            .attr("height", height - HEADER_H)
            .attr("fill",   "rgba(255,107,107,0.07)");
        }

        // ── vertical timeline lane ───────────────────────────────────────────
        svg.append("line")
          .attr("x1", x).attr("y1", HEADER_H)
          .attr("x2", x).attr("y2", height)
          .attr("stroke",           lineColor)
          .attr("stroke-opacity",   crashed ? 0.5 : 0.28)
          .attr("stroke-width",     crashed ? 1.5 : 1)
          .attr("stroke-dasharray", "5 5");

        // ── label circle ────────────────────────────────────────────────────
        svg.append("circle")
          .attr("cx", x).attr("cy", 22)
          .attr("r",  15)
          .attr("fill",         crashed
            ? "rgba(255,107,107,0.18)"
            : "rgba(20,23,40,0.92)")
          .attr("stroke",       lineColor)
          .attr("stroke-width", crashed ? 2 : 1.5);

        // ── node-ID label ────────────────────────────────────────────────────
        svg.append("text")
          .attr("x", x).attr("y", 27)
          .attr("text-anchor",  "middle")
          .attr("font-family",  "ui-monospace, 'Cascadia Code', Consolas, monospace")
          .attr("font-size",    "11px")
          .attr("font-weight",  "700")
          .attr("fill",         lineColor)
          .text(id);

        // ── role sub-label ───────────────────────────────────────────────────
        svg.append("text")
          .attr("x", x).attr("y", 42)
          .attr("text-anchor", "middle")
          .attr("font-family", "ui-monospace, 'Cascadia Code', Consolas, monospace")
          .attr("font-size",   "9px")
          .attr("fill",        crashed ? "#ff6b6b" : color)
          .attr("opacity",     0.6)
          .text(crashed ? "crashed" : ROLE_LABEL[id]);
      });
    }

    // Initial draw, then redraw on container resize.
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();

    // Re-run whenever node crash/active status changes so the overlay updates.
  }, [state.sim.nodes]);

  return (
    <div ref={containerRef} className="simulation-canvas">
      {/* React renders no SVG children — D3 owns the entire SVG interior */}
      <svg ref={svgRef} />
    </div>
  );
}
