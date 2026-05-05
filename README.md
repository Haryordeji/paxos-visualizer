# Paxos Visualizer

Interactive web visualizer for the Paxos consensus protocol. Step through Prepare/Promise/Accept/Accepted phases across 2 proposers and 3 acceptors, drop messages, crash nodes, and watch consensus emerge.

## Stack

React + TypeScript (Vite), D3 for SVG message animation, Framer Motion for UI.

## Run

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — dev server with HMR
- `npm run build` — type-check + production build
- `npm run test` — Vitest
- `npm run lint` — ESLint

## Controls

- **Step** — deliver one queued message. **Auto-play** runs steps on a timer; **Speed** sets the interval.
- **Reset** — back to initial state.
- Click a **node** to crash/restart it. Acceptor stable storage survives a crash.
- Click a **queued message** (an arrow on the canvas) to drop it.
- **Presets** — one-click scenarios: Happy Path, Competing Proposals, Crash Recovery, Message Loss.

## Scripted scenarios (JSON)

Load a `.json` script via **Load script…** to drive the simulation through a timed sequence of events.

```jsonc
{
  "name": "demo",
  "description": "shown in the banner",
  "initial_state": { "crashed": ["A3"] },
  "events": [
    { "at": 0, "do": "propose", "node": "P1" },
    { "at": 5, "do": "crash",   "node": "A2" },
    { "at": 8, "do": "restart", "node": "A2" },
    { "at": 9, "do": "drop",    "to": "A1", "type": "promise" }
  ]
}
```

`at` is the engine's step counter. Verbs: `propose` (P1/P2), `crash`, `restart`, `drop` (matches next queued message by `to` / `from` / `type`). Scripts are validated at load — see `scenarios/README.md` for full schema, examples, and edge cases.

## Layout

- `src/engine/` — simulation engine
- `src/components/` — React UI
- `src/state/`, `src/hooks/` — app state and React glue
- `scenarios/` — example JSON scripts
- `spec.md` — protocol + implementation spec

---

Designed and built by Johnny Ramirez and Ayo Olusanya. COS 583. Spring 2026

Acknowledgements: Claude Code was used for some implementation tasks after we worked through the design decisions ourselves.
Also used the Claude Web App for coming up with interesting Paxos scenerios to test various invariants as seen under `scenarios/`
