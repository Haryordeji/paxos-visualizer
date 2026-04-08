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
  { id: "arrow-dropped",  color: "#4a5180" },
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
      .attr("markerWidth",  5)
      .attr("markerHeight", 5)
      .attr("orient",      "auto")
      .append("path")
        .attr("d",    "M 0 1 L 9 5 L 0 9 Z")
        .attr("fill", color);
  });
}

/** Ensure the clipping rect and arrows layer exist. Idempotent. */
function ensureArrowsLayer(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  svgHeight: number
): void {
  let defs = svg.select<SVGDefsElement>("defs");
  if (defs.empty()) defs = svg.insert("defs", ":first-child");

  // Clip path: show only the area below the header labels
  if (defs.select("#timeline-clip").empty()) {
    defs.append("clipPath")
      .attr("id", "timeline-clip")
      .append("rect")
        .attr("class", "clip-rect")
        .attr("x", 0).attr("y", HEADER_H)
        .attr("width", 10000).attr("height", svgHeight);
  } else {
    defs.select("#timeline-clip .clip-rect").attr("height", svgHeight);
  }

  // Arrows layer (on top of lanes layer)
  if (svg.select(".arrows-layer").empty()) {
    svg.append("g")
      .attr("class", "arrows-layer")
      .attr("clip-path", "url(#timeline-clip)")
      .append("g")
        .attr("class", "scroll-group");
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

type ArrowStyle = { color: string; strokeWidth: number; dasharray: string | null };

function arrowStyle(msg: Message): ArrowStyle {
  if (msg.status === "dropped") {
    return { color: "#4a5180", strokeWidth: 1, dasharray: "3 3" };
  }
  switch (msg.type) {
    case "prepare":  return { color: "#82aaff", strokeWidth: 1.5, dasharray: null };
    case "promise":  return { color: "#c3e88d", strokeWidth: 1.5, dasharray: null };
    case "accept":   return { color: "#ff9f6b", strokeWidth: 1.5, dasharray: null };
    case "accepted": return { color: "#4fd6be", strokeWidth: 2.5, dasharray: null };
    case "nack":     return { color: "#ff6b6b", strokeWidth: 1.5, dasharray: "5 3" };
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

  // Y in the scroll-group's local coordinates (origin = top of timeline area)
  const y = (msgIndex + 0.5) * STEP_H;

  const isDropped = msg.status === "dropped";
  const style     = arrowStyle(msg);
  const label     = arrowLabel(msg);

  // Container group for this arrow
  const g = scrollGroup.append("g")
    .attr("class", "arrow-group")
    .attr("data-step", msgIndex)
    .attr("opacity", 1);

  // ── Main line (starts at fromX, animates to destination) ─────────────────
  const line = g.append("line")
    .attr("x1", fromX).attr("y1", y)
    .attr("x2", fromX).attr("y2", y)        // x2 will be animated
    .attr("stroke",           style.color)
    .attr("stroke-width",     style.strokeWidth)
    .attr("stroke-linecap",   "round")
    .attr("marker-end",       `url(#${markerId(msg)})`);

  if (style.dasharray) line.attr("stroke-dasharray", style.dasharray);

  // ── Label text (fades in after the line reaches its destination) ──────────
  const labelX   = isDropped ? midX : midX;
  const labelY   = y - 7;
  const textColor = isDropped ? "#4a5180" : style.color;

  const text = g.append("text")
    .attr("x", labelX).attr("y", labelY)
    .attr("text-anchor", "middle")
    .attr("font-family",  "ui-monospace, 'Cascadia Code', Consolas, monospace")
    .attr("font-size",    "9px")
    .attr("fill",         textColor)
    .attr("opacity",      0)
    .text(label);

  if (isDropped) text.attr("text-decoration", "line-through");

  // ── Branch: dropped ───────────────────────────────────────────────────────
  if (isDropped) {
    // Animate to midpoint, then ✗ marker appears, then group fades
    line.transition()
      .duration(animDuration * 0.65)
      .ease(d3.easeLinear)
      .attr("x2", midX)
      .on("end", () => {
        // ✗ symbol at the tip
        g.append("text")
          .attr("x", midX + (toX >= fromX ? 10 : -10))
          .attr("y", y + 4)
          .attr("text-anchor", "middle")
          .attr("font-size",   "13px")
          .attr("fill",        "#ff6b6b")
          .attr("opacity",     0)
          .transition().duration(120)
          .attr("opacity", 1);

        // Label briefly visible
        text.transition().duration(100).attr("opacity", 0.6);

        // Whole group fades to near-invisible
        g.transition()
          .delay(350)
          .duration(500)
          .attr("opacity", 0.18);
      });
    return;
  }

  // ── Branch: crashed destination (animate full width then fade) ────────────
  if (isCrashedDest) {
    line.transition()
      .duration(animDuration)
      .ease(d3.easeLinear)
      .attr("x2", toX)
      .on("end", () => {
        text.transition().duration(100).attr("opacity", 0.5);
        g.transition()
          .delay(250)
          .duration(400)
          .attr("opacity", 0.15);
      });
    return;
  }

  // ── Branch: normal delivery ───────────────────────────────────────────────
  line.transition()
    .duration(animDuration)
    .ease(d3.easeLinear)
    .attr("x2", toX)
    .on("end", () => {
      text.transition().duration(180).attr("opacity", 1);
    });
}

// ─── Scroll-group position ────────────────────────────────────────────────────

function updateScrollTransform(
  scrollGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  totalMessages: number,
  svgHeight: number
): void {
  const usableH    = svgHeight - HEADER_H;
  const maxVisible = Math.max(1, Math.floor(usableH / STEP_H));
  const overflow   = Math.max(0, totalMessages - maxVisible);

  scrollGroup.attr("transform",
    `translate(0, ${HEADER_H - overflow * STEP_H})`
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useD3Animation(
  svgRef:       RefObject<SVGSVGElement | null>,
  containerRef: RefObject<HTMLDivElement | null>
): void {
  const { state }    = useSimulation();
  const prevLenRef   = useRef(0);

  useEffect(() => {
    const svgEl = svgRef.current;
    const cont  = containerRef.current;
    if (!svgEl || !cont) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgEl);

    const svgWidth  = parseFloat(svg.attr("width")  || "0");
    const svgHeight = parseFloat(svg.attr("height") || "0");
    if (svgWidth === 0 || svgHeight === 0) return;

    // Ensure structural elements exist (idempotent)
    ensureMarkers(svg);
    ensureArrowsLayer(svg, svgHeight);

    const scrollGroup = svg.select<SVGGElement>(".scroll-group");
    const { deliveredMessages, nodes } = state.sim;
    const animDuration = Math.max(150, state.speedMs * 0.55);

    // ── RESET: deliveredMessages was cleared ──────────────────────────────
    if (deliveredMessages.length === 0 && prevLenRef.current > 0) {
      scrollGroup.selectAll("*").remove();
      scrollGroup.attr("transform", null);
      prevLenRef.current = 0;
      return;
    }

    // ── No new message this tick ──────────────────────────────────────────
    if (deliveredMessages.length === prevLenRef.current) return;

    // ── Draw the new arrow ────────────────────────────────────────────────
    const msgIndex = deliveredMessages.length - 1;
    const msg      = deliveredMessages[msgIndex];

    // A "crashed destination" is when the node is currently crashed but
    // the message was not manually dropped (engine marked it dropped).
    // We can distinguish: manual drop ⟹ node is active (user dropped a queued msg);
    // crashed drop ⟹ the destination node is (still) crashed.
    const isCrashedDest =
      msg.status === "dropped" &&
      nodes[msg.to]?.status === "crashed";

    drawArrow(scrollGroup, msg, msgIndex, svgWidth, isCrashedDest, animDuration);

    // Adjust viewport so the latest step is always visible
    updateScrollTransform(scrollGroup, deliveredMessages.length, svgHeight);

    prevLenRef.current = deliveredMessages.length;

  // Include nodes so isCrashedDest uses current crash state when a new message
  // is delivered. The length-guard prevents redrawing on node-only changes.
  }, [state.sim.deliveredMessages, state.sim.nodes, state.speedMs, svgRef, containerRef]);
}
