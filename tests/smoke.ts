import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

type JsonRpc = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const SERVER = resolve(process.cwd(), "dist/server.js");

function send(child: ReturnType<typeof spawn>, msg: JsonRpc): void {
  child.stdin!.write(JSON.stringify(msg) + "\n");
}

function parseToolText<T>(response: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}): T {
  if (response.isError) {
    throw new Error(`tool returned error: ${response.content?.[0]?.text}`);
  }
  return JSON.parse(response.content[0].text) as T;
}

function cleanupProject(projectId: string | null): void {
  if (!projectId) return;
  spawnSync("multica", ["project", "delete", projectId], {
    stdio: "ignore",
  });
}

function cleanupSquad(squadId: string | null): void {
  if (!squadId) return;
  spawnSync("multica", ["squad", "delete", squadId], {
    stdio: "ignore",
  });
}

async function readResponse(
  child: ReturnType<typeof spawn>,
  id: number,
  timeoutMs = 20_000,
): Promise<JsonRpc> {
  return new Promise((accept, reject) => {
    let buf = "";
    const to = setTimeout(() => {
      reject(new Error(`Timeout waiting for response id=${id}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as JsonRpc;
          if (obj.id === id) {
            clearTimeout(to);
            child.stdout!.off("data", onData);
            accept(obj);
            return;
          }
        } catch {
          // skip non-JSON
        }
      }
    };
    child.stdout!.on("data", onData);
  });
}

async function main() {
  console.log(`Launching ${SERVER}`);
  const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
  child.stderr!.on("data", (b) => process.stderr.write(`[server] ${b}`));

  let nextId = 1;
  const pass: string[] = [];
  const fail: string[] = [];
  let createdProjectId: string | null = null;
  let createdIssueShortId: string | null = null;
  let createdSquadId: string | null = null;

  async function step<T = unknown>(
    label: string,
    method: string,
    params: unknown,
    assertion: (result: T) => void,
  ) {
    const id = nextId++;
    send(child, { jsonrpc: "2.0", id, method, params });
    const resp = await readResponse(child, id);
    if (resp.error) {
      fail.push(`${label}: ${JSON.stringify(resp.error)}`);
      return;
    }
    try {
      assertion(resp.result as T);
      pass.push(label);
    } catch (err) {
      fail.push(`${label}: ${(err as Error).message}`);
    }
  }

  try {
    await step<{ serverInfo?: { name: string } }>(
      "initialize",
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0.1" },
      },
      (r) => {
        if (!r.serverInfo || r.serverInfo.name !== "multica-mcp") {
          throw new Error(`Unexpected serverInfo: ${JSON.stringify(r.serverInfo)}`);
        }
      },
    );

    send(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    await step<{ tools: Array<{ name: string }> }>(
      "tools/list exposes all required tools",
      "tools/list",
      {},
      (r) => {
        if (!Array.isArray(r.tools)) throw new Error("no tools array");
        const names = new Set(r.tools.map((tool) => tool.name));
        const required = [
          "multica_add_comment",
          "multica_agent_create",
          "multica_agent_update",
          "multica_attachment_download",
          "multica_autopilot_trigger_add",
          "multica_autopilot_trigger_delete",
          "multica_autopilot_trigger_update",
          "multica_create_autopilot",
          "multica_create_issue",
          "multica_create_project",
          "multica_delete_autopilot",
          "multica_get_autopilot",
          "multica_get_issue",
          "multica_get_runtime_usage",
          "multica_issue_run_messages",
          "multica_issue_runs",
          "multica_issue_search",
          "multica_list_agents",
          "multica_list_autopilots",
          "multica_list_comments",
          "multica_list_issues",
          "multica_list_projects",
          "multica_runtime_list",
          "multica_trigger_autopilot",
          "multica_update_autopilot",
          "multica_update_issue",
          "multica_workspace_members",
          "multica_list_squads",
          "multica_get_squad",
          "multica_create_squad",
          "multica_update_squad",
          "multica_squad_member_add",
          "multica_squad_member_remove",
          "multica_squad_member_set_role",
        ];
        const missing = required.filter((tool) => !names.has(tool));
        if (missing.length > 0) {
          throw new Error(`Missing tools: ${missing.join(", ")}`);
        }
      },
    );

    let firstAgentName: string | null = null;
    let secondAgentId: string | null = null;
    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_list_agents returns active agents",
      "tools/call",
      { name: "multica_list_agents", arguments: {} },
      (r) => {
        const parsed = parseToolText<{ items: Array<{ id: string; name: string }>; state: string }>(r);
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
          throw new Error(`Expected at least one agent, got ${parsed.items?.length}`);
        }
        if (parsed.state !== "loaded") {
          throw new Error(`Expected state "loaded", got "${parsed.state}"`);
        }
        firstAgentName = parsed.items[0].name;
        secondAgentId = parsed.items[1]?.id ?? null;
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_list_projects returns items array",
      "tools/call",
      { name: "multica_list_projects", arguments: {} },
      (r) => {
        const parsed = parseToolText<{ items: unknown[]; state: string }>(r);
        if (!Array.isArray(parsed.items)) throw new Error("expected items array");
        if (parsed.state !== "loaded" && parsed.state !== "empty") {
          throw new Error(`Unexpected state: ${parsed.state}`);
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_get_runtime_usage returns runtimes",
      "tools/call",
      { name: "multica_get_runtime_usage", arguments: {} },
      (r) => {
        const parsed = parseToolText<Array<{ runtime_id: string }>>(r);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error("expected at least one runtime");
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_runtime_list returns runtimes",
      "tools/call",
      { name: "multica_runtime_list", arguments: {} },
      (r) => {
        const parsed = parseToolText<{ items: Array<{ id: string }>; state: string }>(r);
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
          throw new Error("expected at least one runtime");
        }
        if (parsed.state !== "loaded") {
          throw new Error(`Unexpected state: ${parsed.state}`);
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_workspace_members returns members",
      "tools/call",
      { name: "multica_workspace_members", arguments: {} },
      (r) => {
        const parsed = parseToolText<{ items: Array<{ id: string }>; state: string }>(r);
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
          throw new Error("expected at least one member");
        }
        if (parsed.state !== "loaded") {
          throw new Error(`Unexpected state: ${parsed.state}`);
        }
      },
    );

    const tmpProjectName = `multica-mcp-smoke-${Date.now()}`;
    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_create_project creates a project",
      "tools/call",
      {
        name: "multica_create_project",
        arguments: {
          name: tmpProjectName,
          description: "Smoke test project for multica-mcp",
        },
      },
      (r) => {
        const parsed = parseToolText<{ id: string; name: string }>(r);
        if (!parsed.id) throw new Error("missing project id");
        createdProjectId = parsed.id;
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_create_issue creates an issue",
      "tools/call",
      {
        name: "multica_create_issue",
        arguments: {
          title: "Smoke test issue",
          description: "Smoke test issue created through the MCP wrapper.",
          project: tmpProjectName,
          priority: "medium",
        },
      },
      (r) => {
        const parsed = parseToolText<{ id: string; short_id: string }>(r);
        if (!parsed.id || !parsed.short_id) {
          throw new Error("missing issue identifiers");
        }
        createdIssueShortId = parsed.short_id;
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_list_issues filters by project",
      "tools/call",
      {
        name: "multica_list_issues",
        arguments: {
          project: tmpProjectName,
          limit: 10,
        },
      },
      (r) => {
        const parsed = parseToolText<{ items: Array<{ short_id: string }>; state: string }>(r);
        if (!createdIssueShortId) throw new Error("issue not created");
        if (!parsed.items.some((issue) => issue.short_id === createdIssueShortId)) {
          throw new Error("created issue not returned by list");
        }
      },
    );

    const tmpSquadName = `multica-mcp-smoke-squad-DISPOSABLE-${Date.now()}`;
    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_create_squad creates a disposable test squad",
      "tools/call",
      {
        name: "multica_create_squad",
        arguments: {
          name: tmpSquadName,
          leader: firstAgentName,
          description: "Disposable squad created by the multica-mcp smoke test; safe to delete.",
        },
      },
      (r) => {
        const parsed = parseToolText<{ id: string; name: string; leader_id: string }>(r);
        if (!parsed.id) throw new Error("missing squad id");
        if (parsed.name !== tmpSquadName) throw new Error("unexpected squad name");
        createdSquadId = parsed.id;
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_list_squads returns the created squad",
      "tools/call",
      { name: "multica_list_squads", arguments: {} },
      (r) => {
        const parsed = parseToolText<{ items: Array<{ id: string }>; state: string }>(r);
        if (!createdSquadId) throw new Error("squad not created");
        if (!parsed.items.some((squad) => squad.id === createdSquadId)) {
          throw new Error("created squad not returned by list");
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_get_squad returns squad details and roster",
      "tools/call",
      { name: "multica_get_squad", arguments: { squad_id: createdSquadId } },
      (r) => {
        const parsed = parseToolText<{
          id: string;
          members: Array<{ member_id: string; role: string }>;
        }>(r);
        if (parsed.id !== createdSquadId) throw new Error("wrong squad returned");
        if (!Array.isArray(parsed.members)) throw new Error("expected members array");
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_update_squad updates instructions",
      "tools/call",
      {
        name: "multica_update_squad",
        arguments: {
          squad_id: createdSquadId,
          instructions: "Smoke-test leader briefing.",
        },
      },
      (r) => {
        const parsed = parseToolText<{ id: string }>(r);
        if (parsed.id !== createdSquadId) throw new Error("wrong squad returned");
      },
    );

    if (secondAgentId) {
      await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
        "multica_squad_member_add adds an agent member",
        "tools/call",
        {
          name: "multica_squad_member_add",
          arguments: {
            squad_id: createdSquadId,
            member_id: secondAgentId,
            member_type: "agent",
            role: "planner",
          },
        },
        (r) => {
          if (r.isError) throw new Error(`add failed: ${r.content?.[0]?.text}`);
        },
      );

      await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
        "multica_squad_member_set_role changes the member's role",
        "tools/call",
        {
          name: "multica_squad_member_set_role",
          arguments: {
            squad_id: createdSquadId,
            member_id: secondAgentId,
            member_type: "agent",
            role: "reviewer",
          },
        },
        (r) => {
          if (r.isError) throw new Error(`set-role failed: ${r.content?.[0]?.text}`);
        },
      );

      await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
        "multica_squad_member_remove removes the agent member",
        "tools/call",
        {
          name: "multica_squad_member_remove",
          arguments: {
            squad_id: createdSquadId,
            member_id: secondAgentId,
            member_type: "agent",
          },
        },
        (r) => {
          const parsed = parseToolText<{ removed: boolean }>(r);
          if (!parsed.removed) throw new Error("expected removed: true");
        },
      );
    } else {
      console.log("  (skipping squad member add/set-role/remove: only one agent in workspace)");
    }

    // Deliberately does NOT call multica_update_issue with assignee_id set to
    // the squad here: per Multica's squad routing, assigning an issue to a
    // squad while it isn't in "backlog" status dispatches the leader agent
    // for a real run. That's a genuine side effect (a paid agent task), not
    // something an automated smoke test should trigger. assignee_id/assignee
    // squad support is covered by unit tests on the arg builders and by the
    // schema/type wiring below instead.

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_add_comment adds a comment",
      "tools/call",
      {
        name: "multica_add_comment",
        arguments: {
          issue_id: createdIssueShortId,
          content: "Smoke test comment",
        },
      },
      (r) => {
        const parsed = parseToolText<{ comment_id: string }>(r);
        if (!parsed.comment_id) throw new Error("missing comment id");
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_update_issue updates an issue",
      "tools/call",
      {
        name: "multica_update_issue",
        arguments: {
          issue_id: createdIssueShortId,
          status: "blocked",
          priority: "high",
        },
      },
      (r) => {
        const parsed = parseToolText<{ status: string; priority: string }>(r);
        if (parsed.status !== "blocked" || parsed.priority !== "high") {
          throw new Error(`unexpected update result: ${JSON.stringify(parsed)}`);
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_get_issue returns full issue details",
      "tools/call",
      {
        name: "multica_get_issue",
        arguments: {
          issue_id: createdIssueShortId,
        },
      },
      (r) => {
        const parsed = parseToolText<{
          short_id: string;
          status: string;
          comments: Array<{ content: string }>;
        }>(r);
        if (parsed.short_id !== createdIssueShortId) {
          throw new Error("wrong issue returned");
        }
        if (parsed.status !== "blocked") {
          throw new Error(`unexpected status: ${parsed.status}`);
        }
        if (!parsed.comments.some((comment) => comment.content === "Smoke test comment")) {
          throw new Error("comment not found");
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_list_comments returns the new comment",
      "tools/call",
      {
        name: "multica_list_comments",
        arguments: {
          issue_id: createdIssueShortId,
          limit: 20,
        },
      },
      (r) => {
        const parsed = parseToolText<{
          items: Array<{ content: string }>;
          state: string;
        }>(r);
        if (!parsed.items.some((comment) => comment.content === "Smoke test comment")) {
          throw new Error("comment not found in paginated list");
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_issue_search finds the created issue",
      "tools/call",
      {
        name: "multica_issue_search",
        arguments: {
          query: "Smoke test issue",
          limit: 10,
        },
      },
      (r) => {
        const parsed = parseToolText<{
          items: Array<{ short_id: string }>;
          state: string;
        }>(r);
        if (!createdIssueShortId) throw new Error("issue not created");
        if (!parsed.items.some((issue) => issue.short_id === createdIssueShortId)) {
          throw new Error("created issue not returned by search");
        }
      },
    );

    await step<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
      "multica_issue_runs handles issues with no runs",
      "tools/call",
      {
        name: "multica_issue_runs",
        arguments: {
          issue_id: createdIssueShortId,
        },
      },
      (r) => {
        const parsed = parseToolText<{ items: unknown[]; state: string }>(r);
        if (!Array.isArray(parsed.items)) {
          throw new Error("expected items array");
        }
        if (parsed.state !== "empty" && parsed.state !== "loaded") {
          throw new Error(`Unexpected state: ${parsed.state}`);
        }
      },
    );
  } finally {
    child.kill();
    cleanupProject(createdProjectId);
    cleanupSquad(createdSquadId);
  }

  console.log("\n=== PASS ===");
  for (const p of pass) console.log("  ✓ " + p);
  if (fail.length) {
    console.log("\n=== FAIL ===");
    for (const f of fail) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log(`\nAll ${pass.length} checks passed.`);
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
