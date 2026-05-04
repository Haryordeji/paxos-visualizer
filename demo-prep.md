# Paxos Visualizer — Feature Inventory

Mounting tree: `src/main.tsx` → `src/components/App.tsx` → `SimProvider` → `Header`, `NodePanel`, `SimulationCanvas`, `InfoPanel`, `ControlBar`. Single global state via `useReducer` in `src/state/context.tsx:13`.

---

## A. Simulation controls (footer)

- [ ] **Step button** — Drains exactly one message from `state.sim.messageQueue` and runs the protocol rule for that message.
  - Files: `src/components/ControlBar/ControlBar.tsx:21-27`, reducer `src/state/reducer.ts:92-96`, engine `src/engine/simulation.ts:131-336`.
  - Trigger: click `▶ Step`. Disabled when queue is empty.
  - Working: step counter in header increments, one new arrow animates onto the canvas, event log gets a new "delivered" entry, queued list shrinks by 1, NodeCard whose state changed flashes blue.
  - Edge cases: spam-click while animation is mid-flight (state advances faster than D3 transitions); click immediately after the very last message (button must disable); click after consensus reached (post-consensus messages still process — see ProtocolExplainer rough edge).

- [ ] **Auto-play / Pause toggle** — Dispatches `STEP` on `setInterval(speedMs)` while `autoPlay && queue.length > 0`. Auto-stops when queue drains.
  - Files: `ControlBar.tsx:29-35`, hook `src/hooks/useAutoPlay.ts:8-25`.
  - Trigger: click `▶▶ Auto-play`. Toggles to `⏸ Pause`.
  - Working: arrows draw at the chosen speed; button reverts to "Auto-play" automatically when the queue empties (second effect in `useAutoPlay.ts:20-24`).
  - Edge cases: toggle during animation (interval continues but UI rerenders mid-transition); change speed while running (interval should restart with new value — `speedMs` is in deps); click rapidly to thrash autoPlay flag.

- [ ] **Speed slider** — Sets `state.speedMs` (200–2000ms, step 100). Inverted axis (left=slow, right=fast).
  - Files: `ControlBar.tsx:37-50`, reducer `reducer.ts:125-126`. Animation duration = `max(150, speedMs*0.55)` in `useD3Animation.ts:260`.
  - Trigger: drag slider. Live value shown in `{speedMs}ms` label.
  - Edge cases: default `speedMs=250` (reducer.ts:36) is not on a 100-step boundary — first interaction snaps; at 200ms speed, anim duration is 150ms (tight); change while autoplay running.

- [ ] **Reset button** — Recreates initial sim, preserves `speedMs`, increments `resetKey` so D3 clears the SVG arrows layer.
  - Files: `ControlBar.tsx:54-59`, reducer `reducer.ts:118-123`, D3 reset detection `useD3Animation.ts:262-269`.
  - Working: header step counter returns to 0, all NodeCards return to idle/active, canvas arrows wipe, event log clears, "No consensus yet" banner reappears.
  - Edge cases: reset mid auto-play (autoPlay flag clears via `initialAppState`); reset while a node is crashed (status restores to active/idle); reset right as an arrow is animating.

- [ ] **Step counter badge** — Shows `state.sim.stepCount` in header.
  - Files: `src/components/Header.tsx:7-9`. Increments on each delivered message including dropped ones (`simulation.ts:138`).

---

## B. Preset scenarios

- [ ] **Happy Path** — Initializes, runs `startProposal(P1)`, sets `autoPlay=true`. User watches the full happy run.
  - Files: `src/components/ControlBar/PresetControls.tsx:6-10`, factory `reducer.ts:45-49`.
  - Working: 3 PREPAREs → 3 PROMISEs → 3 ACCEPTs → 3 ACCEPTEDs animate; consensus banner flips to `"A"` accepted by A1, A2, A3; ProtocolExplainer ends with the consensus message.

- [ ] **Competing Proposals** — P1 starts, 3 PREPAREs are pre-stepped (PROMISEs queued), then P2 issues a new proposal with a higher round via `introduceProposal`. Auto-plays.
  - Files: `PresetControls.tsx:11-17`, factory `reducer.ts:51-62`, `src/engine/faults.ts:115-153`.
  - Working: instant batch-render of P1's PREPAREs at top, then animated P2 PREPAREs; expect NACKs back to P1 once acceptors have promised P2; livelock-style behavior. Acceptors should ultimately commit to P2's value `"B"`.
  - Edge cases: rapid Step clicking during the batch render; check that NACKs to P1 bump P1's `round` (`simulation.ts:264-272`) but P1 doesn't auto-retry — it just sits.

- [ ] **Crash Recovery** — P1 reaches phase2 with majority from A1+A2, then A3 is crashed. Auto-plays.
  - Files: `PresetControls.tsx:18-23`, factory `reducer.ts:64-73`.
  - Working: A3 lane shows red overlay and "crashed" label; ACCEPT to A3 should be drawn as dropped (`simulation.ts:163-172`); consensus still reached on `"A"` with A1+A2.
  - Edge cases: try crashing A1 or A2 before the run completes (now <2 active acceptors → "Consensus impossible" banner).

- [ ] **Message Loss** preset — **NOT exposed in UI.** Button commented out at `PresetControls.tsx:24-30`, but factory case still lives at `reducer.ts:75-84` and `PresetName` union still includes it (`reducer.ts:10`). See rough edges.

---

## C. Node panel — per-node controls

- [ ] **Crash / Restart by clicking the node card** — Click anywhere on a card outside its action buttons toggles crash/restart.
  - Files: `src/components/NodePanel/NodeCard.tsx:120-128`, faults `faults.ts:35-85`.
  - Working: crashed → red shake animation (`NodeCard.tsx:89-94`) + lane turns red on canvas (`SimulationCanvas.tsx:60-72`); restart → green pop animation; acceptor stable storage (`highestPromised`, `acceptedProposal`) survives.
  - Edge cases: click during a message animation (lanes redraw mid-flight); crash a proposer in `phase1`/`phase2` then restart (proposer state clears `currentProposal`/`promisesReceived`, but `round` is preserved — `faults.ts:71-83`); crash all 3 acceptors → consensus banner switches to "impossible"; click on the status badge or chevron, which are inside the card and not buttons → also fires crash.

- [ ] **Start Proposal button** — On a proposer card; enabled only when status is `idle` or `done`. Bumps `round` and enqueues 3 PREPAREs.
  - Files: `NodeCard.tsx:214-234`, `simulation.ts:60-96`.
  - Working: button text reads "Proposing…" while in `phase1`/`phase2` (still disabled).
  - Edge cases: click on P1 after consensus reached (status goes `done` → re-enabled, kicks off a new round on top of decided state — protocol-correct but visually confusing); start P1 and P2 back-to-back manually.

- [ ] **New Proposal button** — On a proposer card; enabled unless crashed. Calls `introduceProposal` which sets `round = maxRoundInSystem + 1`.
  - Files: `NodeCard.tsx:236-256`, `faults.ts:92-153`.
  - Working: bumps round above any round seen anywhere (nodes + queue), reuses the proposer's existing `proposedValue`.
  - Edge cases: click while same proposer is mid-`phase1` (resets `promisesReceived` and `acceptsReceived`); rapid double-click (round increments by 2 across two dispatches).

- [ ] **Live node fields** — Proposers display `value`, `proposal`, `promises x/3`, `accepts x/3`. Acceptors display `promised` and `accepted`. Card flashes blue on any change (`NodeCard.tsx:107-113`), green pulse + glow shadow on entering consensus (`NodeCard.tsx:101-106`).

---

## D. Canvas / message animation

- [ ] **Vertical lane timeline** — D3 draws 5 dashed lanes (P1, P2, A1, A2, A3) with circular ID badges, role labels, and tick marks. Redrawn on resize (ResizeObserver) or node-status change.
  - Files: `src/components/Canvas/SimulationCanvas.tsx:29-136`, layout consts `src/components/Canvas/layout.ts`.
  - Edge cases: window resize while messages are on screen (lanes layer redraws but arrows layer untouched — `SimulationCanvas.tsx:55-56`); crash overlay column animates in.

- [ ] **Animated message arrows** — One animated arrow per delivered message; preset pre-steps render instantly (no anim) when `newCount > 1`.
  - Files: `src/components/Canvas/useD3Animation.ts` (whole file). Color/style per message type at lines 78-89.
  - Working: prepare=blue, promise=green, accept=orange, accepted=teal (thicker), nack=red dashed, dropped=grey dashed at half-length with red ✗ glyph.
  - Edge cases: many messages overflow vertically — `updateScrollTransform` (lines 221-233) translates the scroll group up so newest is at the bottom; messages to a crashed acceptor (engine pre-marks them dropped, see rough edges); mid-animation crash/reset.

- [ ] **Arrow labels** — Show proposal number tuple `(round,proposerId)` and value where applicable: `P(r,id)`, `PR(r,id) "v"`, `A(r,id) "v"`, `OK(r,id) "v"`, `✗(r,id)`. Defined at `useD3Animation.ts:91-101`.

---

## E. Event log / inspection

- [ ] **Delivered messages list** — Reverse-chronological list with `✓` (delivered) or `✗` (dropped). Shows from→to and the typed label.
  - Files: `src/components/InfoPanel/EventLog.tsx:72-107`.

- [ ] **Click-to-drop on queued messages** — Clicking a queued (not yet dropped) row dispatches `DROP_MESSAGE`. Engine flips its status to `"dropped"` so when `step` reaches it, it's logged as dropped without protocol effect.
  - Files: `EventLog.tsx:43-69`, engine `simulation.ts:142-147`, fault `faults.ts:18-28`.
  - Edge cases: drop the very next message about to be delivered then click Step (should render as a dropped grey arrow); drop one of three PROMISEs to leave proposer at exactly 2 — should still hit majority; drop two PROMISEs to stall in phase1.

- [ ] **Consensus status banner** — Three states animated with AnimatePresence: `none`, `reached` (green pulsing dot, value, acceptor list), `impossible` (≥2 acceptors crashed and not yet reached).
  - Files: `src/components/InfoPanel/ConsensusStatus.tsx`. Impossibility check at lines 12-16.
  - Edge cases: crash a 2nd acceptor right at the moment consensus is reached (engine guards `if (state.consensus.reached) return state` at `simulation.ts:104`, so once latched it stays); restart a crashed acceptor to see "impossible" → "none" transition.

- [ ] **Protocol explainer (Last step)** — Plain-English description of the last delivered message, swapped with a horizontal slide animation.
  - Files: `src/components/InfoPanel/ProtocolExplainer.tsx`.
  - Edge cases: see rough edges — locks to consensus message permanently after consensus.

---

## F. Engine correctness checks (dev only)

- [ ] **Runtime invariants** — After every `STEP`, asserts P2b value selection, promise honoring, and consensus consistency. Logs to `console.error` in dev; throws in tests.
  - Files: `src/engine/invariants.ts`, called from reducer `reducer.ts:94`.
  - Walkthrough hook: open devtools, run "Competing Proposals" — no `[Paxos invariant violation]` should appear.

---

## Suspected rough edges

- [ ] **`message-loss` preset is half-wired.** Type in `PresetName` (reducer.ts:10), full factory case (reducer.ts:75-84), but the button is commented out (`PresetControls.tsx:24-30`). If a stale dispatch ever sends `{type:"LOAD_PRESET", preset:"message-loss"}` it will work; meanwhile this is unreachable from UI and easy to forget.

- [ ] **Dead branch in arrow renderer.** `useD3Animation.ts:281-283` only sets `isCrashedDest` when `msg.status === "dropped"`. But in `drawArrow`, `isDropped` is checked first (lines 161, 181) and returns. The `isCrashedDest` branches at lines 169-176 (instant) and 198-208 (animated) are unreachable. Looks like it was intended to differentiate "dropped because target crashed" from "dropped manually" but the engine collapses both into `status: "dropped"`.

- [ ] **ProtocolExplainer freezes after consensus** (`ProtocolExplainer.tsx:43-47`). Once `consensus.reached`, every subsequent delivered message (late ACCEPTEDs, NACKs to a competing proposer, manually dropped messages) is hidden behind the consensus message. During the "Competing Proposals" preset, post-consensus NACKs to P1 won't be explained.

- [ ] **Card-level click captures non-button regions.** `NodeCard.tsx:120-128` only excludes clicks whose closest ancestor is a `<button>`. The status badge, role label, fields, and chevron all crash the node when clicked. If a viewer wants to copy a proposal-number field value or just inspect, they crash the node instead.

- [ ] **`Start Proposal` re-enabled after `done`** (`NodeCard.tsx:223`). After consensus, the same proposer can be "re-started" — protocol-correct (it'll send PREPAREs at a higher round, get fresh PROMISEs, and likely re-decide on the same value), but there's zero visual indication this is a "redundant" action and the explainer/banner won't refresh.

- [ ] **Default speed off-grid.** `speedMs` defaults to 250 (reducer.ts:36) but the slider min is 200 with step 100 (`ControlBar.tsx:39-45`). First slider interaction snaps. Cosmetic but jarring.

- [ ] **Tight margin at fastest auto-play.** At `speedMs=200`, animation duration = `max(150, 110) = 150ms` (`useD3Animation.ts:260`) and the autoplay interval is 200ms. Arrow finishes ~50ms before the next one starts; under load or with React StrictMode double-effect, transitions can overlap.

- [ ] **`STEP` advances even after consensus.** Engine doesn't short-circuit when `consensus.reached` — remaining messages keep draining. Demo-wise this is fine (you see late ACCEPTEDs land), but with a chained `New Proposal` after consensus you can interleave a second decision attempt that's protocol-correct but visually noisy.

- [ ] **`NEW_PROPOSAL` for non-proposer fallback.** `reducer.ts:110-116` falls back to `value="?"` if dispatched against an acceptor. Unreachable from UI (button only renders for proposers, `NodeCard.tsx:164`) but the type-safety hole exists.

- [ ] **No guard for `START_PROPOSAL` on crashed proposer in reducer** (`reducer.ts:98-99`). The button is disabled (`canStart` excludes crashed), but the action itself would still process. Not currently reachable.

- [ ] **No animation cancellation on Reset/Preset.** D3 transitions in flight when `resetKey` changes get their target groups removed (`useD3Animation.ts:264`), which interrupts cleanly, but if a `setInterval` STEP fires between the `RESET` dispatch and the next render, you can get a brief visual hiccup.

---

## Dead or orphaned code

- [ ] **`src/App.tsx`** — Vite default template (counter, hero, Vite/React/Discord links). `main.tsx` imports `App` from `./components/App.tsx`, never from this file. Entirely orphaned.

- [ ] **`src/assets/{hero.png, react.svg, vite.svg}`** — Only imported by the orphan `src/App.tsx`. Removable with it.

- [ ] **`isCrashedDest` branches in `useD3Animation.ts`** — Unreachable, see rough edges.

- [ ] **`message-loss` case in `buildPreset`** — Reachable in code but not via UI, see rough edges.

- [ ] **`stepAll` export** — Used only in tests, never in app code. Reasonable to keep but worth knowing it has no UI surface.
