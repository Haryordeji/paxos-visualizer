**April 8**
***Entry 5***

Step 4 (canvas): Replaced React-rendered SVG children with proper D3 ownership in `SimulationCanvas`.

- `src/components/Canvas/SimulationCanvas.tsx` — React renders only `<div ref={containerRef}><svg ref={svgRef} /></div>`; a `useEffect` selects the SVG via ref and uses D3 to draw all content
- D3 draws: evenly-spaced vertical lane lines (dashed), circular label badges with node ID and role sub-label, red column overlay for crashed nodes
- `ResizeObserver` on the container triggers a full `svg.selectAll("*").remove()` + redraw, keeping lanes correct on resize
- Effect dependency on `state.sim.nodes` so the crash overlay updates immediately when a node is crashed/restarted
- Removed `.canvas-placeholder` from CSS (D3 is now the content)

Verified: `tsc -b` clean, `npm run build` clean, 65/65 tests pass.

---

**April 8**
***Entry 4***

Step 4: React UI shell with useReducer state management. No animation yet.

Files created:
- `src/state/reducer.ts` — `AppState`, all 9 `Action` types, `reducer()` delegating to pure engine functions
- `src/state/context.tsx` — `SimProvider` / `useSimulation()` context hook
- `src/components/App.tsx` — root component, wraps tree in `SimProvider`
- `src/components/Header.tsx` — title + live step counter badge
- `src/components/NodePanel/NodePanel.tsx` + `NodeCard.tsx` — displays full internal node state; "Start Proposal" button on proposers (enabled when idle/done); crashed/consensus CSS classes
- `src/components/Canvas/SimulationCanvas.tsx` — SVG placeholder with static lane lines; `svgRef` ready for D3 in Step 5
- `src/components/InfoPanel/{InfoPanel, ConsensusStatus, EventLog, ProtocolExplainer}.tsx` — consensus banner, scrollable message log (delivered + queued), per-step human-readable explanation
- `src/components/ControlBar/{ControlBar, FaultControls}.tsx` — Step, Auto-play (setInterval), Speed slider, Reset; fault controls stubbed for Step 7

Config:
- Extracted `vitest.config.ts` separate from `vite.config.ts` to resolve Vite 8/vitest rolldown vs rollup type conflict
- Rewrote `src/index.css` with dark monospace theme and CSS Grid layout (header / main 3-col / controlbar)
- Updated `src/main.tsx` to import `App` from `components/App.tsx`

Verified: `tsc -b` clean, 65/65 tests pass, `npm run build` succeeds.

---

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