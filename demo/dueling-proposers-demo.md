# Demo Script: Dueling Proposers (Livelock)

## What This Demonstrates

Two proposers (P1 and P2) repeatedly out-bid each other in Phase 1.
Each time one reaches Phase 2 and queues its ACCEPT messages, the other
fires a new Phase 1 with a higher round number — invalidating all the
pending ACCEPTs. Neither proposer ever completes. Consensus is never reached.

This is the classic Paxos livelock, and the reason real systems layer a
leader-election mechanism (Multi-Paxos, Raft) on top of basic Paxos.

## Key Concepts Illustrated

- Proposal numbers ratchet upward monotonically — acceptors always re-promise
  to the highest round they have seen.
- An acceptor's promise to a higher round silently invalidates any in-flight
  ACCEPTs from a lower round (they will be NACKed if they arrive, or are
  useless if already dropped).
- Phase 2 can be entered and immediately orphaned — entering phase2 does not
  guarantee consensus.
- Without a leader, two live proposers can spin indefinitely.

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

P1 enters `phase1` with proposal `(1, P1)` and enqueues 3 PREPARE messages.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Cycle 1 — P1 Runs Phase 1

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1
- A1 `highestPromised` updates to `(1,P1)`

### Step 2 — PREPARE (1,P1) delivered to A2

- Same logic → **A2 promises**
- A2 `highestPromised` = `(1,P1)`

### Step 3 — PREPARE (1,P1) delivered to A3

- Same logic → **A3 promises**
- A3 `highestPromised` = `(1,P1)`

**All three acceptors have promised to P1.**

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

- P1 records promise → count: **1 of 3** (not majority, no action yet)
- P1 NodeCard shows: `promises 1/3`

### Step 5 — PROMISE from A2 delivered to P1

- P1 records promise → count: **2 of 3** → **MAJORITY REACHED**
- No promise carried an accepted value → P1 keeps its own value `"A"`
- P1 transitions to `phase2`
- P1 enqueues `ACCEPT(1,P1,"A")` to **all three acceptors**

P1 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 5:**
```
A3 → P1: PROMISE (1,P1) [no accepted value]   ← 3rd promise, now stale
P1 → A1: ACCEPT (1,P1) "A"
P1 → A2: ACCEPT (1,P1) "A"
P1 → A3: ACCEPT (1,P1) "A"
```

> ✅ **Verify:** P1 NodeCard shows `status: phase2`. P2 still shows `status: idle`.
> All three acceptors show `promised: (1,P1)` and `accepted: —`.

---

## Interrupt 1 — Block P1 and Inject P2

> **Do NOT press Step yet. Perform both UI actions below first.**

### UI Action 1 — Drop P1's ACCEPT messages

In the **Event Log → Queued** section, find:

- `P1 → A1: A(1,P1) "A"`
- `P1 → A2: A(1,P1) "A"`
- `P1 → A3: A(1,P1) "A"`

Click the **✗** on each one to mark them dropped.

**Queue after dropping:**
```
A3 → P1: PROMISE (1,P1) [stale]
P1 → A1: ACCEPT (1,P1) "A"  [dropped]
P1 → A2: ACCEPT (1,P1) "A"  [dropped]
P1 → A3: ACCEPT (1,P1) "A"  [dropped]
```

### UI Action 2 — Inject P2

In the **P2 NodeCard**, click **"New Proposal"**.

The engine calls `introduceProposal`, scans the system for the current max round
(= 1, from P1's proposal and all acceptors' `highestPromised`), and assigns round **2**.

P2: `phase1`, proposal `(2,P2)`. Three PREPAREs enqueued at the end of the queue.

**Queue:**
```
A3 → P1: PROMISE (1,P1) [stale]
P1 → A1: ACCEPT (1,P1) "A"  [dropped]
P1 → A2: ACCEPT (1,P1) "A"  [dropped]
P1 → A3: ACCEPT (1,P1) "A"  [dropped]
P2 → A1: PREPARE (2,P2)
P2 → A2: PREPARE (2,P2)
P2 → A3: PREPARE (2,P2)
```

---

### Step 6 — Stale PROMISE from A3 delivered to P1

- P1 is in `phase2`, not `phase1` → stale-check fires → **silently discarded**
- No state change to any node

### Step 7 — ACCEPT (1,P1) → A1 [dropped]

- Pre-marked dropped → consumed as a no-op → logged as ✗ in Event Log

### Step 8 — ACCEPT (1,P1) → A2 [dropped]

- No-op.

### Step 9 — ACCEPT (1,P1) → A3 [dropped]

- No-op. P1 never receives `accepted` responses. P1 remains stuck in `phase2`.

---

## Cycle 2 — P2 Runs Phase 1

### Step 10 — PREPARE (2,P2) delivered to A1

- A1: `highestPromised` = `(1,P1)`. Is `(2,P2)` greater? Round 2 > 1 → **yes**
- **A1 re-promises to P2.** `highestPromised` updates to `(2,P2)`, accepted = null
- A1 enqueues `PROMISE(2,P2, accepted=null)` → P2

> ⚠️ **Key moment:** A1 has re-promised to a higher proposal. P1's position is now
> invalidated — if its ACCEPTs had not been dropped, they would arrive at acceptors
> whose `highestPromised` is `(2,P2)` and would be NACKed.

### Step 11 — PREPARE (2,P2) delivered to A2

- Same → A2 re-promises. A2 `highestPromised` = `(2,P2)`.

### Step 12 — PREPARE (2,P2) delivered to A3

- Same → A3 re-promises. A3 `highestPromised` = `(2,P2)`.

**All three acceptors have re-promised to P2.**

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

### Step 13 — PROMISE from A1 delivered to P2

- P2 count: **1 of 3** (not majority)

### Step 14 — PROMISE from A2 delivered to P2

- P2 count: **2 of 3** → **MAJORITY**
- No accepted values in any promise → P2 keeps `"B"`
- P2 transitions to `phase2`, enqueues `ACCEPT(2,P2,"B")` × 3

P2 NodeCard: `status: phase2`, `promises 2/3`, `accepts 0/3`

**Queue after step 14:**
```
A3 → P2: PROMISE (2,P2) [stale]
P2 → A1: ACCEPT (2,P2) "B"
P2 → A2: ACCEPT (2,P2) "B"
P2 → A3: ACCEPT (2,P2) "B"
```

> ✅ **Verify:** Both P1 and P2 are now in `phase2`. No acceptor has an `accepted`
> value. Consensus status still reads "No consensus reached."

---

## Interrupt 2 — Block P2 and Re-inject P1

> **Do NOT press Step yet. Perform both UI actions below first.**

### UI Action 1 — Drop P2's ACCEPT messages

In the **Event Log → Queued** section, find:

- `P2 → A1: A(2,P2) "B"`
- `P2 → A2: A(2,P2) "B"`
- `P2 → A3: A(2,P2) "B"`

Click ✗ on each to drop them.

### UI Action 2 — Re-inject P1

In the **P1 NodeCard**, click **"New Proposal"**.

> Note: P1 is still in `phase2` from cycle 1. The "Start Proposal" button is
> disabled. Use "New Proposal" — it calls `introduceProposal`, which resets P1's
> phase tracking and forces a round higher than anything in the system.

Max round = 2 → new round = **3**.

P1: `phase1`, proposal `(3,P1)`. PREPARE(3,P1) × 3 enqueued.

---

### Step 15 — Stale PROMISE from A3 → P2: discarded (P2 in phase2)

### Steps 16–18 — Three dropped ACCEPTs: no-op

### Steps 19–21 — PREPARE (3,P1) delivered to A1, A2, A3

- Each acceptor: `highestPromised` = `(2,P2)`. Round 3 > 2 → **all re-promise to P1**
- All `highestPromised` update to `(3,P1)`

Acceptor state after step 21:

| Node | highestPromised | acceptedProposal |
|------|-----------------|------------------|
| A1   | **(3,P1)**      | null             |
| A2   | **(3,P1)**      | null             |
| A3   | **(3,P1)**      | null             |

**The system is now in the exact same shape as after step 3. The cycle repeats.**

---

## Repeating Cycle Summary

Each full cycle is **14 steps**:

| Steps | What happens |
|-------|--------------|
| 1–3   | 3× PREPARE delivered → all acceptors promise |
| 4–5   | 2× PROMISE → proposer reaches majority, enters `phase2`, 3 ACCEPTs enqueued |
| —     | **Manual:** drop 3 ACCEPTs, click "New Proposal" on the other proposer |
| 6     | 3rd stale PROMISE → discarded |
| 7–9   | 3× dropped ACCEPT → no-op |
| 10–12 | 3× PREPARE from other proposer → all acceptors re-promise |
| 13–14 | 2× PROMISE → other proposer reaches majority, enters `phase2`, 3 ACCEPTs enqueued |
| —     | **Manual:** drop 3 ACCEPTs, click "New Proposal" on the first proposer |

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **P1 `proposal`** | Climbs each cycle: `(1,P1)` → `(3,P1)` → `(5,P1)` ... |
| **P2 `proposal`** | Climbs each cycle: `(2,P2)` → `(4,P2)` → `(6,P2)` ... |
| **Any acceptor `promised`** | Ratchets up every cycle; never resets |
| **Any acceptor `accepted`** | Stays `—` forever — no ACCEPT ever completes |
| **P1 / P2 `status`** | Ping-pongs between `phase1` and `phase2`; never reaches `done` |
| **Consensus Status panel** | Permanently "No consensus reached" |
| **Event Log** | Repeating stripe of PROMISE ✓ rows, then ACCEPT ✗ rows |
| **Canvas** | Back-and-forth arrows between both proposers and all acceptors; X'd-out ACCEPTs |

---

## Manual UI Action Checklist

| After which step | Action |
|---|---|
| Before step 1 | Click **"Start Proposal"** on P1 NodeCard |
| After step 5 | Drop all 3 `ACCEPT(1,P1)` in Event Log; click **"New Proposal"** on P2 |
| After step 14 | Drop all 3 `ACCEPT(2,P2)` in Event Log; click **"New Proposal"** on P1 |
| After step 23 | Drop all 3 `ACCEPT(3,P1)` in Event Log; click **"New Proposal"** on P2 |
| After step 32 | Drop all 3 `ACCEPT(4,P2)` in Event Log; click **"New Proposal"** on P1 |
| ...            | Repeat — the system never terminates on its own |

---

## Why This Happens (The Root Cause)

Paxos only guarantees **safety** (nothing wrong is decided) — not **liveness**
(something is eventually decided). The protocol gives no mechanism to prevent two
proposers from indefinitely preempting each other.

The fix in real systems is to elect a single distinguished leader and suppress all
other proposers. Multi-Paxos, Raft, and ZAB all solve liveness this way.
