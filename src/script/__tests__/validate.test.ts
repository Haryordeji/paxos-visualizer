import { describe, it, expect } from "vitest";
import { parseAndValidate, validate } from "../validate.ts";

describe("parseAndValidate — JSON parsing", () => {
  it("rejects malformed JSON with a single error", () => {
    const r = parseAndValidate("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(/Invalid JSON/);
    }
  });

  it("accepts a well-formed minimal script", () => {
    const r = parseAndValidate(
      JSON.stringify({ name: "T", events: [] })
    );
    expect(r.ok).toBe(true);
  });
});

describe("validate — top-level shape", () => {
  it("rejects non-object top-level", () => {
    const r = validate([1, 2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/JSON object/);
  });

  it("rejects missing name", () => {
    const r = validate({ events: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /name/.test(e))).toBe(true);
  });

  it("rejects empty-string name", () => {
    const r = validate({ name: "", events: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects non-string description", () => {
    const r = validate({ name: "T", description: 5, events: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects events not being an array", () => {
    const r = validate({ name: "T", events: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /events/.test(e))).toBe(true);
  });

  it("allows events to be an empty array", () => {
    const r = validate({ name: "T", events: [] });
    expect(r.ok).toBe(true);
  });
});

describe("validate — initial_state", () => {
  it("accepts valid crashed list", () => {
    const r = validate({
      name: "T",
      initial_state: { crashed: ["A1", "A3"] },
      events: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.initial_state?.crashed).toEqual(["A1", "A3"]);
  });

  it("rejects unknown node IDs in crashed list", () => {
    const r = validate({
      name: "T",
      initial_state: { crashed: ["A1", "X9"] },
      events: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /X9/.test(e))).toBe(true);
  });

  it("rejects non-array crashed", () => {
    const r = validate({
      name: "T",
      initial_state: { crashed: "A1" },
      events: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-object initial_state", () => {
    const r = validate({ name: "T", initial_state: "x", events: [] });
    expect(r.ok).toBe(false);
  });
});

describe("validate — event verbs", () => {
  it("accepts all four valid verbs", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "propose", node: "P1" },
        { at: 1, do: "crash", node: "A1" },
        { at: 2, do: "restart", node: "A1" },
        { at: 3, do: "drop", to: "A2" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown verb with index in the error", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "propose", node: "P1" },
        { at: 1, do: "skip" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /Event 1/.test(e) && /skip/.test(e))).toBe(true);
    }
  });

  it("rejects negative `at`", () => {
    const r = validate({
      name: "T",
      events: [{ at: -1, do: "propose", node: "P1" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer `at`", () => {
    const r = validate({
      name: "T",
      events: [{ at: 2.5, do: "propose", node: "P1" }],
    });
    expect(r.ok).toBe(false);
  });
});

describe("validate — propose-specific rules", () => {
  it("rejects propose on A1", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "propose", node: "A1" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /P1 or P2/.test(e))).toBe(true);
  });

  it("accepts propose on P1 and P2", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "propose", node: "P1" },
        { at: 1, do: "propose", node: "P2" },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe("validate — crash/restart node IDs", () => {
  it("rejects crash on unknown node", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "crash", node: "Z9" }],
    });
    expect(r.ok).toBe(false);
  });

  it("accepts crash on every valid node", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "crash", node: "P1" },
        { at: 1, do: "crash", node: "P2" },
        { at: 2, do: "crash", node: "A1" },
        { at: 3, do: "crash", node: "A2" },
        { at: 4, do: "crash", node: "A3" },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe("validate — drop event", () => {
  it("rejects drop with no match fields", () => {
    const r = validate({ name: "T", events: [{ at: 0, do: "drop" }] });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => /at least one/.test(e))).toBe(true);
  });

  it("accepts drop with `to` only", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "drop", to: "A1" }],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts drop with `from` only", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "drop", from: "P1" }],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts drop with `type` only", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "drop", type: "promise" }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects drop with unknown message type", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "drop", type: "ping" }],
    });
    expect(r.ok).toBe(false);
  });
});

describe("validate — multiple errors collected", () => {
  it("collects errors from multiple events", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "propose", node: "A1" },     // bad node for propose
        { at: -1, do: "crash", node: "A1" },       // negative at
        { at: 5, do: "skip" },                     // bad verb
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("validate — sorting", () => {
  it("sorts events by `at` ascending", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 5, do: "crash", node: "A1" },
        { at: 0, do: "propose", node: "P1" },
        { at: 3, do: "drop", to: "A2" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ats = r.script.events.map((e) => e.at);
      expect(ats).toEqual([0, 3, 5]);
    }
  });

  it("preserves file order on ties (stable sort)", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 5, do: "crash", node: "A1" },
        { at: 5, do: "crash", node: "A2" },
        { at: 5, do: "crash", node: "A3" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const nodes = r.script.events.map((e) => (e as { node: string }).node);
      expect(nodes).toEqual(["A1", "A2", "A3"]);
    }
  });
});

describe("validate — load-time warnings", () => {
  it("warns when a non-empty script has no propose event", () => {
    const r = validate({
      name: "T",
      events: [
        { at: 0, do: "crash", node: "A1" },
        { at: 1, do: "drop", to: "A2" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.some((w) => /no "propose"/.test(w))).toBe(true);
    }
  });

  it("does not warn for an empty events array", () => {
    const r = validate({ name: "T", events: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });

  it("does not warn when at least one propose exists", () => {
    const r = validate({
      name: "T",
      events: [{ at: 0, do: "propose", node: "P1" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });
});
