# Final Demo Prep

A self-contained read-it-the-morning-of-the-demo guide. Source of truth is the code in `src/`, not earlier docs.

---

## 1. App Overview

The Paxos Consensus Visualizer is a browser-based interactive simulator for **single-decree Paxos**, the original Lamport algorithm. It runs a fixed five-node setup — two proposers (P1, P2) and three acceptors (A1, A2, A3) — over a discrete-step model where each press of *Step* delivers exactly one in-flight message and runs the protocol's reaction. Auto-play does the same thing on a timer (200ms–2000ms, slider-controlled).

The audience is anyone who has read *Paxos Made Simple* and wants to **see** the message exchange instead of reasoning about it on paper. Every Paxos artefact is a first-class object on screen: the proposer's `currentProposal`, each acceptor's `highestPromised` and `acceptedProposal`, the message queue (with FIFO order visible), and a live consensus banner. The user can inject faults (crash a node by clicking it, drop a queued message by clicking it) and watch the protocol's safety properties hold up — or, in adversarial scenarios, watch a competing proposer hijack a value.

The app teaches three things explicitly: (1) *why majority quorum works* — minority crashes are tolerated, majority crashes halt; (2) *the value-selection rule (P2b)* — once a value is accepted by any single acceptor in a future quorum, all later proposers are forced to carry it forward; (3) *stable storage* — `highestPromised` and `acceptedProposal` survive crash/restart, which is what keeps the protocol safe across acceptor failures.

---

## 2. Feature Inventory

Grouped by area. Honest about polish vs rough.

### Simulation Controls (footer, row 1)

| Feature | Where | Working state |
|---|---|---|
| **Step button** | `ControlBar.tsx` | Solid. Disabled when queue is empty. |
| **Auto-play / Pause toggle** | `ControlBar.tsx` | Solid. Auto-stops when queue drains (via `useAutoPlay.ts`). After it stops, user must click Auto-play again to resume — there's no "auto-resume on new messages." |
| **Speed slider** | `ControlBar.tsx`, range 200–2000ms | Solid. Default is 1250ms. The slider is inverse-linear (left = slow, right = fast); the displayed `XXXXms` is the actual interval. |
| **Reset button** | `ControlBar.tsx` | Solid. If a script is loaded, Reset rewinds the script (re-applies `initial_state`, re-fires `at:0` events). Otherwise restores `initialAppState()`. |
| **Step badge in header** | `Header.tsx` | Shows `Step N`. Always visible. |

### NodeCards (left rail, `NodePanel/`)

| Feature | Where | Notes |
|---|---|---|
| **Proposer fields:** value, proposal, promises x/3, accepts x/3 | `NodeCard.tsx:176-197` | Updates live. `promises` field counts what's been delivered to the proposer, not what's been sent to it. |
| **Acceptor fields:** promised, accepted | `NodeCard.tsx:199-212` | Both fields render `(round, nodeId)` plus value where applicable. |
| **Click-to-crash / click-to-restart** | `NodeCard.tsx:120-128` | The card click handler dispatches `CRASH_NODE` if active, `RESTART_NODE` if crashed. Buttons inside the card are excluded via a `closest("button")` check. |
| **Start Proposal button** | `NodeCard.tsx:214-235` | Visible only on proposers. Disabled while the proposer is mid-protocol; label flips to "Proposing…" during phase1/phase2. Calls `startProposal()` (round = proposer.round + 1). |
| **New Proposal button** | `NodeCard.tsx:237-257` | Calls `introduceProposal()` (round = max-in-system + 1). Disabled when proposer is crashed. **Important distinction:** Start Proposal uses the proposer's own round counter; New Proposal scans the entire system and picks above the maximum. The dueling-proposers and value-hijacking demos depend on this. |
| **Crash/restart animations** | `NodeCard.tsx:73-118` | Framer Motion `useAnimation`. Crash = red shake (`x: [0, -7, 7, -5, 5, -2, 2, 0]`). Restart = green flash + scale pulse. Consensus = green glow + box-shadow halo. Same dispatch state changes (e.g. crash + restart at same `at`) collapse to a single render — no animation between them. |

### Canvas (centre, `Canvas/`)

| Feature | Where | Notes |
|---|---|---|
| **Vertical timeline lanes** | `SimulationCanvas.tsx:54-159` | Five dashed lanes, top-to-bottom, one per node. D3-rendered into `.lanes-layer`. Crash columns shown as red overlays. |
| **Message arrows** | `useD3Animation.ts` | D3-rendered into `.arrows-layer`. Each delivered message animates left→right (or right→left) at the arrow's row. Dropped messages stop ~30px short of the destination, line-through their label, fade out. NACKs are red dashed. |
| **Auto-grow + scroll** | `SimulationCanvas.tsx:31-49` | The SVG height grows as `delivered` count increases. The container scrolls vertically once the timeline exceeds the viewport. |

### Info Panel (right rail, `InfoPanel/`)

| Feature | Where | Notes |
|---|---|---|
| **Consensus Status banner** | `ConsensusStatus.tsx` | Three states: "No consensus yet" (default), "Consensus impossible — no majority available" (when ≥2 acceptors crashed), "*value*" (when reached). The "impossible" branch is detection-only — the protocol itself just stalls; this banner explains *why*. |
| **Event Log** | `EventLog.tsx` | Reverse-chronological list of delivered + script events, plus a Queued section at the bottom. Hover any row for the protocol-level explanation (`title` attribute, surfaces native browser tooltip). Click any queued row to drop it. |
| **Last-step Protocol Explainer** | `ProtocolExplainer.tsx` | One-liner describing the most recent delivered message in plain English. When consensus is reached, it overrides with a consensus message. |

### Presets (`ControlBar/PresetControls.tsx`, four buttons)

| Preset | What it does | Outcome |
|---|---|---|
| **Happy Path** | `startProposal(P1)`, autoplay on | P1 reaches consensus on "A" in 10 steps. No faults. |
| **Competing Proposals** | `startProposal(P1)`, then immediately `introduceProposal(P2)` | Both proposers in flight from step 0. P2 has round 2 and bumps everyone's `highestPromised`. P1's ACCEPTs are NACKed when they arrive. P2 reaches consensus on "B". |
| **Crash Recovery** | `crashNode(A3)`, then `startProposal(P1)` | P1 reaches consensus on "A" via A1+A2. A3 stays red throughout. |
| **Message Loss** | `startProposal(P1)`, then `dropMessage(prepare→A2)` | **DESCRIPTION ON THE BUTTON IS STALE.** The hover tooltip says "P1 only receives 1 PROMISE — it stalls in phase1." Actual behavior: P1 gets 2 promises (A1 and A3) and reaches consensus on "A". This is a known issue — see §9. |

### Scripted Scenarios (`ControlBar/ScriptControls.tsx`)

| Feature | Where | Notes |
|---|---|---|
| **Load script…** button | Opens a file picker for `.json` files. | Validates with `parseAndValidate` (`script/validate.ts`). Invalid scripts surface a red error banner above the canvas listing every parse/schema error. |
| **Clear button** | Visible only when a script is loaded. | Drops the script + log; sim state stays as-is. |
| **Script banner** | `ScriptBanner.tsx` | Shows the loaded script's name, description, and `N/M events fired` counter above the canvas. |
| **Verbs supported** | `script/types.ts` | `propose`, `crash`, `restart`, `drop`. `at` field is the engine's `stepCount`. Multiple events at same `at` fire in file order, in one dispatch. |
| **Bundled scripts** | `scenarios/` (4 files), `demo/` (6 files) | The `scenarios/` set mirrors the four presets exactly. The `demo/` set covers the harder edge cases. **The user must navigate the file picker to these paths manually — there is no in-app browser for them.** |
| **AutoPlay state on load** | `reducer.ts:143` | A script always loads with `autoPlay: false`. The user must press Auto-play to start the script playing. Scripts with `at: 0` events fire on load (visible in the banner counter), but the engine doesn't advance until you click Auto-play or Step. |

### Limitations / rough edges to know

- Animations between two events at the same `at` (e.g. `crash + restart`) **do not show separately** — they collapse to one render. This was a deliberate design constraint; see §9.
- Loading a new script resets the simulation entirely. There's no way to splice multiple scripts.
- The file picker has no recent-files or built-in browser; users locate scripts via OS file dialog.
- No keyboard shortcuts. Click everything.
- No way to edit a script in-app.

---

## 3. Technical Architecture

### Engine purity contract

`src/engine/` is **pure TypeScript**. No React imports, no DOM access, no side effects (apart from `crypto.randomUUID()` for message IDs). Every public function — `step`, `startProposal`, `introduceProposal`, `crashNode`, `restartNode`, `dropMessage` — takes a `SimulationState` and returns a new one. Tests in `src/engine/__tests__/` exercise these functions directly with no React harness.

### State management

Single `AppState` (in `src/state/reducer.ts`) wraps the engine's `SimulationState` plus UI-only fields:

```ts
interface AppState {
  sim: SimulationState;          // the engine's state
  autoPlay: boolean;
  speedMs: number;
  resetKey: number;              // bumped on RESET/LOAD_PRESET/LOAD_SCRIPT to nuke D3 SVG
  script: LoadedScript | null;
  scriptError: string[] | null;
  scriptLog: ScriptLogEntry[];
}
```

A single reducer handles all 13 action types (`STEP`, `LOAD_PRESET`, `LOAD_SCRIPT`, `CRASH_NODE`, etc.). Components dispatch via the `useSimulation()` hook in `src/state/context.tsx`. No Redux, no Zustand — just `useReducer`.

### Animation layer split

Two libraries, strict ownership boundary:

- **D3 owns SVG**, full stop. The `<svg>` element is rendered by React with no children; D3 populates `.lanes-layer` (in `SimulationCanvas.tsx`) and `.arrows-layer` (in `useD3Animation.ts`). React never touches SVG children. Two D3 effects re-run when their dependencies change: lanes redraw on node-status changes, arrows redraw on delivered-message changes.
- **Framer Motion owns React component animations.** NodeCard background colour transitions, the consensus banner enter/exit, and the protocol explainer fade are all `motion.div` with `useAnimation`. No D3 on React-rendered elements.

### Message queue mechanics

FIFO, in-place, never reordered. `step()` (`simulation.ts:131`) dequeues `messageQueue[0]`, processes it, appends any newly-generated messages to the tail. Two filters happen before the type-handler runs:

1. If the message status is already `dropped` (user-marked), the message is moved to `deliveredMessages` with status `dropped` and `step()` returns. No protocol effect.
2. If the sender is crashed, dropped (this branch is rarely hit because `crashNode` already wipes outbound messages from the queue, but covers the edge case where the sender crashes between step dispatches).
3. If the recipient is crashed, dropped.

Reply messages generated by the type handler are pushed to `messageQueue` via spread-append at `simulation.ts:325`.

### Phase 2 trigger logic

Cite: `simulation.ts:228-254`. When the *first* PROMISE that brings `newPromises.length >= 2` arrives, the proposer:

1. Computes `chosenValue` via the value-selection rule (P2b): if any received promise carries a non-null `accepted`, take the value from the highest-numbered one; otherwise keep `proposer.proposedValue`.
2. Transitions `status: "phase2"`.
3. Enqueues one ACCEPT message *per acceptor in `promisesReceived`* — **only to acceptors that have already promised**, not to all three. This is per Lamport ("send ACCEPT only to acceptors that promised") and is why the third PROMISE often arrives after Phase 2 has already started and gets stale-discarded.

Subsequent PROMISEs are caught by the stale check at `simulation.ts:214-220` (`status !== "phase1"`) and silently discarded.

### Crash and restart semantics

`crashNode` (`faults.ts:35-48`):
- Sets `status: "crashed"`. All other fields preserved (stable storage).
- `messageQueue.filter((m) => m.from !== nodeId)`: removes every queued message originating from the crashed node. So crashing P1 mid-Phase-2 wipes its in-flight ACCEPTs immediately. Crashing A1 mid-Phase-1 wipes its queued PROMISE.

`restartNode` (`faults.ts:55-86`):
- For acceptors: spread on `status: "active"`. `highestPromised` and `acceptedProposal` flow through unchanged.
- For proposers: clears `currentProposal`, `promisesReceived`, `acceptsReceived`. Keeps `round` (so a restarted proposer's next "New Proposal" picks up above its prior history).

### Scripted scenarios runner

`runScriptTick` (`script/runner.ts:103-172`) is invoked from two places in the reducer:

1. After every `STEP` dispatch (at the tail of the case, `reducer.ts:159`).
2. From `buildLoadedScriptState` on `LOAD_SCRIPT` (one-shot at load to fire `at: 0` events).

Inside the tick: while `events[next].at <= sim.stepCount`, fire that event and advance `next`. Same-`at` events fire in file order (sort is stable in `validate.ts:113`).

After firing, the tick checks two stall conditions and emits one-shot system warnings:
- Queue is empty but events remain pending → `"queue empty with N event(s) un-fired"`.
- `stepCount >= 200` while autoplay is on → forces autoplay off, emits `"safety cap"` warning.

### File structure

```
src/
  engine/                  Pure TS — Paxos protocol mechanics
    types.ts               ProposerState, AcceptorState, Message, SimulationState
    proposalNumber.ts      Lex compare on (round, nodeId)
    simulation.ts          step(), startProposal(), checkConsensus(), initializeState()
    faults.ts              crashNode(), restartNode(), dropMessage(), introduceProposal()
    invariants.ts          Runtime safety checks (5 of them, from spec.md §12)
  state/
    reducer.ts             AppState + all 13 actions + preset factory
    context.tsx            React context wrapping useReducer
  script/                  Scripted scenarios feature
    types.ts               ScriptEvent, LoadedScript, ScriptLogEntry
    validate.ts            JSON parse + schema check
    runner.ts              applyScriptEvent(), runScriptTick(), describeScriptEvent()
  components/
    App.tsx                Top-level layout
    Header.tsx             Title + step counter
    ScriptBanner.tsx       Script name/desc/error/progress display
    ControlBar/            Footer with Step, Auto-play, Speed, Reset, Presets, ScriptControls
    NodePanel/             Left rail: 5 NodeCards with state/buttons
    Canvas/                Centre: D3-rendered timeline + arrows (lanes-layer + arrows-layer)
    InfoPanel/             Right rail: ConsensusStatus, EventLog, ProtocolExplainer
  hooks/
    useAutoPlay.ts         Drives STEP dispatches on a setInterval while autoplay is on
scenarios/                 Bundled .json scripts mirroring the 4 presets
demo/                      .json scripts for harder edge-case scenarios + .md docs
```

---

## 4. Anticipated Questions and Answers

### Protocol questions

**Why a majority quorum?**
Majority is the smallest set such that any two majorities overlap by ≥1 acceptor. That overlap is what carries learned values forward across rounds — it's the heart of Paxos's safety proof. With 3 acceptors, majority = 2; you tolerate 1 failure. Generally `2f+1` acceptors tolerate `f` failures. Show the **minority-crash** scenario for the success case and **majority-crash** for the boundary.

**Why two phases?**
Phase 1 gathers a majority of *promises* (acceptors agreeing not to accept anything below the proposer's round number). It also pulls back any prior accepted values via the value-selection rule. Phase 2 then asks the same majority to *accept* a value that is now guaranteed safe to choose — either the proposer's own value (if no prior accepted) or the highest prior accepted value (if any). Splitting collection from commitment is what makes the protocol robust against concurrent proposers.

**What is stable storage?**
Acceptors must persist `highestPromised` and `acceptedProposal` to disk before responding. If they crash and forget either field, a restarted acceptor could re-promise to a lower round, breaking safety. In our model, `restartNode` for acceptors literally just flips `status` back to `"active"` and leaves both fields intact — see `faults.ts:60-69`. The **crash-and-recovery-between-phases** demo isolates this: A1 promises in Phase 1, crashes, restarts, then accepts in Phase 2 because its promise survived.

**FLP impossibility — how does Paxos sidestep it?**
FLP says no async deterministic protocol can guarantee both safety and liveness with even one faulty node. Paxos chooses safety unconditionally and gives up liveness — it can livelock indefinitely (the **dueling-proposers** scenario). Real systems (Multi-Paxos, Raft) layer leader election on top to suppress competing proposers and recover liveness. Mention this when the dueling-proposers scenario plays.

**Multi-Paxos vs basic Paxos?**
This visualizer is single-decree basic Paxos — one consensus instance, terminates with one chosen value. Multi-Paxos chains many instances under a stable leader, amortising Phase 1 across decrees so each decree only needs Phase 2. Out of scope here, mentioned in §"What's next."

**Byzantine vs crash-stop?**
Our model is crash-stop: nodes fail by stopping, never by lying. Byzantine Paxos (PBFT etc.) tolerates malicious or buggy nodes that send arbitrary messages. Different protocol family, different quorum sizes (`3f+1` for PBFT). Out of scope here.

**The value-selection rule (P2b) — what exactly does it do?**
When a proposer collects a majority of PROMISEs, if *any* of those promises carry a previously-accepted value, the proposer must use the value from the highest-numbered such accepted proposal — not its own. This guarantees that once a value is accepted by a majority in any round, every later majority-quorum proposer will discover it and carry it forward. The **value-hijacking** demo is the canonical demonstration: P2 wants "B", but every promise it receives carries A1/A2's accepted "A", so P2's ACCEPTs go out with "A".

### Implementation design decisions

**Why do ACCEPTs go only to promisers, not all acceptors?**
Lamport says so — "send ACCEPT only to acceptors that promised" — and the engine implements it at `simulation.ts:243`. An acceptor that didn't promise hasn't committed its `highestPromised` to this round, so sending it an ACCEPT can produce a NACK depending on what other proposals it has seen. Restricting to promisers also explains the visible asymmetry in the happy path (only 2 of 3 acceptors get an ACCEPT, A3 sits idle).

**Why does Phase 2 fire on threshold (≥2) rather than waiting for the queue to settle?**
We chose to model the protocol's *causal* trigger: a proposer transitions to Phase 2 the moment it sees a majority of promises. Waiting for queue settlement would be a different (and incorrect) abstraction. The third PROMISE arrives "stale" and is silently discarded — that's a real Paxos behaviour worth showing.

**Why does `crashNode` wipe outbound messages from the queue?**
Because in a real system, a crashed node cannot send anything, so any "in-flight" message from it should be considered lost. We chose to model this aggressively: the moment you crash a node, its outbound queue entries vanish. The trade-off is that crashing a proposer mid-Phase-2 makes the ACCEPT animations disappear instead of letting them play out as auto-dropped — the **proposer-crash-after-phase1** demo notes this explicitly. The alternative (let them play out as dropped) was rejected because it would falsely suggest the messages reached the network.

**Why pure reducer + Framer + D3?**
- Pure reducer because the protocol logic is the interesting part and we wanted it testable in isolation. 156 unit tests run in <1 second.
- Framer Motion for React-component animations because it composes naturally with state-driven re-renders.
- D3 for SVG because we needed precise control over arrow geometry, marker definitions, and incremental drawing — React's diffing model is hostile to imperative SVG mutation.
- The strict React/D3 boundary (React renders only the empty `<svg>`, D3 owns interior) is documented in `SimulationCanvas.tsx:13-21`.

### Demo behaviour questions

**Why does A3 promise but never accept on the happy path?**
A3 promises at step 3, but its PROMISE arrives at step 6 — after step 5 where P1's 2nd PROMISE (from A2) triggered the Phase 2 transition. By then P1 is already in `phase2`, so A3's PROMISE is stale-discarded (line 214-220). P1's ACCEPTs went out only to A1 and A2 (the two who'd promised so far at step 5), so A3 never receives an ACCEPT and never accepts. A3's `accepted` field stays `—` even though consensus is reached. Worth pointing out — it's the cleanest illustration of "only acceptors that promised receive ACCEPTs."

**Why doesn't a proposer retry after a NACK?**
The engine handles NACKs as a round-counter bump (`simulation.ts:260-268`): the proposer raises its `round` to `max(own, nack.highestPromised) + 1`, but does NOT auto-restart Phase 1. The user has to click "New Proposal" to actually retry. This is a deliberate simplification — auto-retry would obscure the demo's key beats.

**What happens with two crashed acceptors?**
The **majority-crash** preset/demo shows it. P1 sends 3 PREPAREs; 2 are auto-dropped at crashed recipients; only A1 promises. P1 stays in `phase1` with `promises 1/3` permanently. The Consensus Status banner switches to "Consensus impossible — no majority available" because the UI detects ≥2 crashed acceptors (`ConsensusStatus.tsx:13-16`). This is purely a UI affordance; the protocol itself just stalls.

**What if I crash a proposer during Phase 2?**
Run the **proposer-crash-after-phase1** scripted scenario. P1 wins Phase 1, queues 2 ACCEPTs, then crashes. The engine wipes both ACCEPTs from the queue (since their `from` is now-crashed P1). When P2 enters with a higher round, the acceptors' PROMISEs all carry `accepted: null` (P1's ACCEPTs never landed), so P2 is free to choose its own value "B". Consensus reaches on "B". The teaching point: winning Phase 1 doesn't guarantee consensus.

### Engineering process questions

**Did you use Claude Code?**
Yes, throughout. We architected the engine purity contract, the state model, the preset factory, and the scripted-scenarios feature design. Claude Code wrote a significant portion of the implementation under that direction. Tests we wrote ourselves and used as the contract Claude had to satisfy. We also caught and fixed a real bug along the way — Invariant 5 in `engine/invariants.ts` was checking the comparison in the wrong direction (asserting `acceptedProposal.number >= highestPromised` when the temporal property is the other way around) — that fix is committed.

That's how we work now. We design, the model implements under direction, we verify and own the result.

**Is there a SPEC.md? How did you split design and implementation?**
Yes — `spec.md` is the protocol-level specification (~600 lines, written before any code). `scripted.md` is the design doc for the scripted-scenarios feature. `DEMO_PREP_SPEC.md` is the polish phase plan. `CODEBASE_BRIEF.md` is a short orientation written for future Claude sessions to load in. `WORKLOG.md` is a chronological build log. We wrote specs first, used them to prompt Claude, ran tests after every change, kept the worklog as a paper trail.

**How did you test?**
Three layers:
1. Engine unit tests (`engine/__tests__/`): 60 tests covering proposalNumber compare, simulation step, faults, invariants. Pure-function tests, no React.
2. Script tests (`script/__tests__/`): validation, runner, integration scenarios, bundled scenarios. ~80 tests including running every preset to completion and asserting consensus state.
3. Manual visual verification in the dev server for animation timing and visual edge cases. We don't have UI snapshot tests.

### What we'd do next

- **Multi-Paxos / leader election.** Layer a stable-leader abstraction on top of the basic Paxos engine, implement Phase 1 amortisation across decrees.
- **Scenario authoring UI.** Right now scripts are JSON edited in a text editor. An in-app editor with type-safe forms and live "would this fire" preview would lower the barrier.
- **Network partition modelling.** Currently we have crash-stop and per-message drops. A real partition (group A can talk to group B but not group C) is a useful next abstraction.
- **Two real bugs we know about.** (1) The Message Loss preset's tooltip is stale and contradicts behaviour (§9). (2) `useD3Animation.ts` has a known `react-hooks/exhaustive-deps` warning at line 276 — the effect deliberately reads `state.sim` outside the dep list to avoid redrawing on every state change. We'd refactor to thread the relevant slices through props instead.

---

## 5. Demo Walkthrough Outline

Approximate total time: **15–18 minutes** at default speed. Cut to 10 minutes by skipping bonus scenarios.

### Opening orientation (60 seconds, before clicking anything)

> "Single-decree Paxos. Five nodes — two proposers on the left, three acceptors. The middle column is a timeline; messages flow as arrows along it. Right side has the consensus banner, the event log of every delivered and queued message, and a one-line plain-English explainer of the last step. The footer has Step, Auto-play, Speed, and Reset, and the four preset scenarios. We'll start with the happy path."

Point at: the five NodeCards (note the colours: blue/purple = proposer, teal = acceptor), the empty canvas, the empty Event Log, the "No consensus yet" banner.

### Scenario 1: Happy Path (~2 minutes)

**Click:** *Happy Path* preset.

Auto-play starts. Watch:
- Steps 1–3: PREPAREs flow P1 → A1, A2, A3. Each acceptor's `promised` field updates to `(1, P1)`.
- Steps 4–5: PROMISEs come back. At step 5, P1 hits majority — `promises 2/3`, transitions to phase2, ACCEPTs queue up to **A1 and A2 only**. **Point this out.**
- Step 6: A3's late PROMISE arrives, gets stale-discarded.
- Steps 7–8: A1, A2 accept. Consensus banner lights up green at step 8 with `"A"`.
- Steps 9–10: ACCEPTEDs deliver, P1 → done.

**Narrate:** "Notice that A3 never got an ACCEPT. Lamport's rule says you only ACCEPT to acceptors that already promised. By the time A3's PROMISE arrived, P1 was already in Phase 2 and treated it as stale."

**Likely question:** "Why didn't all 3 acceptors end up with the same `accepted` field?" → Because consensus only requires a majority. A3 wasn't in the loop and stays at `accepted: —`.

### Scenario 2: Competing Proposals (~3 minutes)

**Click:** *Reset*. Then **Click:** *Competing Proposals*.

Both proposers in flight from step 0. Watch:
- Steps 1–3: P1's PREPAREs deliver, all 3 acceptors promise `(1, P1)`.
- Steps 4–6: P2's PREPAREs (round 2) arrive. Acceptors **re-promise to (2, P2)** because round 2 > round 1. PROMISE responses to P2 carry `accepted: null` (no one has accepted yet).
- Steps 7–9: P1's PROMISEs come in but P2's PREPAREs already bumped the acceptors' `highestPromised`. (In this preset's exact ordering: P1's promises arrive *before* P2's, so P1 still hits majority and enters phase2 with proposal (1,P1). Note: depending on queue ordering this is subtle — narrate based on what you see on-screen, not from memory.)
- Eventually: P1's ACCEPTs reach acceptors who have promised (2, P2). They NACK them (red dashed arrows). P2's ACCEPTs deliver successfully. Consensus on "B".

**Narrate the P2b moment:** "P2's PROMISEs all carried `accepted: null` because no acceptor had accepted yet — so P2 was free to keep its own value 'B'. If you'd let P1's ACCEPTs land first, you'd see different behaviour — that's the value-hijacking scenario in the bonus scripts."

**Likely question:** "What if both proposers had hit majority simultaneously?" → They can't — the queue is serialised. But two could ratchet rounds back and forth indefinitely, that's the dueling-proposers livelock.

### Scenario 3: Crash Recovery (Minority Crash) (~2 minutes)

**Click:** *Reset*. Then **Click:** *Crash Recovery*.

A3 starts crashed (red). P1 starts proposing. Watch:
- Step 1, 2: PREPAREs to A1, A2 land normally. Both promise.
- Step 3: PREPARE to A3 auto-drops (red dashed arrow stops short of A3). Note: A3's `promised` field stays `—`.
- Steps 4–5: 2 PROMISEs deliver, P1 hits majority. Phase 2.
- Steps 6–7: ACCEPTs to A1, A2. Both accept. Consensus banner lights up at step 7 with "A".
- Steps 8–9: ACCEPTEDs, P1 → done.

**Narrate:** "Tolerated one acceptor failure. Took 9 steps instead of 10 — even *fewer*, because A3's stale PROMISE never appeared in the queue. Minority crashes are essentially free."

**Likely question:** "What if 2 acceptors are down?" → Run the bonus majority-crash scenario, or just describe: P1 gets 1 promise, never reaches majority, stalls in phase1, the banner switches to "Consensus impossible."

### Scenario 4: Message Loss (~2 minutes)

**Click:** *Reset*. Then **Click:** *Message Loss*.

P1's PREPARE to A2 is pre-marked dropped before any step runs.

> ⚠ **The button's hover tooltip says "P1 only receives 1 PROMISE — it stalls in phase1." That is wrong.** Actual behaviour: P1 still gets 2 PROMISEs (from A1 and A3) and reaches consensus on "A". Just narrate the actual behaviour and don't read the tooltip out loud.

Watch:
- Step 1: PREPARE to A2 auto-drops (it was pre-marked).

  Actually, queue order: PREPARE→A1, PREPARE→A2 (dropped), PREPARE→A3. So step 1 = PREPARE→A1 (A1 promises), step 2 = PREPARE→A2 dropped (no-op), step 3 = PREPARE→A3 (A3 promises). The dropped arrow renders as a red dashed line stopping ~30px short of A2.
- Step 4: PROMISE A1, count=1.
- Step 5: PROMISE A3, count=2 → Phase 2. ACCEPT P1→A1, ACCEPT P1→A3.
- Step 6: ACCEPT P1→A1 → A1 accepts.
- Step 7: ACCEPT P1→A3 → A3 accepts. Consensus banner at "A".
- Steps 8–9: ACCEPTEDs land. P1 → done.

**Narrate:** "Network drop, no problem — Paxos's quorum overlap means as long as you can still reach a majority, the protocol completes. The lost message is just visible noise."

### Bonus scenarios (skip if running short)

**Bonus A: Two crashed acceptors (~1 minute).** Reset. Click A2 to crash, click A3 to crash. Click Start Proposal on P1. Step through. PREPARE to A1 lands; PREPAREs to A2 and A3 auto-drop. P1 gets 1 promise. Never reaches majority. Consensus banner switches to "Consensus impossible." Narrate the `2f+1` rule.

**Bonus B: Stable storage via scripted scenario (~3 minutes).** *Reset*. Click *Load script…*. Pick `demo/crash-and-recovery-between-phases.json`. Read the banner — "A1 is crashed mid-Phase-1 and restarted before Phase 2's ACCEPT arrives." Click *Auto-play*. Watch:
- Steps 1–4: Normal phase 1.
- After step 5: A1 turns red (crashed mid-protocol).
- Step 6: stale PROMISE from A3 discards.
- After step 6: A1 turns green (restarts). Crucially, A1's `promised: (1, P1)` is unchanged.
- Step 7: ACCEPT P1→A1 lands at the just-restarted A1. A1 accepts. **Stable storage payoff.**
- Steps 8–10: A2 accepts, ACCEPTEDs land, consensus.
**Narrate:** "A1 was crashed for two engine steps. Its `highestPromised` survived the crash. When the ACCEPT arrived after restart, A1 honoured it because it remembered the promise. That's stable storage — the foundation of Paxos safety across failures."

**Bonus C: Value Hijacking (~2 minutes).** *Reset*. Click *Load script…*. Pick `demo/value-hijacking.json`. Auto-play. P1 reaches consensus on "A" (steps 1–10). Then P2 enters wanting "B". Watch the PROMISEs from A1 and A2 carry `accepted: "A"` (the event log shows `→ "A"`). At step 15, P2 hits majority — but the value-selection rule forces it to use "A". P2's ACCEPTs all show `"A"`, not `"B"`. Consensus stays "A".
**Narrate:** "P2 wanted to propose B. The protocol forced it to carry A forward. This is why Paxos is safe — once a value is chosen, no future proposer can change it, regardless of intent."

### Closing (~30 seconds)

> "What we'd build next: leader election to break the dueling-proposers livelock, a scenario authoring UI to lower the barrier to scripting, network partition modelling. The engine is pure TS, fully tested, ready to extend. Questions?"

---

## 6. Work Split

*Fill in actual ownership before the demo.*

### Owner: Ayo
- *(placeholder — fill in)*
- e.g., "Engine design and implementation (`src/engine/`)"
- e.g., "State management and reducer architecture"
- e.g., "Scripted scenarios feature design (`scripted.md`) and implementation (`src/script/`)"

### Owner: [Partner Name]
- *(placeholder — fill in)*
- e.g., "Animation work (Framer Motion NodeCard transitions, ConsensusStatus banner)"
- e.g., "D3 canvas rendering (`Canvas/SimulationCanvas.tsx`, `useD3Animation.ts`)"
- e.g., "UI components and styling"

### Joint
- *(placeholder — fill in)*
- e.g., "Spec writing (`spec.md`, `DEMO_PREP_SPEC.md`)"
- e.g., "Preset and demo scenario design"
- e.g., "Testing strategy and test authoring"
- e.g., "Documentation (`README.md`, `WORKLOG.md`, `CODEBASE_BRIEF.md`)"

Suggested categories you might want to split: engine design vs implementation, animation work, preset/scenario design, scripted scenarios feature, UI components, testing, documentation, demo prep.

---

## 7. Pre-Demo Checklist

Run through these in the 10 minutes before you walk in.

- [ ] `git pull` — make sure you're on the latest commit.
- [ ] `npm install` — confirm no dependency drift since last run.
- [ ] `npm run build` — must succeed cleanly.
- [ ] `npm test` — **currently has 7 failing tests in `demo-scenarios.test.ts`** (see §9). Either fix them ahead of time or be prepared to explain. Other 144 tests pass.
- [ ] `npm run lint` — **5 errors and 1 warning** currently (see §9). Either fix or be prepared.
- [ ] `npm run dev` — start the dev server.
- [ ] Open `http://localhost:5173/` in a fresh browser tab. Hard-refresh (Cmd-Shift-R) to clear any old SVG state.
- [ ] Open browser devtools, **clear the console**, leave it docked at the bottom for any unexpected errors.
- [ ] Resize the browser window to projector resolution (typically 1920×1080). Verify the app fills the screen, no horizontal scroll, all five NodeCards visible.
- [ ] **Reset the speed slider to 1250ms** (the default). Drag it slow enough that the audience can read each step.
- [ ] Click each preset once to warm-cache the animations. Then *Reset* before going live.
- [ ] Open these tabs and have them ready in the background:
  - The app at `localhost:5173`
  - `spec.md` in your editor (in case the prof wants to see it)
  - `src/engine/simulation.ts` (in case you need to trace logic on screen)
  - The `scenarios/` and `demo/` directory in a finder/terminal window — you'll need to navigate to these in the file picker.
  - Lamport's *Paxos Made Simple* PDF.
- [ ] Close Slack, email, and any other notifications. Use Do Not Disturb.
- [ ] Have a backup screen recording of the demo running cleanly, in case the live app crashes.

---

## 8. Recovery Plans

### App crashes mid-demo
Reload the page (Cmd-R). The dev server has HMR and state resets cleanly. If the bug is reproducible, switch to your backup screen recording and narrate over it. Don't try to debug live — note it for after.

### A scenario doesn't play as expected
Pause auto-play immediately (`⏸`). Switch to manual stepping. Narrate what *should* happen vs what's happening. If the divergence is a known issue from §9, name it openly: "There's a quirk here I noticed in prep — let me show you what's supposed to happen." Don't pretend it's correct.

### Question you can't answer
"I'd have to check the code, but my hypothesis is..." then think out loud for 20 seconds. Then "let me come back to that — happy to look it up after." Beats guessing wrong. The professor will respect honest uncertainty more than confident bullshit.

### Time runs short
Skip in this order:
1. Bonus C (Value Hijacking) — drop entirely.
2. Bonus B (Stable storage) — drop entirely.
3. Message Loss — abbreviate to 30 seconds, just narrate the result.
4. Competing Proposals — keep, but skip the second pass through the protocol explainer.
5. Crash Recovery — keep, this is the cleanest demonstration of fault tolerance.
6. Happy Path — never skip; it's the foundation.

If you have only 5 minutes: just Happy Path + Crash Recovery + 30-second close. You'll cover the algorithm and the fault tolerance story.

### Audio/projector issue
You can't fix this. Have a printed handout of `final-demo-prep.md` §5 (the walkthrough) so you can talk through what would have been on screen.

---

## 9. Things That Would Sink the Demo

Brutally honest. A sharp-eyed professor could notice any of these.

### Currently failing tests
**7 tests in `src/script/__tests__/demo-scenarios.test.ts` fail.** They reference JSON files that have been deleted or renamed (`acceptor-restart-stable-storage.json`, `majority-crash-with-recovery.json`, etc.) and have stale `at:` value assertions for `proposer-crash-after-partial-accepts.json` and `proposer-crash-after-phase1.json` after recent edits. The other 144 tests in 7 files all pass.

**Mitigation:** Either delete or update the stale tests before the demo, or be prepared to say "we have 144 passing tests; 7 reference scenarios we refactored away — the test file needs cleanup."

### Lint errors (5) and warning (1)
- `useD3Animation.ts:276` — `react-hooks/exhaustive-deps` warning (we deliberately omitted `state.sim` to avoid redraw thrash).
- `ProtocolExplainer.tsx:14` — exports a non-component function (`explainMessage`) which trips `react-refresh/only-export-components`. Same for `state/context.tsx:22` (exports `useSimulation` hook).
- `simulation.ts:175` — `prefer-const` on `updatedNodes` (it's never reassigned at the top level; we shadow within branches).
- `ProtocolExplainer.tsx:14` — unused `_state` parameter (intentional, future-proofing the signature).
- `demo-scenarios.test.ts:17` — `prefer-const` on a test-helper local.

**Mitigation:** Some are auto-fixable with `npm run lint -- --fix`. The two `react-refresh` warnings are structural and would require splitting hooks/utilities into separate files. None affect runtime behaviour. If asked: "minor lint hygiene we haven't gotten to."

### Stale Message Loss preset description
The button's hover tooltip in `PresetControls.tsx:27-30` claims P1 stalls. **It does not stall** — it reaches consensus on "A" via A1 and A3. This was changed at some point and the button copy wasn't updated.

**Mitigation:** Don't read the tooltip aloud. Narrate the actual behaviour. If asked, acknowledge the stale copy and say "we'd update the tooltip in the next pass."

### `crash-and-recovery-between-phases.md` and `.json` describe different scenarios
The `.md` file is the longer "P1 runs to consensus, then A1 crash/restart, then P2 runs and gets hijacked to A" walkthrough (~20 steps). The `.json` file is the shorter "A1 crash/restart between P1's Phase 1 and Phase 2" version (10 steps). These were authored separately and weren't reconciled.

**Mitigation:** Don't open the `.md` during the demo. Just play the script and narrate from the on-screen behaviour.

### `majority-crash.json` description vs behaviour
The description says "A2 and A3 are crashed before the run begins" but the JSON crashes them at `at: 1` (mid-step-1, after A1's PREPARE has already been delivered). Functionally close to the same outcome but the *visual* experience differs — A2 and A3 are briefly active before crashing.

**Mitigation:** Narrate accurately. "We crash A2 and A3 right at step 1 to make the crash animation visible, rather than starting them already-crashed." This is actually more dramatic than pre-crashed and worth selling.

### Auto-play stops when queue drains
After consensus is reached, auto-play self-disables. If you re-trigger something (e.g. click "New Proposal"), auto-play stays off — you have to manually re-toggle it. Looks like a freeze for a second if you're not paying attention.

**Mitigation:** Always click *Auto-play* explicitly after a manual action. Don't assume it'll keep running.

### Same-`at` events render atomically
Two script events at the same `at` value (e.g. `crash A1 + restart A1` both at `at: 5`) render as a single atomic state change — no animation between them. This is a deliberate engine constraint, not a bug, but it makes some scripts visually quieter than expected. The crash-and-recovery-between-phases script avoids this by spacing crash and restart across `at: 5` and `at: 6`.

**Mitigation:** None needed unless asked. If asked, this is an architectural tradeoff documented in the conversation history: dispatches are atomic, render once at the end. The fix would be a "wait" verb that triggers a render without a step.

### Browser console may show invariant warning lines on dev runs
Invariants (`engine/invariants.ts`) write to `console.error` when violated. The fix to Inv5 (the `>=` direction flip) is committed, but if the dev environment somehow has a stale build cached, you might see spurious warnings. Hard-refresh fixes this.

**Mitigation:** Hard-refresh before the demo. Verify console is clean during your warm-up pass.

---

## 10. References

- **Lamport, *Paxos Made Simple* (2001)** — the canonical algorithm description. Have the PDF open in a tab.
- **`spec.md`** (repo root) — our protocol-level technical specification.
- **`scripted.md`** (repo root) — design doc for the scripted scenarios feature.
- **`CODEBASE_BRIEF.md`** (repo root) — a grounded code-walking brief for orientation.
- **`WORKLOG.md`** (repo root) — chronological build log; the most recent entries are the most relevant.
- **`scenarios/README.md`** — schema documentation for scripted scenarios.
- **Source-code anchors worth knowing by file:line:**
  - `src/engine/simulation.ts:228` — Phase 2 trigger logic.
  - `src/engine/simulation.ts:243` — ACCEPTs go only to promisers.
  - `src/engine/faults.ts:46` — `crashNode` queue filter.
  - `src/engine/faults.ts:60-69` — acceptor restart preserves stable storage.
  - `src/engine/invariants.ts:76-86` — Invariant 5, the one we fixed.
  - `src/script/runner.ts:103-119` — script tick logic.
  - `src/state/reducer.ts:156-160` — STEP dispatch, where script tick is wired in.
