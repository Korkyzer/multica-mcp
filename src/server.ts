import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { homedir } from "node:os";
import { join } from "node:path";

import { JsonlLogger } from "./lib/logger.js";
import {
  ensureMulticaCliAvailable,
  formatMulticaError,
} from "./lib/multica-cli.js";
import {
  multicaAddComment,
  multicaAddCommentSchema,
} from "./tools/multica-add-comment.js";
import {
  multicaCreateIssue,
  multicaCreateIssueSchema,
} from "./tools/multica-create-issue.js";
import {
  multicaCreateProject,
  multicaCreateProjectSchema,
} from "./tools/multica-create-project.js";
import {
  multicaGetIssue,
  multicaGetIssueSchema,
} from "./tools/multica-get-issue.js";
import {
  multicaGetRuntimeUsage,
  multicaGetRuntimeUsageSchema,
} from "./tools/multica-get-runtime-usage.js";
import {
  multicaListAgents,
  multicaListAgentsSchema,
} from "./tools/multica-list-agents.js";
import {
  multicaListIssues,
  multicaListIssuesSchema,
} from "./tools/multica-list-issues.js";
import {
  multicaListProjects,
  multicaListProjectsSchema,
} from "./tools/multica-list-projects.js";
import {
  multicaUpdateIssue,
  multicaUpdateIssueSchema,
} from "./tools/multica-update-issue.js";
import {
  multicaListAutopilots,
  multicaListAutopilotsSchema,
} from "./tools/multica-list-autopilots.js";
import {
  multicaGetAutopilot,
  multicaGetAutopilotSchema,
} from "./tools/multica-get-autopilot.js";
import {
  multicaCreateAutopilot,
  multicaCreateAutopilotSchema,
} from "./tools/multica-create-autopilot.js";
import {
  multicaUpdateAutopilot,
  multicaUpdateAutopilotSchema,
} from "./tools/multica-update-autopilot.js";
import {
  multicaDeleteAutopilot,
  multicaDeleteAutopilotSchema,
} from "./tools/multica-delete-autopilot.js";
import {
  multicaTriggerAutopilot,
  multicaTriggerAutopilotSchema,
} from "./tools/multica-trigger-autopilot.js";
import {
  multicaIssueSearch,
  multicaIssueSearchSchema,
} from "./tools/multica-issue-search.js";
import {
  multicaAttachmentDownload,
  multicaAttachmentDownloadSchema,
} from "./tools/multica-attachment-download.js";
import {
  multicaAutopilotTriggerAdd,
  multicaAutopilotTriggerAddSchema,
  multicaAutopilotTriggerUpdate,
  multicaAutopilotTriggerUpdateSchema,
  multicaAutopilotTriggerDelete,
  multicaAutopilotTriggerDeleteSchema,
} from "./tools/multica-autopilot-triggers.js";
import {
  multicaIssueRuns,
  multicaIssueRunsSchema,
} from "./tools/multica-issue-runs.js";
import {
  multicaIssueRunMessages,
  multicaIssueRunMessagesSchema,
} from "./tools/multica-issue-run-messages.js";
import {
  multicaListComments,
  multicaListCommentsSchema,
} from "./tools/multica-list-comments.js";
import {
  multicaWorkspaceMembers,
  multicaWorkspaceMembersSchema,
} from "./tools/multica-workspace-members.js";
import {
  multicaRuntimeList,
  multicaRuntimeListSchema,
} from "./tools/multica-runtime-list.js";
import {
  multicaAgentCreate,
  multicaAgentCreateSchema,
  multicaAgentUpdate,
  multicaAgentUpdateSchema,
} from "./tools/multica-agent-crud.js";
import {
  multicaCreateSquad,
  multicaCreateSquadSchema,
  multicaGetSquad,
  multicaGetSquadSchema,
  multicaListSquads,
  multicaListSquadsSchema,
  multicaUpdateSquad,
  multicaUpdateSquadSchema,
} from "./tools/multica-squad-crud.js";
import {
  multicaSquadMemberAdd,
  multicaSquadMemberAddSchema,
  multicaSquadMemberRemove,
  multicaSquadMemberRemoveSchema,
  multicaSquadMemberSetRole,
  multicaSquadMemberSetRoleSchema,
} from "./tools/multica-squad-members.js";

function resolveLogPath(): string {
  const override = process.env.MULTICA_MCP_LOG_PATH;
  if (override) return override;
  const xdgState = process.env.XDG_STATE_HOME;
  const base = xdgState && xdgState.length > 0
    ? xdgState
    : join(homedir(), ".local", "state");
  return join(base, "multica-mcp", "calls.log");
}

const logger = new JsonlLogger(resolveLogPath());

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function toolError(err: unknown) {
  const error = formatMulticaError(err);
  return {
    isError: true,
    content: [
      { type: "text" as const, text: JSON.stringify({ error }) },
    ],
  };
}

async function notifyProgress(
  extra: ToolExtra,
  progress: number,
  total: number,
): Promise<void> {
  const token = extra._meta?.progressToken;
  if (token === undefined) return;
  await extra
    .sendNotification({
      method: "notifications/progress",
      params: { progressToken: token, progress, total },
    } as ServerNotification)
    .catch(() => {});
}

function wrap<I>(
  name: string,
  fn: (input: I) => Promise<unknown>,
): (input: I, extra: ToolExtra) => Promise<ReturnType<typeof toolResult>> {
  return async (input: I, extra) => {
    await notifyProgress(extra, 0, 1);
    const t0 = Date.now();
    try {
      const out = await fn(input);
      logger.log({
        tool: name,
        params: input,
        duration_ms: Date.now() - t0,
        success: true,
      });
      await notifyProgress(extra, 1, 1);
      return toolResult(out);
    } catch (err) {
      logger.log({
        tool: name,
        params: input,
        duration_ms: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return toolError(err);
    }
  };
}

async function main() {
  await ensureMulticaCliAvailable();

  const server = new McpServer({
    name: "multica-mcp",
    version: "0.4.0",
  });

  server.tool(
    "multica_list_agents",
    "List all non-archived Multica agents in the current workspace. Returns id, name, provider, model_hint, description. Cached 5 minutes.",
    multicaListAgentsSchema.shape,
    wrap("multica_list_agents", async () => multicaListAgents()),
  );

  server.tool(
    "multica_list_projects",
    "List all projects in the current workspace. Cached 5 minutes.",
    multicaListProjectsSchema.shape,
    wrap("multica_list_projects", async () => multicaListProjects()),
  );

  server.tool(
    "multica_create_project",
    "Create a new project in the current workspace.",
    multicaCreateProjectSchema.shape,
    wrap("multica_create_project", async (input) => multicaCreateProject(input)),
  );

  server.tool(
    "multica_create_issue",
    "Create a new issue, optionally assigned to an agent or squad. Use `assignee` for a fuzzy-matched agent/squad name, or `assignee_id` for an exact agent/squad UUID (e.g. from multica_list_squads). Assigning to a squad routes execution to that squad's leader agent, not every member. Use a detailed description (>200 chars) for good agent context. The cwd param is a hint injected into the description because the CLI has no native working-directory flag.",
    multicaCreateIssueSchema.shape,
    wrap("multica_create_issue", async (input) => multicaCreateIssue(input)),
  );

  server.tool(
    "multica_list_issues",
    "List issues with optional filters and pagination. Returns a summarized view suitable for scanning. Use multica_get_issue for full details including comments.",
    multicaListIssuesSchema.shape,
    wrap("multica_list_issues", async (input) => multicaListIssues(input)),
  );

  server.tool(
    "multica_get_issue",
    "Get full details of one issue including description, all comments, and agent task state. Accepts UUID or short identifier like 'ABC-12'. Set include_comments=false to skip comments on heavily-commented issues.",
    multicaGetIssueSchema.shape,
    wrap("multica_get_issue", async (input) => multicaGetIssue(input)),
  );

  server.tool(
    "multica_issue_search",
    "Search issues by text in title or description. Falls back to fetch+filter when the CLI has no native search flag.",
    multicaIssueSearchSchema.shape,
    wrap("multica_issue_search", async (input) => multicaIssueSearch(input)),
  );

  server.tool(
    "multica_list_comments",
    "List comments on an issue with pagination. Supports 'since' (RFC3339) for incremental fetch. Separate from get_issue to handle very long threads.",
    multicaListCommentsSchema.shape,
    wrap("multica_list_comments", async (input) => multicaListComments(input)),
  );

  server.tool(
    "multica_add_comment",
    "Post a markdown comment on an issue. Use to push additional context to an agent that is currently working on the issue.",
    multicaAddCommentSchema.shape,
    wrap("multica_add_comment", async (input) => multicaAddComment(input)),
  );

  server.tool(
    "multica_update_issue",
    "Update an issue's title, description, status, assignee, or priority. `assignee` fuzzy-matches an agent or squad name; `assignee_id` takes an exact agent/squad UUID. Assigning to a squad routes execution to that squad's leader agent. Cannot change assignee on done/cancelled issues (reopen first).",
    multicaUpdateIssueSchema.shape,
    wrap("multica_update_issue", async (input) => multicaUpdateIssue(input)),
  );

  server.tool(
    "multica_issue_runs",
    "List all execution runs for an issue (status, timestamps, errors).",
    multicaIssueRunsSchema.shape,
    wrap("multica_issue_runs", async (input) => multicaIssueRuns(input)),
  );

  server.tool(
    "multica_issue_run_messages",
    "List messages for a specific execution run. Supports incremental fetch via 'since' sequence number.",
    multicaIssueRunMessagesSchema.shape,
    wrap("multica_issue_run_messages", async (input) => multicaIssueRunMessages(input)),
  );

  server.tool(
    "multica_attachment_download",
    "Download an attachment to a local path. Returns the saved file path.",
    multicaAttachmentDownloadSchema.shape,
    wrap("multica_attachment_download", async (input) => multicaAttachmentDownload(input)),
  );

  server.tool(
    "multica_workspace_members",
    "List members of the current workspace. Required to build @-mentions in comments.",
    multicaWorkspaceMembersSchema.shape,
    wrap("multica_workspace_members", async (input) => multicaWorkspaceMembers(input)),
  );

  server.tool(
    "multica_runtime_list",
    "List runtimes in the workspace. Required to pass runtime_id when creating agents.",
    multicaRuntimeListSchema.shape,
    wrap("multica_runtime_list", async () => multicaRuntimeList()),
  );

  server.tool(
    "multica_agent_create",
    "Create a new agent bound to a runtime.",
    multicaAgentCreateSchema.shape,
    wrap("multica_agent_create", async (input) => multicaAgentCreate(input)),
  );

  server.tool(
    "multica_agent_update",
    "Update an existing agent (name, description, instructions, runtime, args, or status).",
    multicaAgentUpdateSchema.shape,
    wrap("multica_agent_update", async (input) => multicaAgentUpdate(input)),
  );

  server.tool(
    "multica_list_autopilots",
    "List autopilots (scheduled/triggered agent automations). Optionally filter by status.",
    multicaListAutopilotsSchema.shape,
    wrap("multica_list_autopilots", async (input) => multicaListAutopilots(input)),
  );

  server.tool(
    "multica_get_autopilot",
    "Get full details of an autopilot including its schedule triggers.",
    multicaGetAutopilotSchema.shape,
    wrap("multica_get_autopilot", async (input) => multicaGetAutopilot(input)),
  );

  server.tool(
    "multica_create_autopilot",
    "Create a new autopilot. Use multica_autopilot_trigger_add to attach cron triggers after creation.",
    multicaCreateAutopilotSchema.shape,
    wrap("multica_create_autopilot", async (input) => multicaCreateAutopilot(input)),
  );

  server.tool(
    "multica_update_autopilot",
    "Update an autopilot's title, description, status (active/paused), agent, priority, or other fields.",
    multicaUpdateAutopilotSchema.shape,
    wrap("multica_update_autopilot", async (input) => multicaUpdateAutopilot(input)),
  );

  server.tool(
    "multica_delete_autopilot",
    "Permanently delete an autopilot and all its triggers.",
    multicaDeleteAutopilotSchema.shape,
    wrap("multica_delete_autopilot", async (input) => multicaDeleteAutopilot(input)),
  );

  server.tool(
    "multica_trigger_autopilot",
    "Manually run an autopilot once immediately, regardless of its schedule.",
    multicaTriggerAutopilotSchema.shape,
    wrap("multica_trigger_autopilot", async (input) => multicaTriggerAutopilot(input)),
  );

  server.tool(
    "multica_autopilot_trigger_add",
    "Attach a cron trigger to an existing autopilot.",
    multicaAutopilotTriggerAddSchema.shape,
    wrap("multica_autopilot_trigger_add", async (input) => multicaAutopilotTriggerAdd(input)),
  );

  server.tool(
    "multica_autopilot_trigger_update",
    "Update an existing autopilot trigger (cron, label, timezone, enabled).",
    multicaAutopilotTriggerUpdateSchema.shape,
    wrap("multica_autopilot_trigger_update", async (input) => multicaAutopilotTriggerUpdate(input)),
  );

  server.tool(
    "multica_autopilot_trigger_delete",
    "Delete a trigger from an autopilot.",
    multicaAutopilotTriggerDeleteSchema.shape,
    wrap("multica_autopilot_trigger_delete", async (input) => multicaAutopilotTriggerDelete(input)),
  );

  server.tool(
    "multica_list_squads",
    "List squads in the current workspace. A squad routes issue/mention work to its leader agent; it does not fan work out to every member. Returns id, name, description, leader_id, member_count, archived.",
    multicaListSquadsSchema.shape,
    wrap("multica_list_squads", async () => multicaListSquads()),
  );

  server.tool(
    "multica_get_squad",
    "Get full squad details (name, description, instructions, leader_id) plus its member roster.",
    multicaGetSquadSchema.shape,
    wrap("multica_get_squad", async (input) => multicaGetSquad(input)),
  );

  server.tool(
    "multica_create_squad",
    "Create a new squad with a leader agent. Squad-routed work (issue assignment, @mentions) always executes as the leader; other members are roster context for the leader to delegate to, not automatically dispatched.",
    multicaCreateSquadSchema.shape,
    wrap("multica_create_squad", async (input) => multicaCreateSquad(input)),
  );

  server.tool(
    "multica_update_squad",
    "Update a squad's name, description, leader-facing instructions, leader agent, or avatar URL.",
    multicaUpdateSquadSchema.shape,
    wrap("multica_update_squad", async (input) => multicaUpdateSquad(input)),
  );

  server.tool(
    "multica_squad_member_add",
    "Add an agent or workspace member to a squad roster with a role label. Does not itself route work to that member — squad work still executes as the leader.",
    multicaSquadMemberAddSchema.shape,
    wrap("multica_squad_member_add", async (input) => multicaSquadMemberAdd(input)),
  );

  server.tool(
    "multica_squad_member_remove",
    "Remove an agent or workspace member from a squad roster.",
    multicaSquadMemberRemoveSchema.shape,
    wrap("multica_squad_member_remove", async (input) => multicaSquadMemberRemove(input)),
  );

  server.tool(
    "multica_squad_member_set_role",
    "Change a squad member's roster role label.",
    multicaSquadMemberSetRoleSchema.shape,
    wrap("multica_squad_member_set_role", async (input) => multicaSquadMemberSetRole(input)),
  );

  server.tool(
    "multica_get_runtime_usage",
    "Authoritative token usage per runtime (and per model) from billing logs, NOT agent self-reports. Use window='today' or '30d' to scope.",
    multicaGetRuntimeUsageSchema.shape,
    wrap("multica_get_runtime_usage", async (input) => multicaGetRuntimeUsage(input)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[multica-mcp] fatal:", err);
  process.exit(1);
});
