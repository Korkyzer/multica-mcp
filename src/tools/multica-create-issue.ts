import { z } from "zod";
import {
  buildUnknownAssigneeMessage,
  getAgentsCached,
  resolveAgentByName,
} from "../lib/agents.js";
import {
  buildUnknownProjectMessage,
  resolveProject,
} from "../lib/projects.js";
import { runMulticaJson, runMulticaRaw } from "../lib/multica-cli.js";
import {
  buildUnknownSquadMessage,
  getSquadsCached,
  mapAssigneeIdToName,
  resolveSquadByName,
} from "../lib/squads.js";
import type { Issue } from "../lib/types.js";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

let cachedAppUrl: string | undefined;

async function resolveAppUrl(): Promise<string> {
  if (process.env.MULTICA_APP_URL) return process.env.MULTICA_APP_URL;
  if (cachedAppUrl !== undefined) return cachedAppUrl;
  try {
    const out = await runMulticaRaw(["config", "show"]);
    const match = out.match(/app[_-]?url\s*[:=]\s*"?([^\s"]+)"?/i);
    if (match) {
      cachedAppUrl = match[1];
      return cachedAppUrl;
    }
  } catch {
    // fall through
  }
  cachedAppUrl = "";
  return "";
}

export const multicaCreateIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  assignee: z.string().optional(),
  assignee_id: z.string().optional(),
  project: z.string().optional(),
  priority: z.enum(PRIORITIES).optional().default("medium"),
  parent_issue_id: z.string().optional(),
  cwd: z.string().optional(),
});

export type MulticaCreateIssueInput = z.infer<typeof multicaCreateIssueSchema>;

function withWorkingDirectoryHint(
  description: string | undefined,
  cwd: string | undefined,
): string | undefined {
  if (!cwd) return description;

  const prefix = [
    `**Working directory**: \`${cwd}\``,
    "",
    `Start with \`cd "${cwd}"\` before any file operation.`,
  ].join("\n");

  return description ? `${prefix}\n\n${description}` : prefix;
}

export async function multicaCreateIssue(
  input: MulticaCreateIssueInput,
) {
  if (input.assignee && input.assignee_id) {
    throw new Error("Provide either assignee or assignee_id, not both.");
  }

  if (input.assignee) {
    const agent = await resolveAgentByName(input.assignee);
    const squad = agent ? undefined : await resolveSquadByName(input.assignee);
    if (!agent && !squad) {
      const [agentMessage, squadMessage] = await Promise.all([
        buildUnknownAssigneeMessage(input.assignee),
        buildUnknownSquadMessage(input.assignee),
      ]);
      throw new Error(`${agentMessage} ${squadMessage}`);
    }
  }

  const args = ["issue", "create", "--title", input.title];
  const description = withWorkingDirectoryHint(input.description, input.cwd);

  if (description) {
    args.push("--description", description);
  }

  if (input.assignee) {
    args.push("--assignee", input.assignee);
  }
  if (input.assignee_id) {
    args.push("--assignee-id", input.assignee_id);
  }

  args.push("--priority", input.priority ?? "medium");

  if (input.parent_issue_id) {
    args.push("--parent", input.parent_issue_id);
  }

  if (input.project) {
    const project = await resolveProject(input.project);
    if (!project) {
      throw new Error(await buildUnknownProjectMessage(input.project));
    }
    args.push("--project", project.id);
  }

  const issue = await runMulticaJson<Issue>(args);
  const [appUrl, agents, squads] = await Promise.all([
    resolveAppUrl(),
    getAgentsCached(),
    getSquadsCached(),
  ]);

  return {
    id: issue.id,
    short_id: issue.identifier,
    title: issue.title,
    status: issue.status,
    assignee: mapAssigneeIdToName(
      agents,
      squads,
      issue.assignee_id,
      issue.assignee_type,
    ),
    assignee_type: issue.assignee_type,
    url: appUrl ? `${appUrl}/issues/${issue.id}` : null,
  };
}
