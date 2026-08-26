import { z } from "zod";
import { getAgentsCached, mapAgentIdToName } from "../lib/agents.js";
import { getIssueById, getLatestRunForIssue, resolveIssueId } from "../lib/issues.js";
import {
  getProjectDisplayName,
  getProjectsCached,
} from "../lib/projects.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import { getSquadsCached, mapAssigneeIdToName } from "../lib/squads.js";
import type { Comment } from "../lib/types.js";

export const multicaGetIssueSchema = z.object({
  issue_id: z.string().min(1),
  include_comments: z.boolean().optional().default(true),
});

export type MulticaGetIssueInput = z.infer<typeof multicaGetIssueSchema>;

export async function multicaGetIssue(input: MulticaGetIssueInput) {
  const issueId = await resolveIssueId(input.issue_id);
  const includeComments = input.include_comments ?? true;

  const [issue, comments, latestRun, agents, projects, squads] = await Promise.all([
    getIssueById(issueId),
    includeComments
      ? runMulticaJson<Comment[]>(["issue", "comment", "list", issueId])
      : Promise.resolve([] as Comment[]),
    getLatestRunForIssue(issueId),
    getAgentsCached(),
    getProjectsCached(),
    getSquadsCached(),
  ]);

  const base = {
    id: issue.id,
    short_id: issue.identifier,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    assignee: mapAssigneeIdToName(
      agents,
      squads,
      issue.assignee_id,
      issue.assignee_type,
    ),
    assignee_type: issue.assignee_type,
    project: issue.project_id
      ? getProjectDisplayName(
          projects.find((project) => project.id === issue.project_id) ?? {
            id: issue.project_id,
          },
        )
      : null,
    priority: issue.priority,
    task: latestRun
      ? {
          status: latestRun.status,
          work_dir: latestRun.result?.work_dir ?? null,
          started_at: latestRun.started_at,
          completed_at: latestRun.completed_at,
          output_summary: latestRun.result?.output?.slice(0, 500) ?? null,
        }
      : null,
  };

  if (!includeComments) return base;

  return {
    ...base,
    comments: comments.map((comment) => ({
      author:
        comment.author_type === "agent"
          ? mapAgentIdToName(agents, comment.author_id) ?? comment.author_id
          : comment.author_id,
      content: comment.content,
      created_at: comment.created_at,
    })),
  };
}
