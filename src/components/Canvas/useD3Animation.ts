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
  const labelY    = y - 7;
  const textColor = isDropped ? "#4a5180" : style.color;

  const text = g.append("text")
    .attr("x", labelX).attr("y", labelY)
    .attr("text-anchor",  "middle")
    .attr("font-family",  "ui-monospace, 'Cascadia Code', Consolas, monospace")
    .attr("font-size",    "9px")
    .attr("fill",         textColor)
    .attr("opacity",      0)
    .text(label);

  if (isDropped) text.attr("text-decoration", "line-through");

  // ── Instant rendering (preset batch-draw) ────────────────────────────────
  if (instant) {
    if (isDropped) {
      line.attr("x2", midX);
      g.append("text")
        .attr("x", midX + (toX >= fromX ? 10 : -10)).attr("y", y + 4)
        .attr("text-anchor", "middle").attr("font-size", "13px")
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
      .attr("x2", midX)
      .on("end", () => {
        g.append("text")
          .attr("x", midX + (toX >= fromX ? 10 : -10)).attr("y", y + 4)
          .attr("text-anchor", "middle").attr("font-size", "13px")
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
    ensureArrowsLayer(svg, svgHeight);

    const scrollGroup = svg.select<SVGGElement>(".scroll-group");
    const { deliveredMessages, nodes } = state.sim;
    const animDuration = Math.max(150, state.speedMs * 0.55);

    // ── Detect RESET or LOAD_PRESET (resetKey changed) ────────────────────
    if (state.resetKey !== prevResetKeyRef.current) {
      scrollGroup.selectAll("*").remove();
      scrollGroup.attr("transform", null);
      prevLenRef.current      = 0;
      prevResetKeyRef.current = state.resetKey;
      // Fall through to draw any pre-loaded messages below
    }

    // ── Nothing new to draw ───────────────────────────────────────────────
    const newCount = deliveredMessages.length - prevLenRef.current;
    if (newCount <= 0) return;

    // ── Draw all new arrows ───────────────────────────────────────────────
    // When multiple arrive at once (preset batch), render them instantly;
    // when exactly one arrives (normal step), animate it.
    for (let i = 0; i < newCount; i++) {
      const msgIndex = prevLenRef.current + i;
      const msg      = deliveredMessages[msgIndex];
      const isCrashedDest =
        msg.status === "dropped" &&
        nodes[msg.to]?.status === "crashed";
      const dur = newCount === 1 ? animDuration : 0;
      drawArrow(scrollGroup, msg, msgIndex, svgWidth, isCrashedDest, dur);
    }

    updateScrollTransform(scrollGroup, deliveredMessages.length, svgHeight);
    prevLenRef.current = deliveredMessages.length;

  }, [state.sim.deliveredMessages, state.sim.nodes, state.speedMs, state.resetKey, svgRef, containerRef]);
}
