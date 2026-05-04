import { useRef, useEffect } from "react";
import * as d3 from "d3";
import { useSimulation } from "../../state/context.tsx";
import { useD3Animation } from "./useD3Animation.ts";
import {
  NODE_IDS, HEADER_H,
  LANE_COLOR, ROLE_LABEL,
  laneX, computeSvgHeight,
} from "./layout.ts";
import type { NodeId } from "./layout.ts";

// ─── Component ───────────────────────────────────────────────────────────────
//
// React renders only:  <div ref={containerRef}><svg ref={svgRef} /></div>
//
// D3 owns the entire SVG interior, split into two layers:
//   .lanes-layer   — vertical timeline lanes, labels, crash overlays
//                    Redrawn from scratch on resize or node status change.
//   .arrows-layer  — message arrows, managed by useD3Animation.
//                    Never cleared by the lanes effect.

export function SimulationCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const { state }    = useSimulation();

  // ── SVG sizing effect ──────────────────────────────────────────────────────
  // Single source of truth for SVG width and height. Width tracks the container;
  // height grows with delivered-message count so the timeline can extend below
  // the viewport, where native overflow-y on the container handles scroll.
  useEffect(() => {
    const container = containerRef.current;
    const svgEl     = svgRef.current;
    if (!container || !svgEl) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgEl);

    function update() {
      const { width, height } = container!.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const svgH = computeSvgHeight(height, state.sim.deliveredMessages.length);
      svg.attr("width", width).attr("height", svgH);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [state.sim.deliveredMessages.length, state.resetKey]);

  // ── Lanes effect ───────────────────────────────────────────────────────────
  // Redraws ONLY the .lanes-layer on container resize, node status change, or
  // when the SVG grows (so lane lines / crash overlays / ticks span the new height).
  useEffect(() => {
    const container = containerRef.current;
    const svgEl     = svgRef.current;
    if (!container || !svgEl) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgEl);

    function draw() {
      const { width } = container!.getBoundingClientRect();
      const height    = parseFloat(svg.attr("height") || "0");
      if (width === 0 || height === 0) return;

      // Ensure the lanes layer exists (below the arrows layer)
      let lanesLayer = svg.select<SVGGElement>(".lanes-layer");
      if (lanesLayer.empty()) {
        // Insert before .arrows-layer if it exists, else just append
        const arrowsLayer = svg.select(".arrows-layer");
        if (arrowsLayer.empty()) {
          lanesLayer = svg.append("g").attr("class", "lanes-layer");
        } else {
          lanesLayer = svg.insert("g", ".arrows-layer").attr("class", "lanes-layer");
        }
      }

      // Clear only the lanes layer — arrows layer is untouched
      lanesLayer.selectAll("*").remove();

      NODE_IDS.forEach((id) => {
        const x       = laneX(id, width);
        const color   = LANE_COLOR[id as NodeId];
        const crashed = state.sim.nodes[id]?.status === "crashed";
        const lineClr = crashed ? "#ff6b6b" : color;

        // Crash overlay column
        if (crashed) {
          lanesLayer.append("rect")
            .attr("x",      x - 12)
            .attr("y",      HEADER_H)
            .attr("width",  24)
            .attr("height", height - HEADER_H)
            .attr("fill",   "rgba(255,107,107,0.07)");
        }

        // Dashed vertical lane line
        lanesLayer.append("line")
          .attr("x1", x).attr("y1", HEADER_H)
          .attr("x2", x).attr("y2", height)
          .attr("stroke",           lineClr)
          .attr("stroke-opacity",   crashed ? 0.65 : 0.38)
          .attr("stroke-width",     crashed ? 2    : 1.5)
          .attr("stroke-dasharray", "5 5");

        // Node-ID badge (circle)
        lanesLayer.append("circle")
          .attr("cx", x).attr("cy", 24)
          .attr("r",  18)
          .attr("fill",         crashed
            ? "rgba(255,107,107,0.22)"
            : "rgba(20,23,40,0.92)")
          .attr("stroke",       lineClr)
          .attr("stroke-width", crashed ? 2.5 : 2);

        // Node-ID label
        lanesLayer.append("text")
          .attr("x", x).attr("y", 29)
          .attr("text-anchor", "middle")
          .attr("font-family", "ui-monospace, 'Cascadia Code', Consolas, monospace")
          .attr("font-size",   "14px")
          .attr("font-weight", "700")
          .attr("fill",        lineClr)
          .text(id);

        // Role sub-label
        lanesLayer.append("text")
          .attr("x", x).attr("y", 47)
          .attr("text-anchor", "middle")
          .attr("font-family", "ui-monospace, 'Cascadia Code', Consolas, monospace")
          .attr("font-size",   "11px")
          .attr("fill",        lineClr)
          .attr("opacity",     0.75)
          .text(crashed ? "crashed" : ROLE_LABEL[id as NodeId]);

        // Step tick marks along the lane (subtle horizontal notches)
        // These give the "timeline" feel even when no arrows are drawn yet.
        const tickCount = Math.floor((height - HEADER_H) / 40);
        for (let t = 0; t < tickCount; t++) {
          const ty = HEADER_H + (t + 1) * 40 - 20;
          lanesLayer.append("line")
            .attr("x1", x - 3).attr("y1", ty)
            .attr("x2", x + 3).attr("y2", ty)
            .attr("stroke",         lineClr)
            .attr("stroke-opacity", 0.25)
            .attr("stroke-width",   1.5);
        }
      });

      // Lane index labels for PAD_X reference (purely cosmetic: step counter)
      // (nothing extra needed here)
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();

  }, [state.sim.nodes, state.sim.deliveredMessages.length]);   // redraw lanes on crash/restart and when SVG grows

  // ── Message animation (Step 5) ─────────────────────────────────────────────
  useD3Animation(svgRef, containerRef);

  return (
    <div ref={containerRef} className="simulation-canvas">
      {/* React owns only this empty shell — D3 populates the SVG interior */}
      <svg ref={svgRef} />
    </div>
  );
}

