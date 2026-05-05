# Demo Script: Value Hijacking (Proposer Safety)

## What This Demonstrates

P1 runs to consensus with value `"A"`. Then P2 starts a fresh proposal with a higher
round number. P2 wants `"B"`, but when its PREPARE messages reach the acceptors, every
PROMISE response carries the already-accepted value `"A"`. The engine's value-selection
rule forces P2 to adopt `"A"` and propose it — even though P2's own `proposedValue` is
still displayed as `"B"` in the NodeCard.

This is Paxos's core **safety guarantee**: once a value has been accepted by a majority,
no future proposer can ever cause a different value to be chosen, regardless of what
value that proposer originally intended.

## Key Concepts Illustrated

- A PROMISE response carries the acceptor's previously-accepted `(proposalNumber, value)`
  if it has one, or `null` if it has not yet accepted anything.
- When a proposer collects a majority of PROMISEs and any of them carry an accepted value,
  the proposer **must** use the value from the highest-numbered accepted proposal —
  it cannot use its own.
- This rule is what makes Paxos safe: the new proposer becomes a carrier for the old
  value, not a competitor against it.
- The consensus value is immutable once decided. A second round of Paxos simply
  confirms the same value.

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

All nodes return to their initial state:

| Node | Status | round | highestPromised | acceptedProposal |
|------|--------|-------|-----------------|------------------|
| P1   | idle   | 0     | —               | —                |
| P2   | idle   | 0     | —               | —                |
| A1   | active | —     | null            | null             |
| A2   | active | —     | null            | null             |
| A3   | active | —     | null            | null             |

**UI action:** In the **P1 NodeCard**, click **"Start Proposal"**.

P1 enters `phase1` with proposal `(1,P1)` and enqueues 3 PREPARE messages.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Part 1 — P1 Runs to Full Consensus (Steps 1–12)

> You can use **Auto-play** or click **Step** 12 times to get through this part quickly.
> The goal is to reach an empty queue with P1 showing `status: done`.

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 `highestPromised` updates to `(1,P1)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1
- Event Log label: `PR(1,P1)` (no accepted value shown)

### Step 2 — PREPARE (1,P1) delivered to A2

- Same → **A2 promises**
- A2 `highestPromised` = `(1,P1)`

### Step 3 — PREPARE (1,P1) delivered to A3

- Same → **A3 promises**
- A3 `highestPromised` = `(1,P1)`

Acceptor state after step 3:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | (1,P1)          | null             |
| A2   | (1,P1)          | null             |
| A3   | (1,P1)          | null             |

**Queue:**
```
A1 → P1: PROMISE (1,P1) [no accepted value]
A2 → P1: PROMISE (1,P1) [no accepted value]
A3 → P1: PROMISE (1,P1) [no accepted value]
```

### Step 4 — PROMISE from A1 delivered to P1

- P1 promises count: **1 of 3** — not majority, no action yet

### Step 5 — PROMISE from A2 delivered to P1

- P1 promises count: **2 of 3** → **MAJORITY**
- No promise carries an accepted value → P1 keeps its own value `"A"`
- P1 transitions to `phase2`
- P1 enqueues `ACCEPT(1,P1,"A")` to all three acceptors

P1 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 5:**
```
A3 → P1: PROMISE (1,P1) [stale — P1 already in phase2]
P1 → A1: ACCEPT (1,P1) "A"
P1 → A2: ACCEPT (1,P1) "A"
P1 → A3: ACCEPT (1,P1) "A"
```

### Step 6 — Stale PROMISE from A3 delivered to P1

- P1 is in `phase2`, not `phase1` → stale-check fires → **silently discarded**
- No state change

### Step 7 — ACCEPT (1,P1,"A") delivered to A1

- A1: `isGreaterThanOrEqual((1,P1), (1,P1))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{number: (1,P1), value: "A"}`
- A1 enqueues `ACCEPTED(1,P1,"A")` → P1

### Step 8 — ACCEPT (1,P1,"A") delivered to A2

- Same → **A2 accepts**
- A2 `acceptedProposal` = `{number: (1,P1), value: "A"}`
- A2 enqueues `ACCEPTED(1,P1,"A")` → P1
- **`checkConsensus` runs: A1 and A2 both hold `"A"` → 2 of 3 → CONSENSUS REACHED**

> ✅ **Verify:** Consensus Status panel now shows `"A"`. A1 and A2 NodeCards light up.
> P2 NodeCard still shows `status: idle`, `value "B"`.

### Step 9 — ACCEPT (1,P1,"A") delivered to A3

- Same → **A3 accepts**
- A3 `acceptedProposal` = `{number: (1,P1), value: "A"}`

Acceptor state after step 9:

| Node | highestPromised | acceptedProposal        |
|------|-----------------|-------------------------|
| A1   | (1,P1)          | **(1,P1) = "A"**        |
| A2   | (1,P1)          | **(1,P1) = "A"**        |
| A3   | (1,P1)          | **(1,P1) = "A"**        |

**Queue:**
```
A1 → P1: ACCEPTED (1,P1) "A"
A2 → P1: ACCEPTED (1,P1) "A"
A3 → P1: ACCEPTED (1,P1) "A"
```

### Step 10 — ACCEPTED from A1 delivered to P1

- P1 `acceptsReceived` = 1 — not majority, status stays `phase2`

### Step 11 — ACCEPTED from A2 delivered to P1

- P1 `acceptsReceived` = 2 → **P1 transitions to `done`**

P1 NodeCard: `status: done`, `accepts 2/3`

### Step 12 — ACCEPTED from A3 delivered to P1

- P1 is `done`, not `phase2` → stale-check fires → **silently discarded**

**Queue is now empty. P1 is `done`. All three acceptors hold `acceptedProposal = (1,P1),"A"`.**

---

## Part 2 — P2 Enters and Is Forced to Carry "A" (Steps 13–24)

> **Slow down here.** Each step has a key observable outcome worth calling out.

### UI Action — Inject P2

In the **P2 NodeCard**, click **"New Proposal"**.

> "New Proposal" calls `introduceProposal`, which scans the system for the current max
> round (= 1, from all acceptors' `highestPromised`) and assigns round **2**.

P2: `phase1`, proposal `(2,P2)`. Three PREPAREs enqueued.

**Queue:**
```
P2 → A1: PREPARE (2,P2)
P2 → A2: PREPARE (2,P2)
P2 → A3: PREPARE (2,P2)
```

P2 NodeCard at this point: `status: phase1`, `value "B"`, `proposal (2,P2)`, `promises 0/3`

---

### Step 13 — PREPARE (2,P2) delivered to A1

- A1: `highestPromised` = `(1,P1)`. Is `(2,P2)` greater? Round 2 > 1 → **yes**
- A1 **re-promises** to P2. `highestPromised` updates to `(2,P2)`.
- A1 `acceptedProposal` = `{(1,P1),"A"}` — **this gets included in the response**
- A1 enqueues `PROMISE(2,P2, accepted={(1,P1),"A"})` → P2

> 📌 **Event Log label:** `A1 → P2: PR(2,P2) → "A"`
>
> The `→ "A"` suffix appears because this PROMISE carries a previously accepted value.
> This is the first visual signal that A1 already committed to something.

### Step 14 — PREPARE (2,P2) delivered to A2

- A2: `highestPromised` = `(1,P1)` → `(2,P2)` is greater → **A2 re-promises**
- A2 `highestPromised` = `(2,P2)`
- A2 enqueues `PROMISE(2,P2, accepted={(1,P1),"A"})` → P2
- Event Log label: `A2 → P2: PR(2,P2) → "A"`

### Step 15 — PREPARE (2,P2) delivered to A3

- A3: same → **A3 re-promises**
- A3 `highestPromised` = `(2,P2)`
- A3 enqueues `PROMISE(2,P2, accepted={(1,P1),"A"})` → P2
- Event Log label: `A3 → P2: PR(2,P2) → "A"`

Acceptor state after step 15:

| Node | highestPromised | acceptedProposal        |
|------|-----------------|-------------------------|
| A1   | **(2,P2)**      | (1,P1) = "A"            |
| A2   | **(2,P2)**      | (1,P1) = "A"            |
| A3   | **(2,P2)**      | (1,P1) = "A"            |

**Queue:**
```
A1 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]
A2 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]
A3 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]
```

### Step 16 — PROMISE from A1 delivered to P2

- P2 records promise with `accepted={(1,P1),"A"}` → count: **1 of 3**
- Not majority yet — no phase transition
- P2 NodeCard: `promises 1/3`

### Step 17 — PROMISE from A2 delivered to P2 ← THE HIJACK MOMENT

- P2 promises count: **2 of 3** → **MAJORITY**
- Engine checks for accepted values in received promises:
  - From A1: `accepted={(1,P1),"A"}`
  - From A2: `accepted={(1,P1),"A"}`
- `withAccepted` is non-empty → engine picks the highest-numbered accepted proposal
- Highest = `(1,P1),"A"` → **`chosenValue = "A"`** — P2's own `"B"` is overridden
- P2 transitions to `phase2`
- P2 enqueues `ACCEPT(2,P2,"A")` to all three acceptors — **not `"B"`**

> ⚠️ **The hijack:** P2's NodeCard still displays `value "B"` (its original intent).
> But the ACCEPT messages it just enqueued carry `"A"`.
> Look at the Event Log queue:
>
> - `P2 → A1: A(2,P2) "A"`
> - `P2 → A2: A(2,P2) "A"`
> - `P2 → A3: A(2,P2) "A"`
>
> P2 wants `"B"` but the protocol forces it to propose `"A"`.

P2 NodeCard: `status: phase2`, `value "B"` (unchanged), `promises 2/3`

**Queue after step 17:**
```
A3 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]   ← stale
P2 → A1: ACCEPT (2,P2) "A"
P2 → A2: ACCEPT (2,P2) "A"
P2 → A3: ACCEPT (2,P2) "A"
```

### Step 18 — Stale PROMISE from A3 delivered to P2

- P2 is in `phase2`, not `phase1` → stale-check fires → **silently discarded**

### Step 19 — ACCEPT (2,P2,"A") delivered to A1

- A1: `highestPromised` = `(2,P2)`. `isGreaterThanOrEqual((2,P2),(2,P2))` = true → **A1 accepts**
- A1 `acceptedProposal` updates to `{(2,P2),"A"}` — still `"A"`
- A1 enqueues `ACCEPTED(2,P2,"A")` → P2

### Step 20 — ACCEPT (2,P2,"A") delivered to A2

- Same → **A2 accepts**
- A2 `acceptedProposal` = `{(2,P2),"A"}`

### Step 21 — ACCEPT (2,P2,"A") delivered to A3

- Same → **A3 accepts**
- A3 `acceptedProposal` = `{(2,P2),"A"}`

**Queue:**
```
A1 → P2: ACCEPTED (2,P2) "A"
A2 → P2: ACCEPTED (2,P2) "A"
A3 → P2: ACCEPTED (2,P2) "A"
```

### Step 22 — ACCEPTED from A1 delivered to P2

- P2 `acceptsReceived` = 1

### Step 23 — ACCEPTED from A2 delivered to P2

- P2 `acceptsReceived` = 2 → **P2 transitions to `done`**

P2 NodeCard: `status: done`

### Step 24 — ACCEPTED from A3 delivered to P2

- P2 is `done`, not `phase2` → stale-check fires → **silently discarded**

**Queue is empty. Both proposers are `done`.**

---

## Final State

| Node | Status | acceptedProposal  |
|------|--------|-------------------|
| P1   | done   | —                 |
| P2   | done   | —                 |
| A1   | active | (2,P2) = **"A"**  |
| A2   | active | (2,P2) = **"A"**  |
| A3   | active | (2,P2) = **"A"**  |

Consensus: `reached = true`, `value = "A"`, `acceptedBy = [A1, A2]` (set at step 8, never changed).

P2 ran a complete two-phase round with proposal `(2,P2)` and `proposedValue "B"` — and
the protocol still converged on `"A"`.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **P2 NodeCard `value`** | Always shows `"B"` — P2's intent, never overwritten |
| **Event Log: steps 13–15** | All three `PROMISE` entries show `PR(2,P2) → "A"` — the `→ "A"` suffix signals an accepted value was carried |
| **Event Log: steps 19–21** | P2's `ACCEPT` entries show `A(2,P2) "A"` — not `"B"` |
| **Consensus Status panel** | Shows `"A"` from step 8 onward; never changes |
| **Acceptor NodeCards after step 9** | `accepted: (1,P1) = "A"` on all three before P2 even starts |
| **Acceptor NodeCards after step 21** | Updates to `accepted: (2,P2) = "A"` — round number changes, value stays `"A"` |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **"Start Proposal"** on P1 | P1 enters phase1 with (1,P1) |
| 1–3 | **Step ×3** (or Auto-play) | All acceptors promise; `promised` field appears in NodeCards |
| 4–5 | **Step ×2** | P1 hits majority, enters phase2; ACCEPT×3 enqueued |
| 6–12 | **Step ×7** (or Auto-play) | Accepts land, A1/A2/A3 all show `accepted: (1,P1) = "A"`; consensus banner lights up; P1 goes `done` |
| — | **"New Proposal"** on P2 | P2 enters phase1 with (2,P2), `value "B"` visible |
| 13–15 | **Step ×3 (slow)** | Event Log shows `PR(2,P2) → "A"` for every PROMISE — point this out explicitly |
| 16 | **Step** | P2 records 1st promise — still no action |
| 17 | **Step (highlight)** | P2 hits majority; ACCEPT entries in queue show `"A"`, not `"B"` — the hijack is visible before continuing |
| 18–24 | **Step ×7** | P2 completes uneventfully with `"A"`; consensus panel unchanged |

---

## Why This Happens (The Root Cause)

The value-selection rule is the heart of Paxos correctness. From the original paper (Paxos
Made Simple, Lamport 2001, §2.2):

> *"A proposer issues a proposal with number n and value v, where v is the value of the
> highest-numbered proposal among all responses, or is any value selected by the
> proposer if the responses reported no proposals."*

This rule ensures that if any value has been accepted by a majority in any prior round,
every future majority necessarily overlaps with at least one acceptor that knows about it.
That acceptor's PROMISE carries the old value forward, and the new proposer is compelled
to adopt it. The safety property holds forever, across any number of rounds and failures.
