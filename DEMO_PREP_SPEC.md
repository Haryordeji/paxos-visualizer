# Demo Prep SPEC

Pre-presentation cleanup for the Paxos visualizer. Five phases, ordered by risk and dependency. Phase A touches the engine and tests. Phase B depends on A. C, D, E are independent.

## Phase A: Engine corrections

### A1. ACCEPT messages go only to promisers

**Current:** When a proposer hits majority promises and enters Phase 2, ACCEPT messages are sent to all acceptors regardless of who promised.

**New:** ACCEPT messages are sent only to acceptors in `promisesReceived` for the current proposal.

**Why:** Matches Lamport's primary algorithm description ("send accept request to each of those acceptors"). Removes the "why is P1 sending ACCEPT to a crashed A3 it never heard from" confusion that surfaces in the Crash Recovery preset.

**Files affected:**
- `src/engine/simulation.ts`: PROMISE handler that triggers Phase 2
- `src/engine/__tests__/simulation.test.ts`: tests asserting on ACCEPT recipient set
- `src/engine/__tests__/faults.test.ts`: crash recovery tests

**Acceptance:**
- After Phase 1 with promises from {A1, A2} of {A1, A2, A3}, only A1 and A2 receive ACCEPT
- All happy-path tests still pass with assertion updates
- Note: this is a revert of WORKLOG Entry 12 behavior

### A2. Crashed nodes' outgoing messages are removed from the queue

**Current:** When a node is crashed, in-flight messages from that node remain queued and are processed as `dropped` when their step arrives. They draw as gray arrows.

**New:** When `crashNode` runs, messages in the queue where `from === crashedNodeId` are filtered out entirely. No arrow draws, no log entry.

Messages where `to === crashedNodeId` are unaffected. They remain in the queue and are dropped on delivery (current behavior preserved). The arrow still draws, which is useful: it shows we tried to reach a dead node.

**Why:** A crashed node should not appear to be transmitting. The current behavior is technically defensible (messages were already on the wire) but visually misleading.

**Files affected:**
- `src/engine/faults.ts`: `crashNode` function
- `src/engine/simulation.ts`: the sender-crash guard in `step` becomes redundant (defensive code, leave or remove, low cost either way)
- `src/engine/__tests__/faults.test.ts`: tests asserting on queue contents post-crash

**Acceptance:**
- Crashing P1 mid-Phase-1 removes any unsent prepares from the queue
- Crashing P1 mid-Phase-2 removes any unsent accepts
- Crashing an acceptor removes any queued promises or nacks from that acceptor
- Messages targeting a crashed node still draw and are marked dropped on delivery

## Phase B: Preset rework

### B1. Presets start without pre-stepping

**Current:** `buildPreset` runs multiple engine steps synchronously. The user sees a board with arrows already drawn, which `useD3Animation` renders instantly because `newCount > 1`. The story of how the state arose is lost.

**New:** Each preset returns an initial `SimulationState` with the scenario *setup* applied (crashed nodes, pre-queued messages including pre-dropped ones) but with zero engine steps executed. The user clicks Auto-play (or Step) to see the scenario unfold.

**Per-preset definitions:**

| Preset | Setup | Initial queue |
|---|---|---|
| Happy Path | None | P1's prepares to A1, A2, A3, all queued |
| Competing Proposals | None | P1's and P2's prepares interleaved |
| Crash Recovery | A3 crashed | P1's prepares to A1, A2, A3 (the one to A3 will drop on delivery) |
| Message Loss | None | P1's prepares to A1, A2, A3, with the prepare to A2 pre-marked `dropped` |

**Implementation note for Message Loss:** the cleanest way to construct this is to call `startProposal` (which queues prepares using existing engine logic) and then call `dropMessage` on the specific message ID. Both are existing engine primitives, no bypass needed.

**Files affected:**
- `src/state/reducer.ts`: `buildPreset` rewritten

**Acceptance:**
- Loading any preset shows zero arrows on the canvas initially
- Crash Recovery shows A3 with the crashed visual treatment from the start
- Message Loss shows the dropped prepare in the queue list with its dropped marker
- Pressing Step or Auto-play causes arrows to animate normally
- All four scenarios reach their expected outcome when stepped to completion

### B2. Per-preset auto-play default

**Current:** Loading a preset does not change `autoPlay` state. Inconsistent across presets in feel.

**New:** Each preset definition includes `autoPlay: boolean`. The `LOAD_PRESET` reducer case sets `state.autoPlay` from the preset value. All four presets default to `true`.

**Files affected:**
- `src/state/reducer.ts`: `Preset` shape, `buildPreset`, `LOAD_PRESET` case

**Acceptance:**
- Clicking any preset button starts the simulation auto-playing immediately
- User can manually pause as expected

## Phase C: Canvas vertical scroll

**Current:** Fixed-height SVG with D3-managed scroll group transforms. When Competing Proposals generates a long sequence of arrows, content overflows below the viewport with no way to see it.

**New:** The canvas container becomes vertically scrollable. SVG height grows with content. Auto-scroll-to-latest is preserved.

**Approach (investigate first):**
- Option (a): Replace the D3 transform with native `overflow-y: auto` on the container, SVG height grows dynamically. Auto-scroll uses `scrollIntoView` or sets `scrollTop` on the container. Simpler if it works.
- Option (b): Keep the D3 transform but ensure the container is scrollable. Native scroll and D3 transform need to not fight.

Option (a) is preferred unless there's a reason it breaks animation continuity.

**Files affected:**
- `src/components/Canvas/SimulationCanvas.tsx`
- `src/components/Canvas/useD3Animation.ts` (specifically `updateScrollTransform`)
- `src/index.css`

**Acceptance:**
- Loading Competing Proposals and stepping to completion has all arrows reachable
- Auto-play keeps the most recent arrow visible
- Manual scrolling works without fighting D3

**Risk:** D3 scroll transform may conflict with native scroll. May need to remove the transform and rely entirely on native scroll.

## Phase D: Polish

### D1. Dropped arrow color
Lighten the dropped arrow color so it's visible against the canvas background while still distinguishing from delivered. Try a mid-gray around `#999` or `#aaa`. Match any CSS variable in `index.css` and the inline color in `useD3Animation.ts` to keep them in sync.

### D2. Proposer/acceptor labels nudged down
Increase Y offset of the role labels in the lane drawing. Goal is more breathing room between the node ID badge and role label. Around 12 to 16 pixels of additional offset.

**Files affected:**
- `src/components/Canvas/useD3Animation.ts` (D1)
- `src/components/Canvas/layout.ts` and/or `SimulationCanvas.tsx` (D2)
- `src/index.css` if CSS vars are used

## Phase E: Event log hover tooltips

**Current:** `ProtocolExplainer` shows one sentence describing the last delivered message. Earlier messages have no inline explanation.

**New:** Each event log entry (delivered or queued) shows a tooltip on hover with the same plain-English explanation that the protocol explainer would show for that message.

**Implementation:**
1. In `ProtocolExplainer.tsx`, extract the message-to-text logic into an exported pure function `explainMessage(msg: Message, state: SimulationState): string`. The component continues to consume it with `state.deliveredMessages.at(-1)`.
2. In `EventLog.tsx`, import `explainMessage` and attach the result as a `title` attribute on each event log entry. Native browser tooltip is fine for now.

**Files affected:**
- `src/components/InfoPanel/ProtocolExplainer.tsx`
- `src/components/InfoPanel/EventLog.tsx`

**Acceptance:**
- Hovering any event log entry shows its plain-English explanation
- The protocol explainer panel continues to behave as before
