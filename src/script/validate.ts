import type {
  LoadedScript,
  NodeId,
  MessageType,
  ScriptEvent,
  ValidateResult,
} from "./types.ts";

const VALID_NODE_IDS: readonly NodeId[] = ["P1", "P2", "A1", "A2", "A3"] as const;
const VALID_PROPOSER_IDS: readonly string[] = ["P1", "P2"] as const;
const VALID_VERBS: readonly string[] = ["propose", "crash", "restart", "drop"] as const;
const VALID_MESSAGE_TYPES: readonly MessageType[] = [
  "prepare",
  "promise",
  "accept",
  "accepted",
  "nack",
] as const;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isInteger(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x);
}

export function parseAndValidate(text: string): ValidateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  return validate(raw);
}

export function validate(raw: unknown): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["Top-level value must be a JSON object."] };
  }

  // name
  const name = raw.name;
  if (typeof name !== "string" || name.length === 0) {
    errors.push('Field "name" is required and must be a non-empty string.');
  }

  // description (optional)
  let description: string | undefined;
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") {
      errors.push('Field "description" must be a string if present.');
    } else {
      description = raw.description;
    }
  }

  // initial_state (optional)
  let initial_state: { crashed?: NodeId[] } | undefined;
  if (raw.initial_state !== undefined) {
    if (!isObject(raw.initial_state)) {
      errors.push('Field "initial_state" must be an object if present.');
    } else {
      const crashedRaw = raw.initial_state.crashed;
      if (crashedRaw !== undefined) {
        if (!Array.isArray(crashedRaw)) {
          errors.push('Field "initial_state.crashed" must be an array.');
        } else {
          const crashed: NodeId[] = [];
          crashedRaw.forEach((id, i) => {
            if (typeof id !== "string" || !VALID_NODE_IDS.includes(id as NodeId)) {
              errors.push(
                `initial_state.crashed[${i}]: invalid node ID "${String(id)}". ` +
                  `Must be one of ${VALID_NODE_IDS.join(", ")}.`
              );
            } else {
              crashed.push(id as NodeId);
            }
          });
          initial_state = { crashed };
        }
      } else {
        initial_state = {};
      }
    }
  }

  // events
  const eventsRaw = raw.events;
  const events: ScriptEvent[] = [];
  if (!Array.isArray(eventsRaw)) {
    errors.push('Field "events" is required and must be an array.');
  } else {
    eventsRaw.forEach((rawEv, i) => {
      const evErrors = validateEvent(rawEv, i);
      if (evErrors.length > 0) {
        errors.push(...evErrors);
      } else {
        events.push(rawEv as ScriptEvent);
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Stable sort by `at`, preserving file order on ties.
  const sortedEvents = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map((x) => x.e);

  // Load-time warnings (non-fatal).
  const hasPropose = sortedEvents.some((e) => e.do === "propose");
  if (sortedEvents.length > 0 && !hasPropose) {
    warnings.push(
      'Script has no "propose" event — the engine queue will stay empty. ' +
        "Use a propose event to start a Paxos round."
    );
  }

  const script: LoadedScript = {
    name: name as string,
    description,
    initial_state,
    events: sortedEvents,
    nextEventIndex: 0,
  };

  return { ok: true, script, warnings };
}

function validateEvent(raw: unknown, i: number): string[] {
  const errs: string[] = [];
  const prefix = `Event ${i}: `;

  if (!isObject(raw)) {
    return [`${prefix}must be an object.`];
  }

  if (!isInteger(raw.at) || (raw.at as number) < 0) {
    errs.push(`${prefix}"at" must be a non-negative integer.`);
  }

  const verb = raw.do;
  if (typeof verb !== "string" || !VALID_VERBS.includes(verb)) {
    errs.push(
      `${prefix}"do" must be one of ${VALID_VERBS.join("/")}, got ${JSON.stringify(verb)}.`
    );
    // Without a known verb we cannot validate other fields.
    return errs;
  }

  switch (verb) {
    case "propose": {
      if (typeof raw.node !== "string" || !VALID_PROPOSER_IDS.includes(raw.node)) {
        errs.push(
          `${prefix}propose "node" must be P1 or P2, got ${JSON.stringify(raw.node)}.`
        );
      }
      break;
    }
    case "crash":
    case "restart": {
      if (typeof raw.node !== "string" || !VALID_NODE_IDS.includes(raw.node as NodeId)) {
        errs.push(
          `${prefix}${verb} "node" must be one of ${VALID_NODE_IDS.join(", ")}, ` +
            `got ${JSON.stringify(raw.node)}.`
        );
      }
      break;
    }
    case "drop": {
      const hasMatch =
        raw.to !== undefined || raw.from !== undefined || raw.type !== undefined;
      if (!hasMatch) {
        errs.push(`${prefix}drop event requires at least one of "to", "from", "type".`);
      }
      if (raw.to !== undefined) {
        if (typeof raw.to !== "string" || !VALID_NODE_IDS.includes(raw.to as NodeId)) {
          errs.push(
            `${prefix}drop "to" must be one of ${VALID_NODE_IDS.join(", ")}, ` +
              `got ${JSON.stringify(raw.to)}.`
          );
        }
      }
      if (raw.from !== undefined) {
        if (typeof raw.from !== "string" || !VALID_NODE_IDS.includes(raw.from as NodeId)) {
          errs.push(
            `${prefix}drop "from" must be one of ${VALID_NODE_IDS.join(", ")}, ` +
              `got ${JSON.stringify(raw.from)}.`
          );
        }
      }
      if (raw.type !== undefined) {
        if (
          typeof raw.type !== "string" ||
          !VALID_MESSAGE_TYPES.includes(raw.type as MessageType)
        ) {
          errs.push(
            `${prefix}drop "type" must be one of ${VALID_MESSAGE_TYPES.join(", ")}, ` +
              `got ${JSON.stringify(raw.type)}.`
          );
        }
      }
      break;
    }
  }

  return errs;
}
