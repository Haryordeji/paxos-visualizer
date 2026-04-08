**April 7**
***Entry 3***

src/engine/faults.ts

- `dropMessage(state, id)` — sets status: `"dropped"` on the target queued message; `step()` then skips delivery  
- `crashNode(state, nodeId)` — sets status: `"crashed"`, preserves all other fields (stable storage intact)  
- `restartNode(state, nodeId)` — acceptors → `"active"`; proposers → `"idle"` with `currentProposal`, `promisesReceived`, `acceptsReceived` cleared (round counter kept)  
- `introduceProposal(state, proposerId, value)` — scans all nodes and queued messages to find `maxRound`, sets new proposal to `maxRound + 1`, enqueues 3 PREPAREs  

faults.test.ts (32 tests across 7 suites)

| Suite                              | Key assertion                                                                 |
|-----------------------------------|------------------------------------------------------------------------------|
| `dropMessage`                     | message marked dropped, `step` skips it without updating acceptor state      |
| `crashNode`                       | stable storage survives; messages to crashed node are silently dropped       |
| `restartNode`                     | acceptor resumes active; proposer clears in-progress tracking, keeps round   |
| **Crash recovery**                | consensus on A1+A2 with A3 crashed; A3's state stays null                    |
| **Message drop**                  | 2 of 3 dropped → P1 stuck in phase1, no consensus; 1 of 3 dropped → consensus still reached |
| **Competing proposals**           | P2's PREPAREs update `highestPromised` before P1's ACCEPTs arrive → NACKs to P1; P2 wins on `"B"` |
| **Value selection via `introduceProposal`** | P2 adopts prior accepted `"X"` not own `"B"`; picks highest when promises carry different values |

**April 7**
***Entry 2***

Files created:                                                                      
  - src/engine/types.ts — all types from spec Section 4 (ProposalNumber,              
  AcceptedProposal, PromiseInfo, ProposerState, AcceptorState, NodeState, Message,    
  MessageStatus, SimulationState)                                                 
  - src/engine/proposalNumber.ts — compareProposalNumbers(), isGreaterThan(),         
  isGreaterThanOrEqual()                                                              
  - src/engine/__tests__/proposalNumber.test.ts — 9 tests covering ordering,          
  tiebreaking, and the full (1,P1) < (1,P2) < (2,P1) ordering from the spec 
  - src/engine/simulation.ts, src/engine/faults.ts — stubs for Steps 2 & 3            
  - src/engine/__tests__/simulation.test.ts, src/engine/__tests__/faults.test.ts —
  placeholder test files                                                              
                                                                                      
  Directory structure created:                                                        
  src/components/{NodePanel,Canvas,InfoPanel,ControlBar}/, src/state/, src/hooks/     
                                                            
  Config changes: added test + test:watch scripts to package.json, configured vitest  
  in vite.config.ts. 


**April 7**
***Entry 1***

src/engine/simulation.ts:                                                           
  - initializeState() — 5 nodes (P1/A, P2/B, A1/A2/A3), empty queues, no consensus
  - startProposal(state, proposerId) — increments round, sets phase1, enqueues 3      
  PREPAREs                                                                      
  - step(state) — dequeues one message, routes by type:                               
    - PREPARE → PROMISE (if n > highestPromised) or NACK    
    - PROMISE → collect; on majority (≥2): apply value selection rule (P2b),          
  transition to phase2, enqueue ACCEPTs                                               
    - NACK → bump round above the nack's highestPromised (performance opt)            
    - ACCEPT → ACCEPTED (if n ≥ highestPromised) or NACK                              
    - ACCEPTED → count; on majority → status = "done"                                 
    - Crashed recipients and pre-dropped messages are logged without processing       
  - checkConsensus() — scans acceptors after every step; ≥2 with matching value →     
  consensus reached                                                                   
  - stepAll() — test helper that drains the queue                                     
                                                                                      
  Tests (24 tests across 8 suites): init state, startProposal, happy path end-to-end, 
  phase 1 majority logic, phase 2 majority logic, value selection rule (including the 
  manual-state P2b test with two different accepted values), empty-queue no-op, and
  immutability.