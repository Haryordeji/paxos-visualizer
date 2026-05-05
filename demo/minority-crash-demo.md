# Demo Script: Minority Crash (Fault Tolerance)

## What This Demonstrates

One acceptor (A3) is crashed before the simulation begins. The remaining two
acceptors (A1 and A2) form a majority of the three-node quorum (2 of 3 = majority).
P1 runs a normal two-phase round and reaches consensus without A3 ever participating.

This is Paxos's core **fault-tolerance guarantee**: the system can lose any minority
of acceptors and still make progress. Nothing changes in the protocol — the majority
threshold is simply met with fewer nodes.

Notably, this scenario is actually **one step shorter** than the happy path, because
the stale third PROMISE that normally clutters the queue never appears — A3 is crashed
so it never sends one.

## Key Concepts Illustrated

- A majority of 3 acceptors is **2** — losing 1 still leaves enough.
- When a PREPARE message is delivered to a crashed acceptor, the engine
  auto-drops it (crashed-recipient rule). No PROMISE is sent back.
- Because A3 never promises, it is never included in P1's ACCEPT recipients —
  the engine sends ACCEPTs only to the acceptors that actually promised.
- A3's `highestPromised` and `acceptedProposal` remain `null` throughout;
  A3 is completely unaware the protocol ran.
- Contrast with **Majority Crash**: lose 2 acceptors and the quorum is gone,
  leaving the system permanently unable to decide.

## Nodes

| Node | Role     | Proposed Value |
|------|----------|----------------|
| P1   | Proposer | "A"            |
| P2   | Proposer | "B"            |
| A1   | Acceptor | —              |
| A2   | Acceptor | —              |
| A3   | Acceptor | — (crashed)    |

Majority = 2 of 3 acceptors.

---

## Setup

**UI action:** Click **↺ Reset**.

All nodes return to their initial state:

| Node | Status | highestPromised | acceptedProposal |
|------|--------|-----------------|------------------|
| P1   | idle   | —               | —                |
| P2   | idle   | —               | —                |
| A1   | active | null            | null             |
| A2   | active | null            | null             |
| A3   | active | null            | null             |

**UI action:** Click directly on the **A3 NodeCard** to crash it.

A3 shakes and turns red. A3 `status` = `crashed`.

> A3's `highestPromised` and `acceptedProposal` remain `null` — stable storage is
> preserved across crashes, and there was nothing stored yet.

**UI action:** In the **P1 NodeCard**, click **"Start Proposal"**.

P1 enters `phase1` with proposal `(1,P1)` and enqueues 3 PREPARE messages — one to
each acceptor, including the crashed A3.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Part 1 — Phase 1: Collecting Promises (Steps 1–5)

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 `highestPromised` = `(1,P1)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1

### Step 2 — PREPARE (1,P1) delivered to A2

- Same → **A2 promises**
- A2 `highestPromised` = `(1,P1)`
- A2 enqueues `PROMISE(1,P1, accepted=null)` → P1

### Step 3 — PREPARE (1,P1) → A3 [auto-dropped, crashed recipient]

- The engine checks: recipient A3 is `crashed` → **message auto-dropped immediately**
- A3 never processes the PREPARE
- A3 `highestPromised` stays `null`
- **No PROMISE is sent from A3**
- Event Log shows: `✗ P1 → A3: P(1,P1)`

> 📌 **Key observation:** Because A3 never promises, it will not appear in P1's
> promise list, and will not receive an ACCEPT message later. A3 is completely
> absent from the rest of the protocol.

Acceptor state after step 3:

| Node | Status      | highestPromised | acceptedProposal |
|------|-------------|-----------------|------------------|
| A1   | active      | **(1,P1)**      | null             |
| A2   | active      | **(1,P1)**      | null             |
| A3   | **crashed** | null            | null             |

**Queue (only 2 items — no PROMISE from A3):**
```
A1 → P1: PROMISE (1,P1) [no accepted value]
A2 → P1: PROMISE (1,P1) [no accepted value]
```

> Compare to the happy path, where all three PROMISEs are in the queue at this point.
> Here there are only two — and **two is enough**.

### Step 4 — PROMISE from A1 delivered to P1

- P1 records promise from A1 → count: **1 of 3** — not majority yet

### Step 5 — PROMISE from A2 delivered to P1

- P1 records promise from A2 → count: **2 of 3** → **MAJORITY REACHED**
- No promise carries an accepted value → P1 keeps its own value `"A"`
- P1 transitions to `phase2`
- Engine sends ACCEPT only to the acceptors that promised — **A1 and A2 only**
  (A3 is absent from `promisesReceived`, so it is not in the recipient list)

P1 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

> ✅ **Verify:** P1 entered `phase2` with only 2 promises. There is no stale third
> PROMISE cluttering the queue (unlike the happy path, where A3's PROMISE arrives
> late). The queue is already clean.

**Queue after step 5 (only 2 ACCEPTs — A3 not included):**
```
P1 → A1: ACCEPT (1,P1) "A"
P1 → A2: ACCEPT (1,P1) "A"
```

---

## Part 2 — Phase 2: Collecting Accepts (Steps 6–9)

### Step 6 — ACCEPT (1,P1,"A") delivered to A1

- A1: `highestPromised` = `(1,P1)`. `isGreaterThanOrEqual((1,P1),(1,P1))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(1,P1), "A"}`
- A1 enqueues `ACCEPTED(1,P1,"A")` → P1

### Step 7 — ACCEPT (1,P1,"A") delivered to A2

- Same → **A2 accepts**
- A2 `acceptedProposal` = `{(1,P1), "A"}`
- A2 enqueues `ACCEPTED(1,P1,"A")` → P1
- **`checkConsensus` runs: A1 and A2 both hold `"A"` → 2 of 3 → CONSENSUS REACHED**

> ✅ **Verify:** Consensus panel shows `"A"`. A1 and A2 NodeCards light up.
> A3 is still crashed and still shows `accepted: —`. Consensus was reached without A3.

Acceptor state after step 7:

| Node | Status      | highestPromised | acceptedProposal     |
|------|-------------|-----------------|----------------------|
| A1   | active      | (1,P1)          | **(1,P1) = "A"**     |
| A2   | active      | (1,P1)          | **(1,P1) = "A"**     |
| A3   | **crashed** | null            | **null**             |

**Queue:**
```
A1 → P1: ACCEPTED (1,P1) "A"
A2 → P1: ACCEPTED (1,P1) "A"
```

### Step 8 — ACCEPTED from A1 delivered to P1

- P1 `acceptsReceived` = 1 — not yet majority

### Step 9 — ACCEPTED from A2 delivered to P1

- P1 `acceptsReceived` = 2 → **P1 transitions to `done`**

P1 NodeCard: `status: done`, `accepts 2/3`

**Queue is empty. Simulation complete.**

---

## Final State

| Node | Status      | highestPromised | acceptedProposal    |
|------|-------------|-----------------|---------------------|
| P1   | done        | —               | —                   |
| P2   | idle        | —               | —                   |
| A1   | active      | (1,P1)          | **(1,P1) = "A"**    |
| A2   | active      | (1,P1)          | **(1,P1) = "A"**    |
| A3   | **crashed** | null            | null                |

Consensus: `reached = true`, `value = "A"`, `acceptedBy = [A1, A2]`.

A3 is crashed and has no knowledge of the consensus. A1 and A2 decided without it.

---

## Comparison: Minority Crash vs. Happy Path

| | Happy Path | Minority Crash |
|---|---|---|
| Total steps | 10 | **9** |
| Stale PROMISE from A3 | Yes (step 6) | **No** — A3 never promised |
| ACCEPTs sent | A1, A2 only | A1, A2 only |
| Consensus step | Step 8 | **Step 7** |
| A3 final state | `accepted: (1,P1)="A"` | `accepted: null` |

The minority crash actually completes **faster** than the normal run — fewer messages in
the queue because A3's stale PROMISE never exists.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **A3 NodeCard** | Red throughout; `highestPromised: —` and `accepted: —` never change |
| **Event Log step 3** | `✗ P1 → A3: P(1,P1)` — the only drop in the entire run |
| **Queue after step 3** | Only 2 PROMISE messages (not 3) |
| **P1 NodeCard step 5** | `promises 2/3` — majority met with 2, not 3 |
| **Queue after step 5** | Only 2 ACCEPT messages (not 3) — A3 is not a recipient |
| **Consensus panel** | Lights up at step 7 with `"A"` despite A3 being crashed |
| **Event Log overall** | One ✗ entry (step 3), then all ✓ — a nearly clean run |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **Click A3 NodeCard** | A3 crashes (red, shakes) |
| Setup | **"Start Proposal"** on P1 | 3 PREPAREs enqueued — including one to the crashed A3 |
| 1–2 | **Step ×2** | A1 and A2 promise normally |
| 3 | **Step** | PREPARE to A3 auto-dropped — show the ✗ in Event Log; A3 NodeCard unchanged |
| 4–5 | **Step ×2** | P1 gets 2 promises and hits majority; queue shows only 2 ACCEPTs (not 3) |
| 6–7 | **Step ×2 (highlight at 7)** | Consensus lights up at step 7 — point out A3 still shows `accepted: —` |
| 8–9 | **Step ×2** | P1 reaches done with `accepts 2/3` |

---

## Optional Extension — Restart A3 and Run P2

After step 9, **click the crashed A3 NodeCard** to restart it.

- A3 `status` returns to `active`
- A3 `highestPromised` = null, `acceptedProposal` = null — **A3 has no memory of what happened**

Now in the **P2 NodeCard**, click **"New Proposal"**.

- P2 gets round = 2 (max system round is 1, from all `highestPromised` fields)
- P2 sends PREPARE(2,P2) to A1, A2, and the now-active A3

When the PROMISEs come back:
- A1 → P2: `PROMISE(2,P2, accepted={(1,P1),"A"})` — A1 knows about `"A"`
- A2 → P2: `PROMISE(2,P2, accepted={(1,P1),"A"})` — same
- A3 → P2: `PROMISE(2,P2, accepted=null)` — A3 has no history

P2 hits majority and sees accepted values from A1 and A2 → **value-hijacking rule applies** →
P2 is forced to adopt `"A"` instead of `"B"`. P2 sends `ACCEPT(2,P2,"A")` to all three.

When A3 receives `ACCEPT(2,P2,"A")`, it accepts and sets `acceptedProposal = {(2,P2),"A"}`.
A3 is now **caught up** — it holds the correct consensus value, learned through the
protocol itself rather than through any external synchronization.

> This extension shows that a crashed acceptor does not need special recovery logic.
> The next round of Paxos naturally propagates the decided value to any lagging node.

---

## Why This Happens (The Root Cause)

The majority quorum rule exists precisely to handle minority failures. By requiring
agreement from more than half the acceptors, Paxos ensures that any two majority sets
overlap by at least one node. This overlap is what allows new proposals to discover
previously accepted values. A minority crash shrinks the available pool but does not
break the overlap property — as long as the majority of nodes are still reachable,
the system can always make progress.

The trade-off: with 3 acceptors, the system tolerates **1 failure**. To tolerate
2 simultaneous failures, you would need at least 5 acceptors (majority of 5 = 3).
In general, to tolerate `f` failures you need at least `2f + 1` acceptors.
