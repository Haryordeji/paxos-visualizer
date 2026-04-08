# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build
```

Tests use Vitest (not yet configured — add `vitest` to devDependencies and a `test` script when implementing):
```bash
npm run test       # Run all tests
npm run test -- simulation.test.ts  # Run a single test file
```

# Paxos Consensus Protocol Visualizer

## Project Overview
Interactive web visualizer for the Paxos consensus protocol. 
Full spec is in SPEC.md — read it before implementing anything.

## Tech Stack
- React + TypeScript (Vite)
- D3.js for SVG message arrow animation
- Framer Motion for React UI element animation
- Vitest for testing

## Architecture Rules
- The simulation engine (src/engine/) is PURE TYPESCRIPT. No React imports, no DOM access. 
  All functions are pure: state in, new state out.
- React UI layer (src/components/) reads engine state but never mutates it directly.
- D3 owns SVG elements inside the canvas ref. React does NOT render SVG children.
- Framer Motion owns all React component animations. Do not use D3 for React elements.

## Key Implementation Details
- Proposal numbers are (round, nodeId) tuples, compared lexicographically.
- 5 nodes: 2 proposers (P1, P2), 3 acceptors (A1, A2, A3).
- Majority = 2 of 3 acceptors.
- Simulation advances one discrete step at a time (one message delivered per step).
- Acceptor state (highestPromised, acceptedProposal) survives crash/restart.

## Testing
- Run tests: `npx vitest run`
- Always run tests after implementing engine changes.
- Engine tests are in src/engine/__tests__/

## Build Order
Follow SPEC.md Section 10 step by step. Do not skip ahead.
Complete and test each step before starting the next.