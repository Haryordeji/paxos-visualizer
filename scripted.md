# Scripted Scenarios — Implementation Plan

Status: pre-implementation. Review and approve before I write code.

The contract (JSON shape, verbs, time semantics, validation rules, UI scope) is taken as fixed per the user. This document only addresses *how* to implement against it.

---

## 1. Data model

### Script representation in AppState

Add three fields to `AppState` (`src/state/reducer.ts:24-30`):

```ts
script: LoadedScript | null;
scriptError: string[] | null;   // transient, set on failed load, cleared on next attempt
scriptLog: ScriptLogEntry[];    // timeline of fired/no-op script events
```

Where:

```ts
interface LoadedScript {
  name: string;
  description?: string;
  events: ScriptEvent[];          // sorted by `at` at validation time, ties preserve file order
  nextEventIndex: number;         // events[i] where i < nextEventIndex have already fired or no-op'd
}

type ScriptEvent =
  | { at: number; do: "propose"; node: "P1" | "P2" }
  | { at: number; do: "crash"; node: NodeId }
  | { at: number; do: "restart"; node: NodeId }
  | { at: number; do: "drop"; to?: NodeId; from?: NodeId; type?: MessageType };

interface ScriptLogEntry {
  firedAtStep: number;
  precedingDeliveredCount: number; // deliveredMessages.length at fire time — used for interleaved render
  event: ScriptEvent;
  outcome: "applied" | { warning: string }; // warning if engine refused
}
```

Why on `AppState` and not in a separate slice or a hook ref:
- The `EventLog` UI needs to read `scriptLog` to render interleaved entries.
- The `Header` / banner reads `script.name`.
- Putting it in `AppState` means a single source of truth, and the reducer can apply script events transactionally with engine effects.
- A separate context would force two providers and split concerns; not worth it for ~3 fields.

Why `nextEventIndex` (cursor) rather than a `firedSet`:
- Events are sorted by `at` at validation; cursor advances monotonically. A high-water-mark integer is sufficient and renders ordering bugs structurally impossible.

### New reducer actions

```ts
| { type: "LOAD_SCRIPT"; script: LoadedScript }
| { type: "LOAD_SCRIPT_ERROR"; errors: string[] }
| { type: "RUN_SCRIPT_TICK" }            // fires all events with at <= sim.stepCount
```

`LOAD_PRESET` is modified to clear `script`, `scriptError`, `scriptLog`.

`RESET` is modified to **preserve** `script` (if loaded), reset `nextEventIndex=0`, re-apply `initial_state.crashed`, clear `scriptLog`. Rationale: if you've loaded a script, RESET reads as "rewind and replay the script". If you actually want to discard the script, load a preset (which clears it) or refresh.

`LOAD_SCRIPT` itself does an implicit reset: builds a fresh `initializeState()`, applies `initial_state.crashed`, stores the script with `nextEventIndex=0`, clears `scriptLog` and `scriptError`, bumps `resetKey` so D3 wipes the canvas.

### Script "propose" maps to `introduceProposal`, not `startProposal`

The engine has two proposer-start functions (`simulation.ts:60` and `faults.ts:116`). They differ in round-number selection. For scripts, predictability matters: every `propose` event should produce a round number strictly greater than anything else in the system, so a script `[propose P1 at 0, propose P2 at 5]` predictably gives P2 the higher round. That's `introduceProposal`. The existing `NEW_PROPOSAL` action (`reducer.ts:123-129`) already wraps it.

This is a real design choice worth confirming. Alternative: use `startProposal` (each proposer bumps its own counter, which can collide on round across proposers and resolve by nodeId tiebreak). I recommend `introduceProposal`.

---

## 2. Runner design

### Architecture

A new pure function `applyScriptEvent(state: AppState, event: ScriptEvent): AppState` lives in `src/script/runner.ts`. It calls the existing engine functions (`startProposal`/`introduceProposal`, `crashNode`, `restartNode`, `dropMessage`) and appends to `scriptLog`. It does not advance `nextEventIndex` — the reducer does.

The reducer's `RUN_SCRIPT_TICK` handler is the orchestration point:

```ts
case "RUN_SCRIPT_TICK": {
  if (!state.script) return state;
  let s = state;
  while (
    s.script!.nextEventIndex < s.script!.events.length &&
    s.script!.events[s.script!.nextEventIndex].at <= s.sim.stepCount
  ) {
    const event = s.script!.events[s.script!.nextEventIndex];
    s = applyScriptEvent(s, event);
    s = { ...s, script: { ...s.script!, nextEventIndex: s.script!.nextEventIndex + 1 } };
  }
  return s;
}
```

Compound transitions in one reducer call are fine — the existing `LOAD_PRESET` reducer also chains multiple engine functions (`reducer.ts:96-99`).

### The hook

`src/hooks/useScriptRunner.ts` mirrors the shape of `useAutoPlay.ts`:

```ts
export function useScriptRunner(): void {
  const { state, dispatch } = useSimulation();
  const stepCount = state.sim.stepCount;
  const hasScript = state.script !== null;

  useEffect(() => {
    if (!hasScript) return;
    dispatch({ type: "RUN_SCRIPT_TICK" });
  }, [stepCount, hasScript, dispatch]);
}
```

Called once from `ControlBar.tsx` next to `useAutoPlay()`.

### Why this works

- `useEffect` runs after every commit where `stepCount` changes. The reducer has already produced the new `stepCount` when the effect fires.
- `LOAD_SCRIPT` itself triggers the effect (because `hasScript` flips false→true), so events with `at: 0` fire immediately on load — before the user clicks play. This is the right behavior: at=0 events are "setup" events that happen before step 1.
- StrictMode double-invocation in dev: the effect dispatches `RUN_SCRIPT_TICK` twice on mount. The reducer is idempotent — the second call sees `nextEventIndex` already advanced and is a no-op. Safe.

### Question 3 — fire-on-transition exactness

The user is right that "fire when stepCount transitions to N" is subtle. Two failure modes to worry about:

**(a) Skipped step counts.** If `stepCount` ever advances by more than 1 between effect runs (it shouldn't with the current `setInterval`-driven autoplay, but a future "step ×3" feature would), we must not miss events. The `while ... at <= stepCount` loop handles this: if stepCount goes 4→7, the runner fires all events with at ∈ {5, 6, 7} that haven't fired yet. Robust.

**(b) Effect not firing.** If `useEffect` deps are wrong (e.g., depending on `state` instead of `state.sim.stepCount`), referential-equality checks could cause spurious or missed runs. The dep array `[stepCount, hasScript, dispatch]` is correct: primitives plus a stable dispatch reference.

**(c) Order of effect vs event log render.** The script log entry for an `at:5` event records `precedingDeliveredCount = state.sim.deliveredMessages.length` at fire time. Since the effect runs after the STEP that produced stepCount=5, deliveredMessages has already been appended. So the log entry's `precedingDeliveredCount` equals the count *including* step 5's delivery. Render order: step-5 delivered message appears, then the script entry. Defensible interpretation: "the event happened *after* step 5's delivery". Worth confirming with the user.

---

## 3. UI changes

### Toolbar

Add a `ScriptControls` component to `ControlBar` row 2 (where presets live). One button, "Load script", which triggers a hidden `<input type="file" accept=".json,application/json">`. On change: read with `FileReader`, parse, validate, dispatch `LOAD_SCRIPT` or `LOAD_SCRIPT_ERROR`.

### Banner

New component `ScriptBanner` rendered in `App.tsx` between `<Header />` and `<main>`. States:

- `script` set, no error: shows `{script.name}` and (if present) `{script.description}` in a thin strip, plus a small "× clear script" button.
- `scriptError` set: shows red banner with bulleted error list and a dismiss button.
- Neither: render nothing (banner collapses).

### Event log

`EventLog.tsx` interleaves `scriptLog` with `deliveredMessages`:

```
delivered[0]
delivered[1]
[Script: propose P1 at step 0]   ← scriptLog entry with precedingDeliveredCount=2
delivered[2]
[Script: ⚠ drop A→P1 (no match) at step 4]
...
queued section
```

Implementation: build a single rendered list by walking `deliveredMessages` and inserting `scriptLog` entries whose `precedingDeliveredCount === currentIndex` before the current delivered message. CSS class `event-script` for normal entries, `event-script-warning` for no-ops.

### Auto-play

Per spec: loading a script does NOT auto-start playback. User clicks the existing Play button. `useAutoPlay` is unchanged.

---

## 4. Validation

### Format

All errors collected, returned as `string[]`. UX: a single inline banner with a bulleted list. Single message OR list of all errors — I recommend list. For a 7-event script with three problems, the user fixes them in one pass instead of three round trips. No toast infrastructure exists; banner fits the UI.

### Validation rules (load-time)

1. JSON parses (`SyntaxError` → "Invalid JSON: {message}").
2. Top-level shape: `name` is non-empty string; `description` if present is string; `initial_state` if present is object with optional `crashed: string[]`; `events` is array.
3. `initial_state.crashed` (if present): every entry is one of `["P1","P2","A1","A2","A3"]`.
4. Each event:
   - `at` is integer, ≥ 0.
   - `do` is one of `"propose" | "crash" | "restart" | "drop"`.
   - `node` (for propose/crash/restart) is one of the five node IDs. For `propose`, must be `"P1"` or `"P2"`.
   - For `drop`: at least one of `to`, `from`, `type` present; each present field is valid (node IDs / message types).
5. Sort events by `at` ascending (stable, preserving file order on ties) — once at validation, never re-sorted.

Error messages cite event index: `"Event 3: 'do' must be one of propose/crash/restart/drop, got 'skip'"`.

### Runtime no-ops

Per spec: if an event tries something the engine refuses, log warning to scriptLog, continue. Specifically:

- `propose` on a crashed proposer: engine `introduceProposal` doesn't check status — it would happily reset a crashed proposer back to phase1. That's wrong for a script semantics. The runner checks `state.sim.nodes[node].status !== "crashed"` before calling and emits a warning if crashed.
- `crash` on already-crashed node: no-op + warning.
- `restart` on non-crashed node: no-op + warning.
- `drop` with no matching queued message: no-op + warning. (Match = first message in `messageQueue` with `status === "queued"` matching all specified `to`/`from`/`type` fields.)

---

## 5. File list

### New files

| File | Approx LOC | Purpose |
|------|-----------|---------|
| `src/script/types.ts` | 30 | `ScriptEvent`, `LoadedScript`, `ScriptLogEntry` |
| `src/script/validate.ts` | 80 | JSON parse + schema validation, returns `{ ok: LoadedScript } \| { errors: string[] }` |
| `src/script/runner.ts` | 60 | `applyScriptEvent(state, event)` pure function |
| `src/hooks/useScriptRunner.ts` | 25 | `useEffect` watching `stepCount` |
| `src/components/ControlBar/ScriptControls.tsx` | 50 | Load button + hidden file input |
| `src/components/ScriptBanner.tsx` | 60 | Banner above canvas (name/desc/errors) |
| `src/script/__tests__/validate.test.ts` | 130 | Schema validator unit tests |
| `src/script/__tests__/runner.test.ts` | 150 | Runner unit tests (timing, no-ops, drop matching) |
| `src/script/__tests__/integration.test.ts` | 90 | End-to-end: load script via reducer, step to completion, assert state |

### Modified files

| File | Approx delta | Changes |
|------|--------------|---------|
| `src/state/reducer.ts` | +90 | New action types, AppState fields, `LOAD_SCRIPT`/`RUN_SCRIPT_TICK`/`LOAD_SCRIPT_ERROR` reducers, `LOAD_PRESET` clears script, `RESET` preserves script |
| `src/components/ControlBar/ControlBar.tsx` | +5 | Render `ScriptControls`, call `useScriptRunner()` |
| `src/components/App.tsx` | +2 | Render `ScriptBanner` between Header and main |
| `src/components/InfoPanel/EventLog.tsx` | +35 | Interleave scriptLog entries |
| `src/index.css` | +50 | Banner, scripted log entry, file input button styling |

**Total estimate: ~850 LOC across 9 new + 5 modified files.**

---

## 6. Test plan

### Unit — validator (`validate.test.ts`)

- Valid happy-path script returns `ok` with sorted events.
- Invalid JSON → single error.
- Missing `name` → error citing field.
- `events` not an array → error.
- Event with negative `at` → error citing index.
- Event with unknown `do` → error.
- `propose` on `A1` → error (must be P1 or P2).
- `crash` on unknown node ID → error.
- `drop` with no match fields → error.
- `drop` with valid `to` only → ok.
- `initial_state.crashed` containing unknown ID → error.
- Multiple errors collected (e.g., 3 bad events) → all 3 in error list.
- Stable sort: two events at `at: 5` retain file order in output.

### Unit — runner (`runner.test.ts`)

Test against the reducer (since `applyScriptEvent` is internal):

- `LOAD_SCRIPT` with `at: 0` propose fires immediately (cursor advances, queue gets PREPAREs).
- Single `at: 5` event does not fire until `stepCount` reaches 5.
- Multiple events at same `at` fire in file order.
- `RUN_SCRIPT_TICK` is idempotent: dispatching twice at same stepCount fires events once.
- `RUN_SCRIPT_TICK` at stepCount=7 with events at 5, 6, 7 (none fired) fires all three.
- `drop` event with no matching message logs warning, advances cursor, doesn't dispatch DROP_MESSAGE.
- `drop` event matches first queued message ignoring already-dropped ones.
- `crash` on already-crashed node logs warning.
- `LOAD_PRESET` after `LOAD_SCRIPT` clears script.
- `RESET` after `LOAD_SCRIPT` preserves script, resets cursor, re-applies initial_state.

### Integration (`integration.test.ts`)

End-to-end with real engine + reducer:

- Happy-path script (propose P1 at 0) → step until queue empty → consensus on "A".
- Crash-recovery script (initial_state.crashed=[A3], propose P1 at 0) → consensus on "A" with `acceptedBy=["A1","A2"]`.
- Late-crash script (propose P1 at 0, crash A2 at 4) → assert A2.status crashed at end, consensus may or may not be reached depending on timing — assert specific terminal state.
- Drop script (propose P1 at 0, drop type:promise at 4) → P1 gets only 1 promise → stalls in phase1.
- Bounded run: integration helper `stepUntilDoneOrCap(state, cap=200)` to prevent runaway.

---

## 7. Open questions / pushback

These are real ambiguities in the spec that I want to surface before implementing:

**(Q1) Script "propose" semantics.** I recommend mapping to `introduceProposal` (always strictly higher round than anything in system). Alternative: `startProposal` (per-proposer round counter, lex tiebreak by nodeId). The choice changes round numbers in scripted scenarios. Confirm.

**(Q2) `at` ordering vs delivered messages in the event log.** I plan to render the script entry for `at: N` *after* step N's delivered message. Justification: the runner fires after `stepCount` becomes N, which is after step N's effect on state. Confirm; alternative is "before", which would require the runner to fire pre-step (more complex).

**(Q3) RESET preserves script (rewind-and-replay) vs RESET clears script.** I recommend preserve. Confirm.

**(Q4) Drop matches only `status === "queued"` messages, not already-dropped ones.** Spec says "next matching in-flight message" — I'm reading "in-flight" as queued + not yet dropped. Confirm.

**(Q5) Events with `at` past the empty-queue point.** If queue empties at step 9 and an event is at: 100, the event never fires. I plan to leave it as silently never-fires until we add a "script complete" UI (out of scope for v1). Alternative: detect at load-time that `at` exceeds a heuristic max and warn. Detect at runtime and warn when queue empties with un-fired events remaining. The runtime warning is cheap and informative — recommend doing that.

**(Q6) Safety cap for the post-events autoplay.** Spec says "with a safety cap, propose one". Recommend 200 steps. The current happy path is ~10 steps, competing-proposals ~20, even pathological scripts shouldn't exceed 100. 200 leaves headroom.

**(Q7) `initial_state` extensibility.** Spec only defines `crashed: string[]`. The plan implements only that. Future additions (pre-dropped messages, pre-queued PREPAREs) would extend the schema; callout for v2.

**(Q8) File input UX details I'm taking liberties on (flag if you disagree):**
- Re-loading the same file twice in a row: input's `value` reset to `""` after each load so the same file can be picked again.
- Loading a script while autoplay is running: current autoplay continues until pause; the implicit reset that LOAD_SCRIPT performs DOES stop autoplay (autoPlay reset to `false`).
- Loading a script while a script is already loaded: replaces the previous script without confirmation. (Could prompt, but this is hand-authored JSON for power users; no need.)

**(Q9) `propose` on a proposer mid-protocol.** Engine's `introduceProposal` happily resets the proposer to phase1 with a new round (`faults.ts:138-153`). So `propose P1 at 0; propose P1 at 5` is well-defined: P1 starts a fresh round at step 5, abandoning whatever it was doing. No additional guard needed. Worth documenting in user-facing examples.

**(Q10) Tension with engine purity contract.** None. The engine stays pure. The script module is in `src/script/`, separate from `src/engine/`. The runner is a thin React effect + a pure reducer transition. No new violation of the "engine is pure TypeScript, no React" rule.

**(Q11) Tension with reducer invariants.** Minor: `RUN_SCRIPT_TICK` is the first action that applies *N* engine effects in one transition (`LOAD_PRESET` does this for setup but not in response to user actions). Each iteration of the while-loop produces a valid intermediate `AppState`. `checkInvariants` (called from `STEP` reducer) is not currently called from `RUN_SCRIPT_TICK`. Recommend calling it after each script event for parity. Cheap.

**(Q12) Edge cases I anticipate that you didn't address:**
- An empty `events: []` array with non-empty `initial_state`. Should validate. Acts as a "preset replacement" — load setup, user steps manually. I recommend allowing.
- A script whose only event is `at: 0` with no `propose`. Engine queue stays empty, autoplay never advances. UI should not deadlock — Play button is already `disabled={!canStep}` (`ControlBar.tsx:32`). Fine as-is, but worth a "no propose event in this script" load-time *warning* (not error). Punting unless you want it in v1.
- A script with two `propose` events for the same proposer back-to-back at the same `at`. The second resets the first. Per the existing engine semantics (Q9), this works, but is almost certainly not what the author intended. Could emit a load-time warning. Punting unless you want it.

---

## TL;DR

Three new files for the script module (`src/script/`), one new hook, two new UI components, four reducer-action additions, modest CSS. ~850 LOC, ~370 of which is tests. Sticks to existing patterns (reducer-driven state, effect-driven runner, engine purity intact). Main design choices to confirm: `propose` → `introduceProposal`; RESET preserves script; script entries render after the delivered message of their `at` step.

Awaiting review.
