# Paxos Consensus Protocol Visualizer — Technical Specification

## 1. Project Overview

An interactive web application that visualizes the Paxos consensus protocol in real time. Users watch messages travel between nodes, observe how nodes update their internal state, and manually inject faults (message drops, node crashes, competing proposals) to see how the protocol converges — or fails to converge — on a single agreed-upon value.

The target audience is students and engineers learning distributed systems. The visualization should make the protocol's correctness properties feel intuitive rather than abstract.

**Stack**: React + TypeScript, D3.js (SVG message animation), Framer Motion (UI element animation), Vite.

---

## 2. What is Paxos? (Protocol Reference)

Paxos is a protocol that allows a group of unreliable nodes to agree on a single value, even when messages can be lost and nodes can crash. It was designed by Leslie Lamport. This section describes the protocol completely — everything needed to implement the simulation engine.

### 2.1 Roles

There are three roles. In a real system a single process can play multiple roles, but in our visualizer each node plays exactly one role for clarity.

| Role | Count | Purpose |
|------|-------|---------|
| **Proposer** | 2 | Proposes a value and drives the two-phase protocol to get it accepted. |
| **Acceptor** | 3 | Votes on proposals. A value is "chosen" when a majority of acceptors (≥2 of 3) accept the same proposal. |
| **Learner** | 0 (implicit) | In our visualizer, consensus detection is handled by a global observer that watches acceptor state, not by explicit learner nodes. |

### 2.2 Proposals

A proposal is a pair: `(proposalNumber, value)`.

**Proposal numbers** must be globally unique and totally ordered. We achieve this with a tuple `(round, nodeId)`, compared lexicographically — round first, then nodeId as tiebreaker. For example, `(1, "P1")` < `(1, "P2")` < `(2, "P1")`. Each proposer increments its own round counter when it needs a new proposal number.

**Values** are simple strings like `"A"` or `"B"` — the thing the nodes are trying to agree on.

### 2.3 The Two Phases

The protocol runs in two phases. Both must succeed for a value to be chosen.

#### Phase 1 — Prepare / Promise

**Phase 1a (Prepare):** A proposer picks a proposal number `n` and sends a `PREPARE(n)` message to all acceptors (or at least a majority).

**Phase 1b (Promise):** When an acceptor receives `PREPARE(n)`:

- **If `n` is greater than any proposal number it has already promised to** (i.e., greater than its `highestPromised` value):
  - It updates `highestPromised = n`.
  - It replies with a `PROMISE(n, accepted)` message, where `accepted` is the highest-numbered proposal it has previously accepted (both the number and the value), or `null` if it hasn't accepted anything yet.
- **If `n` ≤ its `highestPromised`:**
  - It ignores the prepare request (or optionally sends a `NACK(n, highestPromised)` so the proposer knows to back off — this is a performance optimization, not required for correctness).

#### Phase 2 — Accept / Accepted

**Phase 2a (Accept):** Once a proposer has received `PROMISE` responses from a **majority** of acceptors (≥2 of 3), it sends an `ACCEPT(n, v)` message to those acceptors, where:

- `v` is the **value of the highest-numbered accepted proposal** among all the promise responses, OR
- `v` is the proposer's own value if **none** of the responding acceptors had accepted anything.

This rule is critical — it is what guarantees that once a value is chosen, all future proposals will carry the same value.

**Phase 2b (Accepted):** When an acceptor receives `ACCEPT(n, v)`:

- **If `n ≥ highestPromised`** (i.e., it hasn't promised to ignore this proposal):
  - It accepts the proposal: sets `acceptedProposal = {number: n, value: v}` and updates `highestPromised = n` if needed.
  - It replies with `ACCEPTED(n, v)`.
- **If `n < highestPromised`:**
  - It ignores the request (or sends a `NACK`).

### 2.4 Consensus

A value `v` is **chosen** when a majority of acceptors (≥2 of 3) have accepted a proposal carrying value `v`. Once chosen, no different value can ever be chosen — this is the core safety guarantee.

### 2.5 Livelock (The Progress Problem)

Two proposers can prevent each other from ever getting a value chosen:

1. Proposer P1 completes Phase 1 with proposal number `n1`.
2. Proposer P2 then completes Phase 1 with `n2 > n1`, causing acceptors to promise `n2`.
3. P1's Phase 2 messages for `n1` are now rejected (acceptors promised `n2`).
4. P1 starts over with `n3 > n2`, causing P2's Phase 2 to be rejected.
5. This repeats forever.

The standard solution is to elect a single "distinguished proposer" (leader) so only one proposer is active at a time. Our visualizer should make this livelock scenario observable and injectable.

### 2.6 Crash Recovery

Acceptors must persist two values across crashes (Lamport calls this "stable storage"):

- `highestPromised` — the highest proposal number they've promised.
- `acceptedProposal` — the highest-numbered proposal they've accepted (number + value).

When a crashed acceptor restarts, it resumes with these values intact. A proposer can crash and restart freely — it simply abandons any in-progress proposal and can start a new one.

---

## 3. Architecture

The application has two completely decoupled layers that communicate through a shared state object. The engine never imports React. The UI never mutates protocol state directly.

```
┌──────────────────────────────────┐
│         React UI Layer           │
│  (components, controls, layout)  │
│         reads state ↑            │
├──────────────────────────────────┤
│       SimulationState            │
│    (single source of truth)      │
├──────────────────────────────────┤
│         ↓ step(state)            │
│    Paxos Simulation Engine       │
│   (pure TypeScript, no React)    │
└──────────────────────────────────┘
```

### 3.1 Simulation Engine (`src/engine/`)

A pure-function state machine. The core function is:

```
step(state: SimulationState): SimulationState
```

Each call to `step` does exactly one thing: takes the next message from the front of the message queue, delivers it to the recipient, processes it according to the protocol rules in Section 2, and enqueues any response messages. It returns a new state object (immutable update pattern).

The engine also exposes fault injection functions:

```
dropMessage(state, messageId): SimulationState
crashNode(state, nodeId): SimulationState
restartNode(state, nodeId): SimulationState
introduceProposal(state, proposerId, value): SimulationState
```

These are also pure functions that return a new state.

### 3.2 React UI Layer (`src/components/`)

React owns: the page layout, the node timeline columns, the control panel, status displays, and the info/log panel. It holds `SimulationState` in a `useReducer` hook and dispatches actions like `STEP`, `DROP_MESSAGE`, `CRASH_NODE`, etc.

### 3.3 Animation Layer (D3 + Framer Motion split)

**D3** handles: SVG message arrows between node timelines. D3 directly manages these SVG elements (binds data, animates with `d3.transition`). React does not render these elements — it provides D3 a ref to an `<svg>` container and D3 operates within it.

**Framer Motion** handles: all React-rendered UI element animations — node cards changing color on state update, status badges appearing/disappearing, the control panel, log entries sliding in, crash/restart visual effects on node columns.

The rule: if it's an SVG path/arrow between nodes, D3 owns it. If it's a React component, Framer Motion owns it.

---

## 4. Data Model

### 4.1 Core Types

```typescript
// --- Proposal numbers ---
interface ProposalNumber {
  round: number;
  nodeId: string;
}
// Comparison: first by round, then by nodeId lexicographic.
// Implement as a comparator function: compareProposalNumbers(a, b) => -1 | 0 | 1

// --- Accepted proposal (stored by acceptors) ---
interface AcceptedProposal {
  number: ProposalNumber;
  value: string;
}

// --- Node types ---
interface ProposerState {
  id: string;
  role: "proposer";
  status: "idle" | "phase1" | "phase2" | "done" | "crashed";
  currentProposal: ProposalNumber | null;
  proposedValue: string;             // The value this proposer wants to propose
  promisesReceived: PromiseInfo[];   // Collected Phase 1b responses
  acceptsReceived: number;           // Count of Phase 2b ACCEPTED responses
  round: number;                     // This proposer's current round counter
}

interface AcceptorState {
  id: string;
  role: "acceptor";
  status: "active" | "crashed";
  highestPromised: ProposalNumber | null;   // Stable storage — survives crash
  acceptedProposal: AcceptedProposal | null; // Stable storage — survives crash
}

type NodeState = ProposerState | AcceptorState;

// --- Messages ---
type Message =
  | { id: string; type: "prepare";  from: string; to: string; proposalNumber: ProposalNumber; status: MessageStatus }
  | { id: string; type: "promise";  from: string; to: string; proposalNumber: ProposalNumber; accepted: AcceptedProposal | null; status: MessageStatus }
  | { id: string; type: "accept";   from: string; to: string; proposalNumber: ProposalNumber; value: string; status: MessageStatus }
  | { id: string; type: "accepted"; from: string; to: string; proposalNumber: ProposalNumber; value: string; status: MessageStatus }
  | { id: string; type: "nack";     from: string; to: string; proposalNumber: ProposalNumber; highestPromised: ProposalNumber; status: MessageStatus }

type MessageStatus = "queued" | "in-flight" | "delivered" | "dropped";

interface PromiseInfo {
  from: string;
  accepted: AcceptedProposal | null;
}

// --- Top-level simulation state ---
interface SimulationState {
  nodes: Record<string, NodeState>;
  messageQueue: Message[];            // Ordered — front of array is next to deliver
  deliveredMessages: Message[];       // History for the timeline/log
  stepCount: number;
  consensus: {
    reached: boolean;
    value: string | null;
    acceptedBy: string[];             // Which acceptors have accepted the consensus value
  };
}
```

### 4.2 Initial State

```
Nodes:
  P1: Proposer, wants to propose value "A"
  P2: Proposer, wants to propose value "B"
  A1: Acceptor
  A2: Acceptor
  A3: Acceptor

Message queue: empty
Step count: 0
Consensus: not reached
```

The simulation starts idle. The user clicks a "Start Proposal" button on a proposer to kick off Phase 1 (this enqueues PREPARE messages).

---

## 5. Engine Logic — Detailed Pseudocode

### 5.1 `step(state)`

```
1. If messageQueue is empty, return state unchanged.
2. Dequeue the first message.
3. If message.status is "dropped", move it to deliveredMessages with status "dropped" and return.
4. Look up the recipient node.
5. If recipient.status is "crashed", move message to deliveredMessages with status "dropped" (crashed nodes don't process messages) and return.
6. Process the message by type (see below).
7. Set message.status = "delivered", append to deliveredMessages.
8. Check for consensus: if ≥2 acceptors have accepted a proposal with the same value, mark consensus reached.
9. Return new state.
```

### 5.2 Processing Rules

**On PREPARE(n) received by acceptor:**
```
if n > acceptor.highestPromised (or highestPromised is null):
    acceptor.highestPromised = n
    enqueue PROMISE(n, acceptor.acceptedProposal) from acceptor to sender
else:
    enqueue NACK(n, acceptor.highestPromised) from acceptor to sender
```

**On PROMISE(n, accepted) received by proposer:**
```
if proposer.status != "phase1" or proposer.currentProposal != n:
    ignore (stale response)
    return

add { from: sender, accepted } to proposer.promisesReceived

if promisesReceived.length >= 2 (majority of 3 acceptors):
    determine value v:
        collect all non-null accepted proposals from promises
        if any exist: v = value of the one with the highest proposal number
        else: v = proposer.proposedValue
    proposer.status = "phase2"
    for each acceptor that sent a promise:
        enqueue ACCEPT(n, v) from proposer to acceptor
```

**On NACK(n, highestPromised) received by proposer:**
```
Optional behavior: proposer can abandon current proposal and start a new
round with a higher number. This is a performance optimization.
Increment proposer.round to be higher than the nack's highestPromised.round.
```

**On ACCEPT(n, v) received by acceptor:**
```
if n >= acceptor.highestPromised (or highestPromised is null):
    acceptor.highestPromised = n
    acceptor.acceptedProposal = { number: n, value: v }
    enqueue ACCEPTED(n, v) from acceptor to sender
else:
    enqueue NACK(n, acceptor.highestPromised) from acceptor to sender
```

**On ACCEPTED(n, v) received by proposer:**
```
if proposer.status != "phase2" or proposer.currentProposal != n:
    ignore
    return

proposer.acceptsReceived += 1

if acceptsReceived >= 2 (majority):
    proposer.status = "done"
    // consensus will be detected by the global check in step()
```

### 5.3 Fault Injection Functions

**dropMessage(state, messageId):**
Find the message in `messageQueue` and set its status to `"dropped"`. The next `step()` call will skip delivery and move it to the delivered log.

**crashNode(state, nodeId):**
Set the node's status to `"crashed"`. Crashed nodes do not process incoming messages (messages sent to them are effectively lost). The node's `highestPromised` and `acceptedProposal` are preserved (stable storage).

**restartNode(state, nodeId):**
Set the node's status back to `"active"` (for acceptors) or `"idle"` (for proposers). The `highestPromised` and `acceptedProposal` values remain — they survived the crash. For proposers, clear any in-progress tracking (`promisesReceived`, `acceptsReceived`, `currentProposal`).

**introduceProposal(state, proposerId, value):**
Set the proposer's round to a value higher than any proposal number currently in the system. Set status to `"phase1"`. Enqueue `PREPARE` messages from the proposer to all acceptors.

### 5.4 Consensus Detection

After each step, scan all acceptors. If ≥2 acceptors have a non-null `acceptedProposal` and the values match, consensus is reached on that value. Note: the proposal numbers don't need to match — only the values. (Multiple proposals can carry the same value.)

---

## 6. UI Layout and Components

### 6.1 Overall Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Paxos Consensus Visualizer"          [Controls]   │
├─────────┬───────────────────────────────────┬───────────────┤
│         │                                   │               │
│  Node   │    SVG Canvas                     │   Info        │
│  Panel  │    (D3 message animations)        │   Panel       │
│         │                                   │               │
│  P1 [A] │    ║  P1    P2    A1    A2    A3  │  Event log    │
│  P2 [B] │    ║   │     │     │     │     │  │  Node states  │
│  A1     │    ║   │──PREPARE──▶│     │     │  │  Consensus    │
│  A2     │    ║   │     │     │──PROMISE──▶│  │  status       │
│  A3     │    ║   │     │     │     │     │  │               │
│         │    ║   ▼     ▼     ▼     ▼     ▼  │               │
│         │    time                            │               │
├─────────┴───────────────────────────────────┴───────────────┤
│  [▶ Step] [▶▶ Auto-play] [⟳ Reset]  Speed: [━━━●━━━]       │
│  [💥 Crash Node ▾]  [📨 Drop Next ▾]  [⚡ New Proposal ▾]   │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Component Tree

```
<App>
  <Header />
  <main>
    <NodePanel>
      // Lists each node with its current internal state
      // Click a node to crash/restart it
      <NodeCard nodeId="P1" /> // Shows: role, status, current proposal #, proposed value
      <NodeCard nodeId="P2" />
      <NodeCard nodeId="A1" /> // Shows: role, status, highestPromised, acceptedProposal
      <NodeCard nodeId="A2" />
      <NodeCard nodeId="A3" />
    </NodePanel>

    <SimulationCanvas>
      // Contains the SVG element that D3 manages
      // Vertical timeline lanes for each node
      // Animated arrows for messages
      // D3 bindS to a ref — React does not render SVG children
      <svg ref={svgRef} />
    </SimulationCanvas>

    <InfoPanel>
      <ConsensusStatus />   // "No consensus" / "Consensus reached: value A"
      <EventLog />          // Scrollable list of delivered/dropped messages
      <ProtocolExplainer /> // Brief text explaining what just happened in the last step
    </InfoPanel>
  </main>
  <ControlBar>
    <StepButton />          // Advance one step
    <AutoPlayToggle />      // Step automatically on interval
    <SpeedSlider />         // Controls auto-play interval (200ms–2000ms)
    <ResetButton />
    <FaultControls>
      <CrashNodeDropdown />
      <DropMessageButton /> // Marks the next queued message as "dropped"
      <NewProposalButton /> // Triggers introduceProposal for a chosen proposer
    </FaultControls>
  </ControlBar>
</App>
```

### 6.3 SVG Canvas — D3 Specifics

**Timeline lanes**: 5 vertical lines spaced evenly across the SVG width, one per node. Each lane is labeled at the top with the node ID. Time flows downward.

**Message arrows**: When `step()` delivers a message, D3 draws an arrow from the sender's lane to the receiver's lane at the current vertical position (based on `stepCount`). The arrow animates from sender to receiver using `d3.transition()` with duration tied to the speed slider.

**Arrow styling by message type**:

| Message Type | Color | Stroke Style | Label |
|---|---|---|---|
| PREPARE | Blue | Solid | `P(n)` |
| PROMISE | Green | Solid | `PR(n)` or `PR(n, v)` if carrying an accepted value |
| ACCEPT | Orange | Solid | `A(n, v)` |
| ACCEPTED | Dark Green | Solid, thicker | `OK(n, v)` |
| NACK | Red | Dashed | `✗(n)` |
| Dropped | Gray | Dotted, with ✗ marker | Original label, struck through |

**Dropped messages**: Animate halfway, then fade out with a ✗ marker.

**Crashed nodes**: The vertical lane gets a red overlay/stripe. Messages arriving at a crashed lane animate in but fade out at the lane boundary.

### 6.4 Node Card — Framer Motion Specifics

Each `NodeCard` displays the node's internal state and animates on change:

**For proposers**: show status (idle/phase1/phase2/done/crashed), current proposal number, proposed value, number of promises collected, number of accepts collected.

**For acceptors**: show status (active/crashed), `highestPromised` (displayed as the proposal number tuple), `acceptedProposal` (number + value, or "none").

**Animations**:
- State change → background color flash (Framer Motion `animate` on a color property)
- Crash → shake effect + red tint
- Restart → pulse effect + return to normal color
- Consensus → green glow on participating acceptors and the successful proposer

---

## 7. Interaction Flows

### 7.1 Happy Path (No Faults)

1. User clicks "Start Proposal" on P1.
2. Engine enqueues 3 PREPARE messages (P1 → A1, P1 → A2, P1 → A3).
3. User clicks Step (or auto-play is on). Each step delivers one message.
4. After 3 steps: all PREPAREs delivered, 3 PROMISEs enqueued (all with `accepted: null`).
5. After 2 more steps: P1 has majority (2 promises), enqueues 2 ACCEPT messages with its own value.
6. After 2 more steps: 2 ACCEPTEDs received. Consensus reached.
7. Total: ~7-9 steps.

### 7.2 Competing Proposals (Livelock Demo)

1. User starts P1's proposal (value "A").
2. After P1's PREPAREs are delivered but before Phase 2 completes, user clicks "New Proposal" on P2 (value "B").
3. P2 sends PREPAREs with a higher proposal number.
4. Acceptors promise P2's higher number.
5. P1's ACCEPT messages get rejected (NACKed) because acceptors now have a higher promise.
6. User can manually trigger P1 to retry, repeating the cycle.
7. The event log and protocol explainer should highlight that this is the livelock scenario.

### 7.3 Crash and Recovery

1. Start P1's proposal.
2. After 2 of 3 acceptors send promises, crash A3.
3. P1 still reaches majority (2 promises) and proceeds to Phase 2.
4. P1 sends ACCEPT to A1 and A2. Both accept. Consensus reached even with A3 down.
5. Restart A3. It still has its old state (which may be empty if it never accepted anything).

### 7.4 Message Drop

1. Start P1's proposal.
2. P1 sends 3 PREPAREs. User drops the PREPARE to A1.
3. Only A2 and A3 receive PREPARE, only they send promises.
4. P1 still gets majority (2 promises). Protocol proceeds normally.
5. If user drops 2 of 3 PREPAREs, P1 cannot reach majority and stalls.

---

## 8. State Management (React)

Use `useReducer` with the following action types:

```typescript
type Action =
  | { type: "STEP" }                                    // Advance simulation one step
  | { type: "START_PROPOSAL"; proposerId: string }       // Kick off Phase 1
  | { type: "DROP_MESSAGE"; messageId: string }          // Mark message as dropped
  | { type: "CRASH_NODE"; nodeId: string }               // Crash a node
  | { type: "RESTART_NODE"; nodeId: string }             // Restart a crashed node
  | { type: "NEW_PROPOSAL"; proposerId: string }         // Competing proposal with higher round
  | { type: "RESET" }                                    // Return to initial state
  | { type: "SET_SPEED"; ms: number }                    // Auto-play interval
  | { type: "TOGGLE_AUTOPLAY" }                          // Start/stop auto-stepping
```

The reducer calls the engine functions (which are pure) and returns new state. React never holds mutable protocol state outside the reducer.

---

## 9. Directory Structure

```
src/
├── engine/
│   ├── types.ts              # All TypeScript types from Section 4
│   ├── proposalNumber.ts     # ProposalNumber comparison utilities
│   ├── simulation.ts         # step(), initializeState()
│   ├── faults.ts             # dropMessage(), crashNode(), restartNode(), introduceProposal()
│   └── __tests__/
│       ├── simulation.test.ts  # Happy path, majority logic, value selection rule
│       └── faults.test.ts      # Crash recovery, message drops, competing proposals
├── components/
│   ├── App.tsx
│   ├── Header.tsx
│   ├── NodePanel/
│   │   ├── NodePanel.tsx
│   │   └── NodeCard.tsx
│   ├── Canvas/
│   │   ├── SimulationCanvas.tsx   # Provides SVG ref to D3
│   │   └── useD3Animation.ts      # Custom hook: syncs D3 with SimulationState
│   ├── InfoPanel/
│   │   ├── InfoPanel.tsx
│   │   ├── ConsensusStatus.tsx
│   │   ├── EventLog.tsx
│   │   └── ProtocolExplainer.tsx
│   └── ControlBar/
│       ├── ControlBar.tsx
│       └── FaultControls.tsx
├── state/
│   ├── reducer.ts            # useReducer actions → engine function calls
│   └── context.tsx           # SimulationContext provider (optional, or just prop drill)
├── hooks/
│   └── useAutoPlay.ts        # setInterval-based auto-stepping
└── main.tsx
```

---

## 10. Build Sequence (Claude Code Execution Plan)

Each step below should be completed and tested before moving to the next. When working with Claude Code, paste the relevant type definitions and the target behavior for each step.

### Step 1: Scaffold + Types
- `npm create vite@latest paxos-viz -- --template react-ts`
- `npm install d3 @types/d3 framer-motion`
- Create the directory structure above.
- Implement `src/engine/types.ts` with all types from Section 4.
- Implement `src/engine/proposalNumber.ts` with `compareProposalNumbers()` and a helper `isGreaterThan()`.
- **Test**: unit test that `(2, "P1") > (1, "P2") > (1, "P1")`.

### Step 2: Engine — Happy Path
- Implement `initializeState()` returning the 5-node initial state.
- Implement `step()` with full Phase 1 and Phase 2 processing.
- Implement `startProposal()` to enqueue initial PREPARE messages.
- **Test**: from initial state, call `startProposal("P1")`, then call `step()` repeatedly. Assert: after enough steps, consensus is reached on P1's value with ≥2 acceptors having accepted it.

### Step 3: Engine — Faults
- Implement `dropMessage()`, `crashNode()`, `restartNode()`, `introduceProposal()`.
- **Test — crash recovery**: crash A3 before any messages, run happy path, consensus still reached with A1+A2.
- **Test — message drop**: drop 2 of 3 PREPAREs, verify proposer stalls (never reaches phase2).
- **Test — competing proposals**: start P1, let it reach phase1, then introduceProposal for P2 with higher round. Verify P1's ACCEPTs get NACKed.
- **Test — value selection rule**: have A1 accept a proposal with value "X" in a prior round. Then start a new proposal from P2. When P2 collects promises, it should propose "X" (not its own value), because A1's promise carries an accepted proposal.

### Step 4: React Shell + Static Rendering
- Implement the component tree from Section 6.2 with placeholder/static content.
- Wire up `useReducer` with the action types from Section 8.
- Render NodeCards showing each node's state.
- Add a Step button that dispatches `STEP` and verify state updates appear in the UI.
- No animation yet — just re-render on state change.

### Step 5: D3 Message Animation
- Implement `useD3Animation` hook.
- Draw the 5 vertical timeline lanes in SVG.
- On each step, D3 draws and animates an arrow from sender lane to receiver lane.
- Implement the arrow styling table from Section 6.3.
- Dropped messages: animate partway, then fade with ✗.

### Step 6: Framer Motion + UI Polish
- Add Framer Motion animations to NodeCards (color flash on state change, shake on crash, green glow on consensus).
- Implement the ControlBar with all buttons and the speed slider.
- Implement the EventLog as a scrollable list of delivered/dropped messages.
- Implement the ConsensusStatus banner.
- Implement the ProtocolExplainer: after each step, display a one-line description of what just happened (e.g., "A1 promised proposal (1, P1) — no prior accepted value").

### Step 7: Interaction Polish
- Add click-to-crash on NodeCards (with confirmation).
- Add click-to-drop on queued messages in the EventLog or on in-flight arrows in the SVG.
- Add auto-play with speed control.
- Add the "New Proposal" button that triggers `introduceProposal`.
- Add a Reset button.

### Step 8: Preset Scenarios + Edge Cases
- Add preset buttons: "Happy Path", "Competing Proposals (Livelock)", "Crash Recovery", "Message Loss".
- Each preset configures the initial state and pre-queues a sequence of user actions.
- Handle edge case: what if all acceptors crash? Display "consensus impossible — no majority available."
- Handle edge case: proposer crashes mid-protocol — its in-flight messages still deliver but no one processes the responses.

---

## 11. Testing Strategy

**Unit tests** (Vitest, no DOM):
- `proposalNumber.test.ts`: ordering, equality, tiebreaking.
- `simulation.test.ts`: happy path, Phase 1 majority, Phase 2 majority, value selection rule (highest accepted proposal among promises).
- `faults.test.ts`: crash, restart (state preserved), message drop, competing proposals, NACK handling.

**Integration tests** (React Testing Library):
- Render App, click Start Proposal, click Step N times, verify consensus status appears.
- Crash a node mid-protocol, verify protocol still completes.

**Visual QA** (manual):
- Verify D3 arrows animate correctly between correct lanes.
- Verify dropped messages show the ✗ treatment.
- Verify crashed node lanes show the red overlay.

---

## 12. Key Correctness Properties to Validate

These are the invariants that the engine must maintain. Consider writing assertions that check these after every `step()` call during development:

1. **Only proposed values can be chosen.** The consensus value must be one of the proposers' values.
2. **Only a single value is chosen.** Once `consensus.reached = true` with value `v`, it never changes to a different value.
3. **The value selection rule (P2b from Lamport).** When a proposer collects promises and determines its Phase 2 value, if any promise carries an accepted proposal, the proposer MUST use the value from the highest-numbered one — not its own preferred value.
4. **Stable storage survives crashes.** After `crashNode` + `restartNode`, `highestPromised` and `acceptedProposal` are unchanged.
5. **A promise is honored.** An acceptor that has promised proposal number `n` never accepts a proposal numbered less than `n`.
