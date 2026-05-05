# Demo Script: Majority Crash (Quorum Loss / System Halt)

## What This Demonstrates

Two of three acceptors (A2 and A3) are crashed before the simulation begins, leaving
only A1 active. P1 starts a proposal, but A1 is the only acceptor that can respond.
One promise is 1 of 3 — never a majority. P1 is permanently stuck in `phase1`. The
message queue empties after just 4 steps and the system can make no further progress.

Retrying with a higher round number produces the exact same result: A1 promises again
(1 of 3), queue empties, system halts.

This is the hard **availability boundary** of Paxos: below a majority quorum the
protocol halts rather than risk an incorrect decision. It never produces wrong results
— it simply stops until enough nodes are restored.

## Key Concepts Illustrated

- Majority of 3 = **2**. With only 1 active acceptor, the threshold can never be met.
- P1's promise handler only transitions to `phase2` when `promisesReceived.length >= 2`.
  One promise is recorded and then the queue is empty — P1 stays in `phase1` forever.
- ACCEPTs are sent only to acceptors that promised. With only A1 promising,
  only A1 would receive an ACCEPT — but P1 never even gets that far.
- Retrying with a higher round number does not help: the quorum is still missing.
- **Recovery** requires restoring at least one crashed acceptor to get back to
  a 2-of-3 majority. The optional extension at the end shows this.
- Contrast with **Minority Crash**: lose 1 acceptor and the system continues normally.
  The difference between 1 crash and 2 crashes is the difference between progress and
  permanent halt.

## Nodes

| Node | Role     | Proposed Value |
|------|----------|----------------|
| P1   | Proposer | "A"            |
| P2   | Proposer | "B"            |
| A1   | Acceptor | — (active)     |
| A2   | Acceptor | — (crashed)    |
| A3   | Acceptor | — (crashed)    |

Majority = 2 of 3 acceptors. Active acceptors = **1**. Active < majority → **system halts**.

---

## Setup

**UI action:** Click **↺ Reset**.

All nodes return to their initial state.

**UI action:** Click directly on the **A2 NodeCard** to crash it.

A2 shakes and turns red. A2 `status` = `crashed`.

**UI action:** Click directly on the **A3 NodeCard** to crash it.

A3 shakes and turns red. A3 `status` = `crashed`.

> ✅ **Verify before starting:** Two of three acceptor NodeCards are red. One (A1)
> is the only node capable of participating. The Consensus Status panel shows
> "No consensus reached."

| Node | Status      | highestPromised | acceptedProposal |
|------|-------------|-----------------|------------------|
| P1   | idle        | —               | —                |
| P2   | idle        | —               | —                |
| A1   | active      | null            | null             |
| A2   | **crashed** | null            | null             |
| A3   | **crashed** | null            | null             |

**UI action:** In the **P1 NodeCard**, click **"Start Proposal"**.

P1 enters `phase1` with proposal `(1,P1)` and enqueues 3 PREPARE messages — one to
each acceptor, including the two crashed ones.

**Queue (3 items):**
```
P1 → A1: PREPARE (1,P1)
P1 → A2: PREPARE (1,P1)
P1 → A3: PREPARE (1,P1)
```

---

## Attempt 1 — P1 Tries Phase 1 (Steps 1–4)

### Step 1 — PREPARE (1,P1) delivered to A1

- A1: `highestPromised` = null → `(1,P1)` is greater → **A1 promises**
- A1 `highestPromised` = `(1,P1)`
- A1 enqueues `PROMISE(1,P1, accepted=null)` → P1

### Step 2 — PREPARE (1,P1) → A2 [auto-dropped, crashed recipient]

- The engine checks: recipient A2 is `crashed` → **auto-dropped**
- A2 never processes the PREPARE; `highestPromised` stays `null`
- Event Log shows: `✗ P1 → A2: P(1,P1)`

### Step 3 — PREPARE (1,P1) → A3 [auto-dropped, crashed recipient]

- Same → **auto-dropped**
- A3 never processes the PREPARE; `highestPromised` stays `null`
- Event Log shows: `✗ P1 → A3: P(1,P1)`

Acceptor state after step 3:

| Node | Status      | highestPromised | acceptedProposal |
|------|-------------|-----------------|------------------|
| A1   | active      | **(1,P1)**      | null             |
| A2   | **crashed** | null            | null             |
| A3   | **crashed** | null            | null             |

**Queue (only 1 item — A2 and A3 never responded):**
```
A1 → P1: PROMISE (1,P1) [no accepted value]
```

### Step 4 — PROMISE from A1 delivered to P1

- P1 records promise from A1 → count: **1 of 3**
- Engine checks: `newPromises.length >= 2`? → **1 >= 2 is false**
- **No phase2 transition. No ACCEPTs are sent.**
- P1 remains in `phase1` with `promises 1/3`

**Queue is now empty.**

> ⚠️ **System halted.** P1 is stuck in `phase1`. There are no messages left to
> deliver. The Consensus Status panel still reads "No consensus reached."
>
> P1 cannot unilaterally advance — it must wait for more promises. But A2 and A3
> are crashed. No new messages will ever arrive.

P1 NodeCard: `status: phase1`, `promises 1/3`, `accepts 0/3`

---

## Attempt 2 — Retry Confirms the System Is Truly Stuck (Steps 5–8)

> Even with a higher round number, the result is identical — the quorum is still
> missing. **This step is optional but reinforces the point.**

**UI action:** In the **P1 NodeCard**, click **"New Proposal"**.

`introduceProposal` scans the system for the max round (= 1, from A1's
`highestPromised`) and assigns round **2**.

P1: `phase1`, proposal `(2,P1)`. Three PREPAREs enqueued.

**Queue:**
```
P1 → A1: PREPARE (2,P1)
P1 → A2: PREPARE (2,P1)
P1 → A3: PREPARE (2,P1)
```

### Step 5 — PREPARE (2,P1) delivered to A1

- A1: `highestPromised` = `(1,P1)`. Round 2 > 1 → **A1 re-promises**
- A1 `highestPromised` = `(2,P1)`
- A1 enqueues `PROMISE(2,P1, accepted=null)` → P1

### Step 6 — PREPARE (2,P1) → A2 [auto-dropped, crashed]

- Event Log: `✗ P1 → A2: P(2,P1)`

### Step 7 — PREPARE (2,P1) → A3 [auto-dropped, crashed]

- Event Log: `✗ P1 → A3: P(2,P1)`

### Step 8 — PROMISE from A1 delivered to P1

- P1 promises count: **1 of 3**
- `1 >= 2` is still false. **No phase2. No ACCEPTs. Queue empty again.**

> ✅ **Verify:** Exact same outcome as attempt 1. P1's `proposal` now shows `(2,P1)`
> and `promises 1/3` resets and re-fills, but the result is unchanged.
> The system is not "retrying its way out" — the quorum is simply missing.

Acceptor state after step 8:

| Node | Status      | highestPromised | acceptedProposal |
|------|-------------|-----------------|------------------|
| A1   | active      | **(2,P1)**      | null             |
| A2   | **crashed** | null            | null             |
| A3   | **crashed** | null            | null             |

**Consensus:** `reached = false`, `value = null`. Permanently halted.

---

## What to Watch on the UI

| UI element | What you should see |
|---|---|
| **A2 and A3 NodeCards** | Red throughout; `highestPromised` and `accepted` never change from `—` |
| **Event Log steps 2–3 and 6–7** | Two ✗ entries per attempt — both crashed acceptors dropped every time |
| **P1 NodeCard after step 4** | `status: phase1`, `promises 1/3` — never transitions to `phase2` |
| **Queue after step 4** | Empty — no ACCEPTs were ever enqueued |
| **Consensus Status panel** | Never changes from "No consensus reached" |
| **Step button** | Grays out after queue empties — nothing left to deliver |

---

## Step-by-Step Checklist for Demo

| Step(s) | UI action / what to click | What to point out |
|---|---|---|
| Setup | **Reset** | Clean slate |
| Setup | **Click A2 NodeCard** | A2 crashes |
| Setup | **Click A3 NodeCard** | A3 crashes; now 2 of 3 are red |
| Setup | **"Start Proposal"** on P1 | 3 PREPAREs enqueued — system doesn't know 2 recipients are crashed |
| 1 | **Step** | A1 promises — the only healthy acceptor responds |
| 2–3 | **Step ×2** | Both crashed PREPAREs auto-dropped (✗✗ in log); only 1 PROMISE in queue |
| 4 | **Step (highlight)** | P1 gets 1 promise — majority needs 2 — queue goes empty; P1 frozen in phase1 |
| — | **"New Proposal"** on P1 | Show that retrying with round 2 makes no difference |
| 5–8 | **Step ×4** | Same pattern repeats: 1 promise, 2 drops, halt |

---

## Optional Extension — Restore Quorum and Recover

After step 8 (or after step 4 for a shorter demo), **click the crashed A3 NodeCard**
to restart it.

- A3 `status` returns to `active`
- A3 `highestPromised` = null, `acceptedProposal` = null (stable storage preserved,
  nothing was stored before the crash)

Now in the **P1 NodeCard**, click **"New Proposal"**.

`introduceProposal` assigns round **3** (max round in system = 2, from A1's
`highestPromised`).

P1: `phase1`, proposal `(3,P1)`. PREPAREs enqueued.

**Queue:**
```
P1 → A1: PREPARE (3,P1)
P1 → A2: PREPARE (3,P1)   ← A2 still crashed
P1 → A3: PREPARE (3,P1)   ← A3 now active
```

**Recovery Step 1 — PREPARE (3,P1) → A1:** A1 re-promises. PROMISE(3,P1, null)→P1.

**Recovery Step 2 — PREPARE (3,P1) → A2:** Auto-dropped (A2 still crashed).

**Recovery Step 3 — PREPARE (3,P1) → A3:** A3 promises. PROMISE(3,P1, null)→P1.

**Queue:**
```
A1 → P1: PROMISE (3,P1) [no accepted value]
A3 → P1: PROMISE (3,P1) [no accepted value]
```

**Recovery Step 4 — PROMISE from A1 → P1:** promises = 1 of 3.

**Recovery Step 5 — PROMISE from A3 → P1:** promises = **2 of 3 → MAJORITY!**

- No accepted values in promises → P1 keeps `"A"`
- P1 transitions to `phase2`
- ACCEPT(3,P1,"A") sent to A1 and A3 (the two that promised)

**Queue:**
```
P1 → A1: ACCEPT (3,P1) "A"
P1 → A3: ACCEPT (3,P1) "A"
```

**Recovery Step 6 — ACCEPT → A1:** A1 accepts. `acceptedProposal` = `{(3,P1),"A"}`.

**Recovery Step 7 — ACCEPT → A3:** A3 accepts. `acceptedProposal` = `{(3,P1),"A"}`.
**CONSENSUS REACHED with `"A"`.**

**Recovery Steps 8–9 — ACCEPTEDs → P1:** P1 reaches `done`.

> ✅ **The system recovered the moment the quorum was restored.** Paxos did not need
> any special repair procedure — restarting A3 was sufficient. The next round ran
> normally and reached consensus as if the crash had never happened (A2 is still
> crashed but a 2-of-3 majority is sufficient).

---

## Why This Happens (The Root Cause)

Paxos requires a majority quorum for **both** phases:

- **Phase 1:** A proposer needs majority PROMISEs before it may send ACCEPTs.
- **Phase 2:** A proposer needs majority ACCEPTEDs before consensus is declared.

With only 1 of 3 acceptors alive, no majority can form in either phase. The system
does not guess, approximate, or time out — it simply waits. This is a deliberate
safety trade-off: Paxos chooses **consistency over availability** when below quorum.

The general formula: to tolerate **f** simultaneous acceptor failures you need at least
**2f + 1** acceptors.

| Acceptors | Majority needed | Failures tolerated |
|-----------|----------------|-------------------|
| 3         | 2              | 1                  |
| 5         | 3              | 2                  |
| 7         | 4              | 3                  |

In this demo with 3 acceptors, losing 2 (= f + 1 failures) crosses the threshold.
Losing only 1 (the Minority Crash demo) stays safely within tolerance.
