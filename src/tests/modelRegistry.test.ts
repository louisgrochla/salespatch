import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ModelRegistry } from "../runtime/modelRegistry.js";

describe("ModelRegistry", () => {
  let tmpDir: string;
  let registry: ModelRegistry;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "model-registry-"));
    registry = new ModelRegistry(path.join(tmpDir, "test.sqlite"));
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("seeds a default heuristic critic on first construction", () => {
    const list = registry.list({ kind: "critic" });
    assert.ok(list.length >= 1);
    const active = registry.getActive("critic");
    assert.ok(active);
    assert.equal(active.source, "heuristic");
  });

  it("register with activate=true deactivates the previous active model", () => {
    const before = registry.getActive("critic");
    assert.ok(before);

    const after = registry.register({
      kind: "critic",
      version: "lora-2026-09",
      source: "lora",
      weights_path: "/var/models/critic-lora-2026-09.safetensors",
      activate: true,
    });
    assert.equal(after.active, true);

    // Old default no longer active
    const refreshed = registry.list({ kind: "critic" }).find((m) => m.id === before.id);
    assert.equal(refreshed?.active, false);
    const newActive = registry.getActive("critic");
    assert.equal(newActive?.id, after.id);
  });

  it("getActive prefers agent-specific over global", () => {
    registry.register({
      kind: "critic",
      version: "global-llm",
      source: "llm",
      activate: true,
    });
    const specific = registry.register({
      kind: "critic",
      agent_id: "site-composer-agent",
      version: "site-llm-v2",
      source: "llm",
      activate: true,
    });
    const composerActive = registry.getActive("critic", "site-composer-agent");
    assert.equal(composerActive?.id, specific.id);
    // A different agent gets the global one
    const otherActive = registry.getActive("critic", "lead-scout-agent");
    assert.equal(otherActive?.version, "global-llm");
  });

  it("swap flips active flag for the slot", () => {
    const a = registry.register({
      kind: "critic",
      version: "v-a",
      source: "heuristic",
      activate: true,
    });
    const b = registry.register({
      kind: "critic",
      version: "v-b",
      source: "llm",
    });
    assert.equal(a.active, true);
    assert.equal(b.active, false);

    registry.swap(b.id);
    const aRefreshed = registry.list({ kind: "critic" }).find((m) => m.id === a.id);
    const bRefreshed = registry.list({ kind: "critic" }).find((m) => m.id === b.id);
    assert.equal(aRefreshed?.active, false);
    assert.equal(bRefreshed?.active, true);
    assert.equal(registry.getActive("critic")?.id, b.id);
  });

  it("swap with unknown id returns undefined and changes nothing", () => {
    const before = registry.list();
    const result = registry.swap("not-a-real-id");
    assert.equal(result, undefined);
    const after = registry.list();
    assert.deepEqual(
      before.map((m) => `${m.id}:${m.active}`),
      after.map((m) => `${m.id}:${m.active}`),
    );
  });
});
