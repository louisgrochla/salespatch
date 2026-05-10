import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { InMemoryWorkingMemory } from "../runtime/workingMemory.js";

describe("InMemoryWorkingMemory", () => {
  it("round-trips shared values", () => {
    const wm = new InMemoryWorkingMemory("run-1");
    wm.set("instagram_followers", 5400);
    wm.set("hero_image_count", 12);
    assert.equal(wm.get<number>("instagram_followers"), 5400);
    assert.equal(wm.get<number>("hero_image_count"), 12);
    assert.equal(wm.get("missing"), undefined);
  });

  it("agent-scoped values do not collide with shared", () => {
    const wm = new InMemoryWorkingMemory("run-2");
    wm.set("note", "shared");
    wm.setForAgent("scout", "note", "scout-only");
    wm.setForAgent("composer", "note", "composer-only");
    assert.equal(wm.get<string>("note"), "shared");
    assert.equal(wm.getFromAgent("scout", "note"), "scout-only");
    assert.equal(wm.getFromAgent("composer", "note"), "composer-only");
    assert.equal(wm.getFromAgent("missing", "note"), undefined);
  });

  it("addNote / getNotes preserves chronological order with author", () => {
    const wm = new InMemoryWorkingMemory("run-3");
    wm.addNote("strong food photography", "lead-profiler");
    wm.addNote("trust-blue palette suits this brand", "brand-analyser");
    const notes = wm.getNotes();
    assert.equal(notes.length, 2);
    assert.equal(notes[0].note, "strong food photography");
    assert.equal(notes[0].author, "lead-profiler");
    assert.equal(notes[1].author, "brand-analyser");
    assert.ok(notes[0].timestamp <= notes[1].timestamp);
  });

  it("snapshot serialises everything as plain JSON", () => {
    const wm = new InMemoryWorkingMemory("run-4");
    wm.set("k", 1);
    wm.setForAgent("a", "k", 2);
    wm.addNote("n", "x");
    const snap = wm.snapshot();
    assert.deepEqual(snap.shared, { k: 1 });
    assert.deepEqual(snap.agentScoped, { "a/k": 2 });
    const notes = snap.notes as Array<{ note: string }>;
    assert.equal(notes.length, 1);
    // snapshot should be JSON-roundtrippable
    const round = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(round, snap);
  });

  it("static empty() builds a usable instance", () => {
    const wm = InMemoryWorkingMemory.empty("test");
    wm.set("x", 1);
    assert.equal(wm.runId, "test");
    assert.equal(wm.get("x"), 1);
  });
});
