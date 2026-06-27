import { z } from "zod";
import { resolveIssueId } from "../lib/issues.js";
import { getAgentsCached, mapAgentIdToName } from "../lib/agents.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import type { Comment, ListResult } from "../lib/types.js";

export const multicaListCommentsSchema = z.object({
  issue_id: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  since: z.string().optional(),
});

export type MulticaListCommentsInput = z.infer<typeof multicaListCommentsSchema>;

type CommentSummary = {
  id: string;
  parent_id: string | null;
  author: string;
  author_type: "agent" | "member";
  content: string;
  created_at: string;
};

export async function multicaListComments(
  input: MulticaListCommentsInput,
): Promise<ListResult<CommentSummary>> {
  const issueId = await resolveIssueId(input.issue_id);
  const args = ["issue", "comment", "list", issueId];
  if (input.limit) args.push("--recent", String(input.limit));
  if (input.since) args.push("--since", input.since);

  const [comments, agents] = await Promise.all([
    runMulticaJson<Comment[]>(args),
    getAgentsCached(),
  ]);

  if (!comments || comments.length === 0) {
    return { items: [], state: "empty", message: "No comments match." };
  }

  const items = comments.map((comment) => ({
    id: comment.id,
    parent_id: comment.parent_id,
    author:
      comment.author_type === "agent"
        ? mapAgentIdToName(agents, comment.author_id) ?? comment.author_id
        : comment.author_id,
    author_type: comment.author_type,
    content: comment.content,
    created_at: comment.created_at,
  }));

  return { items, state: "loaded" };
}
