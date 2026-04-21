# Paxos Visualizer — Feature Inventory (as-implemented)

Produced by reading every source file in the repo, not the spec or docs.

---

## 1. Simulation Model

**Roles**: Proposer and Acceptor only. There are no learner nodes — proposers track their own ACCEPTED counts and the engine checks consensus globally via `checkConsensus()` after every step.

**Node count**: Fixed at 5. Hardcoded in `initializeState()` (`simulation.ts:22-53`):
- P1 (proposer, value "A"), P2 (proposer, value "B")
- A1, A2, A3 (acceptors)

Not configurable at runtime or via any UI.

**Quorum / majority**: Hardcoded to 2-of-3 acceptors.
- Phase 1: proposer needs `>= 2` promises to proceed (`simulation.ts:216`).
- Phase 2: proposer needs `>= 2` ACCEPTED replies to move to "done" (`simulation.ts:305`).
- Consensus check: any value accepted by `>= 2` acceptors triggers consensus (`simulation.ts:120`).

**Proposal numbers**: `(round, nodeId)` tuples compared lexicographically — round first, then nodeId as a string tiebreaker (`proposalNumber.ts:7-15`). P2 > P1 at the same round because `"P2" > "P1"` lexicographically.

**Round generation**:
- `startProposal`: increments the proposer's own `round` counter by 1 (`simulation.ts:65`).
- `introduceProposal` (used by "New Proposal"): scans all nodes and the message queue for the highest round anywhere in the system, then uses `max + 1` (`faults.ts:92-113`). This guarantees the new proposal beats everything.

**Value selection rule (P2b)**: Implemented in the PROMISE handler (`simulation.ts:219-226`). When a proposer collects majority promises, it picks the value from the highest-numbered accepted proposal among those promises; falls back to its own `proposedValue` if no acceptor had previously accepted anything.

**Message processing**: Strictly one message per step, FIFO from the queue. No reordering, no parallel delivery. `step()` dequeues `messageQueue[0]`, processes it, appends response messages to the end of the queue.

**Invariant checking**: `checkInvariants()` (`invariants.ts`) runs after every STEP in dev mode. Checks: (1) consensus value is a proposed value, (2) acceptedBy nodes agree, (3) ACCEPT values are proposed values, (5) acceptors never accept below their highestPromised. Violations log to console.error in browser, throw in tests.

---

## 2. User-Triggered Actions

| Action | UI Location | What It Does | Preconditions |
|--------|------------|--------------|---------------|
| **Start Proposal** | Blue button on P1/P2 node card (left panel) | Dispatches `START_PROPOSAL` — increments round, sets phase1, enqueues 3 PREPAREs | Proposer status must be `idle` or `done`. Disabled during phase1/phase2 or when crashed. |
| **New Proposal** | Purple button on P1/P2 node card (left panel) | Dispatches `NEW_PROPOSAL` → calls `introduceProposal` — starts a fresh phase1 with a round higher than anything in the system | Only disabled when the node is crashed. Can be clicked while a proposal is already in-flight — it overwrites the proposer's in-progress state. |
| **Step** | "Step" button in control bar (bottom) | Delivers one message from the queue and processes it | Disabled when queue is empty. |
| **Auto-play / Pause** | "Auto-play" button in control bar | Toggles `setInterval` that dispatches STEP at `speedMs` intervals. Auto-stops when queue drains. | Disabled when queue empty and not already playing. |
| **Speed slider** | Control bar, labeled "Speed" | Sets interval between auto-play steps. Range 200ms (fast, slider right) to 2000ms (slow, slider left). | Always enabled. |
| **Reset** | Red "Reset" button in control bar | Restores `initializeState()`, clears all SVG arrows, resets step count to 0. Preserves current speed setting. | Always enabled. |
| **Crash/Restart node** | Click anywhere on a node card (not on a button) | If node is active/idle/phase1/phase2/done: crashes it. If already crashed: restarts it. | Always available on all 5 nodes, including proposers. |
| **Drop message** | Click a queued message entry in the right panel "Queued" section | Marks message as `dropped`; when it reaches the front of the queue, `step()` logs it without processing. | Only on messages not already dropped. Already-dropped entries show `[dropped]` tag and are non-interactive. |
| **Load preset** | 4 preset buttons in second row of control bar | Resets state and pre-computes a scenario. See section 6. | Always enabled. Replaces current state entirely. |

---

## 3. Scenario / Failure Injection

**Crash any node** — click the card. Works on proposers and acceptors alike. When crashed:
- Acceptors: messages sent to the node are silently dropped (logged as dropped in the timeline). Stable storage (`highestPromised`, `acceptedProposal`) is preserved.
- Proposers: same — incoming messages dropped. The proposer's in-flight proposal is effectively dead since responses will never arrive.
- Visual: red border, red-tinted background, shake animation, lane turns red with dashed overlay.

**Restart any node** — click a crashed card again. Acceptors resume as `active` with all stable storage intact. Proposers resume as `idle` with `currentProposal`/`promisesReceived`/`acceptsReceived` cleared but `round` preserved — they need a new `Start Proposal` or `New Proposal` to re-enter the protocol.

**Drop specific messages** — click queued messages in the right panel. The message stays in the queue but is marked `dropped`. When `step()` reaches it, it's logged as dropped without delivery. Partial drops work (e.g., drop 2 of 3 PREPAREs, keep 1).

**Dueling proposers** — fully supported. Click "Start Proposal" on P1, let it run, then click "New Proposal" on P2 at any point. P2's round will be globally higher, so acceptors will NACK P1's subsequent messages. The "Competing Proposals" preset sets this up automatically.

**Network partition** — not a first-class primitive. You can simulate it manually by crashing nodes or selectively dropping messages, but there's no "partition A1 from P1" button.

**Message reordering** — not supported. The queue is strict FIFO; you cannot reorder messages.

**Message delay** — not supported. You can't move a message later in the queue.

**Livelock demonstration** — partially possible via manual clicking. After P1 gets NACKed, you can click "New Proposal" on P1 (higher round), then "New Proposal" on P2 again, etc. But there's no automatic livelock loop — each re-proposal is manual.

---

## 4. Playback Controls

| Control | Implemented? | Notes |
|---------|-------------|-------|
| Step forward | Yes | One message per click |
| Step backward / undo | **No** | State is not snapshottable; no history stack |
| Play / pause | Yes | Auto-play with speed control |
| Speed control | Yes | 200ms–2000ms slider |
| Reset | Yes | Full reset to initial state |
| Jump to state | **No** | |
| Timeline scrubbing | **No** | The SVG timeline is display-only, not interactive |
| Replay from preset | Yes | Load a preset to re-run from a scripted starting point |

---

## 5. Visual / State Representation

### Left panel — Node cards (NodePanel/NodeCard.tsx)
Each of the 5 nodes shows:
- **Node ID** (P1, P2, A1, A2, A3) and **role** (proposer/acceptor)
- **Status badge**: idle, phase1, phase2, done, crashed, active — color-coded
- **Proposer fields**: proposed value, current proposal number `(round, nodeId)`, promises count `N/3`, accepts count `N/3`
- **Acceptor fields**: highestPromised `(round, nodeId)` or "—", accepted proposal `(round, nodeId) = "value"` or "—"
- **Framer Motion animations**: shake on crash, scale pulse on restart, blue flash on state change, green glow + box-shadow on consensus

### Center — SVG timeline canvas (Canvas/SimulationCanvas.tsx + useD3Animation.ts)
- **5 vertical lane lines** — dashed, color-coded (blue for P1, purple for P2, teal for A1/A2/A3)
- **Node ID circles** at the top of each lane with role sub-labels
- **Red overlay column** on crashed nodes
- **Message arrows**: animated lines from sender lane to receiver lane, with:
  - Color per message type (blue=PREPARE, green=PROMISE, orange=ACCEPT, teal=ACCEPTED, red=NACK, gray=dropped)
  - Stroke width varies (ACCEPTED is thickest at 3.5px, dropped thinnest at 1.5px)
  - Text label above each arrow showing type abbreviation + proposal number + value (e.g., `A(1,P1) "A"`)
  - NACK arrows are dashed; dropped arrows are dotted and fade to 18% opacity
  - Dropped arrows stop at the midpoint with a red cross marker
  - Messages to crashed nodes: arrow draws fully but fades to 15% opacity
- **Auto-scrolling**: as steps exceed visible height, the scroll group shifts up to keep the latest step visible
- **Arrowhead markers**: SVG marker defs per message type

### Right panel — Info panel (InfoPanel/)
- **Consensus banner** (top): three states:
  - "No consensus yet" (dimmed)
  - Green glowing banner with pulsing dot showing `"value"` and which acceptors (e.g., "A1, A2")
  - Orange warning "Consensus impossible — no majority available" (when >= 2 acceptors are crashed)
- **Event log** (scrollable, middle): reverse-chronological list of delivered messages with:
  - Check/cross icon
  - Route (e.g., "P1 -> A1")
  - Color-coded label (e.g., green "PR(1,P1)")
  - Dropped messages shown with strikethrough
- **Queued messages** (below event log): upcoming messages with click-to-drop interaction and red "x" hint on hover
- **Protocol explainer** (bottom): one sentence explaining what the last step did in plain English (e.g., `A1 promised (1, P1) to P1 — no prior accepted value`). Animated slide-in on each new step. Shows consensus summary when reached.

### Header
- Title: "Paxos Consensus Visualizer"
- Step counter badge: "Step N"

### Control bar (bottom)
- Step, Auto-play/Pause, Speed slider, Reset
- Hint text: "Click node to crash/restart. Click queued message to drop"
- Second row: 4 preset buttons

---

## 6. Preset Scenarios

Defined in `reducer.ts:43-86`, buttons in `PresetControls.tsx`.

| Preset | What it sets up | Auto-play? |
|--------|----------------|-----------|
| **Happy Path** | `startProposal("P1")`. Queue has 3 PREPAREs ready to deliver. | Yes — runs to completion automatically (~7 steps) |
| **Competing Proposals** | P1 starts, 3 PREPAREs delivered (3 steps pre-run), then P2 introduces a competing proposal with a higher round. Queue has P1's PROMISEs + P2's PREPAREs interleaved. | Yes |
| **Crash Recovery** | P1 starts, 3 PREPAREs + 2 PROMISEs delivered (5 steps pre-run, P1 in phase2), then A3 is crashed. Queue has P1's ACCEPTs ready — A3's will be dropped. | Yes |
| **Message Loss** | P1 starts, then 2 of 3 PREPAREs are pre-dropped (only P1->A1 survives). P1 will only get 1 PROMISE and stall. | **No** — auto-play is off so you can step manually and see the stall |

Pre-run steps are rendered instantly (no animation) when the preset loads. The SVG shows the arrows for pre-run steps immediately.

---

## 7. Edge Cases the App Handles Well

- **Value selection rule (P2b) is visually clear**: When a PROMISE carries a previously accepted value, the arrow label shows `PR(n) "value"`, and the proposer adopts it. The explainer text calls this out: `"A1 promised (2, P2) to P2 — prior accepted: "A" at (1, P1)"`.

- **Consensus detection with partial crashes**: If 2-of-3 acceptors accept before the third crashes, consensus is correctly detected and the green banner appears. The crashed node's lane turns red but the consensus glow still appears on the accepting nodes' cards.

- **"Consensus impossible" detection**: If >= 2 acceptors are crashed, the orange warning banner appears immediately. If you restart one, it disappears and consensus can proceed.

- **Stale message handling**: If a proposer has moved on (different phase or different proposal number), late-arriving messages for old proposals are silently ignored — no spurious state changes. The arrow still draws but the node state doesn't change.

- **NACK round bump**: When a proposer receives a NACK, it bumps its round above the NACK's `highestPromised` (`simulation.ts:251`). This means "New Proposal" after a NACK already has a competitive round number.

- **Crash during in-flight proposal**: Messages already in the queue addressed to a crashed node are delivered as dropped (arrow draws, fades out). This correctly models message loss due to crash.

- **Framer Motion animations are well-tuned**: Crash shake, restart pulse, consensus glow, and state-change flash all use `fingerprint()` to avoid spurious re-runs. The `AnimatePresence` on the consensus banner and explainer text provides clean transitions between states.

- **Preset instant-rendering**: When a preset loads with pre-run steps, all arrows are drawn instantly (no animation). Only new steps after loading are animated. The `resetKey` mechanism ensures old arrows are cleared.

---

## 8. Edge Cases the App Handles Poorly or Not at All

- **No step-back / undo**: Once you step forward, you can't go back. If you overshoot a key moment during a demo, the only recovery is Reset or reload a preset. This is the biggest demo risk.

- **Proposer "done" but no consensus**: A proposer can reach `done` (got 2 ACCEPTEDs) before `checkConsensus` fires on the *next* step. In practice checkConsensus runs in the same step, but the proposer status badge shows "done" while the consensus banner might show the value on the same step — the timing is fine but could confuse if someone asks "does `done` mean consensus?"

- **"New Proposal" during in-flight proposal silently overwrites state**: Clicking "New Proposal" on P1 while P1 is in phase1 or phase2 doesn't warn. It resets the proposer to phase1 with a new round. Old in-flight messages (PROMISEs, ACCEPTEDs for the old round) will still be in the queue and will be silently ignored by the stale-check logic — but they still draw as arrows, which could be visually confusing. The arrows appear normal but have no effect.

- **No visual indication that a message was stale/ignored**: When a PROMISE arrives for an old round, the arrow draws and the label appears, but nothing on screen indicates it was a no-op. The node card doesn't flash. An observer might think the message had an effect.

- **Event log can get long and hard to follow**: No filtering, no collapse, no search. In a complex scenario (competing proposals + drops + crashes), the log gets noisy. The reverse-chronological order helps but the log is small relative to the canvas.

- **Queue order is not visible in the timeline**: The timeline shows delivered messages in order, but there's no way to see where queued messages *will* appear on the timeline before they're delivered. The "Queued" section in the right panel lists them, but there's no spatial preview.

- **Canvas doesn't handle very small windows well**: The lane positions are computed from SVG width with fixed 64px padding. On very narrow screens, lanes can overlap. For a projector demo this is likely fine if the window is full-screen.

- **Auto-play speed mismatch with arrow animation**: Arrow animation duration is `max(150, speedMs * 0.55)`. At max speed (200ms), animation is 150ms, which is fine. At slow speed (2000ms), animation is 1100ms but the next step fires at 2000ms — there's a ~900ms gap where nothing visually happens. Not a bug, but pacing feels uneven at slow speeds.

- **Acceptor status badges only show "active" or "crashed"**: There's no visual distinction on an acceptor card between "has promised" and "has accepted" — you have to read the field values. The status badge stays "active" throughout.

- **After consensus, you can still step and crash nodes**: The app doesn't lock interaction after consensus. You can crash acceptors, drop messages, and step through remaining queued messages. This is technically correct (Paxos doesn't stop the world after consensus), but in a demo it might be confusing — the green banner stays and you can create a state where the consensus acceptors are crashed, which looks contradictory even though it's valid.

- **Preset "Message Loss" doesn't auto-play**: Unlike the others, it starts paused. This is intentional (so you can see the stall), but if you click it expecting auto-play like the other three, nothing happens until you click Step.

- **No keyboard shortcuts**: Everything is click-only. No spacebar for step, no arrow keys, no hotkeys.

---

## 9. Non-Obvious Features

- **Any node is crashable, not just acceptors**: You can crash P1 mid-proposal. Its in-flight messages will still be in the queue and get delivered, but responses back to P1 will be dropped. This creates an interesting "proposer crash" scenario that none of the presets demonstrate.

- **Hover hints on node cards**: A faint "x" (or "restart" icon) appears in the top-right corner of each node card on hover. Not labeled — easy to miss.

- **Tooltip on preset buttons**: Each preset button has a `title` attribute with a multi-sentence description of what the scenario demonstrates. Hover to see it. Won't be visible during a projector demo unless you pause the mouse.

- **"New Proposal" works on any proposer at any time** (except crashed): You can click it on P2 even before P2 has started its first proposal. It will scan the system for the max round and start higher. This means you can inject a competing proposal at any point in the protocol.

- **Runtime invariant violations go to browser console**: In dev mode, `checkInvariants()` logs to `console.error` if an invariant is violated. Open DevTools console to see these. In production builds, invariants are skipped entirely.

- **Dropped messages have two visual treatments**: Pre-dropped (clicked in queue): arrow stops at midpoint, dotted line, fades to 18% opacity. Delivered to crashed node: arrow draws full width, then fades to 15% opacity. Both show as crossed-out in the event log.

- **Multiple proposals from the same proposer**: You can click "Start Proposal" on P1 after it reaches `done`, starting a new round. Combined with "New Proposal" on P2, you can demonstrate multi-round Paxos. No preset covers this.

- **Speed slider persists across Reset**: The speed setting survives Reset (intentional — `reducer.ts:121`). It does NOT survive preset loads (preset sets `speedMs` from current state, so effectively preserved too — `reducer.ts:132`).

- **The "Queued" section live-updates drop status**: If you drop a message and then step, you see the `[dropped]` tag in the queue before it reaches the front, then it appears as a dropped entry in the event log after stepping.
