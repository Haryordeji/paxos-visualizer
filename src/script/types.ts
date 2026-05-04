import type { Message } from "../engine/types.ts";

export type NodeId = "P1" | "P2" | "A1" | "A2" | "A3";
export type ProposerNodeId = "P1" | "P2";
export type MessageType = Message["type"];

export type ScriptEvent =
  | { at: number; do: "propose"; node: ProposerNodeId }
  | { at: number; do: "crash"; node: NodeId }
  | { at: number; do: "restart"; node: NodeId }
  | { at: number; do: "drop"; to?: NodeId; from?: NodeId; type?: MessageType };

export interface InitialState {
  crashed?: NodeId[];
}

export interface LoadedScript {
  name: string;
  description?: string;
  initial_state?: InitialState;
  events: ScriptEvent[];
  nextEventIndex: number;
}

export type ScriptOutcome = "applied" | { warning: string };

export type ScriptLogEntry =
  | {
      kind: "event";
      firedAtStep: number;
      precedingDeliveredCount: number;
      event: ScriptEvent;
      outcome: ScriptOutcome;
    }
  | {
      kind: "system";
      firedAtStep: number;
      precedingDeliveredCount: number;
      warning: string;
    };

export type ValidateResult =
  | { ok: true; script: LoadedScript; warnings: string[] }
  | { ok: false; errors: string[] };
