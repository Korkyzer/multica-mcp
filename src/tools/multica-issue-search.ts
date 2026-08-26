import { z } from "zod";
import { getAgentsCached } from "../lib/agents.js";
import { getProjectDisplayName, getProjectsCached } from "../lib/projects.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import { getSquadsCached, mapAssigneeIdToName } from "../lib/squads.js";
import type { IssueListResponse, Issue, ListResult } from "../lib/types.js";

export const multicaIssueSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  include_description: z.boolean().optional().default(true),
});

export type MulticaIssueSearchInput = z.infer<typeof multicaIssueSearchSchema>;

type IssueMatch = {
  id: string;
  short_id: string;
  title: string;
  status: string;
  assignee: string | null;
  project: string | null;
  priority: string;
  matched_in: "title" | "description";
};

async function tryNativeSearch(query: string): Promise<Issue[] | null> {
  try {
    const response = await runMulticaJson<IssueListResponse>([
      "issue", "list", "--search", query, "--limit", "100",
    ]);
    return response.issues ?? [];
  } catch {
    return null;
  }
}

async function fallbackFetchAll(): Promise<Issue[]> {
  const all: Issue[] = [];
  let offset = 0;
  const limit = 100;
  for (let i = 0; i < 10; i += 1) {
    const page = await runMulticaJson<IssueListResponse>([
      "issue", "list", "--limit", String(limit), "--offset", String(offset),
    ]);
    all.push(...page.issues);
    if (!page.has_more) break;
    offset += limit;
  }
  return all;
}

export async function multicaIssueSearch(
  input: MulticaIssueSearchInput,
): Promise<ListResult<IssueMatch> & { source: "native" | "fallback" }> {
  const limit = input.limit ?? 20;
  const includeDesc = input.include_description ?? true;
  const needle = input.query.toLowerCase();

  let source: "native" | "fallback" = "native";
  let issues = await tryNativeSearch(input.query);
  if (issues === null) {
    source = "fallback";
    issues = await fallbackFetchAll();
  }

  const [agents, projects, squads] = await Promise.all([
    getAgentsCached(),
    getProjectsCached(),
    getSquadsCached(),
  ]);

  const matches: IssueMatch[] = [];
  for (const issue of issues) {
    const inTitle = issue.title.toLowerCase().includes(needle);
    const inDesc = includeDesc
      && (issue.description ?? "").toLowerCase().includes(needle);
    if (!inTitle && !inDesc) continue;
    matches.push({
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
            projects.find((p) => p.id === issue.project_id) ?? { id: issue.project_id },
          )
        : null,
      priority: issue.priority,
      matched_in: inTitle ? "title" : "description",
    });
    if (matches.length >= limit) break;
  }

  if (matches.length === 0) {
    return {
      items: [],
      state: "empty",
      message: `No issues match "${input.query}".`,
      source,
    };
  }
  return { items: matches, state: "loaded", source };
}
