# Demo Script: Proposer Crash After Phase 1 (Orphaned Proposal)

## What This Demonstrates

P1 successfully completes Phase 1 — it collects a majority of PROMISE responses and
transitions to `phase2`. At that exact moment it crashes, before any of its ACCEPT
messages are delivered. The engine automatically drops all of P1's queued outbound
messages (crashed-sender rule) and any inbound messages addressed to it
(crashed-recipient rule).

P2 then steps in with a higher round number. Because no acceptor ever received an
ACCEPT from P1, their PROMISE responses to P2 carry no previously accepted value. P2 is
free to use its own value `"B"`, runs a clean two-phase round, and reaches consensus.

This shows that **winning Phase 1 does not guarantee consensus** — a crash between
Phase 1 and Phase 2 is equivalent to never having participated, from the acceptors'
perspective.

## Key Concepts Illustrated

- The engine automatically discards any queued message whose sender or recipient is
  crashed. No manual dropping is needed after crashing P1.
- Acceptors only update `acceptedProposal` when an ACCEPT message is **delivered** —
  a queued-but-never-delivered ACCEPT has no effect on their state.
- A new proposer's PROMISE responses carry `accepted = null` when no prior ACCEPT was
  delivered, giving the new proposer full freedom to pick its own value.
- Paxos is safe under proposer crashes at any point: the protocol never produces an
  inconsistent result; it simply stalls until a new proposer takes over.

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

## Part 1 — P1 Completes Phase 1 (Steps 1–5)

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 `highestPromised` = `(1,P1)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1

### Step 2 — PREPARE (1,P1) delivered to A2

- Same → **A2 promises**
- A2 `highestPromised` = `(1,P1)`

### Step 3 — PREPARE (1,P1) delivered to A3

- Same → **A3 promises**
- A3 `highestPromised` = `(1,P1)`

**All three acceptors have promised to P1. No acceptor has accepted any value yet.**

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

- P1 records promise → count: **1 of 3** — not majority, no action

### Step 5 — PROMISE from A2 delivered to P1

- P1 records promise → count: **2 of 3** → **MAJORITY REACHED**
- No promise carries an accepted value → P1 keeps its own value `"A"`
- P1 transitions to `phase2`
- P1 enqueues `ACCEPT(1,P1,"A")` to all three acceptors

P1 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 5:**
```
A3 → P1: PROMISE (1,P1) [no accepted value]   ← still in flight to P1
P1 → A1: ACCEPT (1,P1) "A"                    ← enqueued, not yet delivered
P1 → A2: ACCEPT (1,P1) "A"
P1 → A3: ACCEPT (1,P1) "A"
```

> ✅ **Verify:** P1 NodeCard shows `status: phase2`. All acceptors show
> `promised: (1,P1)` and `accepted: —`. Consensus panel shows "No consensus reached."
>
> This is the exact moment P1 has won Phase 1. Its ACCEPT messages are
> queued but not yet delivered to any acceptor.

---

## The Crash — P1 Goes Down Before Any ACCEPT Lands

> **Do NOT press Step yet. Crash P1 first.**

**UI action:** Click directly on the **P1 NodeCard** (anywhere outside the buttons).

The NodeCard shakes and turns red. P1 `status` = `crashed`.

> ⚠️ **Why no manual drops are needed:** The engine checks two things on every step:
>
> - If the **sender** of the next message is crashed → auto-drop
> - If the **recipient** of the next message is crashed → auto-drop
>
> P1 is the **sender** of the three ACCEPT messages and the **recipient** of the stale
> PROMISE from A3. All four messages will be discarded automatically as they are
> dequeued — no clicking ✗ required.

---

## Part 2 — P1's Orphaned Messages Are Discarded (Steps 6–9)

### Step 6 — PROMISE from A3 → P1 [auto-dropped, crashed recipient]

- The engine checks: recipient P1 is `crashed` → message auto-dropped
- No state change to any acceptor
- Event Log shows: `✗ A3 → P1: PR(1,P1)`

### Step 7 — ACCEPT (1,P1,"A") → A1 [auto-dropped, crashed sender]

- The engine checks: sender P1 is `crashed` → message auto-dropped
- **A1 never receives the ACCEPT. A1's `acceptedProposal` stays `null`.**
- Event Log shows: `✗ P1 → A1: A(1,P1) "A"`

### Step 8 — ACCEPT (1,P1,"A") → A2 [auto-dropped, crashed sender]

- Same → A2's `acceptedProposal` stays `null`
- Event Log shows: `✗ P1 → A2: A(1,P1) "A"`

### Step 9 — ACCEPT (1,P1,"A") → A3 [auto-dropped, crashed sender]

- Same → A3's `acceptedProposal` stays `null`
- Event Log shows: `✗ P1 → A3: A(1,P1) "A"`

**Queue is now empty. All four of P1's messages are gone.**

Acceptor state after step 9:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | (1,P1)          | **null**         |
| A2   | (1,P1)          | **null**         |
| A3   | (1,P1)          | **null**         |

> ✅ **Verify:** Event Log shows four consecutive ✗ entries — the stale PROMISE then
> three ACCEPTs, all dropped. Every acceptor NodeCard shows `accepted: —`.
> P1 NodeCard is red with `status: crashed`.
>
> P1 gathered a majority of promises and earned the right to propose — but that
> right vanished the moment it crashed. The acceptors' state is unchanged from
> after step 3.

---

## Part 3 — P2 Takes Over (Steps 10–21)

**UI action:** In the **P2 NodeCard**, click **"New Proposal"**.

> "New Proposal" calls `introduceProposal`, which scans all nodes and the message queue
> for the current max round (= 1, from all acceptors' `highestPromised`) and assigns
> round **2**.

P2: `phase1`, proposal `(2,P2)`, `value "B"`. Three PREPAREs enqueued.

**Queue:**
```
P2 → A1: PREPARE (2,P2)
P2 → A2: PREPARE (2,P2)
P2 → A3: PREPARE (2,P2)
```

---

### Step 10 — PREPARE (2,P2) delivered to A1

- A1: `highestPromised` = `(1,P1)`. Is `(2,P2)` greater? Round 2 > 1 → **yes**
- **A1 re-promises to P2.** `highestPromised` = `(2,P2)`
- A1 `acceptedProposal` = null — **no accepted value to report**
- A1 enqueues `PROMISE(2,P2, accepted=null)` → P2
- Event Log label: `A1 → P2: PR(2,P2)` (no `→ "value"` suffix — nothing accepted)

### Step 11 — PREPARE (2,P2) delivered to A2

- Same → A2 re-promises. A2 `highestPromised` = `(2,P2)`
- `PROMISE(2,P2, accepted=null)` → P2

### Step 12 — PREPARE (2,P2) delivered to A3

- Same → A3 re-promises. A3 `highestPromised` = `(2,P2)`
- `PROMISE(2,P2, accepted=null)` → P2

Acceptor state after step 12:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | **(2,P2)**      | null             |
| A2   | **(2,P2)**      | null             |
| A3   | **(2,P2)**      | null             |

**Queue:**
```
A1 → P2: PROMISE (2,P2) [no accepted value]
A2 → P2: PROMISE (2,P2) [no accepted value]
A3 → P2: PROMISE (2,P2) [no accepted value]
```

> 📌 **Contrast with Value Hijacking:** In that scenario, these PROMISE labels show
> `PR(2,P2) → "A"` because accepts were delivered before P2 entered. Here they show
> plain `PR(2,P2)` — no suffix — because P1's crash prevented any ACCEPT from landing.
> This is why P2 gets to choose freely.

### Step 13 — PROMISE from A1 delivered to P2

- P2 records promise → count: **1 of 3** — not majority

### Step 14 — PROMISE from A2 delivered to P2

- P2 records promise → count: **2 of 3** → **MAJORITY**
- `withAccepted` is empty (both promises carry `null`) → **P2 keeps its own value `"B"`**
- P2 transitions to `phase2`
- P2 enqueues `ACCEPT(2,P2,"B")` to all three acceptors

P2 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 14:**
```
A3 → P2: PROMISE (2,P2) [stale]
P2 → A1: ACCEPT (2,P2) "B"
P2 → A2: ACCEPT (2,P2) "B"
P2 → A3: ACCEPT (2,P2) "B"
```

> ✅ **Key observation:** P2's queued ACCEPTs show `"B"` — not `"A"`. Because P1's
> ACCEPTs were never delivered, P2 has no obligation to carry P1's value forward.

### Step 15 — Stale PROMISE from A3 → P2 [discarded]

- P2 is in `phase2`, not `phase1` → stale-check fires → **silently discarded**

### Step 16 — ACCEPT (2,P2,"B") delivered to A1

- A1: `highestPromised` = `(2,P2)`. `isGreaterThanOrEqual((2,P2),(2,P2))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(2,P2), "B"}`
- A1 enqueues `ACCEPTED(2,P2,"B")` → P2

### Step 17 — ACCEPT (2,P2,"B") delivered to A2

- Same → **A2 accepts**
- A2 `acceptedProposal` = `{(2,P2), "B"}`
- **`checkConsensus`: A1 and A2 both hold `"B"` → 2 of 3 → CONSENSUS REACHED with `"B"`**

> ✅ **Verify:** Consensus panel now shows `"B"`. This is a different value than P1
> intended (`"A"`). P1's crash before Phase 2 meant the system had no commitment to
> `"A"`, so P2 was free to decide.

### Step 18 — ACCEPT (2,P2,"B") delivered to A3

- A3 accepts. A3 `acceptedProposal` = `{(2,P2), "B"}`

**Queue:**
```
A1 → P2: ACCEPTED (2,P2) "B"
A2 → P2: ACCEPTED (2,P2) "B"
A3 → P2: ACCEPTED (2,P2) "B"
```

### Step 19 — ACCEPTED from A1 → P2

- P2 `acceptsReceived` = 1

### Step 20 — ACCEPTED from A2 → P2

- P2 `acceptsReceived` = 2 → **P2 transitions to `done`**

P2 NodeCard: `status: done`

### Step 21 — ACCEPTED from A3 → P2 [stale, discarded]

- P2 is `done`, not `phase2` → stale-check fires → **silently discarded**

**Queue is empty. Simulation complete.**

---

## Final State

| Node | Status      | round | highestPromised | acceptedProposal   |
|------|-------------|-------|-----------------|---------------------|
| P1   | **crashed** | 1     | —               | —                   |
| P2   | done        | 2     | —               | —                   |
| A1   | active      | —     | (2,P2)          | **(2,P2) = "B"**    |
| A2   | active      | —     | (2,P2)          | **(2,P2) = "B"**    |
| A3   | active      | —     | (2,P2)          | **(2,P2) = "B"**    |

Consensus: `reached = true`, `value = "B"`, `acceptedBy = [A1, A2]` (set at step 17).

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **P1 NodeCard after crash** | Red background, shakes on click, `status: crashed` |
| **Event Log steps 6–9** | Four consecutive ✗ entries — one dropped PROMISE (crashed recipient) followed by three dropped ACCEPTs (crashed sender) |
| **Acceptor NodeCards after step 9** | All three still show `accepted: —` — P1's ACCEPTs never landed |
| **Event Log steps 10–12** | All three PROMISE labels show `PR(2,P2)` with **no** `→ "value"` suffix — nothing was accepted before P2 entered |
| **P2 NodeCard step 14** | ACCEPT messages appear in queue showing `"B"`, not `"A"` |
| **Consensus panel** | Lights up at step 17 with `"B"` — different from P1's intended `"A"` |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **"Start Proposal"** on P1 | P1 enters phase1 with (1,P1) |
| 1–3 | **Step ×3** | All acceptors promise; `promised` field appears; `accepted` stays `—` |
| 4–5 | **Step ×2** | P1 hits majority, enters phase2; three ACCEPT messages appear in queue |
| — | **Click P1 NodeCard** to crash | P1 turns red and shakes; ACCEPTs are still queued but P1 is now crashed |
| 6 | **Step** | PROMISE from A3 auto-dropped — P1 is crashed recipient (✗ in log) |
| 7–9 | **Step ×3** | Three ACCEPTs auto-dropped — P1 is crashed sender (✗✗✗ in log); acceptors still show `accepted: —` |
| — | **"New Proposal"** on P2 | P2 enters phase1 with (2,P2), `value "B"` |
| 10–12 | **Step ×3 (slow)** | PROMISE labels show plain `PR(2,P2)` — no accepted value; contrast with Value Hijacking demo |
| 13–14 | **Step ×2 (highlight)** | At step 14, P2 hits majority; queue shows `ACCEPT "B"` — P2 chose freely |
| 15–21 | **Step ×7** | P2 completes; consensus lights up with `"B"`; P1 stays crashed |

---

## Optional Extension — Restart P1 After Consensus

After step 21, **click the crashed P1 NodeCard** to restart it.

- P1 `status` returns to `idle`
- P1 `round` stays at 1 (round counter survives crash, per stable-storage rules)
- P1 `currentProposal`, `promisesReceived`, `acceptsReceived` are all cleared

If you then click **"New Proposal"** on P1:
- `introduceProposal` assigns round = `maxRoundInSystem + 1` = 3
- P1 fires PREPAREs for round 3
- Acceptors return PROMISEs carrying `accepted={(2,P2),"B"}`
- P1 is forced to adopt `"B"` — the same value-hijacking safety rule applies
- Consensus stays on `"B"` permanently

This extension demonstrates that once consensus is reached, **any future proposer —
even P1 trying to reclaim its original intent — is compelled to carry the decided
value forward**.

---

## Why This Happens (The Root Cause)

Paxos separates the "right to propose" (Phase 1) from "actually proposing" (Phase 2).
Winning Phase 1 only means that acceptors will not promise to a lower-numbered proposal.
It does not persist across a crash — the proposer still needs to complete Phase 2 by
getting its value accepted by a majority before any other proposer can interfere.

A Phase 1 victory with no Phase 2 follow-through leaves the acceptors in a state
identical to having never received a proposal at all (only `highestPromised` is updated,
never `acceptedProposal`). The next proposer to win Phase 1 with a higher round number
inherits clean slate and can choose freely — exactly as if the crashed proposer had
never existed.
