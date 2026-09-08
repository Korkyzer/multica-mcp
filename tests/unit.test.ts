import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  multicaDeleteAutopilotSchema,
  multicaGetAutopilotSchema,
  multicaTriggerAutopilotSchema,
  multicaUpdateAutopilotSchema,
} from "../src/lib/autopilot-input-schemas.ts";
import { resolveIssueId } from "../src/lib/issues.ts";

import { TtlCache } from "../src/lib/cache.ts";
import {
  buildAttachmentDownloadArgs,
  buildAgentCreateArgs,
  buildAgentUpdateArgs,
  buildAutopilotTriggerAddArgs,
  buildAutopilotTriggerDeleteArgs,
  buildAutopilotTriggerUpdateArgs,
  buildIssueRunMessagesArgs,
} from "../src/lib/cli-arg-builders.ts";
import { parseAttachmentDownloadPath } from "../src/lib/attachment-download.ts";
import { closestMatch, levenshtein } from "../src/lib/fuzzy.ts";
import { extractModelHint } from "../src/lib/model-hint.ts";

test("TtlCache: get returns stored value within TTL", () => {
  const cache = new TtlCache<number>(1_000);
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);
});

test("TtlCache: entries expire after TTL", async () => {
  const cache = new TtlCache<number>(10);
  cache.set("a", 1);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(cache.get("a"), undefined);
});

test("TtlCache: invalidate() clears all", () => {
  const cache = new TtlCache<number>(1_000);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.invalidate();
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
});

test("TtlCache: invalidate(key) clears only that key", () => {
  const cache = new TtlCache<number>(1_000);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.invalidate("a");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
});

test("levenshtein: identical strings yield 0", () => {
  assert.equal(levenshtein("hello", "hello"), 0);
});

test("levenshtein: single substitution yields 1", () => {
  assert.equal(levenshtein("hello", "hallo"), 1);
});

test("levenshtein: case-insensitive", () => {
  assert.equal(levenshtein("Hello", "hello"), 0);
});

test("closestMatch: finds nearest by threshold", () => {
  assert.equal(
    closestMatch("claude-sonet", ["claude-sonnet", "claude-opus"]),
    "claude-sonnet",
  );
});

test("closestMatch: returns undefined when nothing is close enough", () => {
  assert.equal(
    closestMatch("zzz", ["claude-sonnet", "claude-opus"]),
    undefined,
  );
});

test("closestMatch: handles empty input", () => {
  assert.equal(closestMatch("", ["claude-sonnet"]), undefined);
  assert.equal(closestMatch("foo", []), undefined);
});

test("extractModelHint: returns default for empty args", () => {
  assert.equal(extractModelHint([]), "default");
});

test("extractModelHint: reads --model flag", () => {
  assert.equal(extractModelHint(["--model", "claude-opus-4-7"]), "claude-opus-4-7");
});

test("extractModelHint: reads -m flag", () => {
  assert.equal(extractModelHint(["-m", "gpt-5"]), "gpt-5");
});

test("extractModelHint: parses codex -c model= syntax", () => {
  assert.equal(
    extractModelHint(["-c", "model=\"gpt-5\""]),
    "gpt-5",
  );
});

test("extractModelHint: falls back to default when not found", () => {
  assert.equal(extractModelHint(["--foo", "bar"]), "default");
});

test("buildAgentCreateArgs: matches the current Multica CLI contract", () => {
  assert.deepEqual(
    buildAgentCreateArgs({
      name: "reviewer",
      runtime_id: "runtime-123",
      description: "Reviews pull requests.",
      instructions: "Stay concise.",
      visibility: "workspace",
      max_concurrent_tasks: 2,
      custom_args: ["--model", "gpt-5"],
      runtime_config: { region: "eu-west-1" },
    }),
    [
      "agent",
      "create",
      "--name",
      "reviewer",
      "--runtime-id",
      "runtime-123",
      "--description",
      "Reviews pull requests.",
      "--instructions",
      "Stay concise.",
      "--visibility",
      "workspace",
      "--max-concurrent-tasks",
      "2",
      "--custom-args",
      "[\"--model\",\"gpt-5\"]",
      "--runtime-config",
      "{\"region\":\"eu-west-1\"}",
    ],
  );
});

test("buildAgentUpdateArgs: serializes updated fields with CLI flag names", () => {
  assert.deepEqual(
    buildAgentUpdateArgs({
      agent_id: "agent-123",
      description: "Updated.",
      runtime_id: "runtime-456",
      status: "paused",
      custom_args: ["--model", "o3"],
    }),
    [
      "agent",
      "update",
      "agent-123",
      "--description",
      "Updated.",
      "--runtime-id",
      "runtime-456",
      "--status",
      "paused",
      "--custom-args",
      "[\"--model\",\"o3\"]",
    ],
  );
});

test("buildAgentUpdateArgs: rejects empty updates", () => {
  assert.throws(
    () => buildAgentUpdateArgs({ agent_id: "agent-123" }),
    /No fields provided to update/,
  );
});

test("buildAutopilotTriggerAddArgs: uses trigger-add subcommand", () => {
  assert.deepEqual(
    buildAutopilotTriggerAddArgs({
      autopilot_id: "auto-123",
      cron: "0 9 * * *",
      label: "Daily",
      timezone: "Europe/Paris",
    }),
    [
      "autopilot",
      "trigger-add",
      "auto-123",
      "--cron",
      "0 9 * * *",
      "--label",
      "Daily",
      "--timezone",
      "Europe/Paris",
    ],
  );
});

test("buildAutopilotTriggerUpdateArgs: carries autopilot and trigger IDs", () => {
  assert.deepEqual(
    buildAutopilotTriggerUpdateArgs({
      autopilot_id: "auto-123",
      trigger_id: "trigger-456",
      enabled: false,
    }),
    [
      "autopilot",
      "trigger-update",
      "auto-123",
      "trigger-456",
      "--enabled=false",
    ],
  );
});

test("buildAutopilotTriggerDeleteArgs: uses trigger-delete subcommand", () => {
  assert.deepEqual(
    buildAutopilotTriggerDeleteArgs({
      autopilot_id: "auto-123",
      trigger_id: "trigger-456",
    }),
    ["autopilot", "trigger-delete", "auto-123", "trigger-456"],
  );
});

test("buildIssueRunMessagesArgs: includes since when provided", () => {
  assert.deepEqual(
    buildIssueRunMessagesArgs({
      task_id: "task-123",
      since: 42,
    }),
    ["issue", "run-messages", "task-123", "--since", "42"],
  );
});

test("buildIssueRunMessagesArgs: omits since when absent", () => {
  assert.deepEqual(
    buildIssueRunMessagesArgs({
      task_id: "task-123",
    }),
    ["issue", "run-messages", "task-123"],
  );
});

test("buildAttachmentDownloadArgs: includes output_dir when provided", () => {
  assert.deepEqual(
    buildAttachmentDownloadArgs({
      attachment_id: "attachment-123",
      output_dir: "/tmp/with spaces",
    }),
    ["attachment", "download", "attachment-123", "-o", "/tmp/with spaces"],
  );
});

test("parseAttachmentDownloadPath: extracts path from the CLI's JSON object", () => {
  assert.equal(
    parseAttachmentDownloadPath(
      '{\n  "filename": "Report.pdf",\n  "id": "abc",\n  "path": "/tmp/My Report.pdf",\n  "size": "123"\n}\n',
    ),
    "/tmp/My Report.pdf",
  );
});

test("parseAttachmentDownloadPath: throws on non-JSON output instead of returning a bogus path", () => {
  assert.throws(() => parseAttachmentDownloadPath("not json"));
});

test("parseAttachmentDownloadPath: throws when the path field is missing", () => {
  assert.throws(() => parseAttachmentDownloadPath('{"filename":"x.pdf"}'));
});

test("autopilot schemas: get/update/delete/trigger require autopilot_id", () => {
  const schemas = [
    multicaGetAutopilotSchema,
    multicaUpdateAutopilotSchema,
    multicaDeleteAutopilotSchema,
    multicaTriggerAutopilotSchema,
  ];

  for (const schema of schemas) {
    assert.doesNotThrow(() => schema.parse({ autopilot_id: "auto-123" }));
    assert.throws(() => schema.parse({ id: "auto-123" }), /autopilot_id/);
  }
});

// --- resolveIssueId ---

const FAKE_UUID = "11111111-2222-3333-4444-555555555555";
const OTHER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makePage(issues: Array<{ id: string; identifier: string }>, has_more = false) {
  return {
    issues: issues.map((i) => ({
      ...i,
      number: 1,
      title: "t",
      description: null,
      status: "todo",
      priority: "medium",
      assignee_id: null,
      assignee_type: null,
      project_id: null,
      parent_issue_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    })),
    total: issues.length,
    limit: 100,
    offset: 0,
    has_more,
  };
}

test("resolveIssueId: UUID passthrough — no fetch call", async () => {
  let called = false;
  const result = await resolveIssueId(FAKE_UUID, async () => {
    called = true;
    return makePage([]);
  });
  assert.equal(result, FAKE_UUID);
  assert.equal(called, false);
});

test("resolveIssueId: short ID resolves to UUID", async () => {
  const fetcher = async () =>
    makePage([{ id: OTHER_UUID, identifier: "ABC-123" }]);
  const result = await resolveIssueId("ABC-123", fetcher);
  assert.equal(result, OTHER_UUID);
});

test("resolveIssueId: invalid ID format throws", async () => {
  const fetcher = async () => makePage([]);
  await assert.rejects(
    () => resolveIssueId("not-valid-id", fetcher),
    /not found/,
  );
});

test("resolveIssueId: short ID not in list throws", async () => {
  const fetcher = async () =>
    makePage([{ id: OTHER_UUID, identifier: "ABC-999" }]);
  await assert.rejects(
    () => resolveIssueId("ABC-123", fetcher),
    /Issue "ABC-123" not found/,
  );
});

test("resolveIssueId: paginates until has_more false", async () => {
  let calls = 0;
  const fetcher = async (offset: number) => {
    calls++;
    if (offset === 0) return makePage([{ id: "x", identifier: "ABC-000" }], true);
    return makePage([{ id: OTHER_UUID, identifier: "ABC-123" }], false);
  };
  const result = await resolveIssueId("ABC-123", fetcher);
  assert.equal(result, OTHER_UUID);
  assert.equal(calls, 2);
});
