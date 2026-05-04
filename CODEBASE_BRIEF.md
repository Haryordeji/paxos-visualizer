# Paxos Visualizer — Codebase Brief

A grounded mental model for the repo, derived by walking the source. Use this to reason about feature work; verify against `git log` and the live code before acting on anything time-sensitive.

---

## 1. Architecture

### Tech stack and dependencies

| Package | Version | Why it's here |
|---|---|---|
| `react` / `react-dom` | 19.2 | UI shell, component tree, hooks |
| `typescript` | 5.9 | Type-checked engine + UI |
| `vite` | 8.0 | Dev server + production build (`npm run dev`/`build`) |
| `@vitejs/plugin-react` | 6.0 | React HMR for Vite |
| `d3` + `@types/d3` | 7.9 | Owns the SVG canvas interior — lane drawing and animated message arrows. Imperative DOM mutation inside React refs. |
| `framer-motion` | 12.38 | Animates React DOM elements: NodeCard backgrounds/shake/glow, AnimatePresence transitions on consensus banner and protocol explainer. |
| `vitest` | 3.2 | Engine unit tests. Configured in standalone `vitest.config.ts` (separate from `vite.config.ts` per `WORKLOG.md` Entry 4 — Vite 8 rolldown vs vitest rollup type conflict). |
| `eslint` + `typescript-eslint` + react plugins | 9.39 / 8.57 | Lint for `**/*.{ts,tsx}`, ignores `dist/`. |

`@types/node` is in devDeps but no Node-specific runtime APIs are imported by app code (only `process.env.NODE_ENV` in `invariants.ts:22`).

### Folder structure

```
src/
├── main.tsx                      # createRoot, mounts components/App.tsx
├── App.tsx                       # ORPHAN — Vite default template, unused
├── App.css                       # ORPHAN — only imported by orphan App.tsx
├── index.css                     # 613 lines, the entire UI styling
├── assets/{hero.png, react.svg, vite.svg}   # ORPHAN, only used by orphan App.tsx
├── engine/                       # PURE TS — no React/DOM imports
│   ├── types.ts
│   ├── proposalNumber.ts
│   ├── simulation.ts
│   ├── faults.ts
│   ├── invariants.ts
│   └── __tests__/{simulation, faults, proposalNumber}.test.ts
├── state/
│   ├── reducer.ts                # AppState + Action types + reducer + buildPreset
│   └── context.tsx               # SimProvider + useSimulation hook
├── hooks/
│   └── useAutoPlay.ts            # setInterval driver for auto-play
└── components/
    ├── App.tsx                   # Real root: SimProvider + Header/NodePanel/SimulationCanvas/InfoPanel/ControlBar
    ├── Header.tsx
    ├── NodePanel/{NodePanel, NodeCard}.tsx
    ├── Canvas/{SimulationCanvas, useD3Animation}.tsx + layout.ts
    ├── InfoPanel/{InfoPanel, ConsensusStatus, EventLog, ProtocolExplainer}.tsx
    └── ControlBar/{ControlBar, PresetControls}.tsx
```

**Conventions** (enforced by `CLAUDE.md` and reflected in code):
- Engine layer is pure TS. No `import React`, no `document`, no side effects.
- React layer reads engine state via `useSimulation()` and mutates only via dispatched actions.
- D3 owns SVG interior. React renders only `<div ref><svg ref/></div>` shells.
- Framer Motion owns React component animations. CSS does not own NodeCard backgrounds (`index.css:101-102` calls this out).
- `__tests__/` colocated under `engine/` only — UI is not tested.

### State management

Single source of truth via `useReducer` in `state/context.tsx:13`. The reducer is `state/reducer.ts:90-134`. Shape:

```ts
AppState = {
  sim: SimulationState,   // engine ground truth
  autoPlay: boolean,
  speedMs: number,        // 200..2000, default 250
  resetKey: number,       // increments on RESET and LOAD_PRESET
}
```

`SimulationState` (`engine/types.ts:53-63`) is the engine ground truth:

```ts
{
  nodes: Record<id, NodeState>,
  messageQueue: Message[],          // FIFO; head is next to deliver
  deliveredMessages: Message[],     // chronological log
  stepCount: number,
  consensus: { reached, value, acceptedBy }
}
```

**Action types** (`reducer.ts:12-22`): `STEP`, `START_PROPOSAL`, `DROP_MESSAGE`, `CRASH_NODE`, `RESTART_NODE`, `NEW_PROPOSAL`, `RESET`, `SET_SPEED`, `TOGGLE_AUTOPLAY`, `LOAD_PRESET`. The reducer is a thin shim: each case calls a pure engine function and returns a new `AppState`. `STEP` additionally invokes `checkInvariants(sim)` for runtime assertions.

There are no other stores. No localStorage, no URL state, no derived selectors library. UI components read fields directly off `state.sim` and recompute on every render.

### Engine ↔ UI separation

Strict. Engine functions are imported from `state/reducer.ts` and only called from there:

- `simulation.ts`: `initializeState`, `startProposal`, `step`, `stepAll` (test-only), `checkConsensus` (private)
- `faults.ts`: `dropMessage`, `crashNode`, `restartNode`, `introduceProposal`
- `invariants.ts`: `checkInvariants`
- `proposalNumber.ts`: `compareProposalNumbers`, `isGreaterThan`, `isGreaterThanOrEqual`

All take `SimulationState` and return a new `SimulationState`. Use of `crypto.randomUUID()` for message IDs (`simulation.ts:14`, `faults.ts:10`).

`buildPreset` (`reducer.ts:43-86`) composes engine functions imperatively to assemble pre-stepped scenarios — it's the only place the reducer chains multiple engine calls.

### Animation / rendering approach (mixed by design)

- **D3** owns the simulation canvas. `SimulationCanvas.tsx` has two D3 layers managed independently:
  - `.lanes-layer` — vertical timeline lanes, node ID badges, role labels, tick marks, crash overlays. Redrawn from scratch on container resize (`ResizeObserver`) or node status change (`useEffect` dep on `state.sim.nodes`).
  - `.arrows-layer` — message arrows. Managed by `useD3Animation`; never cleared by the lanes effect.
- **`useD3Animation`** watches `state.sim.deliveredMessages.length` and draws one arrow per new message. Single new message → animated transition. Multiple new messages (preset batch load) → instantaneous render. `state.resetKey` triggers a full clear via `scrollGroup.selectAll("*").remove()`.
- Auto-scroll via `updateScrollTransform` — translates the scroll group up by `STEP_H` per overflow row.
- **Framer Motion** owns:
  - NodeCard backgrounds, shake on crash, scale-pulse on restart, blue flash on state change, green glow on consensus (`NodeCard.tsx:73-118`). State-change detection uses a `fingerprint()` string + refs to avoid spurious animation triggers.
  - `AnimatePresence` for ConsensusStatus banner transitions and ProtocolExplainer slide-in.
- **CSS** is global, in a single file (`src/index.css`, 613 lines). Uses CSS variables for the color palette; same hex values are duplicated inline in D3 (`useD3Animation.ts:12-19`, `layout.ts:16-22`). Layout via CSS Grid: `44px header / 1fr main (240px | 1fr | 270px) / 110px footer`.

---

## 2. Paxos simulation

### Variant: classic single-decree Paxos

One decision. No log, no slot index, no Multi-Paxos optimisation. Once `consensus.reached` is set, a guard at `simulation.ts:104` prevents downgrade — but the protocol can keep running (more proposals, more rounds). Test `value selection rule (P2b)` (`simulation.test.ts:230-254`) confirms a second proposer correctly inherits a previously decided value.

### Topology

Hardcoded in `initializeState` (`simulation.ts:22-53`):
- **P1** (proposer, default value `"A"`)
- **P2** (proposer, default value `"B"`)
- **A1, A2, A3** (acceptors)
- Majority is 2-of-3, hardcoded as the literal `>= 2` at `simulation.ts:228`, `simulation.ts:322`, `simulation.ts:120`.

`NODE_IDS` constant in `Canvas/layout.ts:4` is the shared source of truth for ordering on the canvas. `NODE_ORDER` in `NodePanel/NodePanel.tsx:3` duplicates the same list — not centralised.

### Proposal numbers and rounds

`ProposalNumber = { round: number, nodeId: string }` (`engine/types.ts:2-5`), compared lexicographically — round first, then nodeId as a string (`proposalNumber.ts:7-15`). At equal round, `"P2" > "P1"`.

Two ways a round number is generated:
- `startProposal(state, proposerId)` → `proposer.round + 1` (`simulation.ts:65`). Local counter only.
- `introduceProposal(state, proposerId, value)` → `maxRoundInSystem(state) + 1` (`faults.ts:120`). Scans every node's stored round, every node's `currentProposal`/`highestPromised`/`acceptedProposal`, and every queued message including `nack.highestPromised`. Designed to *guarantee* the new proposal beats everything visible.

NACK handler (`simulation.ts:264-272`) opportunistically bumps the receiving proposer's `round` above the NACK's `highestPromised.round` — but doesn't auto-retry. This is described in code as a "performance optimization."

### Messages and types

Five message types (`engine/types.ts:45-50`), all share `id`, `type`, `from`, `to`, `proposalNumber`, `status`:

| Type | Carries | Sent by | Status flow |
|---|---|---|---|
| `prepare` | — | proposer (Phase 1) | queued → delivered/dropped |
| `promise` | `accepted: AcceptedProposal \| null` | acceptor reply | queued → delivered/dropped |
| `accept` | `value: string` | proposer (Phase 2) | queued → delivered/dropped |
| `accepted` | `value: string` | acceptor reply | queued → delivered/dropped |
| `nack` | `highestPromised: ProposalNumber` | acceptor reject | queued → delivered/dropped |

All messages flow through `state.messageQueue` (single FIFO). No reordering primitive, no per-link channel, no delay primitive.

### Time / step model

Discrete, single-channel, one message per step. `step(state)` (`simulation.ts:131-336`):
1. If queue empty → return same state reference (this is what `step with empty queue` test asserts at `simulation.test.ts:312-316`).
2. Dequeue head, increment `stepCount`.
3. If message pre-marked `dropped` → log to delivered, return.
4. If sender or recipient is crashed → log as dropped, return. (Sender-crash check was added per `WORKLOG.md` Entry 11, April 21.)
5. Otherwise switch on `type`, apply the protocol rule, append response messages to the end of the queue, mark current message `delivered`, run `checkConsensus`.

Stale-check guards in `promise` and `accepted` handlers (`simulation.ts:213-220`, `308-317`): if the proposer has moved on (different phase or different proposal number), the message is silently ignored — no state change, no UI marker. The arrow still draws.

`stepAll(s)` (`simulation.ts:342-348`) drains the queue. Used only in tests.

### Failures and partitions

- **Crash**: `crashNode(state, nodeId)` (`faults.ts:35-47`) sets `status: "crashed"`. Stable storage (`highestPromised`, `acceptedProposal` for acceptors) is preserved verbatim. Tests at `faults.test.ts:69-87` lock this in.
- **Restart**: `restartNode` (`faults.ts:54-85`). Acceptors → `active`, all stable storage intact. Proposers → `idle` with `currentProposal`/`promisesReceived`/`acceptsReceived` cleared, `round` preserved.
- **Message drop**: `dropMessage(state, messageId)` (`faults.ts:18-28`) flips status to `"dropped"`. The message stays in the queue and is logged when `step` reaches it.
- **No partition primitive.** Partition can only be simulated by combinations of crashes and drops.
- **No delay primitive.** No way to reorder or postpone a message in the queue.
- **No malicious / Byzantine model.** All messages are well-formed and authentic; only delivery is faulty.

### Ground truth vs derived display

| Lives in `SimulationState` | Derived per render |
|---|---|
| `nodes[*].status, .role, .highestPromised, .acceptedProposal, .currentProposal, .promisesReceived, .acceptsReceived, .round, .proposedValue` | `inConsensus = consensus.acceptedBy.includes(nodeId)` (NodeCard) |
| `messageQueue, deliveredMessages` (with status) | All arrow visuals (color, label, position, scroll offset) — D3-derived |
| `stepCount` | Step badge text |
| `consensus.reached, consensus.value, consensus.acceptedBy` | "Consensus impossible" banner = `!reached && crashedAcceptors >= 2` (`ConsensusStatus.tsx:12-16`) |
| — | `canStep = messageQueue.length > 0` (ControlBar / useAutoPlay) |
| — | Last-step explainer text (`ProtocolExplainer.tsx:39-47`) |

---

## 3. UI surface

### Layout

CSS Grid in `index.css:40-46`: `grid-template-rows: 44px 1fr 110px`. The middle row is `.app-main` with `grid-template-columns: 240px 1fr 270px`. Single-page; no router.

### Views (single screen, no routes)

1. **Header** (`Header.tsx`) — Title + step counter badge.
2. **NodePanel** (`NodePanel/`) — Left column. Five `NodeCard`s in fixed order P1, P2, A1, A2, A3.
3. **SimulationCanvas** (`Canvas/`) — Center column. D3-rendered SVG with five vertical lanes and animated message arrows below the header band.
4. **InfoPanel** (`InfoPanel/`) — Right column, three stacked sections:
   - `ConsensusStatus` — three states (`none`, `reached`, `impossible`) with Framer transitions
   - `EventLog` — reverse-chronological delivered messages + queued list (with click-to-drop)
   - `ProtocolExplainer` — single sentence describing the last delivered message
5. **ControlBar** (`ControlBar/`) — Footer, two rows:
   - Row 1: Step / Auto-play / Speed slider / Reset / hint label
   - Row 2: `PresetControls` — four preset buttons (Happy Path, Competing Proposals, Crash Recovery, Message Loss)

### Interactive vs read-only

**Interactive:**
- Step button (`ControlBar.tsx:21`) — disabled when queue empty
- Auto-play / Pause toggle (`ControlBar.tsx:29`) — disabled when queue empty *and* not currently playing
- Speed slider (`ControlBar.tsx:39-48`) — 200..2000ms, step 100, axis is *inverted* (left = slow)
- Reset button (`ControlBar.tsx:54`)
- Preset buttons (`PresetControls.tsx`)
- Click anywhere on a NodeCard outside its action buttons → toggles crash/restart (`NodeCard.tsx:120-128`). Note: the click handler only excludes `<button>` ancestors, so clicking the status badge or chevron also crashes.
- Start Proposal button on proposer cards (enabled only when `idle` or `done`)
- New Proposal button on proposer cards (disabled only when crashed) — uses `introduceProposal`
- Click queued message in EventLog → drops it (`EventLog.tsx:43-69`)

**Read-only:**
- Step counter, all NodeCard fields, consensus banner, protocol explainer text, all D3 lanes and arrows, delivered message log entries.

No keyboard shortcuts. No drag-and-drop. No timeline scrubbing.

---

## 4. Current state of the project

### Finished and polished

- **Engine** (`src/engine/`) — all five message types implemented; stable storage; majority logic; P2b value selection rule; NACK round bump; consensus latching; sender + recipient crash guards. WORKLOG Entry 12 (April 21) indicates the most recent fix: ACCEPT messages now go to all acceptors, not just promisers.
- **Test suite** — 65 tests across 3 files (per WORKLOG entries 8–12, run with `npm test`):
  - `proposalNumber.test.ts` — comparison/ordering coverage
  - `simulation.test.ts` — initial state, startProposal, happy path, phase 1/2 majority, P2b value selection (including manual-state edge cases), empty-queue no-op, immutability
  - `faults.test.ts` — dropMessage, crashNode, restartNode, crash recovery scenario, partial drops, competing proposals, value-selection-via-introduceProposal
- **D3 canvas** — lanes + animated arrows + auto-scroll + per-message styling + dropped/NACK visual treatments + responsive resize.
- **Framer Motion polish** — crash shake, restart pulse, consensus glow, state-change flash, banner/explainer slide transitions.
- **All four preset scenarios wired and working** (Happy Path, Competing Proposals, Crash Recovery, Message Loss).
- **Click-to-crash, click-to-drop, auto-play with auto-stop, speed slider, reset.**
- **Runtime invariants** in dev mode (`invariants.ts`) — logs to `console.error` in browser, throws in tests.

### Half-built or stubbed

- **`isCrashedDest` branches in `useD3Animation.ts`** (lines 169–176 instant, 198–208 animated) — unreachable. The caller only sets `isCrashedDest=true` when `msg.status === "dropped"` (`useD3Animation.ts:281-283`), but `drawArrow` checks `isDropped` first and returns. Looks like an in-progress refactor or leftover from a prior model where the engine didn't pre-mark crash-bound messages as dropped.

### TODOs, FIXMEs, commented-out code worth knowing

- No `TODO`, `FIXME`, or `XXX` markers in the source (verified by reading every file).
- Dead-code worth flagging:
  - `src/App.tsx` (Vite default template, 121 lines) and `src/App.css` (184 lines) and `src/assets/{hero.png, react.svg, vite.svg}` — only referenced from each other, not from the live tree.
- Comments worth knowing about (these encode design intent, not bugs):
  - `reducer.ts:28` — *"Incremented on every RESET and LOAD_PRESET so D3 knows to clear the SVG."* — explains the `resetKey` mechanism.
  - `simulation.ts:103-104` — *"Don't downgrade a consensus that's already been reached"* — consensus is one-way latched.
  - `simulation.ts:265-272` — *"Performance optimization: bump our round above the nack's highestPromised"* — this is not a protocol-required action, it's a UX optimisation for the next manual New Proposal click.
  - `faults.ts:31-33` — stable storage is preserved on crash *exactly as specified by the protocol*.
  - `SimulationCanvas.tsx:14-21` — explicit architecture note about D3 layer ownership.
  - `useD3Animation.ts:108-110` — *"Pass 0 for instant rendering (used when preset pre-steps are batch-drawn on load)"* — preset loads bypass animation.
  - `index.css:101-102` — *"background is owned by Framer Motion (NodeCard.tsx useAnimation). CSS only drives border colour and layout."*

### Tests

- 65 unit tests (per WORKLOG; not re-counted by me) in `src/engine/__tests__/`.
- All target the pure engine. **No component tests**, no integration tests, no E2E.
- Vitest config: `environment: "node"`, `include: ["src/**/__tests__/**/*.test.ts"]` (`vitest.config.ts`).
- Test commands: `npm test` (run once), `npm run test:watch`. CLAUDE.md mentions `npx vitest run` as a habit.

---

## 5. Constraints and design decisions worth respecting

These are choices encoded in code that any new feature must respect or deliberately revisit. Rough order of how load-bearing each is.

1. **Engine purity (CLAUDE.md Architecture Rule)**. `src/engine/` is pure TypeScript: state in, new state out, no React imports, no DOM access, no mutations. New simulation logic belongs here, exposed as a pure function called from a new reducer case.

2. **Single source of truth via one reducer**. All state mutation goes through `reducer.ts`. New features add an `Action` variant + a case + (optionally) an engine function. Bypassing this — e.g. local `useState` for sim-relevant state — would split the truth.

3. **D3 owns the SVG; React renders only the shell**. The `<svg>` element has no JSX children. New canvas-level features add a D3 layer (or extend existing ones) inside `SimulationCanvas` or a new hook modeled on `useD3Animation`. Two layers exist: `.lanes-layer` and `.arrows-layer`. The `resetKey` mechanism is the only sanctioned way to force a full clear from React.

4. **Framer Motion owns React component animations**. Don't reach for D3 to animate React DOM. NodeCard backgrounds are owned by Framer's `useAnimation` controller; CSS *deliberately* doesn't set background on `.node-card` (`index.css:101-102`). Adding inline `style` or CSS background would conflict.

5. **One message per step is the temporal unit**. UI, tests, animation, and the auto-play loop all assume `step()` advances by exactly one message. Features that imply "advance N steps" must compose `step()` and decide whether to render each intermediate state (animated, single dispatch per step) or batch (presets pre-run multiple steps then render one batch — see `buildPreset`).

6. **Hardcoded 5-node topology**. The literal `["P1","P2","A1","A2","A3"]` appears in `simulation.ts:25-47`, `Canvas/layout.ts:4`, `NodePanel/NodePanel.tsx:3`, and `ConsensusStatus.tsx:5`. Changing node count or roles requires changes in all four places (and majority math at three call sites in `simulation.ts`). There is no abstraction for "nodes" beyond `NODE_IDS`.

7. **Strict FIFO single-channel queue**. `messageQueue` is one global queue; new messages append at the end (`simulation.ts:331`); no per-link or per-recipient channel; no priority. Feature ideas like "selective delay" or "reorder this message" must extend the queue model or simulate via dropMessage + new enqueue.

8. **Proposal numbers compare strings for tiebreaking**. `compareProposalNumbers` (`proposalNumber.ts:7-15`) uses string `<` on `nodeId`. With `"P1" .. "P9"` it works, but `"P10" < "P2"` lexicographically. Adding more than 9 proposers needs zero-padding or a different scheme.

9. **Consensus is one-way latched**. `simulation.ts:104` `if (state.consensus.reached) return state;`. Tests don't directly enforce this, but several features could break in subtle ways if it's relaxed (e.g., the "Consensus impossible" banner becomes unreachable once reached).

10. **`stepCount` counts every dequeue, including dropped messages** (`simulation.ts:138`). New features that surface "step number" should preserve this or be explicit that they're using delivered-only count.

11. **`resetKey` is the SVG-clear protocol**. Any new "wipe everything" action must increment `resetKey` (`reducer.ts:122, 132`) — that's the trigger D3 listens to (`useD3Animation.ts:262-269`). Without a bump, old arrows persist.

12. **Invariants only run on `STEP`** (`reducer.ts:94`). Other actions (CRASH_NODE, DROP_MESSAGE, NEW_PROPOSAL) don't trigger checks. New actions that mutate `sim` should consider whether to call `checkInvariants` too — and bear in mind that the assertions are dev-only (`invariants.ts:29` short-circuits on `!import.meta.env.DEV`).

13. **No history / undo / time travel**. AppState has no past states. Step-back, scrubbing, or replay would require either snapshotting in the reducer (cheap: state objects are immutable) or rebuilding from `deliveredMessages`. There's no infrastructure for either today.

14. **Auto-play interval ≈ animation duration at fastest speed**. `setInterval(speedMs)` vs `animDuration = max(150, speedMs*0.55)`. At 200ms speed, 150ms animation — 50ms slack. Features that lengthen animations or add per-step UI work need to test at fastest speed.

15. **CSS is global with shared color tokens**. `index.css` uses CSS custom properties (`--blue`, `--green`, `--orange`, `--teal`, `--red`, `--gray`, `--yellow`, `--purple`) that are duplicated as raw hex in D3 (`useD3Animation.ts:12-19`, `Canvas/layout.ts:16-22`, `NodeCard.tsx:13-24`). Changing a color in one place will visually drift unless updated everywhere. There's no theme system.

16. **Preset state is built imperatively in the reducer**. `buildPreset` (`reducer.ts:43-86`) runs multiple engine calls synchronously. Pre-stepped messages don't animate (the `newCount > 1` branch in `useD3Animation.ts:284` short-circuits to instant render). New presets follow the same pattern.

17. **`crypto.randomUUID()` is used for message IDs** (`simulation.ts:14`, `faults.ts:10`). Browser-only — fine for current targets, but tests run in Node (`vitest.config.ts:5`) which has had `crypto.randomUUID()` since Node 19. Worth flagging if support expands.

18. **Test discovery is path-strict**. `vitest.config.ts:6` only picks up `src/**/__tests__/**/*.test.ts`. UI test files placed elsewhere or with `.tsx` extension would be silently skipped.

---

## What's unclear from the code

- **WORKLOG dates have no year.** They say "April 7", "April 8", "April 21" — I assume 2026 from CLAUDE.md's `currentDate` line, but the WORKLOG itself doesn't say.
- **The unreachable `isCrashedDest` branches in `useD3Animation.ts`** — was this meant to differentiate "dropped because target crashed" from "dropped manually"? The engine collapses both into `status: "dropped"`, so the distinction is lost before it reaches D3.
- **No documented intent for post-consensus interaction.** A user can crash acceptors after consensus and even start new proposals; the engine handles this protocol-correctly (consensus stays latched, P2b ensures the same value is re-decided). Whether this is a feature or an oversight isn't stated anywhere in code.

---

Ready to discuss new features. What are you thinking?
