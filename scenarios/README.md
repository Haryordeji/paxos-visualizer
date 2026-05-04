# Scripted Scenarios

JSON scripts that drive the Paxos visualizer through a timed sequence of events. Load via the **Load script…** button in the toolbar.

## Examples in this directory

- `happy-path.json` — P1 proposes, no faults, consensus on "A".
- `crash-recovery.json` — A3 crashed from the start; consensus still reached via A1 + A2.
- `competing-proposals.json` — P2 outbids P1 mid-round; consensus on "B".
- `message-loss.json` — One PREPARE dropped; consensus still reached.

## Schema

```jsonc
{
  "name": "string (required)",
  "description": "string (optional, shown in the banner)",
  "initial_state": {
    "crashed": ["A3"]                // optional, nodes start crashed
  },
  "events": [
    { "at": 0, "do": "propose", "node": "P1" },
    { "at": 5, "do": "crash",   "node": "A2" },
    { "at": 8, "do": "restart", "node": "A2" },
    { "at": 9, "do": "drop",    "to": "A1", "type": "promise" }
  ]
}
```

Events fire when the engine's step counter (shown in the header) reaches the event's `at`. Multiple events at the same `at` fire in file order.

## Verbs

| Verb     | Required fields           | Notes |
|----------|---------------------------|-------|
| propose  | `node`: P1 or P2          | Starts a fresh round with a strictly-higher round number than anything currently in the system. **See "Re-proposing" below.** |
| crash    | `node`: any node ID       | No-op + warning if already crashed. |
| restart  | `node`: any node ID       | No-op + warning if not crashed. Stable storage (highestPromised, acceptedProposal) is preserved across crash/restart. |
| drop     | at least one of `to`, `from`, `type` | Drops the next *queued* (not already-dropped) message that matches all specified fields. No-op + warning if no match. |

Valid node IDs: `P1`, `P2`, `A1`, `A2`, `A3`. Valid message types: `prepare`, `promise`, `accept`, `accepted`, `nack`.

## Re-proposing — important behavior

**A `propose` event on a proposer mid-protocol resets it.** If P1 is in `phase1` or `phase2` and another `propose P1` fires, P1's current proposal is abandoned and a new one starts with a higher round number. The proposer's promise/accept counters are cleared.

This is useful for demonstrating retry scenarios (e.g., "P1 gets NACKed, then re-proposes at a higher round"). Just make sure that's what you want — it's easy to author a script where two `propose` events on the same proposer at adjacent `at` values look like duplicates but actually represent a forced retry.

## Time semantics

- `at` is the engine's step counter. Step 0 is the initial state; step 1 is the state after the first message has been delivered.
- `at: 0` events fire **before** any step happens (immediately on script load).
- `at: N` events fire **after** the message that brings the engine to step N has been delivered.

## Validation

Scripts are validated at load time. Invalid scripts are rejected with a bulleted list of all errors; the simulation is not modified.

Validation errors include: malformed JSON, unknown verbs, invalid node IDs, negative `at`, propose on a non-proposer, drop without any match field, etc.

## Runtime warnings

Some conditions log a warning to the event log but do not stop playback:

- Engine refuses an event (e.g., `crash` on already-crashed node, `drop` with no matching message in the queue).
- The message queue empties while events are still pending (events with `at` past the engine's stalled step can never fire).
- The step counter reaches the safety cap of 200 — autoplay is paused. Manual stepping can continue past the cap.
