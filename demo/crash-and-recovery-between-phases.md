# Demo Script: Acceptor Restart (Stable Storage)

## What This Demonstrates

P1 runs a complete two-phase round to consensus. A1 then crashes and is restarted.
The engine's `restartNode` for acceptors applies `{ ...node, status: "active" }` — only
the `status` field changes. Both `highestPromised` and `acceptedProposal` survive
identically through the crash-and-restart cycle.

P2 then starts a fresh proposal. When P2's PREPARE reaches A1, A1 re-promises and
includes its preserved `acceptedProposal = (1,P1), "A"` in the response — exactly as
if the crash had never occurred. P2 is forced to carry `"A"` forward by the
value-selection rule.

This demonstrates Paxos's **stable storage requirement**: an acceptor must write its
promise and acceptance to durable storage before responding, so that the information
survives any crash. Without this guarantee, a restarted acceptor could silently violate
a prior commitment, breaking the safety property.

## Key Concepts Illustrated

- An acceptor restart changes **only `status`** — `highestPromised` and
  `acceptedProposal` are preserved exactly.
- `highestPromised` preservation: prevents the acceptor from promising to a lower
  proposal after restart, which could allow a stale proposer to sneak through.
- `acceptedProposal` preservation: ensures the accepted value is reported in future
  PROMISE responses, so later proposers can discover and carry it forward.
- An acceptor restarted with its stable storage intact behaves identically to one
  that was never crashed. From the protocol's perspective, the crash never happened.
- This is what distinguishes `restartNode` (memory survives) from a hypothetical
  "factory reset" (memory wiped) — the latter would be unsafe.

## Nodes

| Node | Role     | Proposed Value |
|------|----------|----------------|
| P1   | Proposer | "A"            |
| P2   | Proposer | "B"            |
| A1   | Acceptor | —              |
| A2   | Acceptor | —              |
| A3   | Acceptor | —              |

Majority = 2 of 3 acceptors.

---

## Setup

**UI action:** Click **↺ Reset**.

All nodes return to their initial state.

**UI action:** In the **P1 NodeCard**, click **"Start Proposal"**.

P1: `phase1`, proposal `(1,P1)`. Three PREPAREs enqueued.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Part 1 — P1 Runs to Full Consensus (Steps 1–10)

> You can use **Auto-play** or **Step** through this part. The goal is to reach
> an empty queue with P1 showing `status: done` and A1 showing a non-null
> `accepted` field before the crash.

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 `highestPromised` = `(1,P1)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1

### Step 2 — PREPARE (1,P1) delivered to A2

- Same → **A2 promises**. A2 `highestPromised` = `(1,P1)`

### Step 3 — PREPARE (1,P1) delivered to A3

- Same → **A3 promises**. A3 `highestPromised` = `(1,P1)`

**Queue:**
```
A1 → P1: PROMISE (1,P1) [no accepted value]
A2 → P1: PROMISE (1,P1) [no accepted value]
A3 → P1: PROMISE (1,P1) [no accepted value]
```

### Step 4 — PROMISE from A1 → P1: count = 1/3

### Step 5 — PROMISE from A2 → P1: count = 2/3 → MAJORITY

- P1 transitions to `phase2`, keeps `"A"`, sends ACCEPT to A1 and A2

**Queue after step 5:**
```
A3 → P1: PROMISE (1,P1) [stale]
P1 → A1: ACCEPT (1,P1) "A"
P1 → A2: ACCEPT (1,P1) "A"
```

### Step 6 — Stale PROMISE from A3 → P1: discarded (P1 in phase2)

### Step 7 — ACCEPT (1,P1,"A") delivered to A1

- A1: `isGreaterThanOrEqual((1,P1),(1,P1))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(1,P1), "A"}`
- A1 enqueues `ACCEPTED(1,P1,"A")` → P1

### Step 8 — ACCEPT (1,P1,"A") delivered to A2

- Same → **A2 accepts**. A2 `acceptedProposal` = `{(1,P1), "A"}`
- **CONSENSUS REACHED**: A1 and A2 both hold `"A"` → 2 of 3

Acceptor state after step 8:

| Node | highestPromised | acceptedProposal        |
|------|-----------------|-------------------------|
| A1   | (1,P1)          | **(1,P1) = "A"**        |
| A2   | (1,P1)          | **(1,P1) = "A"**        |
| A3   | (1,P1)          | null                    |

### Step 9 — ACCEPTED from A1 → P1: `acceptsReceived` = 1

### Step 10 — ACCEPTED from A2 → P1: `acceptsReceived` = 2 → **P1 done**

**Queue is empty. P1 is `done`. Consensus panel shows `"A"`.**

> ✅ **Verify before crashing:** A1 NodeCard shows `promised: (1,P1)` and
> `accepted: (1,P1) = "A"`. These are the two fields that must survive the crash.

---

## The Crash and Restart

> The queue is empty. No messages are in flight. This is the cleanest moment to
> demonstrate crash-and-restart with no side effects.

### UI Action — Crash A1

**Click directly on the A1 NodeCard** (not the buttons).

A1 shakes and turns red. A1 `status` = `crashed`.

> ✅ **Verify immediately after crash:** A1 NodeCard still shows:
> - `status: crashed`
> - `promised: (1,P1)` ← **unchanged**
> - `accepted: (1,P1) = "A"` ← **unchanged**
>
> The crash set the `status` field to `crashed`. Nothing else changed.
> The red background makes the crash visible; the data fields remain.

A1 state after crash:

| Field             | Value                         |
|-------------------|-------------------------------|
| `status`          | **crashed**                   |
| `highestPromised` | **(1,P1)** — preserved        |
| `acceptedProposal`| **(1,P1) = "A"** — preserved  |

### UI Action — Restart A1

**Click the crashed A1 NodeCard again.**

A1 bounces and flashes green. A1 `status` returns to `active`.

> `restartNode` for an acceptor applies `{ ...node, status: "active" }`.
> Only the `status` field changes. Every other field is untouched by the spread.

> ✅ **Verify after restart:** A1 NodeCard now shows:
> - `status: active`
> - `promised: (1,P1)` ← **still unchanged**
> - `accepted: (1,P1) = "A"` ← **still unchanged**
>
> The NodeCard looks identical to its state at step 10. The crash and restart
> left no mark on the data.

A1 state after restart:

| Field             | Value                             |
|-------------------|-----------------------------------|
| `status`          | **active** (restored)             |
| `highestPromised` | **(1,P1)** — identical to pre-crash |
| `acceptedProposal`| **(1,P1) = "A"** — identical to pre-crash |

---

## Part 2 — P2 Discovers A1's Preserved Evidence (Steps 11–20)

**UI action:** In the **P2 NodeCard**, click **"New Proposal"**.

`introduceProposal` scans the system for max round (= 1, from all acceptors'
`highestPromised`) and assigns round **2**.

P2: `phase1`, proposal `(2,P2)`, `value "B"`. Three PREPAREs enqueued.

**Queue:**
```
P2 → A1: PREPARE (2,P2)
P2 → A2: PREPARE (2,P2)
P2 → A3: PREPARE (2,P2)
```

---

### Step 11 — PREPARE (2,P2) delivered to A1 (the restarted acceptor)

- A1 is **active** (restarted). `highestPromised` = `(1,P1)`. Round 2 > 1 → **A1 re-promises**
- A1 `highestPromised` = `(2,P2)`
- A1 `acceptedProposal` = `{(1,P1),"A"}` — **this is included in the response**
- A1 enqueues `PROMISE(2,P2, accepted={(1,P1),"A"})` → P2
- Event Log label: `A1 → P2: PR(2,P2) → "A"` ← **the preserved evidence surfaces**

> 📌 **This is the stable storage payoff.** A1 was crashed, restarted, and is now
> responding to P2. Its promise carries exactly the same accepted value it held
> before the crash. From P2's perspective, A1 never went down.

### Step 12 — PREPARE (2,P2) delivered to A2

- A2 never crashed. `highestPromised` = `(1,P1)`. Round 2 > 1 → **A2 re-promises**
- A2 `acceptedProposal` = `{(1,P1),"A"}` → included in response
- Event Log label: `A2 → P2: PR(2,P2) → "A"`

### Step 13 — PREPARE (2,P2) delivered to A3

- A3 never crashed and never accepted. `highestPromised` = `(1,P1)` → **A3 re-promises**
- A3 `acceptedProposal` = null — no accepted value to report
- Event Log label: `A3 → P2: PR(2,P2)` (no suffix)

Acceptor state after step 13:

| Node | Status              | highestPromised | acceptedProposal  |
|------|---------------------|-----------------|-------------------|
| A1   | active (restarted)  | **(2,P2)**      | (1,P1) = "A"      |
| A2   | active              | **(2,P2)**      | (1,P1) = "A"      |
| A3   | active              | **(2,P2)**      | null              |

**Queue:**
```
A1 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]   ← from restarted A1
A2 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]
A3 → P2: PROMISE (2,P2) [no accepted value]
```

### Step 14 — PROMISE from A1 → P2: count = 1/3

- P2 records promise with `accepted={(1,P1),"A"}`
- `withAccepted = [{(1,P1),"A"}]` — P2 already knows about `"A"` but doesn't have majority yet

### Step 15 — PROMISE from A2 → P2: count = 2/3 → MAJORITY

- `withAccepted = [{(1,P1),"A"}, {(1,P1),"A"}]`
- Highest accepted = `{(1,P1),"A"}` → **`chosenValue = "A"` — P2's `"B"` is overridden**
- P2 transitions to `phase2`
- ACCEPT(2,P2,"A") sent to A1 and A2

P2 NodeCard: `status: phase2`, `value "B"` (intent unchanged)

**Queue after step 15:**
```
A3 → P2: PROMISE (2,P2) [stale]
P2 → A1: ACCEPT (2,P2) "A"
P2 → A2: ACCEPT (2,P2) "A"
```

> ⚠️ **P2's ACCEPT messages carry `"A"`, not `"B"`.** P2 wanted `"B"` but the
> preserved evidence from A1 and A2 forced it to adopt `"A"`. If A1 had been
> wiped on restart (no stable storage), its promise would have carried `null`
> — but A2 still held `"A"`, so P2 would still have been forced. Stable storage
> is critical when fewer than a full majority of acceptors survive a crash.

### Step 16 — Stale PROMISE from A3 → P2: discarded (P2 in phase2)

### Step 17 — ACCEPT (2,P2,"A") delivered to A1 (restarted)

- A1: `isGreaterThanOrEqual((2,P2),(2,P2))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(2,P2), "A"}` (round number updated, value still `"A"`)
- A1 enqueues `ACCEPTED(2,P2,"A")` → P2

### Step 18 — ACCEPT (2,P2,"A") delivered to A2

- Same → **A2 accepts**. A2 `acceptedProposal` = `{(2,P2), "A"}`
- `checkConsensus`: A1 and A2 both hold `"A"` → **already `reached = true`** since step 8

### Step 19 — ACCEPTED from A1 → P2: `acceptsReceived` = 1

### Step 20 — ACCEPTED from A2 → P2: `acceptsReceived` = 2 → **P2 done**

**Queue is empty. Simulation complete.**

---

## Final State

| Node | Status             | highestPromised | acceptedProposal        |
|------|--------------------|-----------------|-------------------------|
| P1   | done               | —               | —                       |
| P2   | done               | —               | —                       |
| A1   | active (restarted) | (2,P2)          | **(2,P2) = "A"**        |
| A2   | active             | (2,P2)          | **(2,P2) = "A"**        |
| A3   | active             | (2,P2)          | null                    |

Consensus: `reached = true`, `value = "A"` — established at step 8, never changed.

A1's crash and restart left zero trace on the outcome.

---

## A1's State Through the Full Lifecycle

| Phase | A1 `status` | A1 `highestPromised` | A1 `acceptedProposal` |
|---|---|---|---|
| After step 3 (promised)     | active      | (1,P1)     | null               |
| After step 7 (accepted)     | active      | (1,P1)     | **(1,P1) = "A"**   |
| After step 10 (consensus)   | active      | (1,P1)     | (1,P1) = "A"       |
| After crash                 | **crashed** | (1,P1) ✓   | (1,P1) = "A" ✓     |
| After restart               | **active**  | (1,P1) ✓   | (1,P1) = "A" ✓     |
| After step 11 (P2's PREPARE)| active      | **(2,P2)** | (1,P1) = "A" ✓     |
| After step 17 (P2's ACCEPT) | active      | (2,P2)     | **(2,P2) = "A"**   |

Both the ✓ rows show the stable storage guarantee: neither field changed across
the crash-and-restart boundary.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **A1 NodeCard after step 10** | `promised: (1,P1)`, `accepted: (1,P1) = "A"` — the two fields to watch |
| **A1 NodeCard after crash** | Red background, shake animation; `promised` and `accepted` **unchanged** |
| **A1 NodeCard after restart** | Green flash, scale bounce; `promised` and `accepted` **still unchanged** |
| **Event Log steps 11–12** | Both A1 and A2 PROMISEs show `→ "A"` suffix — both carry evidence |
| **P2 NodeCard step 15** | `value "B"` (intent); queue ACCEPTs show `"A"` (actual) |
| **Consensus panel** | Lit since step 8; never changes; P2's run confirms rather than changes it |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **"Start Proposal"** on P1 | P1 enters phase1 |
| 1–10 | **Auto-play or Step ×10** | P1 completes; A1 NodeCard shows `accepted: (1,P1) = "A"` |
| — | **Click A1 NodeCard** to crash | A1 shakes red — **point at both fields: still showing "A"** |
| — | **Click A1 NodeCard again** to restart | Green bounce — **point at both fields: still identical** |
| — | **"New Proposal"** on P2 | P2 enters with `(2,P2)`, wants `"B"` |
| 11–13 | **Step ×3 (slow)** | A1 and A2 PROMISEs show `→ "A"`; A3 does not — restarted A1 behaves normally |
| 14–15 | **Step ×2 (highlight at 15)** | P2 hits majority; ACCEPTs carry `"A"` not `"B"` |
| 16–20 | **Step ×5** | P2 completes; consensus panel unchanged at `"A"` |

---

## Optional Variant — Crash and Restart Between Phase 1 and Phase 2

For a tighter demonstration of `highestPromised` preservation specifically:

1. Run steps 1–5 only (P1 completes Phase 1, ACCEPTs are queued but not yet delivered)
2. **Crash and immediately restart A1**
3. Continue stepping

When ACCEPT(1,P1,"A") reaches the restarted A1 at step 7:
- A1 `highestPromised` = `(1,P1)` (preserved through crash/restart)
- `isGreaterThanOrEqual((1,P1),(1,P1))` = true → **A1 still accepts correctly**

Without stable storage, if A1 had reset `highestPromised` to `null` on restart:
- A1 would still accept this ACCEPT (the null case passes the check)
- But A1 would also now be vulnerable to accepting from a **lower** proposal number
  in a different scenario — one where a proposer with a stale, lower round arrived
  after A1 had promised to a higher one before crashing

This is the exact safety hole Paxos's stable storage requirement closes: an
acceptor that forgets its `highestPromised` after restart cannot be trusted to honor
its prior commitments, which could allow two different values to be accepted by
overlapping quorums.

---

## Why This Happens (The Root Cause)

In the Paxos paper, Lamport specifies that acceptors must write to stable storage
**before** sending any response:

- Before sending a PROMISE, the acceptor writes the new `highestPromised` to disk.
- Before sending an ACCEPTED, the acceptor writes the new `acceptedProposal` to disk.

This "write-ahead" guarantee means that if the node crashes mid-operation, the stored
value on restart reflects the last committed state — never a partially-updated or
wiped state.

The engine models this by making `restartNode` for acceptors a pure field update:
only `status` is changed. The two durable fields — `highestPromised` and
`acceptedProposal` — are untouched. This is equivalent to reading them back from
stable storage on startup.

Without this guarantee, Paxos is not safe. A restarted acceptor that forgot it
promised to round 5 might re-promise to round 3, potentially allowing two different
values to each receive acceptance from overlapping majorities — the core safety
violation the protocol is designed to prevent.
