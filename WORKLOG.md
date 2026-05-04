**May 4**
***Entry 17***

Demo prep — Phase E (event log tooltips from DEMO_PREP_SPEC.md).

Step 1: Extracted the per-message plain-English explainer from `ProtocolExplainer.tsx` into an exported pure function `explainMessage(msg: Message, _state: SimulationState): string`. Renamed from the local `explain` and made position-independent — it describes what a message *means in protocol terms*, not "what just happened in the latest step." Safe to call for delivered, queued, or dropped messages. The component body now calls `explainMessage(last, state.sim)`. The `_state` prefix satisfies `noUnusedParameters: true` while preserving the spec-prescribed signature; the parameter is reserved for future explanations that need broader context.

Step 2: In `EventLog.tsx`, imported `explainMessage` and attached it as the native `title` attribute on every event-log row — both `DeliveredEntry` and `QueuedEntry`. Both sub-components now take `sim: SimulationState` so the explanation is computed at render time. The previous queued-row tooltip ("Click to drop this message") is replaced by the protocol explanation per spec; click-to-drop is still discoverable via the `queue-title-hint` ("— click to drop") in the queue header and the `queue-drop-hint` (✗) at the right edge of each droppable row.

Files modified:
- `src/components/InfoPanel/ProtocolExplainer.tsx` — export `explainMessage`; component consumes it
- `src/components/InfoPanel/EventLog.tsx` — import and attach as `title` on delivered + queued entries

69/69 tests pass, build clean. Visual verification (hover behavior matching the protocol explainer panel) still pending — dev server unavailable in this session.

---

**May 4**
***Entry 16***

Demo prep — Phase D polish (DEMO_PREP_SPEC.md).

D1: Lightened the dropped-message color from `#6a72a0` (dark indigo-tinted gray) to `#aaaaaa` (mid neutral gray) so dropped arrows read more clearly against the near-black canvas (`--bg: #0d0f1a`). Updated in two places to keep them in sync:
- CSS variable `--gray` in `src/index.css` — also used by `.event-dropped`, `.msg-dropped`, `.queue-dropped-tag` in the event log/queue panels, so those lighten too (consistent treatment per spec).
- Inline color `#6a72a0` in `src/components/Canvas/useD3Animation.ts` — used by the `arrow-dropped` SVG marker definition and by `arrowStyle()` for the line stroke.

D2: Bumped role sub-label Y from 47 to 61 (+14px) in `src/components/Canvas/SimulationCanvas.tsx` so there's more breathing room between the node-ID badge (cy=24, r=18, bottom edge at y=42) and the "proposer"/"acceptor" label. Note: the label baseline now sits at y=61, 3px below `HEADER_H=58` where the dashed lane line begins. Since both label and lane use the same `lineClr` and the lane is dashed/low-opacity, the visual overlap is minimal — flagging for visual confirmation.

Files modified:
- `src/index.css` — `--gray` variable
- `src/components/Canvas/useD3Animation.ts` — two `#6a72a0` inline references
- `src/components/Canvas/SimulationCanvas.tsx` — role label Y

69/69 tests pass, build clean. Visual verification of the lane-line/label proximity still pending (dev server unavailable in this session).

---

**May 4**
***Entry 15***

Demo prep — Phase C (canvas vertical scroll from DEMO_PREP_SPEC.md).

**Approach (a) chosen**: native `overflow-y: auto` on the container, SVG height grows with content, D3 scroll transform deleted. Approach (b) — keeping the D3 transform and layering native scroll — was rejected because the two scroll mechanisms would fight during auto-play.

Three architectural changes:

1. **Single source of truth for SVG height.** New helper `computeSvgHeight(containerH, deliveredCount) = max(containerH, HEADER_H + (deliveredCount + 2) * STEP_H)` in `layout.ts`. A new dedicated effect in `SimulationCanvas.tsx` (declared before the lanes effect) owns `svg.attr("width", w).attr("height", svgH)`. Lanes effect now *reads* height from `svg.attr("height")` instead of computing its own. This avoids a race where a crash mid-playback (which re-runs the lanes effect on `state.sim.nodes` change) would shrink the SVG back to container height even though arrows had grown beyond it.

2. **D3 scroll transform deleted; clip-path deleted.** `updateScrollTransform` is gone. `.scroll-group` gets a static `translate(0, ${HEADER_H})` once at layer creation, never updated — arrows render at their natural absolute SVG Y. `#timeline-clip` clip-path removed: with native scroll, the container clips visually and the SVG never draws above y=0 or beyond declared height, so no clip-path is needed.

3. **Native auto-scroll-to-latest with "follow if near bottom".** Standard chat-scroll UX: before drawing, capture `wasNearBottom = scrollTop + clientHeight >= scrollHeight - STEP_H * 1.5`. After drawing, jump scrollTop to the new bottom only if the user was already there. On `resetKey` change (RESET / LOAD_PRESET), force `scrollTop = 0` so each preset starts at the top. Threshold `STEP_H * 1.5` (≈70px) is wide enough that a user tracking the latest stays in auto-follow as new arrows arrive, but tight enough that a manual scroll up disengages auto-follow until the user scrolls back near the bottom.

**Tradeoff accepted**: header (node ID badges + role labels) scrolls away with content. SVG `position: sticky` doesn't apply; a sticky header would need a structural split into two stacked elements. Lane X positions stay consistent across the full SVG, so the user keeps spatial context. Spec doesn't require sticky.

CSS additions:
- `.simulation-canvas`: `overflow-y: auto`, `overflow-x: hidden`, `overscroll-behavior: contain`, `min-height: 0` (the last is critical so `1fr` grid cell allows shrink and lets `overflow-y` engage).
- `.simulation-canvas svg`: dropped `height: 100%`; height is now set imperatively.

Files modified:
- `src/components/Canvas/layout.ts` — added `computeSvgHeight`
- `src/index.css` — `.simulation-canvas` and `svg` rules
- `src/components/Canvas/SimulationCanvas.tsx` — new height effect, lanes effect reads from SVG attr, lanes deps include `deliveredMessages.length`
- `src/components/Canvas/useD3Animation.ts` — deleted `updateScrollTransform`, deleted clip-path block, static `.scroll-group` transform, native auto-scroll added to main effect

69/69 tests pass, build clean. **Visual verification deferred**: dev server launch was blocked in this session. Manual browser verification still needed against the 7-step verification list in `/Users/ayosanya/.claude/plans/smooth-meandering-dahl.md`.

---

**May 4**
***Entry 14***

Demo prep — Phase B (preset rework from DEMO_PREP_SPEC.md).

B1: Rewrote `buildPreset` so each preset returns an initial state with scenario *setup* applied (crashed nodes, queued messages, pre-dropped messages) but **zero engine steps executed**. Previously presets ran multiple `step()` calls synchronously, so the user saw a board with arrows already drawn (rendered instantly because `useD3Animation` skips animation when `newCount > 1`). Now arrows animate from the very first delivery — the story of how state arose is preserved.

Per-preset:
- Happy Path: `startProposal(P1)`. Queue: 3 PREPAREs from P1.
- Competing Proposals: `startProposal(P1)` then `introduceProposal(P2, "B")`. Queue: P1's 3 PREPAREs + P2's 3 PREPAREs. P2's higher round causes acceptors to repromise after their P1 promises, NACKing P1's later ACCEPTs.
- Crash Recovery: `crashNode(A3)` first, then `startProposal(P1)`. Queue: 3 PREPAREs to A1/A2/A3 (the one to A3 drops on delivery because recipient is crashed). With A1 being implemented (ACCEPT only to promisers), P1 cleanly enqueues ACCEPTs to A1+A2 only.
- Message Loss: `startProposal(P1)`, then `dropMessage` on the PREPARE to A2. **Semantic change**: previous preset dropped 2 PREPAREs to demonstrate "P1 stalls below majority"; spec now drops only 1 to demonstrate "Paxos tolerates a lost message — A1 + A3 still form majority, consensus reached." The PresetControls.tsx tooltip is now stale and should be rewritten in a follow-up to match.

Refactored to a `PRESETS: Record<PresetName, Preset>` map keyed by preset name. Each entry holds `{ autoPlay: boolean; build: () => SimulationState }`. `buildPreset` is now a 3-line reader.

B2: All four presets set `autoPlay: true` (Message Loss was previously `false`). The `LOAD_PRESET` reducer case unchanged — already pulls `autoPlay` from `buildPreset`'s return, which is now driven by the per-preset definition.

Files modified:
- `src/state/reducer.ts` — `Preset` type + `PRESETS` map + simplified `buildPreset`. No `step()` calls in any preset.

69/69 tests pass, build clean. No reducer tests existed; engine primitives are exercised by the existing engine test suite.

---

**May 4**
***Entry 13***

Demo prep — Phase A (engine corrections from DEMO_PREP_SPEC.md).

A1: Reverted Entry 12. ACCEPT messages are sent only to acceptors in `promisesReceived` for the current proposal, matching Lamport's primary algorithm description ("send accept request to each of those acceptors"). Removes the confusion in the Crash Recovery preset where P1 appeared to ACCEPT a crashed A3 it had never heard a PROMISE from.

A2: `crashNode` now filters `messageQueue` entries where `from === crashedNodeId`. Messages targeting a crashed node are unchanged — they remain queued and are dropped on delivery, so the arrow still draws (visually shows we tried to reach a dead node). The sender-crash guard in `step()` (Entry 11) becomes defensive but is left in place.

Files modified:
- `src/engine/simulation.ts` — PROMISE handler enumerates `newPromises` instead of all acceptors when enqueuing ACCEPTs
- `src/engine/faults.ts` — `crashNode` filters `messageQueue` by sender
- `src/engine/__tests__/simulation.test.ts` — 2 tests now expect 2 ACCEPTs (to A1, A2) instead of 3
- `src/engine/__tests__/faults.test.ts` — added 4 tests covering A2 acceptance criteria (mid-Phase-1 proposer crash, mid-Phase-2 proposer crash, acceptor crash with queued PROMISE, recipient-crash leaves queue intact)

69/69 tests pass, build clean.

---

**April 21**
***Entry 12***

Bug fix: ACCEPT messages were only sent to the 2 acceptors that replied with PROMISE (the majority), not to all 3 acceptors.

Root cause: The PROMISE handler in `step()` iterated over `newPromises` (the promises received so far) when enqueuing ACCEPTs, instead of iterating over all acceptors. In standard Paxos, Phase 2 sends ACCEPT to all acceptors.

Fix: Changed the ACCEPT loop to enumerate all acceptor nodes instead of just the promisers.

Files modified:
- `src/engine/simulation.ts` — ACCEPT enqueue loop now sends to all acceptors
- `src/engine/__tests__/simulation.test.ts` — updated 2 tests to expect 3 ACCEPTs instead of 2

65/65 tests pass, build clean.

---

**April 21**
***Entry 11***

Bug fix: crashed nodes could still send messages (promises, accepted, nacks) that were queued before the crash.

Root cause: `step()` in `simulation.ts` only checked if the *recipient* was crashed, never the *sender*. Messages already in the queue from a node that subsequently crashed were delivered normally.

Fix: Added a sender-crashed check in `step()` before the existing recipient-crashed check. Messages from crashed senders are now logged as dropped, same as messages to crashed recipients.

Files modified:
- `src/engine/simulation.ts` — added `sender.status === "crashed"` guard in `step()`

65/65 tests pass, build clean.

---

**April 21**
***Entry 10***

Legibility pass for live demo projection (10–30 ft viewing distance).

Changes:
- `src/index.css` — Bumped all font sizes 15–25% (base 12→14px, header 15→18px, node IDs 13→16px, status badges 9→11px, event log 11→13px, buttons 12→14px, etc.). Increased `--text-dim` contrast (#606888→#8891b3) and `--gray` dropped-message color (#4a5180→#6a72a0). Boosted consensus-acceptors opacity 0.75→0.85.
- `src/components/Canvas/SimulationCanvas.tsx` — Larger node-ID circles (r 15→18, stroke 1.5→2/2.5). Node label font 11→14px. Role sub-label 9→11px, opacity 0.55→0.75. Lane lines thicker (1→1.5px) and more opaque (0.28→0.38). Tick marks bolder (opacity 0.15→0.25, width 1→1.5).
- `src/components/Canvas/useD3Animation.ts` — Arrow strokes +1px across the board (1.5→2.5, 2.5→3.5). Arrow label font 9→12px. Arrowhead markers 5→7. Dropped arrow color updated to match brighter `--gray`.
- `src/components/Canvas/layout.ts` — HEADER_H 52→58, STEP_H 40→46 to accommodate larger elements.

---

**April 8**
***Entry 9***

Step 8: Preset scenarios, invariant assertions, edge-case handling.

Files created/modified:
- `src/engine/invariants.ts` — NEW: `checkInvariants(sim)` checks 3 stateless runtime invariants in dev mode: (1) consensus value is a proposed value, (2) consensus.acceptedBy nodes all agree on the consensus value with ≥2 acceptors, (3) ACCEPT message values are proposed values (weak P2b sanity check), (5) each acceptor's acceptedProposal.number ≥ highestPromised. Uses `console.error` in browser; throws in test mode. Invariants 3(full) and 4 are covered by engine unit tests.
- `src/state/reducer.ts` — Added `resetKey: number` to `AppState` (incremented on RESET and LOAD_PRESET); added `LOAD_PRESET` action; `buildPreset()` factory computes each scenario state synchronously by calling engine functions directly; `checkInvariants` called after every STEP.
- `src/components/Canvas/useD3Animation.ts` — Watches `state.resetKey` to detect RESET/LOAD_PRESET and clear the SVG; loops over all `newCount` new messages per render; batch messages (newCount > 1, preset load) drawn instantly (animDuration=0); single new message animated normally. `drawArrow` refactored with `instant` path that sets final attribute state without transitions.
- `src/components/ControlBar/PresetControls.tsx` — NEW: 4 preset buttons ("Happy Path", "Competing Proposals", "Crash Recovery", "Message Loss") each dispatch `LOAD_PRESET`; tooltip explains each scenario.
- `src/components/ControlBar/ControlBar.tsx` — Added second control row for `<PresetControls />`.
- `src/components/InfoPanel/ConsensusStatus.tsx` — Added `impossible` state (≥2 of 3 acceptors crashed); shows orange warning banner "Consensus impossible — no majority available" via `AnimatePresence`.
- `src/index.css` — `.consensus-banner-impossible` orange variant; `.preset-controls` / `.btn-preset` styles.

Preset scenarios:
- Happy Path: START_PROPOSAL("P1") + autoPlay = true
- Competing Proposals: START_PROPOSAL("P1") + 3 steps + INTRODUCE("P2") + autoPlay = true
- Crash Recovery: START_PROPOSAL("P1") + 5 steps + CRASH("A3") + autoPlay = true
- Message Loss: START_PROPOSAL("P1") + drop 2 PREPAREs + autoPlay = false

Verified: `tsc -b` clean, 65/65 tests pass.

---

**April 8**
***Entry 8***

Step 7: Interaction polish — click-to-crash, message dropping, auto-play hook, New Proposal button.

Files created/modified:
- `src/hooks/useAutoPlay.ts` — NEW: extracted `useAutoPlay()` hook from ControlBar; drives `setInterval` at `speedMs` while `autoPlay && canStep`; auto-stops (`TOGGLE_AUTOPLAY`) when queue drains
- `src/components/NodePanel/NodeCard.tsx` — `motion.div` `onClick` toggles `CRASH_NODE`/`RESTART_NODE` (ignores clicks that land on `<button>`); `× / ↺` crash-hint icon fades in on hover; added `NewProposalButton` (purple, dispatches `NEW_PROPOSAL`) alongside `StartProposalButton` in the actions row
- `src/components/InfoPanel/EventLog.tsx` — `QueuedEntry` is now clickable (dispatches `DROP_MESSAGE`) with red `✗` hint on hover; already-dropped entries are non-interactive; added `"— click to drop"` sub-label on queue section title
- `src/components/ControlBar/ControlBar.tsx` — calls `useAutoPlay()`; removed inline setInterval logic; speed slider range fixed to 200–2000ms (spec §7)
- `src/components/ControlBar/FaultControls.tsx` — replaced stubs with `null` (interactions moved to NodeCards and EventLog)
- `src/index.css` — `.crash-hint` hover fade; `.node-card-actions` flex row for two buttons; `.btn-new-proposal` purple ghost button; `.queue-entry-droppable` hover highlight + opacity transition on `.queue-drop-hint`

Verified: `tsc -b` clean, 65/65 tests pass.

Competing proposals flow (§7.2) works end-to-end:
1. Start P1 → 3 PREPAREs queued
2. Step 3× → P1 in phase2
3. Click "New Proposal" on P2 → P2 introduces higher-round PREPAREs
4. Step → acceptors promise P2's round; P1's ACCEPTs get NACKed
5. P2 reaches consensus on "B"

---

**April 8**
***Entry 7***

Step 6: Framer Motion UI polish — NodeCard animations, ConsensusStatus banner, ProtocolExplainer.

Files modified:
- `src/components/NodePanel/NodeCard.tsx` — Framer Motion `motion.div` with `useAnimation()` controls; four animation branches: crash (shake + red tint), restart (scale pulse + green flash), consensus (green glow + box-shadow), generic state change (blue flash → resting). Uses `fingerprint()` string + prev-value refs to avoid spurious re-runs.
- `src/components/InfoPanel/ConsensusStatus.tsx` — `AnimatePresence mode="wait"` with two states: dimmed "No consensus yet" and green glowing banner with pulsing dot; slides in from above on consensus reached.
- `src/components/InfoPanel/ProtocolExplainer.tsx` — Concise spec-style descriptions (e.g., "A1 promised (1, P1) to P1 — no prior accepted value"); `AnimatePresence` keyed by message id for slide-in-from-right transition on each new step.
- `src/index.css` — Removed `background` from `.node-card`, `.node-card.crashed`, `.node-card.consensus` (Framer Motion now owns background). Replaced `.consensus-status` with `.consensus-banner-wrap` / `.consensus-banner-reached` / `.consensus-banner-none` with inset shadow. Added `.explainer-text` for overflow-hidden slide animation.

Verified: `tsc -b` clean, 65/65 tests pass.

---

**April 8**
***Entry 6***

Step 5: D3 message arrow animation via `useD3Animation` hook.

Files created/modified:
- `src/components/Canvas/layout.ts` — shared constants (`NODE_IDS`, `PAD_X`, `HEADER_H`, `STEP_H`, `LANE_COLOR`, `ROLE_LABEL`) and `laneX(nodeId, svgWidth)` used by both the lanes effect and the animation hook
- `src/components/Canvas/useD3Animation.ts` — hook that watches `state.sim.deliveredMessages`; on each new message draws an animated arrow via `d3.transition()`; on RESET clears all arrows
  - Arrowhead markers injected into `<defs>` once, idempotent
  - `drawArrow()` has three branches: normal delivery (line grows, label fades in), manually dropped (halfway → ✗ marker → group fades), crashed-destination (full width → fades)
  - Sliding scroll window: `updateScrollTransform()` shifts the scroll-group upward as steps exceed the visible area so the latest step always stays in view
  - Animation duration = `max(150, speedMs * 0.55)` — responsive to speed slider
- `src/components/Canvas/SimulationCanvas.tsx` — refactored to use two D3 layers: `.lanes-layer` (cleared on resize/node-change) and `.arrows-layer` (never cleared by lanes); calls `useD3Animation(svgRef, containerRef)`

Arrow styling per spec:
- PREPARE: blue `#82aaff`, solid 1.5px, label `P(n)`
- PROMISE: green `#c3e88d`, solid 1.5px, label `PR(n)` or `PR(n) "v"`
- ACCEPT: orange `#ff9f6b`, solid 1.5px, label `A(n) "v"`
- ACCEPTED: dark-green `#4fd6be`, thick 2.5px, label `OK(n) "v"`
- NACK: red `#ff6b6b`, dashed 5/3, label `✗(n)`
- Dropped: gray `#4a5180`, dotted 3/3, struck-through label, ✗ at tip, fades to 18% opacity

Verified: `tsc -b` clean, 65/65 tests pass, `npm run build` clean.

---

**April 8**
***Entry 5***

Step 4 (canvas): Replaced React-rendered SVG children with proper D3 ownership in `SimulationCanvas`.

- `src/components/Canvas/SimulationCanvas.tsx` — React renders only `<div ref={containerRef}><svg ref={svgRef} /></div>`; a `useEffect` selects the SVG via ref and uses D3 to draw all content
- D3 draws: evenly-spaced vertical lane lines (dashed), circular label badges with node ID and role sub-label, red column overlay for crashed nodes
- `ResizeObserver` on the container triggers a full `svg.selectAll("*").remove()` + redraw, keeping lanes correct on resize
- Effect dependency on `state.sim.nodes` so the crash overlay updates immediately when a node is crashed/restarted
- Removed `.canvas-placeholder` from CSS (D3 is now the content)

Verified: `tsc -b` clean, `npm run build` clean, 65/65 tests pass.

---

**April 8**
***Entry 4***

Step 4: React UI shell with useReducer state management. No animation yet.

Files created:
- `src/state/reducer.ts` — `AppState`, all 9 `Action` types, `reducer()` delegating to pure engine functions
- `src/state/context.tsx` — `SimProvider` / `useSimulation()` context hook
- `src/components/App.tsx` — root component, wraps tree in `SimProvider`
- `src/components/Header.tsx` — title + live step counter badge
- `src/components/NodePanel/NodePanel.tsx` + `NodeCard.tsx` — displays full internal node state; "Start Proposal" button on proposers (enabled when idle/done); crashed/consensus CSS classes
- `src/components/Canvas/SimulationCanvas.tsx` — SVG placeholder with static lane lines; `svgRef` ready for D3 in Step 5
- `src/components/InfoPanel/{InfoPanel, ConsensusStatus, EventLog, ProtocolExplainer}.tsx` — consensus banner, scrollable message log (delivered + queued), per-step human-readable explanation
- `src/components/ControlBar/{ControlBar, FaultControls}.tsx` — Step, Auto-play (setInterval), Speed slider, Reset; fault controls stubbed for Step 7

Config:
- Extracted `vitest.config.ts` separate from `vite.config.ts` to resolve Vite 8/vitest rolldown vs rollup type conflict
- Rewrote `src/index.css` with dark monospace theme and CSS Grid layout (header / main 3-col / controlbar)
- Updated `src/main.tsx` to import `App` from `components/App.tsx`

Verified: `tsc -b` clean, 65/65 tests pass, `npm run build` succeeds.

---

**April 7**
***Entry 3***

src/engine/faults.ts

- `dropMessage(state, id)` — sets status: `"dropped"` on the target queued message; `step()` then skips delivery  
- `crashNode(state, nodeId)` — sets status: `"crashed"`, preserves all other fields (stable storage intact)  
- `restartNode(state, nodeId)` — acceptors → `"active"`; proposers → `"idle"` with `currentProposal`, `promisesReceived`, `acceptsReceived` cleared (round counter kept)  
- `introduceProposal(state, proposerId, value)` — scans all nodes and queued messages to find `maxRound`, sets new proposal to `maxRound + 1`, enqueues 3 PREPAREs  

faults.test.ts (32 tests across 7 suites)

| Suite                              | Key assertion                                                                 |
|-----------------------------------|------------------------------------------------------------------------------|
| `dropMessage`                     | message marked dropped, `step` skips it without updating acceptor state      |
| `crashNode`                       | stable storage survives; messages to crashed node are silently dropped       |
| `restartNode`                     | acceptor resumes active; proposer clears in-progress tracking, keeps round   |
| **Crash recovery**                | consensus on A1+A2 with A3 crashed; A3's state stays null                    |
| **Message drop**                  | 2 of 3 dropped → P1 stuck in phase1, no consensus; 1 of 3 dropped → consensus still reached |
| **Competing proposals**           | P2's PREPAREs update `highestPromised` before P1's ACCEPTs arrive → NACKs to P1; P2 wins on `"B"` |
| **Value selection via `introduceProposal`** | P2 adopts prior accepted `"X"` not own `"B"`; picks highest when promises carry different values |

**April 7**
***Entry 2***

Files created:                                                                      
  - src/engine/types.ts — all types from spec Section 4 (ProposalNumber,              
  AcceptedProposal, PromiseInfo, ProposerState, AcceptorState, NodeState, Message,    
  MessageStatus, SimulationState)                                                 
  - src/engine/proposalNumber.ts — compareProposalNumbers(), isGreaterThan(),         
  isGreaterThanOrEqual()                                                              
  - src/engine/__tests__/proposalNumber.test.ts — 9 tests covering ordering,          
  tiebreaking, and the full (1,P1) < (1,P2) < (2,P1) ordering from the spec 
  - src/engine/simulation.ts, src/engine/faults.ts — stubs for Steps 2 & 3            
  - src/engine/__tests__/simulation.test.ts, src/engine/__tests__/faults.test.ts —
  placeholder test files                                                              
                                                                                      
  Directory structure created:                                                        
  src/components/{NodePanel,Canvas,InfoPanel,ControlBar}/, src/state/, src/hooks/     
                                                            
  Config changes: added test + test:watch scripts to package.json, configured vitest  
  in vite.config.ts. 


**April 7**
***Entry 1***

src/engine/simulation.ts:                                                           
  - initializeState() — 5 nodes (P1/A, P2/B, A1/A2/A3), empty queues, no consensus
  - startProposal(state, proposerId) — increments round, sets phase1, enqueues 3      
  PREPAREs                                                                      
  - step(state) — dequeues one message, routes by type:                               
    - PREPARE → PROMISE (if n > highestPromised) or NACK    
    - PROMISE → collect; on majority (≥2): apply value selection rule (P2b),          
  transition to phase2, enqueue ACCEPTs                                               
    - NACK → bump round above the nack's highestPromised (performance opt)            
    - ACCEPT → ACCEPTED (if n ≥ highestPromised) or NACK                              
    - ACCEPTED → count; on majority → status = "done"                                 
    - Crashed recipients and pre-dropped messages are logged without processing       
  - checkConsensus() — scans acceptors after every step; ≥2 with matching value →     
  consensus reached                                                                   
  - stepAll() — test helper that drains the queue                                     
                                                                                      
  Tests (24 tests across 8 suites): init state, startProposal, happy path end-to-end, 
  phase 1 majority logic, phase 2 majority logic, value selection rule (including the 
  manual-state P2b test with two different accepted values), empty-queue no-op, and
  immutability.