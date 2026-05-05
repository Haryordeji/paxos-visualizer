# Demo Script: Proposer Crash After Partial Accepts (Value Preservation Under Crash)

## What This Demonstrates

P1 completes Phase 1 and begins Phase 2. The ACCEPT message to A2 is manually dropped
so that only A1 receives and processes it. With only one acceptance, consensus is not
yet reached. P1 then crashes before its ACCEPTED response from A1 is delivered — P1
never learns that A1 accepted.

P2 enters with a higher round. When P2 collects PROMISEs, **A1 reports its previously
accepted value `"A"`** while A2 and A3 report nothing. Even with only one acceptor
carrying evidence of P1's partial work, P2 is forced by the value-selection rule to
adopt `"A"`. Consensus is reached with `"A"` — the value P1 intended — even though
P1 crashed and never knew it.

This is the deepest demonstration of Paxos safety: a value is safe the moment **any
single acceptor in the next proposer's quorum has accepted it**, because quorum overlap
guarantees that evidence will be discovered.

## Key Concepts Illustrated

- Consensus is not declared until a majority of acceptors hold the same value in
  `acceptedProposal`. One acceptor is not a majority — no consensus yet after A1 alone
  accepts.
- P1 crashing after a partial Phase 2 is the most fragile moment in the protocol.
  Safety is preserved only because Paxos's quorum overlap forces the next proposer to
  discover the partial work.
- P2's majority quorum (A1 + A2) must overlap with whatever partial quorum P1 started.
  A1 is in both sets — A1 is the bridge that carries the evidence to P2.
- The value-selection rule fires on **any** non-null accepted value in the promises.
  Even one accepted value out of three forces P2 to adopt it.
- Contrast with **Proposer Crash After Phase 1**: there, P1 crashed before any ACCEPT
  landed, so P2's promises carried `null` and P2 was free to use `"B"`. The difference
  between the two scenarios is exactly **one delivered ACCEPT**.

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

| Node | Status | highestPromised | acceptedProposal |
|------|--------|-----------------|------------------|
| P1   | idle   | —               | —                |
| P2   | idle   | —               | —                |
| A1   | active | null            | null             |
| A2   | active | null            | null             |
| A3   | active | null            | null             |

**UI action:** In the **P1 NodeCard**, click **"Start Proposal"**.

P1 enters `phase1` with proposal `(1,P1)` and enqueues 3 PREPARE messages.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Part 1 — P1 Runs Phase 1 Cleanly (Steps 1–5)

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

### Step 4 — PROMISE from A1 delivered to P1

- P1 promises count: **1 of 3** — not majority, no action

### Step 5 — PROMISE from A2 delivered to P1

- P1 promises count: **2 of 3** → **MAJORITY REACHED**
- No promise carries an accepted value → P1 keeps `"A"`
- P1 transitions to `phase2`
- Engine sends ACCEPT **only to A1 and A2** — the two that promised

P1 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 5:**
```
A3 → P1: PROMISE (1,P1) [stale — P1 now in phase2]
P1 → A1: ACCEPT (1,P1) "A"
P1 → A2: ACCEPT (1,P1) "A"
```

> ✅ **Verify:** P1 is in `phase2`. Queue shows exactly 2 ACCEPTs (not 3) — A3
> never promised to P1 first, so it is not an ACCEPT recipient. A3 has `promised:
> (1,P1)` but `accepted: —`.

---

## The Partial-Delivery Setup

> **Do NOT press Step yet. Drop exactly one ACCEPT before continuing.**

### UI Action — Drop the ACCEPT to A2

In the **Event Log → Queued** section, find:

- `P1 → A2: A(1,P1) "A"`

Click the **✗** on that entry to drop it. Leave the ACCEPT to A1 intact.

**Queue after dropping:**
```
A3 → P1: PROMISE (1,P1) [stale]
P1 → A1: ACCEPT (1,P1) "A"          ← will be delivered
P1 → A2: ACCEPT (1,P1) "A"  [dropped]   ← will be discarded
```

> This simulates a partial network failure: P1's message reached A1 but was lost
> before reaching A2. A3 was never a recipient.

---

## Part 2 — One ACCEPT Lands, Then P1 Crashes (Steps 6–9)

### Step 6 — Stale PROMISE from A3 delivered to P1

- P1 is in `phase2`, not `phase1` → stale-check fires → **silently discarded**

### Step 7 — ACCEPT (1,P1,"A") delivered to A1 ← THE PARTIAL ACCEPT

- A1: `highestPromised` = `(1,P1)`. `isGreaterThanOrEqual((1,P1),(1,P1))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(1,P1), "A"}`
- A1 enqueues `ACCEPTED(1,P1,"A")` → P1

`checkConsensus` runs: A1 holds `"A"`, A2 holds `null`, A3 holds `null` → only 1 of 3 →
**no consensus yet**.

> 📌 **A1 now holds the only evidence that "A" was ever proposed.** A2 and A3 know
> nothing about Phase 2. This is the moment of maximum fragility.

**Queue after step 7:**
```
P1 → A2: ACCEPT (1,P1) "A"  [dropped]
A1 → P1: ACCEPTED (1,P1) "A"
```

---

### UI Action — Crash P1

**Click directly on the P1 NodeCard** (not the buttons).

P1 shakes and turns red. P1 `status` = `crashed`.

> P1 is now crashed with an ACCEPTED message still in flight. P1 will never learn
> that A1 accepted. From P1's perspective, the proposal vanishes into the void.
>
> The ACCEPTED message is addressed to P1 (crashed recipient). The dropped ACCEPT to
> A2 is pre-marked. Both will be discarded automatically on the next two steps.

---

### Step 8 — ACCEPT (1,P1,"A") → A2 [dropped]: consumed as no-op

### Step 9 — ACCEPTED (1,P1,"A") → P1 [auto-dropped, crashed recipient]

- The engine checks: recipient P1 is `crashed` → **auto-dropped**
- P1 never learns A1 accepted. P1 stays crashed.
- Event Log shows: `✗ A1 → P1: OK(1,P1) "A"`

**Queue is now empty.**

Acceptor state after step 9:

| Node | Status      | highestPromised | acceptedProposal      |
|------|-------------|-----------------|------------------------|
| A1   | active      | (1,P1)          | **(1,P1) = "A"**       |
| A2   | active      | (1,P1)          | **null**               |
| A3   | active      | (1,P1)          | **null**               |

> ✅ **Verify:** No consensus panel. P1 is red and crashed. A1 is the only acceptor
> with an accepted value. A2 and A3 show `accepted: —`. One ACCEPT landed; one didn't.
>
> The system is in an ambiguous state. A quorum has **not** accepted `"A"` yet, but
> the groundwork is laid — whoever runs next will find A1's evidence.

---

## Part 3 — P2 Discovers A1's Evidence and Is Forced to Carry "A" (Steps 10–19)

**UI action:** In the **P2 NodeCard**, click **"New Proposal"**.

`introduceProposal` scans the system: max round = 1 (A1's `highestPromised`,
A1's `acceptedProposal.number.round`). New round = **2**.

P2: `phase1`, proposal `(2,P2)`, `value "B"`. Three PREPAREs enqueued.

**Queue:**
```
P2 → A1: PREPARE (2,P2)
P2 → A2: PREPARE (2,P2)
P2 → A3: PREPARE (2,P2)
```

### Step 10 — PREPARE (2,P2) delivered to A1

- A1: `highestPromised` = `(1,P1)`. Round 2 > 1 → **A1 re-promises**
- A1 `highestPromised` = `(2,P2)`
- A1 `acceptedProposal` = `{(1,P1),"A"}` — **this is carried in the response**
- A1 enqueues `PROMISE(2,P2, accepted={(1,P1),"A"})` → P2
- Event Log label: `A1 → P2: PR(2,P2) → "A"` ← **the evidence surfaces**

### Step 11 — PREPARE (2,P2) delivered to A2

- A2: `highestPromised` = `(1,P1)`. Round 2 > 1 → **A2 re-promises**
- A2 `acceptedProposal` = null — **no accepted value to report**
- A2 enqueues `PROMISE(2,P2, accepted=null)` → P2
- Event Log label: `A2 → P2: PR(2,P2)` (no suffix)

### Step 12 — PREPARE (2,P2) delivered to A3

- A3: same as A2 → **A3 re-promises** with no accepted value
- Event Log label: `A3 → P2: PR(2,P2)` (no suffix)

> 📌 **Notice the asymmetry:** Only A1's PROMISE label carries `→ "A"`. A2 and A3
> have plain labels. This asymmetry — one node knows, two don't — is the visible
> fingerprint of the partial-accept scenario. In Value Hijacking, all three PROMISE
> labels carry `→ "A"`.

Acceptor state after step 12:

| Node | highestPromised | acceptedProposal  |
|------|-----------------|-------------------|
| A1   | **(2,P2)**      | (1,P1) = **"A"**  |
| A2   | **(2,P2)**      | null              |
| A3   | **(2,P2)**      | null              |

**Queue:**
```
A1 → P2: PROMISE (2,P2) [accepted: (1,P1) = "A"]
A2 → P2: PROMISE (2,P2) [no accepted value]
A3 → P2: PROMISE (2,P2) [no accepted value]
```

### Step 13 — PROMISE from A1 delivered to P2

- P2 records promise with `accepted={(1,P1),"A"}` → count: **1 of 3**
- `withAccepted = [{(1,P1),"A"}]` — P2 already knows about "A" but doesn't yet have majority

### Step 14 — PROMISE from A2 delivered to P2 ← THE FORCED CHOICE

- P2 records promise with `accepted=null` → count: **2 of 3** → **MAJORITY**
- `withAccepted = [{(1,P1),"A"}]` — only A1's promise carries an accepted value
- `highest = {(1,P1),"A"}` — that is the only candidate
- **`chosenValue = "A"` — P2's own value `"B"` is overridden**
- P2 transitions to `phase2`
- Engine sends ACCEPT to A1 and A2 (the two that promised) with value `"A"`

P2 NodeCard: `status: phase2`, `value "B"` (intent unchanged), `promises 2/3`

**Queue after step 14:**
```
A3 → P2: PROMISE (2,P2) [stale — P2 now in phase2]
P2 → A1: ACCEPT (2,P2) "A"
P2 → A2: ACCEPT (2,P2) "A"
```

> ⚠️ **The forced choice:** P2's ACCEPT messages carry `"A"`, not `"B"`. P2's
> NodeCard still shows `value "B"` (its own intent), but the Event Log queue shows
> `A(2,P2) "A"`. One accepted value from A1 — just one — was enough to override P2.

### Step 15 — Stale PROMISE from A3 → P2: discarded (P2 in phase2)

### Step 16 — ACCEPT (2,P2,"A") delivered to A1

- A1: `isGreaterThanOrEqual((2,P2),(2,P2))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(2,P2), "A"}` (updated round, same value)
- A1 enqueues `ACCEPTED(2,P2,"A")` → P2

### Step 17 — ACCEPT (2,P2,"A") delivered to A2

- A2: same → **A2 accepts**
- A2 `acceptedProposal` = `{(2,P2), "A"}`
- **`checkConsensus`: A1 and A2 both hold `"A"` → 2 of 3 → CONSENSUS REACHED**

> ✅ **Consensus panel lights up with `"A"`.**
>
> P1 crashed, never learned its value was partially accepted, and never reached
> `done`. Yet the value it proposed is now permanently decided. P2 carried it across
> the finish line against its own will.

### Step 18 — ACCEPTED from A1 → P2: accepts = 1

### Step 19 — ACCEPTED from A2 → P2: accepts = 2 → **P2 transitions to `done`**

**Queue is empty. Simulation complete.**

---

## Final State

| Node | Status      | acceptedProposal    |
|------|-------------|---------------------|
| P1   | **crashed** | —                   |
| P2   | done        | —                   |
| A1   | active      | **(2,P2) = "A"**    |
| A2   | active      | **(2,P2) = "A"**    |
| A3   | active      | (1,P1) = (1,P1)     |

Wait — A3 never received any ACCEPT from either P1 or P2. A3.acceptedProposal remains
`null`. Consensus only requires A1 + A2.

Consensus: `reached = true`, `value = "A"`, `acceptedBy = [A1, A2]`.

---

## Side-by-Side Comparison: Three Crash Scenarios

| | Crash After Phase 1 | **Crash After Partial Accepts** | Value Hijacking (no crash) |
|---|---|---|---|
| P1 crash timing | Before any ACCEPT delivered | After A1 accepts, A2's dropped | After all accepts + P1 done |
| A1 accepted before P2 | null | **(1,P1) = "A"** | (1,P1) = "A" |
| A2 accepted before P2 | null | **null** | (1,P1) = "A" |
| P2 PROMISE from A1 | `PR(2,P2)` | **`PR(2,P2) → "A"`** | `PR(2,P2) → "A"` |
| P2 PROMISE from A2 | `PR(2,P2)` | **`PR(2,P2)`** (no suffix) | `PR(2,P2) → "A"` |
| P2 forced to use "A"? | **No** — chooses "B" freely | **Yes** — one accepted = enough | **Yes** — all three carried it |
| Consensus value | "B" | **"A"** | "A" |

The middle column is this scenario. It sits exactly between the other two.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **Event Log after step 7** | A1's ACCEPT delivers (✓); queue shows dropped A2 ACCEPT and in-flight ACCEPTED to P1 |
| **A1 NodeCard after step 7** | `accepted: (1,P1) = "A"` — only A1 shows an accepted value |
| **A2, A3 NodeCards** | `accepted: —` throughout Part 2 |
| **Event Log step 9** | `✗ A1 → P1: OK(1,P1) "A"` — P1 never learns; evidence stays with A1 |
| **Event Log steps 10–12** | Only A1's PROMISE shows `→ "A"` suffix; A2 and A3 show plain `PR(2,P2)` |
| **P2 NodeCard step 14** | `value "B"` unchanged; queue ACCEPTs show `"A"` — contradiction visible |
| **Consensus panel** | Lights up at step 17 with `"A"` despite P1 being crashed and P2 wanting "B" |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **"Start Proposal"** on P1 | P1 enters phase1 with (1,P1) |
| 1–3 | **Step ×3** | All 3 acceptors promise |
| 4–5 | **Step ×2** | P1 hits majority; phase2; queue shows 2 ACCEPTs (not 3) |
| — | **Drop `ACCEPT → A2`** in Event Log | Simulate partial delivery — only A1 will receive the ACCEPT |
| 6 | **Step** | Stale 3rd PROMISE discarded |
| 7 | **Step (highlight)** | A1 accepts! A1 NodeCard shows `accepted: (1,P1) = "A"`; A2 and A3 still `—` |
| — | **Click P1 NodeCard** to crash | P1 turns red; ACCEPTED from A1 is still in queue |
| 8–9 | **Step ×2** | Dropped ACCEPT to A2 clears; ACCEPTED to crashed P1 auto-drops (✗) |
| — | **"New Proposal"** on P2 | P2 enters phase1 with (2,P2), `value "B"` |
| 10–12 | **Step ×3 (slow)** | Contrast: A1's PROMISE shows `→ "A"`, A2 and A3 don't |
| 13 | **Step** | P2 records 1 promise — already "knows" about "A" from A1 |
| 14 | **Step (highlight)** | P2 hits majority with A2's null promise but A1's evidence wins — ACCEPTs show `"A"` |
| 15–19 | **Step ×5** | P2 completes; consensus on `"A"`; P1 stays crashed |

---

## Why This Happens (The Root Cause)

This scenario illustrates the mathematical core of Paxos: **quorum intersection**.

Any two majority quorums drawn from the same set of nodes must share at least one
member. P1's partial Phase 2 quorum included A1. P2's Phase 1 quorum included A1 and A2.
A1 is the intersection. As long as P2's Phase 1 reaches A1, P2 will discover P1's
partial work.

Paxos's value-selection rule exploits this: "if any promise in my majority carries an
accepted value, use the highest-numbered one." This is precisely because the intersection
node (A1 here) will always report the evidence. The rule turns the inevitability of quorum
overlap into a guarantee of value preservation.

A value cannot be lost once even one acceptor in any possible future quorum holds it.
That is why Paxos is safe under any minority of crashes, at any point in the protocol.
