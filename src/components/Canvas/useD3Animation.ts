import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { RefObject } from "react";
import { useSimulation } from "../../state/context.tsx";
import type { Message } from "../../engine/types.ts";
import { HEADER_H, STEP_H, laneX } from "./layout.ts";

// ─── Arrow-head marker definitions ───────────────────────────────────────────

type MarkerDef = { id: string; color: string };

const MARKER_DEFS: MarkerDef[] = [
  { id: "arrow-prepare",  color: "#82aaff" },
  { id: "arrow-promise",  color: "#c3e88d" },
  { id: "arrow-accept",   color: "#ff9f6b" },
  { id: "arrow-accepted", color: "#4fd6be" },
  { id: "arrow-nack",     color: "#ff6b6b" },
  { id: "arrow-dropped",  color: "#6a72a0" },
];

function markerId(msg: Message): string {
  return msg.status === "dropped" ? "arrow-dropped" : `arrow-${msg.type}`;
}

/** Ensure all arrowhead markers exist in the SVG <defs>. Idempotent. */
function ensureMarkers(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
  let defs = svg.select<SVGDefsElement>("defs");
  if (defs.empty()) defs = svg.insert("defs", ":first-child");

  MARKER_DEFS.forEach(({ id, color }) => {
    if (!defs.select(`#${id}`).empty()) return;
    defs.append("marker")
      .attr("id",          id)
      .attr("viewBox",     "0 0 10 10")
      .attr("refX",        8)
      .attr("refY",        5)
      .attr("markerWidth",  7)
      .attr("markerHeight", 7)
      .attr("orient",      "auto")
      .append("path")
        .attr("d",    "M 0 1 L 9 5 L 0 9 Z")
        .attr("fill", color);
  });
}

/** Ensure the arrows layer exists. Idempotent. */
function ensureArrowsLayer(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
): void {
  if (svg.select(".arrows-layer").empty()) {
    svg.append("g")
      .attr("class", "arrows-layer")
      .append("g")
        .attr("class", "scroll-group")
        .attr("transform", `translate(0, ${HEADER_H})`);
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

type ArrowStyle = { color: string; strokeWidth: number; dasharray: string | null };

function arrowStyle(msg: Message): ArrowStyle {
  if (msg.status === "dropped") {
    return { color: "#6a72a0", strokeWidth: 1.5, dasharray: "3 3" };
  }
  switch (msg.type) {
    case "prepare":  return { color: "#82aaff", strokeWidth: 2.5, dasharray: null };
    case "promise":  return { color: "#c3e88d", strokeWidth: 2.5, dasharray: null };
    case "accept":   return { color: "#ff9f6b", strokeWidth: 2.5, dasharray: null };
    case "accepted": return { color: "#4fd6be", strokeWidth: 3.5, dasharray: null };
    case "nack":     return { color: "#ff6b6b", strokeWidth: 2.5, dasharray: "5 3" };
  }
}

function arrowLabel(msg: Message): string {
  const { round, nodeId } = msg.proposalNumber;
  const pn = `(${round},${nodeId})`;
  switch (msg.type) {
    case "prepare":  return `P${pn}`;
    case "promise":  return msg.accepted ? `PR${pn} "${msg.accepted.value}"` : `PR${pn}`;
    case "accept":   return `A${pn} "${msg.value}"`;
    case "accepted": return `OK${pn} "${msg.value}"`;
    case "nack":     return `✗${pn}`;
  }
}

// ─── Core drawing function ────────────────────────────────────────────────────

/**
 * Draw one arrow into the scroll group.
 *
 * @param animDuration  Animation duration in ms. Pass 0 for instant rendering
 *                      (used when preset pre-steps are batch-drawn on load).
 */
function drawArrow(
  scrollGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  msg: Message,
  msgIndex: number,
  svgWidth: number,
  isCrashedDest: boolean,
  animDuration: number
): void {
  const fromX = laneX(msg.from, svgWidth);
  const toX   = laneX(msg.to,   svgWidth);
  const midX  = (fromX + toX) / 2;
  const y     = (msgIndex + 0.5) * STEP_H;

  const isDropped = msg.status === "dropped";
  const style     = arrowStyle(msg);
  const label     = arrowLabel(msg);
  const instant   = animDuration === 0;

  const g = scrollGroup.append("g")
    .attr("class", "arrow-group")
    .attr("data-step", msgIndex)
    .attr("opacity", 1);

  const line = g.append("line")
    .attr("x1", fromX).attr("y1", y)
    .attr("x2", fromX).attr("y2", y)
    .attr("stroke",         style.color)
    .attr("stroke-width",   style.strokeWidth)
    .attr("stroke-linecap", "round")
    .attr("marker-end",     `url(#${markerId(msg)})`);

  if (style.dasharray) line.attr("stroke-dasharray", style.dasharray);

  const labelX    = midX;
  const labelY    = y - 9;
  const textColor = isDropped ? "#6a72a0" : style.color;

  const text = g.append("text")
    .attr("x", labelX).attr("y", labelY)
    .attr("text-anchor",  "middle")
    .attr("font-family",  "ui-monospace, 'Cascadia Code', Consolas, monospace")
    .attr("font-size",    "12px")
    .attr("fill",         textColor)
    .attr("opacity",      0)
    .text(label);

  if (isDropped) text.attr("text-decoration", "line-through");

  // ── Instant rendering (preset batch-draw) ────────────────────────────────
  if (instant) {
    if (isDropped) {
      line.attr("x2", toX - (toX >= fromX ? 30 : -30));
      g.append("text")
        .attr("x", midX + (toX >= fromX ? 10 : -10)).attr("y", y + 4)
        .attr("text-anchor", "middle").attr("font-size", "15px")
        .attr("fill", "#ff6b6b").attr("opacity", 1);
      text.attr("opacity", 0.6);
      g.attr("opacity", 0.18);
    } else if (isCrashedDest) {
      line.attr("x2", toX);
      text.attr("opacity", 0.5);
      g.attr("opacity", 0.15);
    } else {
      line.attr("x2", toX);
      text.attr("opacity", 1);
    }
    return;
  }

  // ── Animated rendering ────────────────────────────────────────────────────
  if (isDropped) {
    line.transition()
      .duration(animDuration * 0.65)
      .ease(d3.easeLinear)
      .attr("x2", toX - (toX >= fromX ? 30 : -30))
      .on("end", () => {
        g.append("text")
          .attr("x", midX + (toX >= fromX ? 10 : -10)).attr("y", y + 4)
          .attr("text-anchor", "middle").attr("font-size", "15px")
          .attr("fill", "#ff6b6b").attr("opacity", 0)
          .transition().duration(120).attr("opacity", 1);
        text.transition().duration(100).attr("opacity", 0.6);
        g.transition().delay(350).duration(500).attr("opacity", 0.18);
      });
    return;
  }

  if (isCrashedDest) {
    line.transition()
      .duration(animDuration)
      .ease(d3.easeLinear)
      .attr("x2", toX)
      .on("end", () => {
        text.transition().duration(100).attr("opacity", 0.5);
        g.transition().delay(250).duration(400).attr("opacity", 0.15);
      });
    return;
  }

  line.transition()
    .duration(animDuration)
    .ease(d3.easeLinear)
    .attr("x2", toX)
    .on("end", () => {
      text.transition().duration(180).attr("opacity", 1);
    });
}

// ─── Scroll-group position ────────────────────────────────────────────────────

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useD3Animation(
  svgRef:       RefObject<SVGSVGElement | null>,
  containerRef: RefObject<HTMLDivElement | null>
): void {
  const { state } = useSimulation();
  const prevLenRef      = useRef(0);
  const prevResetKeyRef = useRef(state.resetKey);

  useEffect(() => {
    const svgEl = svgRef.current;
    const cont  = containerRef.current;
    if (!svgEl || !cont) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgEl);
    const svgWidth  = parseFloat(svg.attr("width")  || "0");
    const svgHeight = parseFloat(svg.attr("height") || "0");
    if (svgWidth === 0 || svgHeight === 0) return;

    ensureMarkers(svg);
    ensureArrowsLayer(svg);

    const scrollGroup = svg.select<SVGGElement>(".scroll-group");
    const { deliveredMessages, nodes } = state.sim;
    const animDuration = Math.max(150, state.speedMs * 0.55);

    // Are we close enough to the bottom that the user is "watching the latest"?
    // The SVG-sizing effect has already grown the SVG for the new arrow at this
    // point, so this measures distance to the *new* bottom. With a single new
    // arrow per tick (normal play) the user's tracked-bottom position lands
    // exactly STEP_H from the new bottom, comfortably inside the 1.5*STEP_H
    // threshold. If the user manually scrolled up to inspect, they fall outside
    // and we leave them there.
    const isResetCycle  = state.resetKey !== prevResetKeyRef.current;
    const wasNearBottom =
      cont.scrollTop + cont.clientHeight >= cont.scrollHeight - STEP_H * 1.5;

    // ── Detect RESET or LOAD_PRESET (resetKey changed) ────────────────────
    if (isResetCycle) {
      scrollGroup.selectAll("*").remove();
      prevLenRef.current      = 0;
      prevResetKeyRef.current = state.resetKey;
      // Fall through to draw any pre-loaded messages below
    }

    // ── Draw any new arrows ───────────────────────────────────────────────
    // When multiple arrive at once (preset batch), render them instantly;
    // when exactly one arrives (normal step), animate it.
    const newCount = deliveredMessages.length - prevLenRef.current;
    if (newCount > 0) {
      for (let i = 0; i < newCount; i++) {
        const msgIndex = prevLenRef.current + i;
        const msg      = deliveredMessages[msgIndex];
        const isCrashedDest =
          msg.status === "dropped" &&
          nodes[msg.to]?.status === "crashed";
        const dur = newCount === 1 ? animDuration : 0;
        drawArrow(scrollGroup, msg, msgIndex, svgWidth, isCrashedDest, dur);
      }
      prevLenRef.current = deliveredMessages.length;
    }

    // ── Native auto-scroll: jump to top on reset, follow if near bottom ───
    if (isResetCycle) {
      cont.scrollTop = 0;
    } else if (newCount > 0 && wasNearBottom) {
      cont.scrollTop = cont.scrollHeight - cont.clientHeight;
    }

  }, [state.sim.deliveredMessages, state.sim.nodes, state.speedMs, state.resetKey, svgRef, containerRef]);
}
