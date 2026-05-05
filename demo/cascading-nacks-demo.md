# Demo Script: Cascading NACKs (Round Ratcheting)

## What This Demonstrates

P2 starts a proposal first and gets all three acceptors to promise to round `(1,P2)`.
P1 then starts with round `(1,P1)` — the same round number, but `"P1" < "P2"`
lexicographically, so `(1,P1)` is strictly lower. When P1's PREPARE messages arrive,
all three acceptors have already promised to a higher proposal and reject P1 with NACK
responses. Each NACK carries the `highestPromised` field, which tells P1 the exact
barrier it must exceed.

P1 processes each NACK individually, ratcheting its internal round counter upward
with every rejection. After three NACKs, P1's round has climbed from 1 to 4. A
retry via "New Proposal" uses the new high-water mark and assigns round 5 — safely
above everything in the system. P1's second Phase 1 succeeds, all three acceptors
promise cleanly, and P1 reaches consensus with `"A"`.

## Key Concepts Illustrated

- Proposal numbers are **lexicographic tuples** `(round, nodeId)`. Two proposals
  at the same round are ordered by node ID: `"P1" < "P2"`, so `(1,P1) < (1,P2)`.
- A NACK is an acceptor's way of saying: "I've already promised something higher —
  here is what it was." It is an informative rejection, not a silent drop.
- The NACK handler applies `newRound = max(proposer.round, nack.highestPromised.round) + 1`
  for each NACK received. Processing 3 NACKs one at a time escalates P1's round
  counter faster than a single NACK would: 1 → 2 → 3 → 4.
- `introduceProposal` scans the entire system state (all node rounds and message queue
  rounds) for the current maximum and assigns `max + 1`. After NACKs push P1's round
  to 4, the next proposal uses round 5 — guaranteed higher than everything seen.
- A proposer that is NACKed does **not** re-propose the same round. It must run a
  fresh Phase 1 with the new, higher round number.

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

**UI action:** In the **P2 NodeCard**, click **"Start Proposal"**.

> P2 starts first. This is the key: P2 establishes a `highestPromised` barrier across
> all acceptors before P1 ever sends a message.

P2: `phase1`, round = 1, proposal = `(1,P2)`. Three PREPAREs enqueued.

**Queue (3 items):**
```
P2 → A1: PREPARE (1,P2)
P2 → A2: PREPARE (1,P2)
P2 → A3: PREPARE (1,P2)
```

---

## Part 1 — P2 Establishes Round 1 Across All Acceptors (Steps 1–3)

### Step 1 — PREPARE (1,P2) delivered to A1

- A1: `highestPromised` = null → `(1,P2)` is greater → **A1 promises**
- A1 `highestPromised` = `(1,P2)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(1,P2, accepted=null)` → P2

### Step 2 — PREPARE (1,P2) delivered to A2

- Same → **A2 promises**. A2 `highestPromised` = `(1,P2)`

### Step 3 — PREPARE (1,P2) delivered to A3

- Same → **A3 promises**. A3 `highestPromised` = `(1,P2)`

**All three acceptors have promised to P2.**

Acceptor state after step 3:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | **(1,P2)**      | null             |
| A2   | **(1,P2)**      | null             |
| A3   | **(1,P2)**      | null             |

**Queue:**
```
A1 → P2: PROMISE (1,P2) [no accepted value]
A2 → P2: PROMISE (1,P2) [no accepted value]
A3 → P2: PROMISE (1,P2) [no accepted value]
```

> ⚠️ **The barrier is set.** Any incoming PREPARE with a proposal number ≤ `(1,P2)`
> will be rejected with a NACK. `(1,P1)` is exactly this case: same round, but
> `"P1" < "P2"` → `(1,P1) < (1,P2)`.

---

### UI Action — Start P1

In the **P1 NodeCard**, click **"Start Proposal"**.

P1: `phase1`, round = 1, proposal = `(1,P1)`. Three PREPAREs appended to the end of
the queue.

**Queue after starting P1:**
```
A1 → P2: PROMISE (1,P2) [no accepted value]
A2 → P2: PROMISE (1,P2) [no accepted value]
A3 → P2: PROMISE (1,P2) [no accepted value]
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Part 2 — P2 Reaches Phase 2, P1's PREPAREs Queue Up (Steps 4–6)

### Step 4 — PROMISE from A1 delivered to P2

- P2 promises count: **1 of 3** — not majority

### Step 5 — PROMISE from A2 delivered to P2

- P2 promises count: **2 of 3** → **MAJORITY**
- No accepted values → P2 keeps `"B"`
- P2 transitions to `phase2`
- ACCEPT(1,P2,"B") sent to A1 and A2

P2 NodeCard: `status: phase2`

**Queue after step 5:**
```
A3 → P2: PROMISE (1,P2) [stale]
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
P2 → A1: ACCEPT (1,P2) "B"
P2 → A2: ACCEPT (1,P2) "B"
```

### UI Action — Drop P2's ACCEPT Messages

In the **Event Log → Queued** section, find:

- `P2 → A1: A(1,P2) "B"`
- `P2 → A2: A(1,P2) "B"`

Click the **✗** on each one to drop them.

> This prevents P2 from completing Phase 2. The scenario focuses on P1's Phase 1
> rejection. Without this drop, P2 would reach consensus before P1's NACKs are even
> processed — making the NACK story harder to follow.

### Step 6 — Stale PROMISE from A3 → P2: discarded (P2 in phase2)

---

## Part 3 — P1's PREPAREs Hit the NACK Wall (Steps 7–9)

### Step 7 — PREPARE (1,P1) delivered to A1 ← FIRST NACK

- A1: `highestPromised` = `(1,P2)`. Is `(1,P1)` greater than `(1,P2)`?
  - Same round (1 = 1) → compare nodeIds: `"P1"` vs `"P2"` → `"P1" < "P2"` → **(1,P1) is NOT greater**
- A1 sends **NACK** back to P1 carrying `highestPromised = (1,P2)`
- A1 `highestPromised` **stays `(1,P2)`** — no update
- Event Log: `✓ A1 → P1: ✗(1,P1)` — a delivered rejection

> 📌 The Event Log entry shows ✓ (successfully delivered) with content `✗(1,P1)` (a
> rejection). A NACK is not a lost message — it is an informative response telling
> P1 exactly what barrier it must exceed.

### Step 8 — PREPARE (1,P1) delivered to A2 ← SECOND NACK

- A2: `highestPromised` = `(1,P2)`. Same comparison → **(1,P1) is NOT greater**
- A2 sends **NACK** to P1 carrying `highestPromised = (1,P2)`
- A2 `highestPromised` stays `(1,P2)`
- Event Log: `✓ A2 → P1: ✗(1,P1)`

### Step 9 — PREPARE (1,P1) delivered to A3 ← THIRD NACK

- A3: Same → **NACK** to P1 carrying `highestPromised = (1,P2)`
- Event Log: `✓ A3 → P1: ✗(1,P1)`

**All three acceptors rejected P1. No acceptor updated its state for P1.**

**Queue after step 9:**
```
P2 → A1: ACCEPT (1,P2) "B"  [dropped]
P2 → A2: ACCEPT (1,P2) "B"  [dropped]
A1 → P1: NACK (1,P1) [highestPromised: (1,P2)]
A2 → P1: NACK (1,P1) [highestPromised: (1,P2)]
A3 → P1: NACK (1,P1) [highestPromised: (1,P2)]
```

> ✅ **Verify:** Event Log shows three consecutive `✓ A* → P1: ✗(1,P1)` entries.
> P1 NodeCard still shows `status: phase1`, `promises 0/3`. No acceptor updated
> its `highestPromised` — all three carry the same `(1,P2)` as before.

---

## Part 4 — Dropped ACCEPTs Clear, NACKs Ratchet P1's Round (Steps 10–14)

### Step 10 — ACCEPT (1,P2,"B") → A1 [dropped]: no-op

### Step 11 — ACCEPT (1,P2,"B") → A2 [dropped]: no-op

### Step 12 — First NACK delivered to P1

- NACK carries `highestPromised = (1,P2)`, round = 1
- P1: `status` = `phase1`, `round` = 1
- NACK handler: `newRound = max(proposer.round=1, nack.highestPromised.round=1) + 1`
  = `max(1, 1) + 1` = **2**
- **P1.round updates to 2**

P1 NodeCard: `round` field (visible in proposal as `(1,P1)` — `currentProposal` unchanged)

### Step 13 — Second NACK delivered to P1

- P1.round = 2; NACK still carries `highestPromised.round = 1`
- `newRound = max(2, 1) + 1` = **3**
- **P1.round updates to 3**

### Step 14 — Third NACK delivered to P1

- P1.round = 3; same NACK
- `newRound = max(3, 1) + 1` = **4**
- **P1.round updates to 4**

**Queue is now empty.**

> ✅ **Verify:** P1 NodeCard shows `status: phase1`, `round` = 4 (or `proposal (1,P1)`
> for `currentProposal`). Three NACKs, each independently pushing P1's round one step
> higher than the last: 1 → 2 → 3 → 4.
>
> The `currentProposal` field still shows `(1,P1)` — the last proposal P1 actually
> sent. The `round` counter on P1 has moved ahead of that, ready for the retry.

P1 state after step 14:

| Field              | Value          |
|--------------------|----------------|
| `status`           | `phase1`       |
| `currentProposal`  | `(1,P1)` (old) |
| `round`            | **4**          |
| `promisesReceived` | `[]` (0/3)     |

---

## Part 5 — P1 Retries With a Higher Round and Succeeds (Steps 15–24)

### UI Action — P1 Retries

In the **P1 NodeCard**, click **"New Proposal"**.

> "Start Proposal" is disabled (P1 is still in `phase1`, not `idle`). "New Proposal"
> calls `introduceProposal`, which scans the full system for the current max round:
>
> - P1.round = **4** (the highest value anywhere in the system)
> - P2.round = 1, all acceptors `highestPromised` = `(1,P2)` → round 1
>
> `maxRoundInSystem = 4`. New round = **5**.

P1: `phase1`, round = 5, proposal = `(5,P1)`. Three PREPAREs enqueued.

**Queue:**
```
P1 → A1: PREPARE (5,P1)
P1 → A2: PREPARE (5,P1)
P1 → A3: PREPARE (5,P1)
```

---

### Step 15 — PREPARE (5,P1) delivered to A1

- A1: `highestPromised` = `(1,P2)`. Is `(5,P1)` greater? Round 5 > 1 → **yes, decisively**
- **A1 promises.** `highestPromised` = `(5,P1)`, `acceptedProposal` = null
- A1 enqueues `PROMISE(5,P1, accepted=null)` → P1
- Event Log: `✓ A1 → P1: PR(5,P1)` (a plain PROMISE, no `→ "value"` suffix)

### Step 16 — PREPARE (5,P1) delivered to A2

- Same → **A2 promises**. `highestPromised` = `(5,P1)`
- Event Log: `✓ A2 → P1: PR(5,P1)`

### Step 17 — PREPARE (5,P1) delivered to A3

- Same → **A3 promises**. `highestPromised` = `(5,P1)`
- Event Log: `✓ A3 → P1: PR(5,P1)`

Acceptor state after step 17:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | **(5,P1)**      | null             |
| A2   | **(5,P1)**      | null             |
| A3   | **(5,P1)**      | null             |

**Queue:**
```
A1 → P1: PROMISE (5,P1) [no accepted value]
A2 → P1: PROMISE (5,P1) [no accepted value]
A3 → P1: PROMISE (5,P1) [no accepted value]
```

> ✅ **Compare with steps 7–9:** Same acceptors, same proposer, but now all three
> PROMISE instead of NACK. The only difference is the round number: 1 vs 5.
> Round 5 clears the `(1,P2)` barrier with room to spare.

### Step 18 — PROMISE from A1 delivered to P1

- P1 promises count: **1 of 3**

### Step 19 — PROMISE from A2 delivered to P1

- P1 promises count: **2 of 3** → **MAJORITY**
- No promise carries an accepted value → P1 keeps its own value `"A"`
- P1 transitions to `phase2`. ACCEPT(5,P1,"A") → A1 and A2.

P1 NodeCard: `status: phase2`, `promises 2/3`

### Step 20 — Stale PROMISE from A3 → P1: discarded (P1 in phase2)

### Step 21 — ACCEPT (5,P1,"A") delivered to A1

- A1: `isGreaterThanOrEqual((5,P1),(5,P1))` = true → **A1 accepts**
- A1 `acceptedProposal` = `{(5,P1), "A"}`

### Step 22 — ACCEPT (5,P1,"A") delivered to A2

- Same → **A2 accepts**
- A2 `acceptedProposal` = `{(5,P1), "A"}`
- **`checkConsensus`: A1 and A2 both hold `"A"` → CONSENSUS REACHED**

> ✅ **Consensus panel lights up with `"A"`.**

### Step 23 — ACCEPTED from A1 → P1: accepts = 1

### Step 24 — ACCEPTED from A2 → P1: accepts = 2 → **P1 transitions to `done`**

**Queue is empty. Simulation complete.**

---

## Final State

| Node | Status   | round | highestPromised | acceptedProposal    |
|------|----------|-------|-----------------|----------------------|
| P1   | done     | 5     | —               | —                    |
| P2   | phase2   | 1     | —               | —                    |
| A1   | active   | —     | (5,P1)          | **(5,P1) = "A"**     |
| A2   | active   | —     | (5,P1)          | **(5,P1) = "A"**     |
| A3   | active   | —     | (5,P1)          | null                 |

Consensus: `reached = true`, `value = "A"`, `acceptedBy = [A1, A2]`.

P2 is stuck in `phase2`. Its ACCEPTs were dropped and it never reached `done`. Its
original value `"B"` was never accepted by any node.

---

## The Round Ratchet in Detail

| Event | P1.round before | NACK `highestPromised.round` | Calculation | P1.round after |
|---|---|---|---|---|
| NACK from A1 (step 12) | 1 | 1 | max(1,1)+1 | **2** |
| NACK from A2 (step 13) | 2 | 1 | max(2,1)+1 | **3** |
| NACK from A3 (step 14) | 3 | 1 | max(3,1)+1 | **4** |
| `introduceProposal` | — | — | maxSystem(4)+1 | **5** |

Each NACK is processed independently. If all three NACKs reported the same
`highestPromised.round = 1`, the optimal result after seeing all three would be
round = 1 + 1 = 2. Instead, processing them one at a time compounds: 1→2→3→4.
This is conservative but safe — round 5 is guaranteed to be above any barrier in the
system regardless of what else may have happened.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **Event Log steps 1–3** | `✓ P2 → A*: P(1,P2)` — P2's PREPAREs all delivered |
| **All acceptor `promised` fields after step 3** | `(1,P2)` on every NodeCard — the barrier is established |
| **Event Log steps 7–9** | `✓ A* → P1: ✗(1,P1)` — the ✓ means delivered; the ✗(1,P1) means rejection |
| **P1 NodeCard steps 12–14** | `round` field visibly increments: 2 → 3 → 4 after each NACK |
| **Event Log steps 15–17** | `✓ A* → P1: PR(5,P1)` — plain PROMISE, same acceptors, higher round |
| **Acceptor `promised` fields after step 17** | All flip from `(1,P2)` to `(5,P1)` |
| **Consensus panel** | Lights up with `"A"` at step 22 |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **"Start Proposal"** on P2 | P2 starts first — this is the key |
| 1–3 | **Step ×3** | All acceptors commit to `(1,P2)`; all NodeCards show `promised: (1,P2)` |
| — | **"Start Proposal"** on P1 | P1 enters with `(1,P1)` — same round, but lower nodeId |
| 4–5 | **Step ×2** | P2 hits majority, enters phase2; ACCEPTs appear in queue |
| — | **Drop both P2 ACCEPTs** in Event Log | Freeze P2 mid-flight |
| 6 | **Step** | Stale PROMISE cleared |
| 7–9 | **Step ×3 (slow)** | Three `✗(1,P1)` NACKs — the cascade — point out ✓✗ symbol duality |
| 10–11 | **Step ×2** | Dropped ACCEPTs clear |
| 12–14 | **Step ×3 (highlight each)** | P1's round climbs: 2 → 3 → 4; point out the ratchet table |
| — | **"New Proposal"** on P1 | Round jumps to 5 — above the barrier by 4 |
| 15–17 | **Step ×3 (slow)** | Same acceptors now PROMISE — contrast with steps 7–9 |
| 18–24 | **Step ×7** | P1 completes; consensus `"A"` |

---

## Why This Happens (The Root Cause)

Paxos requires that every proposal number used in Phase 1 be **strictly greater** than
any previously seen. The `highestPromised` field on each acceptor enforces this: it is a
monotonically increasing watermark that refuses any PREPARE at or below its current
value.

When a proposer arrives "too late" — after others have already established a higher
watermark — the NACK mechanism gives it the information it needs to leapfrog the
barrier. The proposer does not need a global coordinator or clock; it learns the
current watermark directly from the rejections themselves and self-corrects.

This is why Paxos is decentralized: failures and conflicts are resolved by the
protocol's own messaging, not by external timeout or election logic.
