import { z } from "zod";
import { getAgentsCached } from "../lib/agents.js";
import {
  buildUnknownProjectMessage,
  getProjectDisplayName,
  getProjectsCached,
  resolveProject,
} from "../lib/projects.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import { getSquadsCached, mapAssigneeIdToName } from "../lib/squads.js";
import type { IssueListResponse, ListResult } from "../lib/types.js";

const STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
] as const;
const SORTS = ["created_desc", "updated_desc", "priority"] as const;

const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const multicaListIssuesSchema = z.object({
  status: z.union([z.enum(STATUSES), z.array(z.enum(STATUSES))]).optional(),
  assignee: z.string().optional(),
  project: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(SORTS).optional(),
});

export type MulticaListIssuesInput = z.infer<typeof multicaListIssuesSchema>;

type IssueSummary = {
  id: string;
  short_id: string;
  title: string;
  status: string;
  assignee: string | null;
  project: string | null;
  priority: string;
  updated_at: string;
};

type ListIssuesResult = ListResult<IssueSummary> & {
  total?: number;
  offset?: number;
  has_more?: boolean;
  next_offset?: number;
};

export async function multicaListIssues(
  input: MulticaListIssuesInput,
): Promise<ListIssuesResult> {
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;
  const args = [
    "issue", "list",
    "--limit", String(Math.min(limit * 3, 300)),
    "--offset", String(offset),
  ];

  if (typeof input.status === "string") {
    args.push("--status", input.status);
  }
  if (input.assignee) {
    args.push("--assignee", input.assignee);
  }
  if (input.project) {
    const project = await resolveProject(input.project);
    if (!project) {
      throw new Error(await buildUnknownProjectMessage(input.project));
    }
    args.push("--project", project.id);
  }

  const [response, agents, projects, squads] = await Promise.all([
    runMulticaJson<IssueListResponse>(args),
    getAgentsCached(),
    getProjectsCached(),
    getSquadsCached(),
  ]);

  let issues = response.issues;
  if (Array.isArray(input.status)) {
    const statuses = new Set(input.status);
    issues = issues.filter((issue) =>
      statuses.has(issue.status as (typeof STATUSES)[number]),
    );
  }

  const sort = input.sort ?? "updated_desc";
  issues = issues
    .slice()
    .sort((left, right) => {
      if (sort === "created_desc") {
        return right.created_at.localeCompare(left.created_at);
      }
      if (sort === "priority") {
        return (
          (priorityRank[left.priority] ?? Number.MAX_SAFE_INTEGER) -
          (priorityRank[right.priority] ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return right.updated_at.localeCompare(left.updated_at);
    })
    .slice(0, limit);

  const items = issues.map((issue) => ({
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
    project: issue.project_id
      ? getProjectDisplayName(
          projects.find((project) => project.id === issue.project_id) ?? {
            id: issue.project_id,
          },
        )
      : null,
    priority: issue.priority,
    updated_at: issue.updated_at,
  }));

  if (items.length === 0) {
    return {
      items: [],
      state: "empty",
      message: "No issues match the current filters. Try broader filters or create a new issue.",
      total: response.total,
      offset,
      has_more: response.has_more ?? false,
    };
  }

  return {
    items,
    state: "loaded",
    total: response.total,
    offset,
    has_more: response.has_more ?? false,
    next_offset: response.has_more ? offset + limit : undefined,
  };
}
